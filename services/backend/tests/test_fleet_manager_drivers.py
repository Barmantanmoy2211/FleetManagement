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


def test_fleet_manager_lists_and_assigns_managed_driver(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="FM Assign Co")
    tid = tenant["tenantId"]
    fm = repo.create_user_profile(
        tenant_id=tid,
        email="fm@example.com",
        role=Role.FLEET_MANAGER,
        cognito_sub="sub-fm",
        user_id="fm-id",
    )
    driver_user = repo.create_user_profile(
        tenant_id=tid,
        email="ava@example.com",
        role=Role.DRIVER,
        cognito_sub="sub-ava",
        user_id="driver-user-id",
    )
    emp = repo.create_employee(
        tenant_id=tid,
        name="Ava Harris",
        email="ava@example.com",
        persona="Driver",
        driver_manager_user_id=fm["userId"],
    )
    repo.update_employee(
        tid,
        emp["employeeId"],
        {"linkedUserId": driver_user["userId"]},
    )

    fm_header = _dev_user_header(
        userId="wrong",
        cognitoSub="sub-fm",
        role=Role.FLEET_MANAGER.value,
        tenantId=tid,
        email=fm["email"],
    )
    listed = client.get("/api/v1/drivers", headers=fm_header)
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert len(body) == 1
    assert body[0]["name"] == "Ava Harris"
    assert body[0]["email"] == "ava@example.com"
    driver_id = body[0]["driverId"]

    admin = _dev_user_header(
        userId="fa",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="fa@test.com",
    )
    vehicle = client.post(
        "/api/v1/vehicles",
        json={
            "registrationNumber": "MH12AB9999",
            "vehicleName": "Truck 1",
            "make": "Tata",
            "model": "LPT",
            "year": 2020,
        },
        headers=admin,
    )
    assert vehicle.status_code == 201
    vehicle_id = vehicle.json()["vehicleId"]

    assignment = client.post(
        "/api/v1/assignments",
        json={
            "driverId": driver_id,
            "vehicleId": vehicle_id,
            "changeDate": date.today().isoformat(),
            "releaseDate": (date.today().replace(day=28) if date.today().day < 28 else date.today()).isoformat(),
        },
        headers=fm_header,
    )
    assert assignment.status_code == 201, assignment.text
