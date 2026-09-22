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


def test_trip_lifecycle(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Trip Test")
    tid = tenant["tenantId"]
    fm_user = repo.create_user_profile(
        tenant_id=tid,
        email="fm@trip.test",
        role=Role.FLEET_MANAGER,
        cognito_sub="sub-fm-trip",
        user_id="fm-trip",
    )
    fm = _dev_user_header(
        userId="fm-trip",
        role=Role.FLEET_MANAGER.value,
        tenantId=tid,
        email="fm@trip.test",
    )
    admin = _dev_user_header(
        userId="fa-trip",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="fa@trip.test",
    )

    v = client.post(
        "/api/v1/vehicles",
        json={
            "vehicleName": "Trip Van",
            "registrationNumber": "TRIP01",
            "make": "Ford",
            "model": "Transit",
            "year": 2022,
        },
        headers=admin,
    )
    assert v.status_code == 201
    vehicle_id = v.json()["vehicleId"]

    repo.create_user_profile(
        tenant_id=tid,
        email="driver@yopmail.com",
        role=Role.DRIVER,
        cognito_sub="sub-trip-driver",
    )
    driver_user_id = repo.list_users_for_tenant(tid)[0]["userId"]
    sync = client.post(
        "/api/v1/drivers/sync-from-users",
        json={"userIds": [driver_user_id]},
        headers=admin,
    )
    assert sync.status_code == 200
    driver_id = sync.json()["drivers"][0]["driverId"]
    emp = repo.create_employee(
        tenant_id=tid,
        name="Trip Driver",
        email="driver@yopmail.com",
        persona="Driver",
        driver_manager_user_id=fm_user["userId"],
    )
    repo.update_employee(
        tid, emp["employeeId"], {"linkedUserId": driver_user_id}
    )

    a = client.post(
        "/api/v1/assignments",
        json={
            "driverId": driver_id,
            "vehicleId": vehicle_id,
            "changeDate": __import__("datetime").date.today().isoformat(),
        },
        headers=admin,
    )
    assert a.status_code == 201
    assignment_id = a.json()["assignmentId"]

    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    end = now + __import__("datetime").timedelta(hours=2)
    created = client.post(
        "/api/v1/trips",
        json={
            "assignmentId": assignment_id,
            "scheduledStartTime": now.isoformat(),
            "scheduledEndTime": end.isoformat(),
            "pickupLatitude": 22.5726,
            "pickupLongitude": 88.3639,
            "destinationLatitude": 22.6102,
            "destinationLongitude": 88.4011,
        },
        headers=fm,
    )
    assert created.status_code == 201
    trip_id = created.json()["tripId"]
    assert created.json()["status"] == "SCHEDULED"
    assert created.json()["routeDistanceKm"] > 0

    start = client.post(f"/api/v1/trips/{trip_id}/start", headers=fm)
    assert start.status_code == 200
    assert start.json()["status"] == "IN_PROGRESS"
    assert start.json().get("actualStartTime")

    v2 = client.get(f"/api/v1/vehicles/{vehicle_id}", headers=fm)
    assert v2.json()["status"] == "IN_TRIP"

    route_patch = client.patch(
        f"/api/v1/trips/{trip_id}",
        json={
            "pickupLatitude": 22.5726,
            "pickupLongitude": 88.3639,
            "destinationLatitude": 22.6102,
            "destinationLongitude": 88.4011,
        },
        headers=fm,
    )
    assert route_patch.status_code == 200
    assert route_patch.json()["routeDistanceKm"] > 0

    end_no_fuel = client.post(f"/api/v1/trips/{trip_id}/end", json={}, headers=fm)
    assert end_no_fuel.status_code == 400

    loc = client.post(
        f"/api/v1/trips/{trip_id}/location",
        json={"latitude": 22.5726, "longitude": 88.3639},
        headers=fm,
    )
    assert loc.status_code == 200
    assert loc.json()["lastLatitude"] == pytest.approx(22.5726)

    end = client.post(
        f"/api/v1/trips/{trip_id}/end",
        json={"fuelRequiredLiters": 18.5},
        headers=fm,
    )
    assert end.status_code == 200
    assert end.json()["status"] == "COMPLETED"
    assert end.json()["fuelRequiredLiters"] == pytest.approx(18.5)
    assert end.json()["timeTakenMinutes"] is not None
    assert end.json()["timeTakenMinutes"] >= 0

    v3 = client.get(f"/api/v1/vehicles/{vehicle_id}", headers=fm)
    assert v3.json()["status"] == "ASSIGNED"
    assert v3.json()["lastLatitude"] == pytest.approx(22.5726)
