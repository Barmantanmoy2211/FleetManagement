from fastapi import APIRouter, Depends

from app.core.dependencies import CurrentUser, require_roles
from app.models import Role
from app.schemas import CreateTenantRequest, TenantDetailResponse, TenantResponse, UpdateTenantRequest
from app.services.tenant_service import TenantService

router = APIRouter(prefix="/tenants", tags=["tenants"])

TENANT_DETAIL_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.LOCATION_HEAD,
    Role.FLEET_MANAGER,
)


@router.get("", response_model=list[TenantResponse])
def list_tenants(
    _: CurrentUser = Depends(require_roles(Role.PLATFORM_ADMIN)),
) -> list[TenantResponse]:
    return TenantService().list_tenants()


@router.post("", response_model=TenantResponse, status_code=201)
def create_tenant(
    body: CreateTenantRequest,
    current: CurrentUser = Depends(require_roles(Role.PLATFORM_ADMIN)),
) -> TenantResponse:
    return TenantService().create_tenant(body, current.user_id)


@router.get("/{tenant_id}", response_model=TenantDetailResponse)
def get_tenant_detail(
    tenant_id: str,
    current: CurrentUser = Depends(require_roles(*TENANT_DETAIL_ROLES)),
) -> TenantDetailResponse:
    return TenantService().get_tenant_detail(current, tenant_id)


@router.patch("/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: str,
    body: UpdateTenantRequest,
    current: CurrentUser = Depends(require_roles(Role.PLATFORM_ADMIN)),
) -> TenantResponse:
    return TenantService().update_tenant(tenant_id, body, current.user_id)


@router.delete("/{tenant_id}", response_model=TenantResponse)
def delete_tenant(
    tenant_id: str,
    current: CurrentUser = Depends(require_roles(Role.PLATFORM_ADMIN)),
) -> TenantResponse:
    return TenantService().delete_tenant(tenant_id, current.user_id)
