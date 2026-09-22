"""Phase 3: trip APIs respect tenant boundaries."""

import json
from datetime import datetime, timedelta, timezone

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


def test_tenant_b_cannot_read_tenant_a_trip(client: TestClient, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant_a = repo.create_tenant(name="Trip Tenant A")
    tenant_b = repo.create_tenant(name="Trip Tenant B")
    tid_a = tenant_a["tenantId"]
    tid_b = tenant_b["tenantId"]

    admin_a = {
        "X-Dev-User": json.dumps(
            {
                "userId": "fa-a",
                "role": Role.FLEET_ADMIN.value,
                "tenantId": tid_a,
                "email": "fa@a.com",
            }
        )
    }
    admin_b = {
        "X-Dev-User": json.dumps(
            {
                "userId": "fa-b",
                "role": Role.FLEET_ADMIN.value,
                "tenantId": tid_b,
                "email": "fa@b.com",
            }
        )
    }

    v = client.post(
        "/api/v1/vehicles",
        headers=admin_a,
        json={
            "registrationNumber": "ISO01",
            "vehicleName": "Van",
            "make": "T",
            "model": "M",
            "year": 2020,
        },
    )
    vid = v.json()["vehicleId"]
    repo.create_user_profile(
        tenant_id=tid_a,
        email="d@a.com",
        role=Role.DRIVER,
        cognito_sub="sub-d-a",
    )
    uid = repo.list_users_for_tenant(tid_a)[0]["userId"]
    sync = client.post(
        "/api/v1/drivers/sync-from-users",
        json={"userIds": [uid]},
        headers=admin_a,
    )
    did = sync.json()["drivers"][0]["driverId"]
    a = client.post(
        "/api/v1/assignments",
        headers=admin_a,
        json={
            "driverId": did,
            "vehicleId": vid,
            "changeDate": datetime.now(timezone.utc).date().isoformat(),
        },
    )
    assignment_id = a.json()["assignmentId"]
    now = datetime.now(timezone.utc)
    trip = client.post(
        "/api/v1/trips",
        headers=admin_a,
        json={
            "assignmentId": assignment_id,
            "scheduledStartTime": now.isoformat(),
            "scheduledEndTime": (now + timedelta(hours=2)).isoformat(),
            "pickupLatitude": 22.5726,
            "pickupLongitude": 88.3639,
            "destinationLatitude": 22.6102,
            "destinationLongitude": 88.4011,
        },
    )
    assert trip.status_code == 201
    trip_id = trip.json()["tripId"]

    cross = client.get(f"/api/v1/trips/{trip_id}?tenantId={tid_a}", headers=admin_b)
    assert cross.status_code == 403

    own = client.get(f"/api/v1/trips/{trip_id}?tenantId={tid_a}", headers=admin_a)
    assert own.status_code == 200
