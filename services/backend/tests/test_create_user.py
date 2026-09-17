import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from app.core.config import get_settings
from app.main import app
from app.models import Role


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("SKIP_JWT_VERIFY", "true")
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "test-fleet-operational")
    monkeypatch.setenv("AWS_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("COGNITO_USER_POOL_ID", "test-pool")
    monkeypatch.setenv("SEND_INVITE_EMAIL", "false")
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


def test_create_user_accepts_camelcase_tenant_id(client, ddb_table):
    from app.repositories.dynamodb import DynamoDBRepository

    repo = DynamoDBRepository(table_name="test-fleet-operational")
    tenant = repo.create_tenant("ABC Corp")
    admin = _dev_user_header(
        userId="admin-1",
        role=Role.PLATFORM_ADMIN.value,
        tenantId=None,
        email="admin@platform.test",
    )

    mock_cognito = MagicMock()
    mock_cognito.admin_create_user.return_value = {
        "User": {
            "Attributes": [
                {"Name": "sub", "Value": "new-user-sub"},
                {"Name": "email", "Value": "fleet.admin@example.com"},
            ]
        }
    }

    with patch("app.services.user_service.boto3.client", return_value=mock_cognito):
        res = client.post(
            "/api/v1/users",
            headers=admin,
            json={
                "email": "fleet.admin@example.com",
                "role": Role.FLEET_ADMIN.value,
                "tenantId": tenant["tenantId"],
            },
        )

    assert res.status_code == 201, res.text
    assert res.json()["email"] == "fleet.admin@example.com"
    assert res.json()["role"] == Role.FLEET_ADMIN.value
