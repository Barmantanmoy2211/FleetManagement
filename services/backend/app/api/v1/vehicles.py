from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUser, require_roles
from app.models import Role
from app.schemas.fleet import (
    AssignmentResponse,
    CreateAssignmentRequest,
    CreateDriverRequest,
    CreateVehicleRequest,
    DriverResponse,
    UpdateDriverRequest,
    UpdateVehicleRequest,
    VehicleResponse,
)
from app.services.fleet_service import AssignmentService, DriverService, VehicleService

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

READ_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.FLEET_MANAGER,
    Role.VIEWER,
    Role.DRIVER,
)
WRITE_ROLES = (Role.PLATFORM_ADMIN, Role.FLEET_ADMIN)


@router.get("", response_model=list[VehicleResponse])
def list_vehicles(
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*READ_ROLES)),
) -> list[VehicleResponse]:
    return VehicleService().list_vehicles(current, tenantId)


@router.post("", response_model=VehicleResponse, status_code=201)
def create_vehicle(
    body: CreateVehicleRequest,
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> VehicleResponse:
    return VehicleService().create_vehicle(current, body)


@router.get("/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(
    vehicle_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*READ_ROLES)),
) -> VehicleResponse:
    return VehicleService().get_vehicle(current, vehicle_id, tenantId)


@router.patch("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(
    vehicle_id: str,
    body: UpdateVehicleRequest,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> VehicleResponse:
    return VehicleService().update_vehicle(current, vehicle_id, body, tenantId)
