import json
from datetime import date

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


def test_get_assignment_by_id(client: TestClient, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Get Assign Co")
    tid = tenant["tenantId"]
    admin = {
        "X-Dev-User": json.dumps(
            {
                "userId": "fa-get",
                "role": Role.FLEET_ADMIN.value,
                "tenantId": tid,
                "email": "fa@get.com",
            }
        )
    }
    v = client.post(
        "/api/v1/vehicles",
        headers=admin,
        json={
            "registrationNumber": "GET01",
            "vehicleName": "Van",
            "make": "Ford",
            "model": "T",
            "year": 2020,
        },
    )
    assert v.status_code == 201
    vid = v.json()["vehicleId"]
    repo.create_user_profile(
        tenant_id=tid,
        email="driver@get.com",
        role=Role.DRIVER,
        cognito_sub="sub-get-driver",
    )
    uid = repo.list_users_for_tenant(tid)[0]["userId"]
    sync = client.post(
        "/api/v1/drivers/sync-from-users",
        json={"userIds": [uid]},
        headers=admin,
    )
    did = sync.json()["drivers"][0]["driverId"]
    created = client.post(
        "/api/v1/assignments",
        headers=admin,
        json={
            "driverId": did,
            "vehicleId": vid,
            "changeDate": date.today().isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    aid = created.json()["assignmentId"]

    got = client.get(f"/api/v1/assignments/{aid}?tenantId={tid}", headers=admin)
    assert got.status_code == 200, got.text
    body = got.json()
    assert body["assignmentId"] == aid
    assert body["changeDate"] == date.today().isoformat()

    legacy_id = repo.create_assignment(
        tenant_id=tid,
        driver_id=did,
        vehicle_id=vid,
        assigned_by="fa-get",
        change_date="2024-06-01",
        start_time="2024-06-01T00:00:00+00:00",
    )["assignmentId"]
    legacy = client.get(
        f"/api/v1/assignments/{legacy_id}?tenantId={tid}", headers=admin
    )
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()["changeDate"] == "2024-06-01"
