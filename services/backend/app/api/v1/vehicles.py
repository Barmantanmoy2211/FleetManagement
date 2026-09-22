from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response

from app.core.dependencies import CurrentUser, require_roles
from app.models import Role
from app.schemas.fleet import (
    AssignmentResponse,
    CreateAssignmentRequest,
    CreateDriverRequest,
    CreateVehicleRequest,
    DriverResponse,
    ImportVehiclesResponse,
    UpdateDriverRequest,
    UpdateVehicleRequest,
    VehicleResponse,
)
from app.services.fleet_service import AssignmentService, DriverService, VehicleService
from app.services.tenant_scope import resolve_effective_tenant

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

READ_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.LOCATION_HEAD,
    Role.FLEET_MANAGER,
    Role.VIEWER,
    Role.DRIVER,
)
WRITE_ROLES = (Role.PLATFORM_ADMIN, Role.FLEET_ADMIN)


@router.get("/import-template")
def download_vehicle_import_template(
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> Response:
    resolve_effective_tenant(current, tenantId)
    data = VehicleService().build_import_template()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="vehicle-import-template.xlsx"'
        },
    )


@router.post("/import", response_model=ImportVehiclesResponse)
async def import_vehicles_from_excel(
    file: UploadFile = File(...),
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> ImportVehiclesResponse:
    raw = await file.read()
    if not raw:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file"
        )
    return VehicleService().import_from_excel(current, tenantId, raw)


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


@router.delete("/{vehicle_id}", response_model=VehicleResponse)
def delete_vehicle(
    vehicle_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*WRITE_ROLES)),
) -> VehicleResponse:
    return VehicleService().delete_vehicle(current, vehicle_id, tenantId)
