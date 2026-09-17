from unittest.mock import MagicMock, patch

import pytest
from jose import jwt

from app.core.cognito_groups import resolve_cognito_groups
from app.core.dependencies import parse_current_user
from app.core.jwt_claims import load_jwt_claims
from app.models import Role


def _make_token(payload: dict) -> str:
    return jwt.encode(payload, "test-secret", algorithm="HS256")


def test_resolve_groups_from_claims():
    claims = {"cognito:groups": ["PlatformAdmin"], "sub": "sub-1"}
    assert resolve_cognito_groups(claims) == ["PlatformAdmin"]


def test_resolve_groups_from_cognito_when_missing_from_id_token():
    claims = {"sub": "f1433d6a-5081-70cb-b3b6-c72caa3cc8bb", "email": "admin@example.com"}
    mock_client = MagicMock()
    mock_client.admin_list_groups_for_user.return_value = {
        "Groups": [{"GroupName": "PlatformAdmin"}],
    }
    with patch("app.core.cognito_groups.boto3.client", return_value=mock_client):
        with patch("app.core.cognito_groups.get_settings") as mock_settings:
            mock_settings.return_value.cognito_user_pool_id = "pool-1"
            mock_settings.return_value.cognito_region = "us-east-1"
            groups = resolve_cognito_groups(claims)
    assert groups == ["PlatformAdmin"]


def test_load_jwt_claims_merges_gateway_and_bearer():
    request = MagicMock()
    request.state.jwt_claims = {"sub": "sub-1", "email": "a@b.com"}
    token = _make_token(
        {
            "sub": "sub-1",
            "cognito:groups": ["PlatformAdmin"],
            "email": "a@b.com",
        }
    )

    def header_get(key, default=None):
        if key and key.lower() == "authorization":
            return f"Bearer {token}"
        return default

    request.headers.get.side_effect = header_get

    claims = load_jwt_claims(request)
    assert claims is not None
    assert claims["cognito:groups"] == ["PlatformAdmin"]


def test_parse_current_user_with_gateway_claims_only_and_bearer_groups():
    request = MagicMock()
    request.state.jwt_claims = {"sub": "sub-1", "email": "admin@example.com"}
    token = _make_token(
        {
            "sub": "sub-1",
            "cognito:groups": ["PlatformAdmin"],
            "email": "admin@example.com",
        }
    )

    def header_get(key, default=None):
        if key and key.lower() == "authorization":
            return f"Bearer {token}"
        return default

    request.headers.get.side_effect = header_get

    with patch("app.core.dependencies.get_settings") as mock_settings:
        mock_settings.return_value.skip_jwt_verify = False
        user = parse_current_user(request)

    assert user.role == Role.PLATFORM_ADMIN
    assert user.tenant_id is None
