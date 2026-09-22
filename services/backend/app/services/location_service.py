from __future__ import annotations

from fastapi import HTTPException, status

from app.core.dependencies import CurrentUser
from app.models import LocationStatus, Role
from app.repositories.dynamodb import DynamoDBRepository
from app.schemas.location import (
    CreateLocationRequest,
    LocationResponse,
    UpdateLocationRequest,
)
from app.services.tenant_scope import resolve_effective_tenant


def _location_read_roles() -> tuple[Role, ...]:
    return (
        Role.PLATFORM_ADMIN,
        Role.FLEET_ADMIN,
        Role.LOCATION_HEAD,
        Role.FLEET_MANAGER,
        Role.VIEWER,
        Role.DRIVER,
    )


def _location_write_roles() -> tuple[Role, ...]:
    return (Role.PLATFORM_ADMIN, Role.FLEET_ADMIN)


class LocationService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def list_locations(
        self, current: CurrentUser, tenant_id: str | None
    ) -> list[LocationResponse]:
        effective = resolve_effective_tenant(current, tenant_id)
        self.repo.backfill_tenant_location_ids(effective)
        items = self.repo.list_locations_for_tenant(effective)
        if current.role == Role.LOCATION_HEAD and current.location_id:
            items = [i for i in items if i.get("locationId") == current.location_id]
        elif current.role in (Role.FLEET_MANAGER, Role.DRIVER, Role.VIEWER):
            if current.location_id:
                items = [i for i in items if i.get("locationId") == current.location_id]
        return [self._to_response(i) for i in items]

    def get_location(
        self, current: CurrentUser, location_id: str, tenant_id: str | None
    ) -> LocationResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_location(effective, location_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
        self._ensure_can_read_location(current, item)
        return self._to_response(item)

    def create_location(
        self, current: CurrentUser, body: CreateLocationRequest
    ) -> LocationResponse:
        effective = resolve_effective_tenant(current, body.tenantId)
        if not self.repo.ensure_tenant_exists(effective):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        item = self.repo.create_location(
            tenant_id=effective,
            name=body.name,
            code=body.code,
            street=body.street,
            city=body.city,
            state=body.state,
            country=body.country,
        )
        return self._to_response(item)

    def update_location(
        self,
        current: CurrentUser,
        location_id: str,
        body: UpdateLocationRequest,
        tenant_id: str | None,
    ) -> LocationResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        existing = self.repo.get_location(effective, location_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
        updates = body.model_dump(exclude_unset=True)
        updated = self.repo.update_location(effective, location_id, updates)
        assert updated
        return self._to_response(updated)

    def set_primary(
        self, current: CurrentUser, location_id: str, tenant_id: str | None
    ) -> LocationResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        updated = self.repo.set_primary_location(effective, location_id)
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
        return self._to_response(updated)

    def _ensure_can_read_location(self, current: CurrentUser, item: dict) -> None:
        if current.role in (Role.PLATFORM_ADMIN, Role.FLEET_ADMIN):
            return
        if current.location_id and item.get("locationId") != current.location_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    @staticmethod
    def _to_response(item: dict) -> LocationResponse:
        return LocationResponse(
            locationId=item["locationId"],
            tenantId=item["tenantId"],
            name=item["name"],
            code=item.get("code"),
            street=item.get("street"),
            city=item.get("city"),
            state=item.get("state"),
            country=item.get("country"),
            status=LocationStatus(item["status"]),
            isPrimary=bool(item.get("isPrimary")),
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )


LOCATION_READ_ROLES = _location_read_roles()
LOCATION_WRITE_ROLES = _location_write_roles()
