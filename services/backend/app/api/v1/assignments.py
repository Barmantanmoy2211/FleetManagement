from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUser, require_roles
from app.models import Role
from app.schemas.fleet import AssignmentResponse, CreateAssignmentRequest
from app.services.fleet_service import AssignmentService

router = APIRouter(prefix="/assignments", tags=["assignments"])

READ_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.FLEET_MANAGER,
    Role.VIEWER,
    Role.DRIVER,
)
ASSIGN_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.FLEET_MANAGER,
)


@router.get("", response_model=list[AssignmentResponse])
def list_assignments(
    tenantId: str | None = Query(default=None),
    activeOnly: bool = Query(default=False),
    current: CurrentUser = Depends(require_roles(*READ_ROLES)),
) -> list[AssignmentResponse]:
    return AssignmentService().list_assignments(current, tenantId, active_only=activeOnly)


@router.post("", response_model=AssignmentResponse, status_code=201)
def create_assignment(
    body: CreateAssignmentRequest,
    current: CurrentUser = Depends(require_roles(*ASSIGN_ROLES)),
) -> AssignmentResponse:
    return AssignmentService().create_assignment(current, body)


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
