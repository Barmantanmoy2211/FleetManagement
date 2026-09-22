from __future__ import annotations

from fastapi import HTTPException, status

from app.core.dependencies import CurrentUser
from app.models import Role
from app.repositories.dynamodb import DynamoDBRepository

ALL_LOCATIONS = object()


def resolve_effective_location_id(
    repo: DynamoDBRepository, tenant_id: str, location_id: str | None
) -> str:
    if location_id:
        loc = repo.get_location(tenant_id, location_id)
        if not loc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid locationId",
            )
        return location_id
    primary = repo.ensure_primary_location(tenant_id)
    return primary["locationId"]


def resolve_location_scope(
    current: CurrentUser, tenant_id: str, repo: DynamoDBRepository | None = None
) -> set[str] | object:
    """Return ALL_LOCATIONS or a set of allowed location IDs."""
    repository = repo or DynamoDBRepository()
    if current.role in (Role.PLATFORM_ADMIN, Role.FLEET_ADMIN):
        return ALL_LOCATIONS
    if current.role == Role.LOCATION_HEAD:
        if not current.location_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Location context required",
            )
        return {current.location_id}
    if current.role in (Role.FLEET_MANAGER, Role.DRIVER, Role.VIEWER):
        if not current.location_id:
            repository.ensure_primary_location(tenant_id)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Location not assigned to user profile",
            )
        return {current.location_id}
    return ALL_LOCATIONS


def item_location_id(item: dict, default_location_id: str | None) -> str | None:
    lid = item.get("locationId")
    if lid:
        return str(lid)
    return default_location_id


def assert_location_access(
    current: CurrentUser,
    tenant_id: str,
    item: dict,
    repo: DynamoDBRepository | None = None,
) -> None:
    scope = resolve_location_scope(current, tenant_id, repo)
    if scope is ALL_LOCATIONS:
        return
    repository = repo or DynamoDBRepository()
    default = repository.get_primary_location_id(tenant_id)
    lid = item_location_id(item, default)
    if lid not in scope:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found",
        )


def filter_by_location_scope(
    items: list[dict],
    scope: set[str] | object,
    default_location_id: str | None,
) -> list[dict]:
    if scope is ALL_LOCATIONS:
        return items
    allowed = scope
    out: list[dict] = []
    for item in items:
        lid = item_location_id(item, default_location_id)
        if lid and lid in allowed:
            out.append(item)
    return out


def repo_location_filter(
    repo: DynamoDBRepository, current: CurrentUser, tenant_id: str
) -> str | None:
    repo.backfill_tenant_location_ids(tenant_id)
    scope = resolve_location_scope(current, tenant_id, repo)
    if scope is ALL_LOCATIONS:
        return None
    return next(iter(scope))
