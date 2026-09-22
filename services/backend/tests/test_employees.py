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


def test_fleet_manager_sees_only_assigned_drivers(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="FM Scope Co")
    tid = tenant["tenantId"]
    fm_a = repo.create_user_profile(
        tenant_id=tid,
        email="fm-a@example.com",
        role=Role.FLEET_MANAGER,
        cognito_sub="sub-fm-a",
        user_id="fm-a-id",
    )
    fm_b = repo.create_user_profile(
        tenant_id=tid,
        email="fm-b@example.com",
        role=Role.FLEET_MANAGER,
        cognito_sub="sub-fm-b",
        user_id="fm-b-id",
    )
    admin = _dev_user_header(
        userId="fa-fm-scope",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="admin@fm-scope.com",
    )
    d1 = client.post(
        "/api/v1/employees",
        headers=admin,
        json={
            "name": "Driver A",
            "persona": "Driver",
            "driverManagerUserId": fm_a["userId"],
        },
    )
    d2 = client.post(
        "/api/v1/employees",
        headers=admin,
        json={
            "name": "Driver B",
            "persona": "Driver",
            "driverManagerUserId": fm_b["userId"],
        },
    )
    assert d1.status_code == 201, d1.text
    assert d2.status_code == 201, d2.text
    driver_a_id = d1.json()["employeeId"]
    repo.create_user_profile(
        tenant_id=tid,
        email="driver-a@example.com",
        role=Role.DRIVER,
        cognito_sub="sub-driver-a",
        user_id="driver-a-user",
    )
    repo.update_employee(
        tid,
        driver_a_id,
        {
            "email": "driver-a@example.com",
            "linkedUserId": "driver-a-user",
        },
    )

    fm_a_header = _dev_user_header(
        userId="wrong-sub-id",
        cognitoSub="sub-fm-a",
        role=Role.FLEET_MANAGER.value,
        tenantId=tid,
        email=fm_a["email"],
    )
    listed = client.get(f"/api/v1/employees?tenantId={tid}", headers=fm_a_header)
    assert listed.status_code == 200, listed.text
    driver_names = {e["name"] for e in listed.json() if e.get("persona") == "Driver"}
    assert driver_names == {"Driver A"}

    tenant_detail = client.get(f"/api/v1/tenants/{tid}", headers=fm_a_header)
    assert tenant_detail.status_code == 200, tenant_detail.text
    assert tenant_detail.json().get("linkedDriverCount") == 1

    other = client.get(
        f"/api/v1/employees/{d2.json()['employeeId']}?tenantId={tid}",
        headers=fm_a_header,
    )
    assert other.status_code == 404


def test_driver_manager_must_be_fleet_manager_user(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="Validate FM Co")
    tid = tenant["tenantId"]
    driver_user = repo.create_user_profile(
        tenant_id=tid,
        email="driver@example.com",
        role=Role.DRIVER,
        cognito_sub="sub-driver",
        user_id="driver-user-id",
    )
    admin = _dev_user_header(
        userId="fa-val",
        role=Role.FLEET_ADMIN.value,
        tenantId=tid,
        email="admin@validate.com",
    )
    res = client.post(
        "/api/v1/employees",
        headers=admin,
        json={
            "name": "Bad Assign",
            "persona": "Driver",
            "driverManagerUserId": driver_user["userId"],
        },
    )
    assert res.status_code == 400


def test_fleet_manager_can_list_users(client, ddb_table):
    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant(name="FM Users Co")
    tid = tenant["tenantId"]
    repo.create_user_profile(
        tenant_id=tid,
        email="fm@example.com",
        role=Role.FLEET_MANAGER,
        cognito_sub="sub-fm-users",
        user_id="fm-users-id",
    )
    fm = _dev_user_header(
        userId="ignored",
        cognitoSub="sub-fm-users",
        role=Role.FLEET_MANAGER.value,
        tenantId=tid,
        email="fm@example.com",
    )
    res = client.get(f"/api/v1/users?tenantId={tid}", headers=fm)
    assert res.status_code == 200, res.text
    assert any(u["email"] == "fm@example.com" for u in res.json())


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
