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


def _setup_assignment(client: TestClient, repo: DynamoDBRepository):
    tenant = repo.create_tenant(name="Overlap Co")
    tid = tenant["tenantId"]
    admin = {
        "X-Dev-User": json.dumps(
            {
                "userId": "fa-over",
                "role": Role.FLEET_ADMIN.value,
                "tenantId": tid,
                "email": "fa@over.com",
            }
        )
    }
    fm_user = repo.create_user_profile(
        tenant_id=tid,
        email="fm@over.com",
        role=Role.FLEET_MANAGER,
        cognito_sub="sub-fm-over",
        user_id="fm-over",
    )
    fm = {
        "X-Dev-User": json.dumps(
            {
                "userId": "fm-over",
                "role": Role.FLEET_MANAGER.value,
                "tenantId": tid,
                "email": "fm@over.com",
            }
        )
    }
    v = client.post(
        "/api/v1/vehicles",
        headers=admin,
        json={
            "registrationNumber": "OV01",
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
        email="driver@over.com",
        role=Role.DRIVER,
        cognito_sub="sub-over",
    )
    uid = repo.list_users_for_tenant(tid)[0]["userId"]
    sync = client.post(
        "/api/v1/drivers/sync-from-users",
        json={"userIds": [uid]},
        headers=admin,
    )
    did = sync.json()["drivers"][0]["driverId"]
    emp = repo.create_employee(
        tenant_id=tid,
        name="Over Driver",
        email="driver@over.com",
        persona="Driver",
        driver_manager_user_id=fm_user["userId"],
    )
    repo.update_employee(tid, emp["employeeId"], {"linkedUserId": uid})
    a = client.post(
        "/api/v1/assignments",
        headers=admin,
        json={
            "driverId": did,
            "vehicleId": vid,
            "changeDate": datetime.now(timezone.utc).date().isoformat(),
        },
    )
    assert a.status_code == 201
    return tid, fm, admin, a.json()["assignmentId"]


ROUTE_BODY = {
    "pickupLatitude": 22.5726,
    "pickupLongitude": 88.3639,
    "destinationLatitude": 22.6102,
    "destinationLongitude": 88.4011,
}


def test_future_trip_allowed_after_in_progress_window(client: TestClient, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tid, fm, admin, assignment_id = _setup_assignment(client, repo)
    now = datetime.now(timezone.utc)

    live = client.post(
        "/api/v1/trips",
        json={
            "assignmentId": assignment_id,
            "scheduledStartTime": now.isoformat(),
            "scheduledEndTime": (now + timedelta(hours=2)).isoformat(),
            **ROUTE_BODY,
        },
        headers=fm,
    )
    assert live.status_code == 201
    live_id = live.json()["tripId"]
    started = client.post(f"/api/v1/trips/{live_id}/start", headers=fm)
    assert started.status_code == 200

    future_overlap = now + timedelta(hours=1)
    blocked = client.post(
        "/api/v1/trips",
        json={
            "assignmentId": assignment_id,
            "scheduledStartTime": future_overlap.isoformat(),
            "scheduledEndTime": (future_overlap + timedelta(hours=2)).isoformat(),
            **ROUTE_BODY,
        },
        headers=fm,
    )
    assert blocked.status_code == 409

    future_start = now + timedelta(hours=3)
    ok = client.post(
        "/api/v1/trips",
        json={
            "assignmentId": assignment_id,
            "scheduledStartTime": future_start.isoformat(),
            "scheduledEndTime": (future_start + timedelta(hours=1)).isoformat(),
            **ROUTE_BODY,
        },
        headers=fm,
    )
    assert ok.status_code == 201
    assert ok.json()["status"] == "SCHEDULED"


def test_scheduled_trip_blocks_overlap(client: TestClient, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tid, fm, _, assignment_id = _setup_assignment(client, repo)
    now = datetime.now(timezone.utc)
    start = now + timedelta(days=1)
    first = client.post(
        "/api/v1/trips",
        json={
            "assignmentId": assignment_id,
            "scheduledStartTime": start.isoformat(),
            "scheduledEndTime": (start + timedelta(hours=4)).isoformat(),
            **ROUTE_BODY,
        },
        headers=fm,
    )
    assert first.status_code == 201

    overlap = client.post(
        "/api/v1/trips",
        json={
            "assignmentId": assignment_id,
            "scheduledStartTime": (start + timedelta(hours=2)).isoformat(),
            "scheduledEndTime": (start + timedelta(hours=6)).isoformat(),
            **ROUTE_BODY,
        },
        headers=fm,
    )
    assert overlap.status_code == 409

    later = client.post(
        "/api/v1/trips",
        json={
            "assignmentId": assignment_id,
            "scheduledStartTime": (start + timedelta(hours=5)).isoformat(),
            "scheduledEndTime": (start + timedelta(hours=7)).isoformat(),
            **ROUTE_BODY,
        },
        headers=fm,
    )
    assert later.status_code == 201
