from __future__ import annotations

import boto3
from botocore.exceptions import ClientError

from app.core.config import get_settings


def resolve_cognito_groups(claims: dict) -> list[str]:
    """Return Cognito group names from JWT claims, or load from Cognito if absent.

    ID tokens (used with API Gateway JWT authorizer) often omit cognito:groups;
    access tokens include them but are not used at the gateway.
    """
    groups = claims.get("cognito:groups") or []
    if isinstance(groups, str):
        return [groups]
    if groups:
        return list(groups)

    sub = claims.get("sub")
    if not sub:
        return []

    settings = get_settings()
    if not settings.cognito_user_pool_id:
        return []

    client = boto3.client("cognito-idp", region_name=settings.cognito_region)
    try:
        resp = client.admin_list_groups_for_user(
            UserPoolId=settings.cognito_user_pool_id,
            Username=sub,
        )
        return [g["GroupName"] for g in resp.get("Groups", [])]
    except ClientError:
        return []
