from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUser, require_roles
from app.models import Role
from app.schemas.fleet import AssignmentResponse, CreateAssignmentRequest, UpdateAssignmentRequest
from app.services.fleet_service import AssignmentService

router = APIRouter(prefix="/assignments", tags=["assignments"])

READ_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.LOCATION_HEAD,
    Role.FLEET_MANAGER,
    Role.VIEWER,
    Role.DRIVER,
)
ASSIGN_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.LOCATION_HEAD,
    Role.FLEET_MANAGER,
)


@router.get("", response_model=list[AssignmentResponse])
def list_assignments(
    tenantId: str | None = Query(default=None),
    activeOnly: bool = Query(default=False),
    driverId: str | None = Query(default=None),
    vehicleId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*READ_ROLES)),
) -> list[AssignmentResponse]:
    return AssignmentService().list_assignments(
        current,
        tenantId,
        active_only=activeOnly,
        driver_id=driverId,
        vehicle_id=vehicleId,
    )


@router.post("", response_model=AssignmentResponse, status_code=201)
def create_assignment(
    body: CreateAssignmentRequest,
    current: CurrentUser = Depends(require_roles(*ASSIGN_ROLES)),
) -> AssignmentResponse:
    return AssignmentService().create_assignment(current, body)


@router.get("/{assignment_id}", response_model=AssignmentResponse)
def get_assignment(
    assignment_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*READ_ROLES)),
) -> AssignmentResponse:
    return AssignmentService().get_assignment(current, assignment_id, tenantId)


@router.patch("/{assignment_id}", response_model=AssignmentResponse)
def update_assignment(
    assignment_id: str,
    body: UpdateAssignmentRequest,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*ASSIGN_ROLES)),
) -> AssignmentResponse:
    return AssignmentService().update_assignment(
        current, assignment_id, body, tenantId
    )


@router.delete("/{assignment_id}", response_model=AssignmentResponse)
def delete_assignment(
    assignment_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*ASSIGN_ROLES)),
) -> AssignmentResponse:
    return AssignmentService().delete_assignment(current, assignment_id, tenantId)


@router.post("/{assignment_id}/activate", response_model=AssignmentResponse)
def activate_assignment(
    assignment_id: str,
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(require_roles(*ASSIGN_ROLES)),
) -> AssignmentResponse:
    return AssignmentService().activate_assignment(current, assignment_id, tenantId)


@router.post("/{assignment_id}/end", response_model=AssignmentResponse)
def end_assignment(
    assignment_id: str,
    tenantId: str | None = Query(default=None),
    cancel: bool = Query(default=False),
    current: CurrentUser = Depends(require_roles(*ASSIGN_ROLES)),
) -> AssignmentResponse:
    return AssignmentService().end_assignment(
        current, assignment_id, tenantId, cancelled=cancel
    )
