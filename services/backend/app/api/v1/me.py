from fastapi import APIRouter, Depends

from app.core.dependencies import CurrentUser, parse_current_user
from app.schemas import MeResponse
from app.services.user_service import UserService

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeResponse)
def get_me(current: CurrentUser = Depends(parse_current_user)) -> MeResponse:
    user_service = UserService()
    profile = user_service.get_me(current)
    tenant_id = current.tenant_id
    if profile:
        tenant_id = profile.tenantId
    return MeResponse(
        userId=current.user_id,
        tenantId=tenant_id,
        email=current.email or (profile.email if profile else ""),
        role=current.role,
    )
