from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUser, require_roles
from app.schemas.location import (
    CreateLocationRequest,
    LocationResponse,
    UpdateLocationRequest,
)
from app.services.location_service import (
    LOCATION_READ_ROLES,
    LOCATION_WRITE_ROLES,
    LocationService,
)

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("", response_model=list[LocationResponse])
def list_locations(
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*LOCATION_READ_ROLES)),
) -> list[LocationResponse]:
    return LocationService().list_locations(current, tenantId)


@router.post("", response_model=LocationResponse, status_code=201)
def create_location(
    body: CreateLocationRequest,
    current: CurrentUser = Depends(require_roles(*LOCATION_WRITE_ROLES)),
) -> LocationResponse:
    return LocationService().create_location(current, body)


@router.get("/{location_id}", response_model=LocationResponse)
def get_location(
    location_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*LOCATION_READ_ROLES)),
) -> LocationResponse:
    return LocationService().get_location(current, location_id, tenantId)


@router.patch("/{location_id}", response_model=LocationResponse)
def update_location(
    location_id: str,
    body: UpdateLocationRequest,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*LOCATION_WRITE_ROLES)),
) -> LocationResponse:
    return LocationService().update_location(current, location_id, body, tenantId)


@router.post("/{location_id}/set-primary", response_model=LocationResponse)
def set_primary_location(
    location_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*LOCATION_WRITE_ROLES)),
) -> LocationResponse:
    return LocationService().set_primary(current, location_id, tenantId)
