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


def test_fleet_admin_creates_and_lists_employee(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="HR Co")
    admin = _dev_user_header(
        userId="fa-1",
        role=Role.FLEET_ADMIN.value,
        tenantId=tenant["tenantId"],
        email="admin@example.com",
    )
    create = client.post(
        "/api/v1/employees",
        headers=admin,
        json={
            "name": "Olayemi Tunde O",
            "employeeCode": "687",
            "persona": "Driver",
            "dateOfBirth": "1983-08-22",
            "gender": "Male",
            "isDriver": True,
            "hireDate": "2025-03-11",
        },
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["name"] == "Olayemi Tunde O"
    assert body["employeeCode"] == "687"
    assert body["persona"] == "Driver"
    assert body["isDriver"] is True


def test_employee_import_template_and_upload(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Import Co")
    admin = _dev_user_header(
        userId="fa-2",
        role=Role.FLEET_ADMIN.value,
        tenantId=tenant["tenantId"],
        email="admin2@example.com",
    )
    template = client.get(
        f"/api/v1/employees/import-template?tenantId={tenant['tenantId']}",
        headers=admin,
    )
    assert template.status_code == 200
    assert "spreadsheetml" in template.headers["content-type"]

    res = client.post(
        f"/api/v1/employees/import?tenantId={tenant['tenantId']}",
        headers=admin,
        files={
            "file": (
                "employees.xlsx",
                template.content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["created"] >= 1
    assert any(e.get("persona") == "Driver" for e in body["employees"])


def test_delete_employee_marks_inactive(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="HR Co")
    admin = _dev_user_header(
        userId="fa-3",
        role=Role.FLEET_ADMIN.value,
        tenantId=tenant["tenantId"],
        email="admin3@example.com",
    )
    created = client.post(
        "/api/v1/employees",
        headers=admin,
        json={"name": "To Remove", "employeeCode": "X1"},
    )
    emp_id = created.json()["employeeId"]
    deleted = client.delete(
        f"/api/v1/employees/{emp_id}",
        headers=admin,
    )
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "INACTIVE"


def test_viewer_cannot_create_employee(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="HR Co")
    viewer = _dev_user_header(
        userId="v-1",
        role=Role.VIEWER.value,
        tenantId=tenant["tenantId"],
        email="v@example.com",
    )
    res = client.post(
        "/api/v1/employees",
        headers=viewer,
        json={"name": "Test User"},
    )
    assert res.status_code == 403
