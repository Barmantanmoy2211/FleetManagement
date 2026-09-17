from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.core.config import get_settings
from app.core.cognito_groups import resolve_cognito_groups
from app.core.jwt_claims import load_jwt_claims
from app.models import Role


@dataclass
class CurrentUser:
    user_id: str
    email: str
    role: Role
    tenant_id: str | None
    cognito_sub: str


def _role_from_groups(groups: list[str]) -> Role:
    priority = [
        Role.PLATFORM_ADMIN,
        Role.FLEET_ADMIN,
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
        return CurrentUser(
            user_id=data["userId"],
            email=data.get("email", "dev@local"),
            role=Role(data["role"]),
            tenant_id=data.get("tenantId"),
            cognito_sub=data.get("cognitoSub", data["userId"]),
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

    if role != Role.PLATFORM_ADMIN and not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant context required for this user",
        )

    return CurrentUser(
        user_id=claims.get("sub", ""),
        email=claims.get("email") or claims.get("username") or "",
        role=role,
        tenant_id=tenant_id,
        cognito_sub=claims.get("sub", ""),
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
