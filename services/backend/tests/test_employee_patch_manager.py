import json

import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.core.config import get_settings
from app.main import app
from app.models import Role
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


def test_patch_employee_assign_driver_manager_like_ui(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Patch Co")
    tid = tenant["tenantId"]
    fm = repo.create_user_profile(
        tenant_id=tid,
        email="emily.wilson@yopmail.com",
        role=Role.FLEET_MANAGER,
        cognito_sub="sub-fm",
        user_id="fm-emily",
    )
    admin = _dev_user_header(
        userId="fa",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="admin@example.com",
    )
    created = client.post(
        "/api/v1/employees",
        headers=admin,
        json={
            "name": "Ava Harris",
            "employeeCode": "DRV-1009",
            "persona": "Driver",
            "email": "ava.harris@yopmail.com",
            "phone": "+1-555-1009",
        },
    )
    assert created.status_code == 201, created.text
    eid = created.json()["employeeId"]

    patch = client.patch(
        f"/api/v1/employees/{eid}?tenantId={tid}",
        headers=admin,
        json={
            "name": "Ava Harris",
            "employeeCode": "DRV-1009",
            "email": "ava.harris@yopmail.com",
            "phone": "+1-555-1009",
            "persona": "Driver",
            "status": "ACTIVE",
            "driverManagerUserId": fm["userId"],
        },
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["driverManagerUserId"] == fm["userId"]
