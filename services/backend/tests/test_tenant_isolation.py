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
    tenant = repo.create_tenant(name="Tenant A")
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
    t1 = repo.create_tenant(name="Tenant One")
    t2 = repo.create_tenant(name="Tenant Two")
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


def test_fleet_admin_tenant_detail_own_tenant(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Own Org")
    tid = tenant["tenantId"]
    fleet_admin = _dev_user_header(
        userId="fa-1",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="fa@own.test",
    )
    res = client.get(f"/api/v1/tenants/{tid}", headers=fleet_admin)
    assert res.status_code == 200
    body = res.json()
    assert body["fleetAdmins"] == []
    assert body["users"] == []
    assert "tenant" in body

    other = repo.create_tenant(name="Other")
    res403 = client.get(f"/api/v1/tenants/{other['tenantId']}", headers=fleet_admin)
    assert res403.status_code == 403


def test_fleet_manager_tenant_detail_tabs_data(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="FM Org")
    tid = tenant["tenantId"]
    repo.create_user_profile(
        tenant_id=tid,
        email="admin@example.com",
        role=Role.FLEET_ADMIN,
        cognito_sub="sub-fa",
    )
    repo.create_user_profile(
        tenant_id=tid,
        email="fm@example.com",
        role=Role.FLEET_MANAGER,
        cognito_sub="sub-fm",
    )
    fm = _dev_user_header(
        userId="fm-1",
        role=Role.FLEET_MANAGER.value,
        tenantId=tid,
        email="fm@t.test",
    )
    res = client.get(f"/api/v1/tenants/{tid}", headers=fm)
    assert res.status_code == 200
    body = res.json()
    assert body["fleetAdmins"] == []
    assert body["fleetManagers"] == []
    assert len(body["users"]) >= 2
    roles = {u["role"] for u in body["users"]}
    assert "FleetAdmin" in roles
    assert "FleetManager" in roles


def test_tenant_detail_linked_driver_count(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Driver Count Org")
    tid = tenant["tenantId"]
    repo.create_employee(
        tenant_id=tid,
        name="Ava Harris",
        employee_code="DRV-1009",
        email="ava.harris@yopmail.com",
        persona="Driver",
    )
    repo.create_user_profile(
        tenant_id=tid,
        email="ava.harris@yopmail.com",
        role=Role.DRIVER,
        cognito_sub="sub-ava",
    )
    admin = _dev_user_header(
        userId="fa-dc",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="fa-dc@test.com",
    )
    res = client.get(f"/api/v1/tenants/{tid}", headers=admin)
    assert res.status_code == 200
    body = res.json()
    assert body["linkedDriverCount"] == 1
    assert body["drivers"] == []
