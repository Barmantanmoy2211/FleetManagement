from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUser, require_roles
from app.models import Role
from app.schemas.fleet import (
    DriverImportCandidate,
    DriverResponse,
    ImportDriversFromUsersRequest,
    SyncDriversResponse,
    UpdateDriverRequest,
)
from app.services.fleet_service import DriverService

router = APIRouter(prefix="/drivers", tags=["drivers"])

READ_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.FLEET_MANAGER,
    Role.VIEWER,
    Role.DRIVER,
)
WRITE_ROLES = (Role.PLATFORM_ADMIN, Role.FLEET_ADMIN)


@router.get("", response_model=list[DriverResponse])
def list_drivers(
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*READ_ROLES)),
) -> list[DriverResponse]:
    return DriverService().list_drivers(current, tenantId)


@router.get("/import-candidates", response_model=list[DriverImportCandidate])
def list_driver_import_candidates(
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> list[DriverImportCandidate]:
    return DriverService().list_import_candidates(current, tenantId)


@router.post("/sync-from-users", response_model=SyncDriversResponse)
def sync_drivers_from_users(
    body: ImportDriversFromUsersRequest,
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> SyncDriversResponse:
    return DriverService().sync_from_users(current, body)


@router.get("/{driver_id}", response_model=DriverResponse)
def get_driver(
    driver_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*READ_ROLES)),
) -> DriverResponse:
    return DriverService().get_driver(current, driver_id, tenantId)


@router.patch("/{driver_id}", response_model=DriverResponse)
def update_driver(
    driver_id: str,
    body: UpdateDriverRequest,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> DriverResponse:
    return DriverService().update_driver(current, driver_id, body, tenantId)
