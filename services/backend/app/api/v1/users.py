from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUser, require_roles
from app.models import Role
from app.schemas import CreateUserRequest, CreateUserResponse, UserResponse
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
def list_users(
    tenant_id: str | None = Query(default=None, alias="tenantId"),
    current: CurrentUser = Depends(
        require_roles(Role.PLATFORM_ADMIN, Role.FLEET_ADMIN),
    ),
) -> list[UserResponse]:
    return UserService().list_users(current, tenant_id)


@router.post("", response_model=CreateUserResponse, status_code=201)
def create_user(
    body: CreateUserRequest,
    current: CurrentUser = Depends(
        require_roles(Role.PLATFORM_ADMIN, Role.FLEET_ADMIN),
    ),
) -> CreateUserResponse:
    return UserService().create_user(current, body)
