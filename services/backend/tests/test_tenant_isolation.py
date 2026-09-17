import json

import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.core.config import get_settings
from app.main import app
from app.models import Role, TenantStatus
from app.repositories.dynamodb import DynamoDBRepository


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("SKIP_JWT_VERIFY", "true")
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "test-fleet-operational")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    get_settings.cache_clear()


@pytest.fixture
def ddb_table():
    with mock_aws():
        import boto3

        dynamodb = boto3.resource("dynamodb", region_name="us-east-1")
        table = dynamodb.create_table(
            TableName="test-fleet-operational",
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
                {"AttributeName": "GSI1PK", "AttributeType": "S"},
                {"AttributeName": "GSI1SK", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table.wait_until_exists()
        yield table


@pytest.fixture
def client(ddb_table):
    return TestClient(app)


def _dev_user_header(**kwargs) -> dict[str, str]:
    return {"X-Dev-User": json.dumps(kwargs)}


def test_health_public(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_tenant_crud_platform_admin(client, ddb_table):
    admin = _dev_user_header(
        userId="admin-1",
        role=Role.PLATFORM_ADMIN.value,
        tenantId=None,
        email="admin@platform.test",
    )
    create = client.post(
        "/api/v1/tenants",
        json={"name": "ABC Logistics"},
        headers=admin,
    )
    assert create.status_code == 201
    tenant_id = create.json()["tenantId"]

    listed = client.get("/api/v1/tenants", headers=admin)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    patch = client.patch(
        f"/api/v1/tenants/{tenant_id}",
        json={"status": TenantStatus.SUSPENDED.value},
        headers=admin,
    )
    assert patch.status_code == 200
    assert patch.json()["status"] == TenantStatus.SUSPENDED.value


def test_fleet_admin_cannot_list_tenants(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant("Tenant A")
    fleet_admin = _dev_user_header(
        userId="fa-1",
        role=Role.FLEET_ADMIN.value,
        tenantId=tenant["tenantId"],
        email="fa@tenant.test",
    )
    res = client.get("/api/v1/tenants", headers=fleet_admin)
    assert res.status_code == 403


def test_tenant_isolation_on_users(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    t1 = repo.create_tenant("Tenant One")
    t2 = repo.create_tenant("Tenant Two")
    repo.create_user_profile(
        tenant_id=t1["tenantId"],
        email="u1@t1.test",
        role=Role.FLEET_MANAGER,
        cognito_sub="sub-u1",
    )

    admin_t2 = _dev_user_header(
        userId="fa-t2",
        role=Role.FLEET_ADMIN.value,
        tenantId=t2["tenantId"],
        email="fa@t2.test",
    )
    res = client.get(
        f"/api/v1/users?tenantId={t1['tenantId']}",
        headers=admin_t2,
    )
    assert res.status_code == 403

    res_ok = client.get("/api/v1/users", headers=admin_t2)
    assert res_ok.status_code == 200
    assert res_ok.json() == []
