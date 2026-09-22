from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.core.config import get_settings
from app.core.cognito_groups import resolve_cognito_groups
from app.core.jwt_claims import load_jwt_claims
from app.models import Role
from app.repositories.dynamodb import DynamoDBRepository


def _platform_user_id_for_cognito_sub(cognito_sub: str) -> str | None:
    if not cognito_sub:
        return None
    profile = DynamoDBRepository().get_user_by_cognito_sub(cognito_sub)
    if not profile:
        return None
    uid = profile.get("userId")
    return str(uid) if uid else None


@dataclass
class CurrentUser:
    user_id: str
    email: str
    role: Role
    tenant_id: str | None
    cognito_sub: str
    location_id: str | None = None
    reports_to_user_id: str | None = None


def _profile_context(
    cognito_sub: str,
    tenant_id: str | None,
    platform_user_id: str | None = None,
) -> tuple[str | None, str | None, str | None, str | None]:
    """Returns (platform_user_id, location_id, reports_to_user_id, profile_tenant_id)."""
    repo = DynamoDBRepository()
    profile = repo.get_user_by_cognito_sub(cognito_sub)
    if not profile and tenant_id and platform_user_id:
        profile = repo.get_user(tenant_id, platform_user_id)
    if not profile:
        return None, None, None, None
    uid = profile.get("userId")
    platform_id = str(uid) if uid else None
    loc = profile.get("locationId")
    reports = profile.get("reportsToUserId")
    profile_tenant = profile.get("tenantId")
    if profile_tenant:
        profile_tenant = str(profile_tenant)
    return platform_id, loc, reports, profile_tenant


def _role_from_groups(groups: list[str]) -> Role:
    priority = [
        Role.PLATFORM_ADMIN,
        Role.FLEET_ADMIN,
        Role.LOCATION_HEAD,
        Role.FLEET_MANAGER,
        Role.DRIVER,
        Role.VIEWER,
    ]
    group_set = set(groups)
    for role in priority:
        if role.value in group_set:
            return role
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="User has no recognized role group",
    )


def parse_current_user(request: Request) -> CurrentUser:
    settings = get_settings()

    if settings.skip_jwt_verify:
        dev_header = request.headers.get("X-Dev-User")
        if not dev_header:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing X-Dev-User header in dev mode",
            )
        import json

        data = json.loads(dev_header)
        cognito_sub = data.get("cognitoSub", data["userId"])
        user_id = data["userId"]
        platform_id, loc_id, reports_to, profile_tenant = _profile_context(
            cognito_sub, data.get("tenantId"), data.get("userId")
        )
        if platform_id:
            user_id = platform_id
        resolved_tenant = data.get("tenantId") or profile_tenant
        return CurrentUser(
            user_id=user_id,
            email=data.get("email", "dev@local"),
            role=Role(data["role"]),
            tenant_id=resolved_tenant,
            cognito_sub=cognito_sub,
            location_id=data.get("locationId") or loc_id,
            reports_to_user_id=data.get("reportsToUserId") or reports_to,
        )

    claims = load_jwt_claims(request)
    if not claims:
        auth = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth and auth.lower().startswith("bearer "):
            from app.core.security import decode_bearer_token

            claims = decode_bearer_token(auth.split(" ", 1)[1])
            request.state.jwt_claims = claims
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing bearer token",
            )

    groups = resolve_cognito_groups(claims)

    role = _role_from_groups(groups)
    tenant_id = claims.get("custom:tenant_id") or claims.get("tenant_id")

    cognito_sub = claims.get("sub", "")
    user_id = cognito_sub
    platform_id, loc_id, reports_to, profile_tenant = _profile_context(cognito_sub, tenant_id)
    if platform_id:
        user_id = platform_id
    if not tenant_id and profile_tenant:
        tenant_id = profile_tenant

    if role != Role.PLATFORM_ADMIN and not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant context required for this user",
        )

    return CurrentUser(
        user_id=user_id,
        email=claims.get("email") or claims.get("username") or "",
        role=role,
        tenant_id=tenant_id,
        cognito_sub=cognito_sub,
        location_id=loc_id,
        reports_to_user_id=reports_to,
    )


def require_roles(*allowed: Role):
    def dependency(request: Request) -> CurrentUser:
        user = parse_current_user(request)
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return dependency
