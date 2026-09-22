import json

import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.core.config import get_settings
from app.main import app
from app.models import FuelType, Role, VehicleType
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


def _header(user_id: str, role: Role, tenant_id: str, **extra: str) -> dict[str, str]:
    payload = {
        "userId": user_id,
        "email": f"{user_id}@yopmail.com",
        "role": role.value,
        "tenantId": tenant_id,
        **extra,
    }
    return {"X-Dev-User": json.dumps(payload)}


def test_tenant_create_gets_primary_location(ddb_table):
    repo = DynamoDBRepository()
    tenant = repo.create_tenant(name="Prime Logistics")
    primary = repo.ensure_primary_location(tenant["tenantId"])
    assert primary.get("isPrimary") is True
    assert primary.get("name") == "Primary"


def test_locations_crud_and_org_chart(ddb_table):
    client = TestClient(app)
    repo = DynamoDBRepository()
    tenant = repo.create_tenant(name="Prime Logistics")
    tid = tenant["tenantId"]
    admin = _header("admin1", Role.FLEET_ADMIN, tid)

    listed = client.get(f"/api/v1/locations?tenantId={tid}", headers=admin)
    assert listed.status_code == 200
    assert len(listed.json()) >= 1

    created = client.post(
        "/api/v1/locations",
        json={"name": "Kolkata", "city": "Kolkata", "tenantId": tid},
        headers=admin,
    )
    assert created.status_code == 201
    loc_id = created.json()["locationId"]

    chart = client.get(f"/api/v1/me/org-chart?tenantId={tid}", headers=admin)
    assert chart.status_code == 200
    assert chart.json()["kind"] == "tenant"
    assert any(c.get("label") == "Kolkata" for c in chart.json().get("children", []))

    repo.create_user_profile(
        tenant_id=tid,
        email="head@yopmail.com",
        role=Role.LOCATION_HEAD,
        cognito_sub="sub-head",
        user_id="head-user",
        location_id=loc_id,
    )
    head_hdr = _header("head-user", Role.LOCATION_HEAD, tid)
    head_chart = client.get(f"/api/v1/me/org-chart?tenantId={tid}", headers=head_hdr)
    assert head_chart.status_code == 200


def test_location_head_cannot_see_other_location_vehicle(ddb_table):
    client = TestClient(app)
    repo = DynamoDBRepository()
    tenant = repo.create_tenant(name="Scoped Co")
    tid = tenant["tenantId"]
    loc_a = repo.create_location(tenant_id=tid, name="Site A", city="A")
    loc_b = repo.create_location(tenant_id=tid, name="Site B", city="B")
    repo.create_user_profile(
        tenant_id=tid,
        email="head-a@yopmail.com",
        role=Role.LOCATION_HEAD,
        cognito_sub="sub-ha",
        user_id="head-a",
        location_id=loc_a["locationId"],
    )
    vehicle_b = repo.create_vehicle(
        tenant_id=tid,
        vehicle_name="Truck B",
        registration_number="REG-B",
        make="Make",
        model="Model",
        year=2024,
        vehicle_type=VehicleType.TRUCK,
        fuel_type=FuelType.DIESEL,
        location_id=loc_b["locationId"],
    )
    head_hdr = _header("head-a", Role.LOCATION_HEAD, tid)
    detail = client.get(
        f"/api/v1/vehicles/{vehicle_b['vehicleId']}?tenantId={tid}",
        headers=head_hdr,
    )
    assert detail.status_code in (403, 404)
