from fastapi import APIRouter, Body, Depends, Query



from app.core.dependencies import CurrentUser, require_roles

from app.models import Role

from app.schemas.fleet import (

    CreateTripRequest,

    EndTripRequest,

    TripResponse,

    UpdateTripLocationRequest,

    UpdateTripRequest,

)

from app.services.trip_service import TripService



router = APIRouter(prefix="/trips", tags=["trips"])



READ_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.LOCATION_HEAD,
    Role.FLEET_MANAGER,
    Role.VIEWER,
    Role.DRIVER,
)

TRIP_WRITE_ROLES = (
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.LOCATION_HEAD,
    Role.FLEET_MANAGER,
    Role.DRIVER,
)





@router.get("", response_model=list[TripResponse])

def list_trips(

    tenantId: str | None = Query(default=None),

    activeOnly: bool = Query(default=False),

    openOnly: bool = Query(default=False),

    assignmentId: str | None = Query(default=None),

    current: CurrentUser = Depends(require_roles(*READ_ROLES)),

) -> list[TripResponse]:

    return TripService().list_trips(

        current,

        tenantId,

        active_only=activeOnly,

        open_only=openOnly,

        assignment_id=assignmentId,

    )





@router.post("", response_model=TripResponse, status_code=201)

def create_trip(

    body: CreateTripRequest,

    current: CurrentUser = Depends(require_roles(*TRIP_WRITE_ROLES)),

) -> TripResponse:

    return TripService().create_trip(current, body)





@router.get("/{trip_id}", response_model=TripResponse)

def get_trip(

    trip_id: str,

    tenantId: str | None = Query(default=None),

    current: CurrentUser = Depends(require_roles(*READ_ROLES)),

) -> TripResponse:

    return TripService().get_trip(current, trip_id, tenantId)





@router.patch("/{trip_id}", response_model=TripResponse)

def update_trip(

    trip_id: str,

    body: UpdateTripRequest,

    tenantId: str | None = Query(default=None),

    current: CurrentUser = Depends(require_roles(*TRIP_WRITE_ROLES)),

) -> TripResponse:

    return TripService().update_trip(current, trip_id, body, tenantId)





@router.post("/{trip_id}/start", response_model=TripResponse)

def start_scheduled_trip(

    trip_id: str,

    tenantId: str | None = Query(default=None),

    current: CurrentUser = Depends(require_roles(*TRIP_WRITE_ROLES)),

) -> TripResponse:

    return TripService().activate_trip(current, trip_id, tenantId)





@router.post("/{trip_id}/end", response_model=TripResponse)

def end_trip(

    trip_id: str,

    tenantId: str | None = Query(default=None),

    cancel: bool = Query(default=False),

    body: EndTripRequest | None = Body(default=None),

    current: CurrentUser = Depends(require_roles(*TRIP_WRITE_ROLES)),

) -> TripResponse:

    cancelled = body.cancel if body is not None else cancel
    fuel = body.fuelRequiredLiters if body is not None else None
    return TripService().end_trip(
        current,
        trip_id,
        tenantId,
        cancelled=cancelled,
        fuel_required_liters=fuel,
    )





@router.post("/{trip_id}/location", response_model=TripResponse)

def update_trip_location(

    trip_id: str,

    body: UpdateTripLocationRequest,

    tenantId: str | None = Query(default=None),

    current: CurrentUser = Depends(require_roles(*TRIP_WRITE_ROLES)),

) -> TripResponse:

    return TripService().update_location(current, trip_id, body, tenantId)

