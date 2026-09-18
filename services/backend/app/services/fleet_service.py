from __future__ import annotations

import uuid
from datetime import date

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.core.dependencies import CurrentUser
from app.models import AssignmentStatus, DriverStatus, LeaseOwnershipType, VehicleStatus
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
    UpdateDriverRequest,
    UpdateVehicleRequest,
    VehicleResponse,
)
from app.services.tenant_scope import resolve_effective_tenant
from app.services.vehicle_excel import (
    build_vehicle_import_template_bytes,
    parse_vehicle_import_rows,
)


def _date_to_str(value: date | None) -> str | None:
    return value.isoformat() if value else None


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
                item = self._persist_create(effective, body)
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
        items = self.repo.list_vehicles_for_tenant(effective)
        return [self._to_response(i) for i in items]

    def create_vehicle(
        self, current: CurrentUser, body: CreateVehicleRequest
    ) -> VehicleResponse:
        effective = resolve_effective_tenant(current, body.tenantId)
        item = self._persist_create(effective, body)
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

    def _persist_create(self, effective: str, body: CreateVehicleRequest) -> dict:
        if not self.repo.ensure_tenant_exists(effective):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        reg = self._registration_for_create(effective, body)
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
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )


class DriverService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def list_drivers(self, current: CurrentUser, tenant_id: str | None) -> list[DriverResponse]:
        effective = resolve_effective_tenant(current, tenant_id)
        items = self.repo.list_drivers_for_tenant(effective)
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
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )


class AssignmentService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def list_assignments(
        self, current: CurrentUser, tenant_id: str | None, active_only: bool = False
    ) -> list[AssignmentResponse]:
        effective = resolve_effective_tenant(current, tenant_id)
        items = self.repo.list_assignments_for_tenant(effective, active_only=active_only)
        return [self._to_response(i) for i in items]

    def create_assignment(
        self, current: CurrentUser, body: CreateAssignmentRequest
    ) -> AssignmentResponse:
        effective = resolve_effective_tenant(current, body.tenantId)
        driver = self.repo.get_driver(effective, body.driverId)
        if not driver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found")
        vehicle = self.repo.get_vehicle(effective, body.vehicleId)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

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

        assignment = self.repo.create_assignment(
            tenant_id=effective,
            driver_id=body.driverId,
            vehicle_id=body.vehicleId,
            assigned_by=current.user_id,
        )
        aid = assignment["assignmentId"]
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
            },
        )
        return self._to_response(assignment)

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
        return AssignmentResponse(
            assignmentId=item["assignmentId"],
            tenantId=item["tenantId"],
            driverId=item["driverId"],
            vehicleId=item["vehicleId"],
            startTime=item["startTime"],
            endTime=item.get("endTime"),
            status=item["status"],
            assignedBy=item["assignedBy"],
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )
