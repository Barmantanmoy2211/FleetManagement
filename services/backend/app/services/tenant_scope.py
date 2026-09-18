from __future__ import annotations

from fastapi import HTTPException, status

from app.core.dependencies import CurrentUser
from app.models import Role


def resolve_effective_tenant(current: CurrentUser, requested: str | None) -> str:
    if current.role == Role.PLATFORM_ADMIN:
        if not requested:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tenantId query/body required for platform admin",
            )
        return requested
    if not current.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant context missing",
        )
    if requested and requested != current.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant access denied",
        )
    return current.tenant_id
