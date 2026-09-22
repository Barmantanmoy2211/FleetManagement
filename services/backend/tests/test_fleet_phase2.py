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


def _dev_user_header(**kwargs) -> dict[str, str]:
    return {"X-Dev-User": json.dumps(kwargs)}


def test_viewer_cannot_create_vehicle(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Fleet Co")
    viewer = _dev_user_header(
        userId="v-1",
        role=Role.VIEWER.value,
        tenantId=tenant["tenantId"],
        email="v@t.test",
    )
    res = client.post(
        "/api/v1/vehicles",
        json={
            "registrationNumber": "MH12AB1234",
            "vehicleName": "Tata LPT",
            "make": "Tata",
            "model": "LPT",
            "year": 2020,
        },
        headers=viewer,
    )
    assert res.status_code == 403


def test_assignment_lifecycle(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Assign Test")
    tid = tenant["tenantId"]
    admin = _dev_user_header(
        userId="fa-1",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="fa@t.test",
    )

    v = client.post(
        "/api/v1/vehicles",
        json={"registrationNumber": "KA01XY9999", "vehicleName": "Ashok Dost", "make": "Ashok", "model": "Dost", "year": 2019},
        headers=admin,
    )
    assert v.status_code == 201
    vehicle_id = v.json()["vehicleId"]

    repo.create_user_profile(
        tenant_id=tid,
        email="rahul@example.com",
        role=Role.DRIVER,
        cognito_sub="sub-rahul",
    )
    driver_user_id = repo.list_users_for_tenant(tid)[0]["userId"]
    d = client.post(
        "/api/v1/drivers/sync-from-users",
        json={"userIds": [driver_user_id]},
        headers=admin,
    )
    assert d.status_code == 200
    driver_id = d.json()["drivers"][0]["driverId"]

    a = client.post(
        "/api/v1/assignments",
        json={
            "driverId": driver_id,
            "vehicleId": vehicle_id,
            "changeDate": date.today().isoformat(),
        },
        headers=admin,
    )
    assert a.status_code == 201
    assignment_id = a.json()["assignmentId"]
    assert a.json()["status"] == "ACTIVE"

    v2 = client.get(f"/api/v1/vehicles/{vehicle_id}", headers=admin)
    assert v2.json()["status"] == "ASSIGNED"
    assert v2.json()["currentDriverId"] == driver_id

    end = client.post(f"/api/v1/assignments/{assignment_id}/end", headers=admin)
    assert end.status_code == 200
    assert end.json()["status"] == "ENDED"

    history = client.get("/api/v1/assignments", headers=admin)
    assert len(history.json()) == 1
    assert history.json()[0]["endTime"] is not None


def test_sync_drivers_from_users(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Sync Test")
    tid = tenant["tenantId"]
    repo.create_user_profile(
        tenant_id=tid,
        email="driver@example.com",
        role=Role.DRIVER,
        cognito_sub="sub-driver",
    )
    driver_user_id = repo.list_users_for_tenant(tid)[0]["userId"]
    admin = _dev_user_header(
        userId="fa-1",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="fa@t.test",
    )
    empty = client.get("/api/v1/drivers", headers=admin)
    assert empty.status_code == 200
    assert empty.json() == []

    candidates = client.get("/api/v1/drivers/import-candidates", headers=admin)
    assert candidates.status_code == 200
    assert len(candidates.json()) == 1
    assert candidates.json()[0]["userId"] == driver_user_id

    sync = client.post(
        "/api/v1/drivers/sync-from-users",
        json={"userIds": [driver_user_id]},
        headers=admin,
    )
    assert sync.status_code == 200
    assert sync.json()["created"] == 1

    listed = client.get("/api/v1/drivers", headers=admin)
    assert len(listed.json()) == 1
    assert listed.json()[0]["email"] == "driver@example.com"


def test_vehicle_import_template(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Vehicle Import Co")
    admin = _dev_user_header(
        userId="fa-v",
        role=Role.FLEET_ADMIN.value,
        tenantId=tenant["tenantId"],
        email="fa-v@test.com",
    )
    template = client.get(
        f"/api/v1/vehicles/import-template?tenantId={tenant['tenantId']}",
        headers=admin,
    )
    assert template.status_code == 200
    assert "spreadsheetml" in template.headers["content-type"]
    assert len(template.content) > 100


def test_vehicle_import_demo_workbook(client, ddb_table):
    from pathlib import Path

    fixture = Path(__file__).resolve().parent / "fixtures" / "vehicle-import-20-demo-records.xlsx"
    if not fixture.is_file():
        pytest.skip("demo fixture missing")

    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Vehicle Import Demo")
    admin = _dev_user_header(
        userId="fa-v2",
        role=Role.FLEET_ADMIN.value,
        tenantId=tenant["tenantId"],
        email="fa-v2@test.com",
    )
    file_bytes = fixture.read_bytes()

    res = client.post(
        f"/api/v1/vehicles/import?tenantId={tenant['tenantId']}",
        headers=admin,
        files={
            "file": (
                "vehicles.xlsx",
                file_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["created"] == 20, body
    assert body["failed"] == 0


def test_delete_vehicle_marks_inactive(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Delete Vehicle Co")
    tid = tenant["tenantId"]
    admin = _dev_user_header(
        userId="fa-del",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="fa-del@test.com",
    )
    created = client.post(
        "/api/v1/vehicles",
        json={
            "vehicleName": "To Remove",
            "registrationNumber": "DEL001",
            "make": "Ford",
            "model": "Transit",
            "year": 2020,
        },
        headers=admin,
    )
    assert created.status_code == 201
    vid = created.json()["vehicleId"]
    deleted = client.delete(f"/api/v1/vehicles/{vid}", headers=admin)
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "INACTIVE"


def test_tenant_isolation_vehicles(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    t1 = repo.create_tenant(name="One")
    t2 = repo.create_tenant(name="Two")
    admin_t2 = _dev_user_header(
        userId="fa-t2",
        role=Role.FLEET_ADMIN.value,
        tenantId=t2["tenantId"],
        email="fa@t2.test",
    )
    res = client.get(
        f"/api/v1/vehicles?tenantId={t1['tenantId']}",
        headers=admin_t2,
    )
    assert res.status_code == 403
