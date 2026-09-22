from fastapi import APIRouter, Depends, Query

from app.core.dependencies import CurrentUser, parse_current_user
from app.schemas import MeResponse, UpdateMeRequest
from app.schemas.location import OrgChartNode
from app.services.org_chart_service import OrgChartService
from app.services.user_service import UserService

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeResponse)
def get_me(current: CurrentUser = Depends(parse_current_user)) -> MeResponse:
    user_service = UserService()
    profile = user_service.get_me(current)
    return user_service.me_response(current, profile)


@router.get("/me/org-chart", response_model=OrgChartNode)
def get_org_chart(
    tenantId: str | None = Query(default=None),
    current: CurrentUser = Depends(parse_current_user),
) -> OrgChartNode:
    return OrgChartService().get_org_chart(current, tenantId)


@router.patch("/me", response_model=MeResponse)
def update_me(
    body: UpdateMeRequest,
    current: CurrentUser = Depends(parse_current_user),
) -> MeResponse:
    return UserService().update_me(current, body.timeZone)
