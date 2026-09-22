from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.core.dependencies import CurrentUser
from app.models import AssignmentStatus, DriverStatus, EmployeePersona, LeaseOwnershipType, Role, VehicleStatus
from app.repositories.dynamodb import DynamoDBRepository
from app.schemas.fleet import (
    AssignmentResponse,
    CreateAssignmentRequest,
    CreateVehicleRequest,
    DriverResponse,
    DriverImportCandidate,
    ImportDriversFromUsersRequest,
    ImportVehicleRowError,
    ImportVehiclesResponse,
    SyncDriversResponse,
    UpdateAssignmentRequest,
    UpdateDriverRequest,
    UpdateVehicleRequest,
    VehicleResponse,
)
from app.services.tenant_scope import resolve_effective_tenant
from app.services.location_scope import (
    ALL_LOCATIONS,
    assert_location_access,
    repo_location_filter,
    resolve_effective_location_id,
    resolve_location_scope,
)
from app.services.vehicle_excel import (
    build_vehicle_import_template_bytes,
    parse_vehicle_import_rows,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _assignment_change_date(item: dict) -> date:
    raw = item.get("changeDate")
    if raw:
        return date.fromisoformat(str(raw)[:10])
    start = item.get("startTime") or ""
    if len(start) >= 10:
        return date.fromisoformat(start[:10])
    return date.today()


def _assignment_release_date(item: dict) -> date | None:
    raw = item.get("releaseDate")
    if not raw:
        return None
    return date.fromisoformat(str(raw)[:10])


def managed_driver_user_ids_for_fleet_manager(
    repo: DynamoDBRepository, tenant_id: str, manager_user_id: str
) -> set[str]:
    ids: set[str] = set()
    for emp in repo.list_employees_for_tenant(tenant_id):
        if emp.get("persona") != EmployeePersona.DRIVER.value:
            continue
        if emp.get("driverManagerUserId") != manager_user_id:
            continue
        linked = emp.get("linkedUserId")
        if linked:
            ids.add(str(linked))
            continue
        email = (emp.get("email") or "").strip()
        if email:
            user = repo.find_user_by_email(tenant_id, email)
            if user and user.get("role") == Role.DRIVER.value:
                ids.add(str(user["userId"]))
    return ids


def filter_driver_items_for_user_ids(
    repo: DynamoDBRepository,
    tenant_id: str,
    items: list[dict],
    allowed_user_ids: set[str],
) -> list[dict]:
    if not allowed_user_ids:
        return []
    allowed_emails: set[str] = set()
    for user in repo.list_users_for_tenant(tenant_id):
        if str(user.get("userId")) in allowed_user_ids:
            email = (user.get("email") or "").strip().lower()
            if email:
                allowed_emails.add(email)
    filtered: list[dict] = []
    for item in items:
        linked = item.get("linkedUserId")
        if linked and str(linked) in allowed_user_ids:
            filtered.append(item)
            continue
        email = (item.get("email") or "").strip().lower()
        if email and email in allowed_emails:
            filtered.append(item)
    return filtered


def driver_item_allowed_for_user_ids(
    repo: DynamoDBRepository,
    tenant_id: str,
    driver: dict,
    allowed_user_ids: set[str],
) -> bool:
    if not allowed_user_ids:
        return False
    linked = driver.get("linkedUserId")
    if linked and str(linked) in allowed_user_ids:
        return True
    email = (driver.get("email") or "").strip().lower()
    if not email:
        return False
    user = repo.find_user_by_email(tenant_id, email)
    return bool(user and str(user.get("userId")) in allowed_user_ids)


def assignment_allowed_for_fleet_manager(
    repo: DynamoDBRepository,
    tenant_id: str,
    assignment: dict,
    manager_user_id: str,
) -> bool:
    driver = repo.get_driver(tenant_id, assignment["driverId"])
    if not driver:
        return False
    allowed = managed_driver_user_ids_for_fleet_manager(
        repo, tenant_id, manager_user_id
    )
    return driver_item_allowed_for_user_ids(repo, tenant_id, driver, allowed)


def _date_to_str(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _float_or_none(value: object | None) -> float | None:
    if value is None:
        return None
    return float(value)


class VehicleService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def build_import_template(self) -> bytes:
        return build_vehicle_import_template_bytes()

    def import_from_excel(
        self,
        current: CurrentUser,
        tenant_id: str | None,
        file_bytes: bytes,
    ) -> ImportVehiclesResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        if not self.repo.ensure_tenant_exists(effective):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

        rows, parse_errors = parse_vehicle_import_rows(file_bytes)
        errors = [ImportVehicleRowError(**e) for e in parse_errors]
        created_items: list[dict] = []

        for offset, row in enumerate(rows):
            excel_row = offset + 2
            try:
                body = self._row_to_create_request(row, effective)
                item = self._persist_create(effective, body, current)
                created_items.append(item)
            except ValidationError as exc:
                msg = exc.errors()[0]["msg"] if exc.errors() else "Validation failed"
                errors.append(ImportVehicleRowError(row=excel_row, message=msg))
            except HTTPException as exc:
                errors.append(ImportVehicleRowError(row=excel_row, message=str(exc.detail)))
            except ValueError as exc:
                errors.append(ImportVehicleRowError(row=excel_row, message=str(exc)))

        if created_items:
            self.repo.write_audit(
                tenant_id=effective,
                actor_user_id=current.user_id,
                action="VEHICLE_IMPORT",
                resource="vehicles",
                after={"created": len(created_items)},
            )

        return ImportVehiclesResponse(
            created=len(created_items),
            failed=len(errors),
            errors=errors,
            vehicles=[self._to_response(i) for i in created_items],
        )

    def list_vehicles(self, current: CurrentUser, tenant_id: str | None) -> list[VehicleResponse]:
        effective = resolve_effective_tenant(current, tenant_id)
        loc = repo_location_filter(self.repo, current, effective)
        items = self.repo.list_vehicles_for_tenant(effective, location_id=loc)
        return [self._to_response(i) for i in items]

    def create_vehicle(
        self, current: CurrentUser, body: CreateVehicleRequest
    ) -> VehicleResponse:
        effective = resolve_effective_tenant(current, body.tenantId)
        item = self._persist_create(effective, body, current)
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="VEHICLE_CREATE",
            resource=f"vehicle:{item['vehicleId']}",
            after={"vehicleName": item["vehicleName"]},
        )
        return self._to_response(item)

    def _registration_for_create(
        self, effective: str, body: CreateVehicleRequest
    ) -> str:
        if body.registrationNumber and body.registrationNumber.strip():
            reg = body.registrationNumber.strip()
            existing = self.repo.find_vehicle_by_registration(effective, reg)
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Registration number already exists for this tenant",
                )
            return reg
        for _ in range(5):
            reg = f"AUTO-{uuid.uuid4().hex[:10].upper()}"
            if not self.repo.find_vehicle_by_registration(effective, reg):
                return reg
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not allocate registration number",
        )

    def _persist_create(
        self, effective: str, body: CreateVehicleRequest, current: CurrentUser
    ) -> dict:
        if not self.repo.ensure_tenant_exists(effective):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        reg = self._registration_for_create(effective, body)
        loc = resolve_effective_location_id(
            self.repo, effective, getattr(body, "locationId", None) or current.location_id
        )
        if current.role not in (Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.LOCATION_HEAD):
            if current.location_id and loc != current.location_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot create vehicle outside your location",
                )
        return self.repo.create_vehicle(
            tenant_id=effective,
            vehicle_name=body.vehicleName.strip(),
            registration_number=reg,
            vin=body.vin.strip() if body.vin and body.vin.strip() else None,
            make=body.make.strip(),
            model=body.model.strip(),
            year=body.year,
            color=body.color,
            dot_number=body.dotNumber.strip() if body.dotNumber and body.dotNumber.strip() else None,
            lease_ownership_type=body.leaseOwnershipType,
            vehicle_type=body.vehicleType,
            vehicle_subtype=body.vehicleSubtype,
            fuel_type=body.fuelType,
            cargo_type=body.cargoType,
            weight_lbs=body.weightLbs,
            policy_number=body.policyNumber,
            covered_under_policy=body.coveredUnderPolicy,
            status=body.status,
            odometer_km=body.odometerKm,
            location_id=loc,
        )

    def _row_to_create_request(self, row: dict, tenant_id: str) -> CreateVehicleRequest:
        reg = row.get("registrationNumber")
        return CreateVehicleRequest(
            vehicleName=row["vehicleName"],
            registrationNumber=reg.strip() if reg else None,
            vin=row.get("vin"),
            make=row["make"],
            model=row["model"],
            year=row["year"],
            color=row.get("color"),
            dotNumber=row.get("dotNumber"),
            leaseOwnershipType=row.get("leaseOwnershipType"),
            vehicleType=row["vehicleType"],
            vehicleSubtype=row.get("vehicleSubtype"),
            fuelType=row["fuelType"],
            cargoType=row.get("cargoType"),
            weightLbs=row.get("weightLbs"),
            policyNumber=row.get("policyNumber"),
            coveredUnderPolicy=row.get("coveredUnderPolicy") or False,
            status=row["status"],
            tenantId=tenant_id,
        )

    def get_vehicle(
        self, current: CurrentUser, vehicle_id: str, tenant_id: str | None
    ) -> VehicleResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_vehicle(effective, vehicle_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
        assert_location_access(current, effective, item, self.repo)
        return self._to_response(item)

    def update_vehicle(
        self,
        current: CurrentUser,
        vehicle_id: str,
        body: UpdateVehicleRequest,
        tenant_id: str | None,
    ) -> VehicleResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_vehicle(effective, vehicle_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

        updates = body.model_dump(exclude_unset=True)
        if "registrationNumber" in updates and updates["registrationNumber"]:
            dup = self.repo.find_vehicle_by_registration(effective, updates["registrationNumber"])
            if dup and dup["vehicleId"] != vehicle_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Registration number already exists for this tenant",
                )
        if "vehicleType" in updates and updates["vehicleType"] is not None:
            updates["vehicleType"] = updates["vehicleType"].value
        if "fuelType" in updates and updates["fuelType"] is not None:
            updates["fuelType"] = updates["fuelType"].value
        if "leaseOwnershipType" in updates and updates["leaseOwnershipType"] is not None:
            updates["leaseOwnershipType"] = updates["leaseOwnershipType"].value
        if "status" in updates and updates["status"] is not None:
            updates["status"] = updates["status"].value

        updated = self.repo.update_vehicle(effective, vehicle_id, updates)
        assert updated
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="VEHICLE_UPDATE",
            resource=f"vehicle:{vehicle_id}",
            after=updates,
        )
        return self._to_response(updated)

    def delete_vehicle(
        self,
        current: CurrentUser,
        vehicle_id: str,
        tenant_id: str | None,
    ) -> VehicleResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_vehicle(effective, vehicle_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
        if item.get("currentAssignmentId"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="End the active assignment before removing this vehicle",
            )
        updated = self.repo.update_vehicle(
            effective,
            vehicle_id,
            {"status": VehicleStatus.INACTIVE.value},
        )
        assert updated
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="VEHICLE_DELETE",
            resource=f"vehicle:{vehicle_id}",
            after={"status": VehicleStatus.INACTIVE.value},
        )
        return self._to_response(updated)

    @staticmethod
    def _to_response(item: dict) -> VehicleResponse:
        lease_raw = item.get("leaseOwnershipType")
        lease = LeaseOwnershipType(lease_raw) if lease_raw else None
        vehicle_name = item.get("vehicleName") or item.get("registrationNumber") or "Vehicle"
        year = item.get("year")
        if year is not None and not isinstance(year, int):
            year = int(year)
        return VehicleResponse(
            vehicleId=item["vehicleId"],
            tenantId=item["tenantId"],
            locationId=item.get("locationId"),
            vehicleName=vehicle_name,
            registrationNumber=item["registrationNumber"],
            vin=item.get("vin"),
            make=item["make"],
            model=item["model"],
            year=year,
            color=item.get("color"),
            dotNumber=item.get("dotNumber"),
            leaseOwnershipType=lease,
            vehicleType=item["vehicleType"],
            vehicleSubtype=item.get("vehicleSubtype"),
            fuelType=item["fuelType"],
            cargoType=item.get("cargoType"),
            weightLbs=item.get("weightLbs"),
            policyNumber=item.get("policyNumber"),
            coveredUnderPolicy=bool(item.get("coveredUnderPolicy")),
            status=item["status"],
            odometerKm=item.get("odometerKm"),
            currentDriverId=item.get("currentDriverId"),
            currentAssignmentId=item.get("currentAssignmentId"),
            lastLatitude=_float_or_none(item.get("lastLatitude")),
            lastLongitude=_float_or_none(item.get("lastLongitude")),
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )


class DriverService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def list_drivers(self, current: CurrentUser, tenant_id: str | None) -> list[DriverResponse]:
        effective = resolve_effective_tenant(current, tenant_id)
        loc = repo_location_filter(self.repo, current, effective)
        if current.role == Role.FLEET_MANAGER:
            allowed = managed_driver_user_ids_for_fleet_manager(
                self.repo, effective, current.user_id
            )
            if allowed:
                self.repo.sync_driver_profiles_from_users(effective, list(allowed))
            items = self.repo.list_drivers_for_tenant(effective, location_id=loc)
            items = filter_driver_items_for_user_ids(
                self.repo, effective, items, allowed
            )
        else:
            items = self.repo.list_drivers_for_tenant(effective, location_id=loc)
        return [self._to_response(i) for i in items]

    def get_driver(
        self, current: CurrentUser, driver_id: str, tenant_id: str | None
    ) -> DriverResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_driver(effective, driver_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
        return self._to_response(item)

    def update_driver(
        self,
        current: CurrentUser,
        driver_id: str,
        body: UpdateDriverRequest,
        tenant_id: str | None,
    ) -> DriverResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_driver(effective, driver_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")

        updates = body.model_dump(exclude_unset=True)
        if "email" in updates and updates["email"] is not None:
            updates["email"] = str(updates["email"])
        if "licenseExpiry" in updates:
            updates["licenseExpiry"] = _date_to_str(updates.get("licenseExpiry"))
        if "joiningDate" in updates:
            updates["joiningDate"] = _date_to_str(updates.get("joiningDate"))
        if "status" in updates and updates["status"] is not None:
            updates["status"] = updates["status"].value

        updated = self.repo.update_driver(effective, driver_id, updates)
        assert updated
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="DRIVER_UPDATE",
            resource=f"driver:{driver_id}",
            after=updates,
        )
        return self._to_response(updated)

    def list_import_candidates(
        self, current: CurrentUser, tenant_id: str | None
    ) -> list[DriverImportCandidate]:
        effective = resolve_effective_tenant(current, tenant_id)
        items = self.repo.list_driver_import_candidates(effective)
        return [DriverImportCandidate(**i) for i in items]

    def sync_from_users(
        self,
        current: CurrentUser,
        body: ImportDriversFromUsersRequest,
    ) -> SyncDriversResponse:
        effective = resolve_effective_tenant(current, body.tenantId)
        created_items = self.repo.sync_driver_profiles_from_users(effective, body.userIds)
        skipped = len(body.userIds) - len(created_items)
        if skipped > 0 and len(created_items) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No driver profiles created — users may already be imported or invalid",
            )
        if created_items:
            self.repo.write_audit(
                tenant_id=effective,
                actor_user_id=current.user_id,
                action="DRIVER_SYNC_FROM_USERS",
                resource="drivers",
                after={"created": len(created_items), "userIds": body.userIds},
            )
        return SyncDriversResponse(
            created=len(created_items),
            drivers=[self._to_response(i) for i in created_items],
        )

    @staticmethod
    def _to_response(item: dict) -> DriverResponse:
        license_expiry = item.get("licenseExpiry")
        joining = item.get("joiningDate")
        return DriverResponse(
            driverId=item["driverId"],
            tenantId=item["tenantId"],
            locationId=item.get("locationId"),
            name=item["name"],
            email=item.get("email"),
            phone=item.get("phone"),
            licenseNumber=item["licenseNumber"],
            licenseType=item.get("licenseType"),
            licenseExpiry=date.fromisoformat(license_expiry) if license_expiry else None,
            status=item["status"],
            emergencyContact=item.get("emergencyContact"),
            joiningDate=date.fromisoformat(joining) if joining else None,
            currentVehicleId=item.get("currentVehicleId"),
            currentAssignmentId=item.get("currentAssignmentId"),
            linkedUserId=item.get("linkedUserId"),
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )


class AssignmentService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def list_assignments(
        self,
        current: CurrentUser,
        tenant_id: str | None,
        active_only: bool = False,
        *,
        driver_id: str | None = None,
        vehicle_id: str | None = None,
    ) -> list[AssignmentResponse]:
        effective = resolve_effective_tenant(current, tenant_id)
        loc = repo_location_filter(self.repo, current, effective)
        items = self.repo.list_assignments_for_tenant(
            effective, active_only=active_only, location_id=loc
        )
        if driver_id:
            items = [i for i in items if i.get("driverId") == driver_id]
        if vehicle_id:
            items = [i for i in items if i.get("vehicleId") == vehicle_id]
        if current.role == Role.FLEET_MANAGER:
            allowed = managed_driver_user_ids_for_fleet_manager(
                self.repo, effective, current.user_id
            )
            scoped: list[dict] = []
            for item in items:
                driver = self.repo.get_driver(effective, item["driverId"])
                if driver and driver_item_allowed_for_user_ids(
                    self.repo, effective, driver, allowed
                ):
                    scoped.append(item)
            items = scoped
        return [self._to_response(i) for i in items]

    def create_assignment(
        self, current: CurrentUser, body: CreateAssignmentRequest
    ) -> AssignmentResponse:
        effective = resolve_effective_tenant(current, body.tenantId)
        change = body.changeDate
        release = body.releaseDate
        if release and release < change:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Release date cannot be before change date",
            )

        driver = self.repo.get_driver(effective, body.driverId)
        if not driver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
        if current.role == Role.FLEET_MANAGER:
            allowed = managed_driver_user_ids_for_fleet_manager(
                self.repo, effective, current.user_id
            )
            if not driver_item_allowed_for_user_ids(
                self.repo, effective, driver, allowed
            ):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found"
                )
        vehicle = self.repo.get_vehicle(effective, body.vehicleId)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
        assert_location_access(current, effective, driver, self.repo)
        assert_location_access(current, effective, vehicle, self.repo)
        primary = self.repo.get_primary_location_id(effective)
        d_loc = driver.get("locationId") or primary
        v_loc = vehicle.get("locationId") or primary
        if d_loc != v_loc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Driver and vehicle must belong to the same location",
            )

        if driver.get("status") in (
            DriverStatus.INACTIVE.value,
            DriverStatus.SUSPENDED.value,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Driver is not available for assignment",
            )
        if vehicle.get("status") in (
            VehicleStatus.INACTIVE.value,
            VehicleStatus.MAINTENANCE.value,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vehicle is not available for assignment",
            )

        today = date.today()
        is_scheduled = change > today
        if is_scheduled:
            if self.repo.get_scheduled_assignment_for_driver(effective, body.driverId):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Driver already has a scheduled assignment",
                )
            if self.repo.get_scheduled_assignment_for_vehicle(effective, body.vehicleId):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Vehicle already has a scheduled assignment",
                )
        else:
            if self.repo.get_active_assignment_for_driver(effective, body.driverId):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Driver already has an active assignment",
                )
            if self.repo.get_active_assignment_for_vehicle(effective, body.vehicleId):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Vehicle already has an active assignment",
                )
            if driver.get("status") != DriverStatus.AVAILABLE.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Driver is not available for assignment",
                )
            if vehicle.get("status") != VehicleStatus.AVAILABLE.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Vehicle is not available for assignment",
                )

        status = (
            AssignmentStatus.SCHEDULED
            if is_scheduled
            else AssignmentStatus.ACTIVE
        )
        start_iso = datetime.combine(
            change, datetime.min.time(), tzinfo=timezone.utc
        ).isoformat()
        assignment = self.repo.create_assignment(
            tenant_id=effective,
            driver_id=body.driverId,
            vehicle_id=body.vehicleId,
            assigned_by=current.user_id,
            change_date=change.isoformat(),
            release_date=release.isoformat() if release else None,
            status=status,
            start_time=start_iso,
            location_id=d_loc,
        )
        aid = assignment["assignmentId"]
        if status == AssignmentStatus.ACTIVE:
            self.repo.update_driver(
                effective,
                body.driverId,
                {
                    "status": DriverStatus.ASSIGNED.value,
                    "currentVehicleId": body.vehicleId,
                    "currentAssignmentId": aid,
                },
            )
            self.repo.update_vehicle(
                effective,
                body.vehicleId,
                {
                    "status": VehicleStatus.ASSIGNED.value,
                    "currentDriverId": body.driverId,
                    "currentAssignmentId": aid,
                },
            )
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="ASSIGNMENT_CREATE",
            resource=f"assignment:{aid}",
            after={
                "driverId": body.driverId,
                "vehicleId": body.vehicleId,
                "changeDate": change.isoformat(),
                "releaseDate": release.isoformat() if release else None,
                "status": status.value,
            },
        )
        return self._to_response(assignment)

    def activate_assignment(
        self, current: CurrentUser, assignment_id: str, tenant_id: str | None
    ) -> AssignmentResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        existing = self.repo.get_assignment(effective, assignment_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
            )
        if existing.get("status") != AssignmentStatus.SCHEDULED.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only scheduled assignments can be activated",
            )
        change = _assignment_change_date(existing)
        if change > date.today():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Change date has not been reached yet",
            )
        driver_id = existing["driverId"]
        vehicle_id = existing["vehicleId"]
        if self.repo.get_active_assignment_for_driver(effective, driver_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Driver already has an active assignment",
            )
        if self.repo.get_active_assignment_for_vehicle(effective, vehicle_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Vehicle already has an active assignment",
            )
        driver = self.repo.get_driver(effective, driver_id)
        vehicle = self.repo.get_vehicle(effective, vehicle_id)
        assert driver and vehicle
        if driver.get("status") != DriverStatus.AVAILABLE.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Driver is not available",
            )
        if vehicle.get("status") != VehicleStatus.AVAILABLE.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vehicle is not available",
            )
        now = _now_iso()
        updated = self.repo.update_assignment_status(
            effective, assignment_id, AssignmentStatus.ACTIVE, start_time=now
        )
        assert updated
        self.repo.update_driver(
            effective,
            driver_id,
            {
                "status": DriverStatus.ASSIGNED.value,
                "currentVehicleId": vehicle_id,
                "currentAssignmentId": assignment_id,
            },
        )
        self.repo.update_vehicle(
            effective,
            vehicle_id,
            {
                "status": VehicleStatus.ASSIGNED.value,
                "currentDriverId": driver_id,
                "currentAssignmentId": assignment_id,
            },
        )
        return self._to_response(updated)

    def get_assignment(
        self,
        current: CurrentUser,
        assignment_id: str,
        tenant_id: str | None,
    ) -> AssignmentResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_assignment(effective, assignment_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
            )
        if current.role == Role.FLEET_MANAGER and not assignment_allowed_for_fleet_manager(
            self.repo, effective, item, current.user_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
            )
        return self._to_response(item)

    def update_assignment(
        self,
        current: CurrentUser,
        assignment_id: str,
        body: UpdateAssignmentRequest,
        tenant_id: str | None,
    ) -> AssignmentResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_assignment(effective, assignment_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
            )
        if current.role == Role.FLEET_MANAGER and not assignment_allowed_for_fleet_manager(
            self.repo, effective, item, current.user_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
            )
        status_val = item.get("status")
        if status_val in (
            AssignmentStatus.ENDED.value,
            AssignmentStatus.CANCELLED.value,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot edit a closed assignment",
            )
        updates = body.model_dump(exclude_unset=True)
        change = updates.get("changeDate", _assignment_change_date(item))
        release = updates.get("releaseDate", _assignment_release_date(item))
        if "releaseDate" in updates and updates["releaseDate"] is None:
            release = None
        if release and release < change:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Release date cannot be before change date",
            )
        if status_val == AssignmentStatus.ACTIVE.value and "changeDate" in updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Change date cannot be edited on an active assignment",
            )
        db_updates: dict = {}
        if "changeDate" in updates and updates["changeDate"] is not None:
            db_updates["changeDate"] = updates["changeDate"].isoformat()
        if "releaseDate" in updates:
            db_updates["releaseDate"] = (
                updates["releaseDate"].isoformat() if updates["releaseDate"] else None
            )
        updated = self.repo.update_assignment_fields(effective, assignment_id, db_updates)
        assert updated
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="ASSIGNMENT_UPDATE",
            resource=f"assignment:{assignment_id}",
            after=db_updates,
        )
        return self._to_response(updated)

    def delete_assignment(
        self,
        current: CurrentUser,
        assignment_id: str,
        tenant_id: str | None,
    ) -> AssignmentResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_assignment(effective, assignment_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
            )
        if current.role == Role.FLEET_MANAGER and not assignment_allowed_for_fleet_manager(
            self.repo, effective, item, current.user_id
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
            )
        if item.get("status") == AssignmentStatus.SCHEDULED.value:
            return self.end_assignment(
                current, assignment_id, tenant_id, cancelled=True
            )
        if item.get("status") == AssignmentStatus.ACTIVE.value:
            return self.end_assignment(current, assignment_id, tenant_id, cancelled=False)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment is already closed",
        )

    def end_assignment(
        self,
        current: CurrentUser,
        assignment_id: str,
        tenant_id: str | None,
        *,
        cancelled: bool = False,
    ) -> AssignmentResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        existing = self.repo.get_assignment(effective, assignment_id)
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
            )
        if existing.get("status") == AssignmentStatus.SCHEDULED.value:
            ended = self.repo.end_assignment(
                effective, assignment_id, cancelled=True
            )
            assert ended
            self.repo.write_audit(
                tenant_id=effective,
                actor_user_id=current.user_id,
                action="ASSIGNMENT_CANCEL",
                resource=f"assignment:{assignment_id}",
                after={"status": ended["status"]},
            )
            return self._to_response(ended)
        if existing.get("status") != AssignmentStatus.ACTIVE.value:
            return self._to_response(existing)

        ended = self.repo.end_assignment(effective, assignment_id, cancelled=cancelled)
        assert ended
        driver_id = existing["driverId"]
        vehicle_id = existing["vehicleId"]
        self.repo.update_driver(
            effective,
            driver_id,
            {
                "status": DriverStatus.AVAILABLE.value,
                "currentVehicleId": None,
                "currentAssignmentId": None,
            },
        )
        self.repo.update_vehicle(
            effective,
            vehicle_id,
            {
                "status": VehicleStatus.AVAILABLE.value,
                "currentDriverId": None,
                "currentAssignmentId": None,
            },
        )
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="ASSIGNMENT_END",
            resource=f"assignment:{assignment_id}",
            after={"status": ended["status"]},
        )
        return self._to_response(ended)

    @staticmethod
    def _to_response(item: dict) -> AssignmentResponse:
        release_raw = item.get("releaseDate")
        release = date.fromisoformat(str(release_raw)[:10]) if release_raw else None
        return AssignmentResponse(
            assignmentId=item["assignmentId"],
            tenantId=item["tenantId"],
            locationId=item.get("locationId"),
            driverId=item["driverId"],
            vehicleId=item["vehicleId"],
            changeDate=_assignment_change_date(item),
            releaseDate=release,
            startTime=item["startTime"],
            endTime=item.get("endTime"),
            status=item["status"],
            assignedBy=item["assignedBy"],
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )
