from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.core.dependencies import CurrentUser
from app.models import AssignmentStatus, DriverStatus, Role, TripStatus, VehicleStatus
from app.repositories.dynamodb import DynamoDBRepository
from app.schemas.fleet import CreateTripRequest, TripResponse, UpdateTripLocationRequest, UpdateTripRequest
from app.services.fleet_service import assignment_allowed_for_fleet_manager
from app.services.tenant_scope import resolve_effective_tenant
from app.services.location_scope import assert_location_access, repo_location_filter
from app.services.trip_route import driving_route_distance_km
from app.services.trip_scheduling import (
    parse_iso,
    trip_blocking_window,
    windows_overlap,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_assignment_for_trip(
    repo: DynamoDBRepository,
    current: CurrentUser,
    tenant_id: str,
    assignment: dict | None,
) -> dict:
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )
    if assignment.get("status") != AssignmentStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment is not active",
        )
    if current.role == Role.FLEET_MANAGER and not assignment_allowed_for_fleet_manager(
        repo, tenant_id, assignment, current.user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )
    return assignment


def _assert_no_assignment_overlap(
    repo: DynamoDBRepository,
    tenant_id: str,
    assignment_id: str,
    window: tuple[datetime, datetime],
    *,
    exclude_trip_id: str | None = None,
) -> None:
    for trip in repo.list_trips_for_assignment(tenant_id, assignment_id):
        if exclude_trip_id and trip.get("tripId") == exclude_trip_id:
            continue
        blocking = trip_blocking_window(trip)
        if blocking and windows_overlap(window, blocking):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Assignment already has a trip in this time period",
            )


def _assert_driver_vehicle_available_for_live_trip(
    repo: DynamoDBRepository,
    tenant_id: str,
    driver_id: str,
    vehicle_id: str,
) -> None:
    if repo.get_active_trip_for_driver(tenant_id, driver_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Driver already has a trip in progress",
        )
    if repo.get_active_trip_for_vehicle(tenant_id, vehicle_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vehicle already has a trip in progress",
        )


class TripService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def list_trips(
        self,
        current: CurrentUser,
        tenant_id: str | None,
        active_only: bool = False,
        open_only: bool = False,
        assignment_id: str | None = None,
    ) -> list[TripResponse]:
        effective = resolve_effective_tenant(current, tenant_id)
        loc = repo_location_filter(self.repo, current, effective)
        items = self.repo.list_trips_for_tenant(
            effective,
            active_only=active_only,
            open_only=open_only,
            assignment_id=assignment_id,
            location_id=loc,
        )
        return [self._to_response(i) for i in items]

    def get_trip(
        self, current: CurrentUser, trip_id: str, tenant_id: str | None
    ) -> TripResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_trip(effective, trip_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
            )
        assert_location_access(current, effective, item, self.repo)
        return self._to_response(item)

    def create_trip(self, current: CurrentUser, body: CreateTripRequest) -> TripResponse:
        effective = resolve_effective_tenant(current, body.tenantId)
        assignment = _ensure_assignment_for_trip(
            self.repo, current, effective, self.repo.get_assignment(effective, body.assignmentId)
        )

        try:
            sched_start = parse_iso(body.scheduledStartTime)
            sched_end = parse_iso(body.scheduledEndTime)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid scheduled date/time",
            ) from exc

        if sched_end <= sched_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End time must be after start time",
            )

        now = datetime.now(timezone.utc)
        if sched_end <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trip end time must be in the future",
            )

        window = (sched_start, sched_end)
        _assert_no_assignment_overlap(
            self.repo, effective, body.assignmentId, window
        )

        driver_id = assignment["driverId"]
        vehicle_id = assignment["vehicleId"]
        sched_start_iso = sched_start.isoformat()
        sched_end_iso = sched_end.isoformat()
        route_km = driving_route_distance_km(
            body.pickupLatitude,
            body.pickupLongitude,
            body.destinationLatitude,
            body.destinationLongitude,
        )

        trip = self.repo.create_trip(
            tenant_id=effective,
            assignment_id=body.assignmentId,
            driver_id=driver_id,
            vehicle_id=vehicle_id,
            started_by=current.user_id,
            scheduled_start_time=sched_start_iso,
            scheduled_end_time=sched_end_iso,
            status=TripStatus.SCHEDULED,
            start_time=sched_start_iso,
            pickup_latitude=body.pickupLatitude,
            pickup_longitude=body.pickupLongitude,
            destination_latitude=body.destinationLatitude,
            destination_longitude=body.destinationLongitude,
            route_distance_km=route_km,
            location_id=assignment.get("locationId")
            or self.repo.get_primary_location_id(effective),
        )

        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="TRIP_CREATE",
            resource=f"trip:{trip['tripId']}",
            after={
                "assignmentId": body.assignmentId,
                "status": trip["status"],
            },
        )
        return self._to_response(trip)

    def activate_trip(
        self, current: CurrentUser, trip_id: str, tenant_id: str | None
    ) -> TripResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        existing = self.repo.get_trip(effective, trip_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
            )
        if existing.get("status") != TripStatus.SCHEDULED.value:
            if (
                existing.get("status") == TripStatus.IN_PROGRESS.value
                and not existing.get("actualStartTime")
            ):
                now = datetime.now(timezone.utc)
                updated = self.repo.record_actual_trip_start(
                    effective, trip_id, start_time=now.isoformat()
                )
                if not updated:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Trip could not be started",
                    )
                self.repo.write_audit(
                    tenant_id=effective,
                    actor_user_id=current.user_id,
                    action="TRIP_START",
                    resource=f"trip:{trip_id}",
                    after={"actualStartTime": now.isoformat()},
                )
                return self._to_response(updated)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trip is not scheduled",
            )

        assignment = _ensure_assignment_for_trip(
            self.repo,
            current,
            effective,
            self.repo.get_assignment(effective, existing["assignmentId"]),
        )
        if assignment["driverId"] != existing["driverId"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignment no longer matches trip",
            )

        now = datetime.now(timezone.utc)
        sched_end = parse_iso(existing["scheduledEndTime"])
        if now >= sched_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Scheduled trip window has ended",
            )

        window = (now, sched_end)
        _assert_no_assignment_overlap(
            self.repo,
            effective,
            existing["assignmentId"],
            window,
            exclude_trip_id=trip_id,
        )
        _assert_driver_vehicle_available_for_live_trip(
            self.repo,
            effective,
            existing["driverId"],
            existing["vehicleId"],
        )

        updated = self.repo.activate_scheduled_trip(
            effective, trip_id, start_time=now.isoformat()
        )
        assert updated
        self.repo.update_driver(
            effective,
            existing["driverId"],
            {"status": DriverStatus.ON_TRIP.value},
        )
        self.repo.update_vehicle(
            effective,
            existing["vehicleId"],
            {"status": VehicleStatus.IN_TRIP.value},
        )
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="TRIP_START",
            resource=f"trip:{trip_id}",
            after={"status": TripStatus.IN_PROGRESS.value},
        )
        return self._to_response(updated)

    def update_trip(
        self,
        current: CurrentUser,
        trip_id: str,
        body: UpdateTripRequest,
        tenant_id: str | None,
    ) -> TripResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        existing = self.repo.get_trip(effective, trip_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
            )
        _ensure_assignment_for_trip(
            self.repo,
            current,
            effective,
            self.repo.get_assignment(effective, existing["assignmentId"]),
        )

        status_val = existing.get("status")
        route_fields_set = any(
            v is not None
            for v in (
                body.pickupLatitude,
                body.pickupLongitude,
                body.destinationLatitude,
                body.destinationLongitude,
            )
        )
        schedule_fields_set = (
            body.scheduledStartTime is not None or body.scheduledEndTime is not None
        )

        if status_val == TripStatus.IN_PROGRESS.value:
            if schedule_fields_set:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Schedule cannot be changed after the trip has started",
                )
            if not route_fields_set:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No route fields to update",
                )
            plat = (
                body.pickupLatitude
                if body.pickupLatitude is not None
                else float(existing.get("pickupLatitude", 0))
            )
            plng = (
                body.pickupLongitude
                if body.pickupLongitude is not None
                else float(existing.get("pickupLongitude", 0))
            )
            dlat = (
                body.destinationLatitude
                if body.destinationLatitude is not None
                else float(existing.get("destinationLatitude", 0))
            )
            dlng = (
                body.destinationLongitude
                if body.destinationLongitude is not None
                else float(existing.get("destinationLongitude", 0))
            )
            route_km = driving_route_distance_km(plat, plng, dlat, dlng)
            updated = self.repo.update_trip_route(
                effective,
                trip_id,
                pickup_latitude=plat,
                pickup_longitude=plng,
                destination_latitude=dlat,
                destination_longitude=dlng,
                route_distance_km=route_km,
            )
            if not updated:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Trip route could not be updated",
                )
            return self._to_response(updated)

        if status_val != TripStatus.SCHEDULED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only scheduled trips can be edited",
            )

        try:
            sched_start = parse_iso(
                body.scheduledStartTime or existing["scheduledStartTime"]
            )
            sched_end = parse_iso(
                body.scheduledEndTime or existing["scheduledEndTime"]
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid scheduled date/time",
            ) from exc

        if sched_end <= sched_start:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End time must be after start time",
            )
        now = datetime.now(timezone.utc)
        if sched_end <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trip end time must be in the future",
            )

        window = (sched_start, sched_end)
        _assert_no_assignment_overlap(
            self.repo,
            effective,
            existing["assignmentId"],
            window,
            exclude_trip_id=trip_id,
        )

        plat = (
            body.pickupLatitude
            if body.pickupLatitude is not None
            else float(existing.get("pickupLatitude", 0))
        )
        plng = (
            body.pickupLongitude
            if body.pickupLongitude is not None
            else float(existing.get("pickupLongitude", 0))
        )
        dlat = (
            body.destinationLatitude
            if body.destinationLatitude is not None
            else float(existing.get("destinationLatitude", 0))
        )
        dlng = (
            body.destinationLongitude
            if body.destinationLongitude is not None
            else float(existing.get("destinationLongitude", 0))
        )
        route_km = driving_route_distance_km(plat, plng, dlat, dlng)

        updated = self.repo.update_trip_schedule(
            effective,
            trip_id,
            scheduled_start_time=sched_start.isoformat(),
            scheduled_end_time=sched_end.isoformat(),
            pickup_latitude=plat,
            pickup_longitude=plng,
            destination_latitude=dlat,
            destination_longitude=dlng,
            route_distance_km=route_km,
        )
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trip could not be updated",
            )
        return self._to_response(updated)

    def end_trip(
        self,
        current: CurrentUser,
        trip_id: str,
        tenant_id: str | None,
        *,
        cancelled: bool = False,
        fuel_required_liters: float | None = None,
    ) -> TripResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        existing = self.repo.get_trip(effective, trip_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
            )
        status_val = existing.get("status")
        if status_val not in (
            TripStatus.IN_PROGRESS.value,
            TripStatus.SCHEDULED.value,
        ):
            return self._to_response(existing)

        if status_val == TripStatus.SCHEDULED.value and not cancelled:
            cancelled = True

        time_taken_minutes: float | None = None
        if not cancelled and status_val == TripStatus.IN_PROGRESS.value:
            actual = existing.get("actualStartTime")
            if not actual:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Trip must be started before it can be completed",
                )
            if fuel_required_liters is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Fuel required (liters) is required to end the trip",
                )
            end_dt = datetime.now(timezone.utc)
            try:
                start_dt = parse_iso(actual)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid actual start time on trip",
                ) from exc
            delta = end_dt - start_dt
            time_taken_minutes = round(max(0.0, delta.total_seconds() / 60.0), 2)

        ended = self.repo.end_trip(
            effective,
            trip_id,
            cancelled=cancelled,
            time_taken_minutes=time_taken_minutes,
            fuel_required_liters=fuel_required_liters,
        )
        assert ended
        if status_val == TripStatus.IN_PROGRESS.value:
            driver_id = existing["driverId"]
            vehicle_id = existing["vehicleId"]
            self.repo.update_driver(
                effective,
                driver_id,
                {"status": DriverStatus.ASSIGNED.value},
            )
            self.repo.update_vehicle(
                effective,
                vehicle_id,
                {"status": VehicleStatus.ASSIGNED.value},
            )
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="TRIP_END",
            resource=f"trip:{trip_id}",
            after={"status": ended["status"]},
        )
        return self._to_response(ended)

    def update_location(
        self,
        current: CurrentUser,
        trip_id: str,
        body: UpdateTripLocationRequest,
        tenant_id: str | None,
    ) -> TripResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        trip = self.repo.get_trip(effective, trip_id)
        if not trip:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
            )
        if trip.get("status") != TripStatus.IN_PROGRESS.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trip is not in progress",
            )
        updated = self.repo.update_trip_location(
            effective, trip_id, body.latitude, body.longitude
        )
        assert updated
        self.repo.update_vehicle(
            effective,
            trip["vehicleId"],
            {
                "lastLatitude": body.latitude,
                "lastLongitude": body.longitude,
            },
        )
        return self._to_response(updated)

    @staticmethod
    def _to_response(item: dict) -> TripResponse:
        lat = item.get("lastLatitude")
        lng = item.get("lastLongitude")
        if lat is not None and not isinstance(lat, float):
            lat = float(lat)
        if lng is not None and not isinstance(lng, float):
            lng = float(lng)
        sched_start = item.get("scheduledStartTime") or item.get("startTime")
        sched_end = item.get("scheduledEndTime") or item.get("endTime")
        if not sched_end and item.get("startTime"):
            try:
                start = parse_iso(item["startTime"])
                sched_end = (start + timedelta(hours=8)).isoformat()
            except ValueError:
                sched_end = item["startTime"]
        def _float_field(key: str, default: float = 0.0) -> float:
            raw = item.get(key)
            if raw is None:
                return default
            return float(raw)

        def _optional_float(key: str) -> float | None:
            raw = item.get(key)
            if raw is None:
                return None
            return float(raw)

        return TripResponse(
            tripId=item["tripId"],
            tenantId=item["tenantId"],
            assignmentId=item["assignmentId"],
            driverId=item["driverId"],
            vehicleId=item["vehicleId"],
            status=item["status"],
            scheduledStartTime=sched_start,
            scheduledEndTime=sched_end or sched_start,
            actualStartTime=item.get("actualStartTime"),
            pickupLatitude=_float_field("pickupLatitude"),
            pickupLongitude=_float_field("pickupLongitude"),
            destinationLatitude=_float_field("destinationLatitude"),
            destinationLongitude=_float_field("destinationLongitude"),
            routeDistanceKm=_float_field("routeDistanceKm"),
            timeTakenMinutes=_optional_float("timeTakenMinutes"),
            fuelRequiredLiters=_optional_float("fuelRequiredLiters"),
            startTime=item["startTime"],
            endTime=item.get("endTime"),
            lastLatitude=lat,
            lastLongitude=lng,
            startedBy=item["startedBy"],
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )
