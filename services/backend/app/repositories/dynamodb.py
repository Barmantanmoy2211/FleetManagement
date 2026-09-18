from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import boto3

from app.core.config import get_settings
from app.models import (
    AssignmentStatus,
    DriverStatus,
    EmployeeStatus,
    FuelType,
    LeaseOwnershipType,
    Role,
    TenantStatus,
    VehicleStatus,
    VehicleType,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tenant_pk(tenant_id: str) -> str:
    return f"TENANT#{tenant_id}"


def _user_sk(user_id: str) -> str:
    return f"USER#{user_id}"


def _vehicle_sk(vehicle_id: str) -> str:
    return f"VEHICLE#{vehicle_id}"


def _driver_sk(driver_id: str) -> str:
    return f"DRIVER#{driver_id}"


def _assignment_sk(assignment_id: str) -> str:
    return f"ASSIGNMENT#{assignment_id}"


def _employee_sk(employee_id: str) -> str:
    return f"EMPLOYEE#{employee_id}"


class DynamoDBRepository:
    def __init__(self, table_name: str | None = None, dynamodb_resource=None):
        settings = get_settings()
        self.table_name = table_name or settings.dynamodb_table_name
        self._dynamodb = dynamodb_resource or boto3.resource(
            "dynamodb",
            region_name=settings.aws_region,
        )
        self.table = self._dynamodb.Table(self.table_name)

    def create_tenant(
        self,
        *,
        name: str,
        status: TenantStatus = TenantStatus.ACTIVE,
        street: str | None = None,
        city: str | None = None,
        zip_code: str | None = None,
        state: str | None = None,
        country: str | None = None,
        landmark: str | None = None,
        revenue: float | None = None,
        established_date: str | None = None,
    ) -> dict[str, Any]:
        tenant_id = str(uuid.uuid4())
        now = _now_iso()
        platform_onboarding = datetime.now(timezone.utc).date().isoformat()
        item = {
            "PK": _tenant_pk(tenant_id),
            "SK": "META",
            "entityType": "Tenant",
            "tenantId": tenant_id,
            "name": name,
            "status": status.value,
            "street": street,
            "city": city,
            "zipCode": zip_code,
            "state": state,
            "country": country,
            "landmark": landmark,
            "revenue": revenue,
            "establishedDate": established_date,
            "platformOnboardingDate": platform_onboarding,
            "createdAt": now,
            "updatedAt": now,
        }
        list_item = {
            "PK": "PLATFORM",
            "SK": f"TENANT#{tenant_id}",
            "entityType": "TenantIndex",
            "tenantId": tenant_id,
            "name": name,
            "status": status.value,
            "city": city,
            "country": country,
            "platformOnboardingDate": platform_onboarding,
            "createdAt": now,
            "updatedAt": now,
        }
        self.table.put_item(Item=item)
        self.table.put_item(Item=list_item)
        return item

    def list_tenants(self) -> list[dict[str, Any]]:
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues={":pk": "PLATFORM", ":sk": "TENANT#"},
        )
        items = resp.get("Items", [])
        return sorted(items, key=lambda x: x.get("name", ""))

    def get_tenant(self, tenant_id: str) -> dict[str, Any] | None:
        resp = self.table.get_item(Key={"PK": _tenant_pk(tenant_id), "SK": "META"})
        return resp.get("Item")

    def update_tenant(
        self,
        tenant_id: str,
        *,
        name: str | None = None,
        status: TenantStatus | None = None,
        street: str | None = None,
        city: str | None = None,
        zip_code: str | None = None,
        state: str | None = None,
        country: str | None = None,
        landmark: str | None = None,
        revenue: float | None = None,
        established_date: str | None = None,
    ) -> dict[str, Any] | None:
        existing = self.get_tenant(tenant_id)
        if not existing:
            return None

        now = _now_iso()
        updates: dict[str, Any] = {"updatedAt": now}
        if name is not None:
            updates["name"] = name
        if status is not None:
            updates["status"] = status.value
        if street is not None:
            updates["street"] = street
        if city is not None:
            updates["city"] = city
        if zip_code is not None:
            updates["zipCode"] = zip_code
        if state is not None:
            updates["state"] = state
        if country is not None:
            updates["country"] = country
        if landmark is not None:
            updates["landmark"] = landmark
        if revenue is not None:
            updates["revenue"] = revenue
        if established_date is not None:
            updates["establishedDate"] = established_date

        expr_parts = []
        values: dict[str, Any] = {}
        names: dict[str, str] = {}
        for key, value in updates.items():
            if key == "updatedAt":
                expr_parts.append("updatedAt = :u")
                values[":u"] = value
            elif key == "status":
                names["#status"] = "status"
                expr_parts.append("#status = :st")
                values[":st"] = value
            elif key == "name":
                names["#name"] = "name"
                expr_parts.append("#name = :n")
                values[":n"] = value
            else:
                expr_parts.append(f"{key} = :v_{key}")
                values[f":v_{key}"] = value

        resp = self.table.update_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": "META"},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ExpressionAttributeValues=values,
            ExpressionAttributeNames=names or None,
            ReturnValues="ALL_NEW",
        )
        updated = resp["Attributes"]

        list_key = {"PK": "PLATFORM", "SK": f"TENANT#{tenant_id}"}
        list_updates = ["updatedAt = :u"]
        list_values: dict[str, Any] = {":u": now}
        list_names: dict[str, str] = {}
        if name is not None:
            list_updates.append("#name = :n")
            list_values[":n"] = name
            list_names["#name"] = "name"
        if status is not None:
            list_updates.append("#status = :s")
            list_values[":s"] = status.value
            list_names["#status"] = "status"
        if city is not None:
            list_updates.append("city = :c")
            list_values[":c"] = city
        if country is not None:
            list_updates.append("country = :co")
            list_values[":co"] = country
        self.table.update_item(
            Key=list_key,
            UpdateExpression="SET " + ", ".join(list_updates),
            ExpressionAttributeValues=list_values,
            ExpressionAttributeNames=list_names or None,
        )
        return updated

    def create_user_profile(
        self,
        *,
        tenant_id: str,
        email: str,
        role: Role,
        cognito_sub: str,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        uid = user_id or str(uuid.uuid4())
        now = _now_iso()
        item = {
            "PK": _tenant_pk(tenant_id),
            "SK": _user_sk(uid),
            "GSI1PK": f"USER#{cognito_sub}",
            "GSI1SK": "META",
            "entityType": "User",
            "userId": uid,
            "tenantId": tenant_id,
            "email": email,
            "role": role.value,
            "cognitoSub": cognito_sub,
            "createdAt": now,
            "updatedAt": now,
        }
        self.table.put_item(Item=item)
        return item

    def list_users_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues={
                ":pk": _tenant_pk(tenant_id),
                ":sk": "USER#",
            },
        )
        return resp.get("Items", [])

    def find_user_by_email(self, tenant_id: str, email: str) -> dict[str, Any] | None:
        target = email.strip().lower()
        for item in self.list_users_for_tenant(tenant_id):
            item_email = (item.get("email") or "").strip().lower()
            if item_email and item_email == target:
                return item
        return None

    def get_user_by_cognito_sub(self, cognito_sub: str) -> dict[str, Any] | None:
        resp = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression="GSI1PK = :pk AND GSI1SK = :sk",
            ExpressionAttributeValues={
                ":pk": f"USER#{cognito_sub}",
                ":sk": "META",
            },
            Limit=1,
        )
        items = resp.get("Items", [])
        return items[0] if items else None

    def write_audit(
        self,
        *,
        tenant_id: str,
        actor_user_id: str,
        action: str,
        resource: str,
        before: dict | None = None,
        after: dict | None = None,
    ) -> None:
        ts = _now_iso()
        item: dict[str, Any] = {
            "PK": _tenant_pk(tenant_id),
            "SK": f"AUDIT#{ts}#{uuid.uuid4()}",
            "entityType": "Audit",
            "tenantId": tenant_id,
            "actorUserId": actor_user_id,
            "action": action,
            "resource": resource,
            "timestamp": ts,
        }
        if before is not None:
            item["before"] = before
        if after is not None:
            item["after"] = after
        try:
            self.table.put_item(Item=item)
        except Exception:
            # Audit must never fail the primary API operation.
            return

    def ensure_tenant_exists(self, tenant_id: str) -> bool:
        return self.get_tenant(tenant_id) is not None

    def create_vehicle(
        self,
        *,
        tenant_id: str,
        vehicle_name: str,
        registration_number: str,
        make: str,
        model: str,
        year: int,
        vehicle_type: VehicleType,
        fuel_type: FuelType,
        status: VehicleStatus = VehicleStatus.AVAILABLE,
        vin: str | None = None,
        color: str | None = None,
        dot_number: str | None = None,
        lease_ownership_type: LeaseOwnershipType | None = None,
        vehicle_subtype: str | None = None,
        cargo_type: str | None = None,
        weight_lbs: float | None = None,
        policy_number: str | None = None,
        covered_under_policy: bool = False,
        odometer_km: float | None = None,
    ) -> dict[str, Any]:
        vehicle_id = str(uuid.uuid4())
        now = _now_iso()
        item = {
            "PK": _tenant_pk(tenant_id),
            "SK": _vehicle_sk(vehicle_id),
            "entityType": "Vehicle",
            "vehicleId": vehicle_id,
            "tenantId": tenant_id,
            "vehicleName": vehicle_name,
            "registrationNumber": registration_number,
            "vin": vin or None,
            "make": make,
            "model": model,
            "year": year,
            "color": color,
            "dotNumber": dot_number or None,
            "leaseOwnershipType": lease_ownership_type.value if lease_ownership_type else None,
            "vehicleType": vehicle_type.value,
            "vehicleSubtype": vehicle_subtype,
            "fuelType": fuel_type.value,
            "cargoType": cargo_type,
            "weightLbs": weight_lbs,
            "policyNumber": policy_number,
            "coveredUnderPolicy": covered_under_policy,
            "status": status.value,
            "odometerKm": odometer_km,
            "currentDriverId": None,
            "currentAssignmentId": None,
            "createdAt": now,
            "updatedAt": now,
        }
        self.table.put_item(Item=item)
        return item

    def list_vehicles_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues={
                ":pk": _tenant_pk(tenant_id),
                ":sk": "VEHICLE#",
            },
        )
        items = resp.get("Items", [])
        return sorted(items, key=lambda x: x.get("registrationNumber", ""))

    def get_vehicle(self, tenant_id: str, vehicle_id: str) -> dict[str, Any] | None:
        resp = self.table.get_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": _vehicle_sk(vehicle_id)},
        )
        return resp.get("Item")

    def find_vehicle_by_registration(
        self, tenant_id: str, registration_number: str
    ) -> dict[str, Any] | None:
        reg = registration_number.strip().upper()
        for item in self.list_vehicles_for_tenant(tenant_id):
            if (item.get("registrationNumber") or "").strip().upper() == reg:
                return item
        return None

    def update_vehicle(
        self, tenant_id: str, vehicle_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        existing = self.get_vehicle(tenant_id, vehicle_id)
        if not existing:
            return None
        now = _now_iso()
        updates = {**updates, "updatedAt": now}
        expr_parts = []
        values: dict[str, Any] = {}
        names: dict[str, str] = {}
        for key, value in updates.items():
            if key in ("PK", "SK", "entityType", "vehicleId", "tenantId", "createdAt"):
                continue
            placeholder = f":v_{key}"
            if key == "status":
                names["#status"] = "status"
                expr_parts.append("#status = :v_status")
                values[":v_status"] = value
            else:
                expr_parts.append(f"{key} = {placeholder}")
                values[placeholder] = value
        if not expr_parts:
            return existing
        resp = self.table.update_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": _vehicle_sk(vehicle_id)},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ExpressionAttributeValues=values,
            ExpressionAttributeNames=names or None,
            ReturnValues="ALL_NEW",
        )
        return resp["Attributes"]

    def create_driver(
        self,
        *,
        tenant_id: str,
        name: str,
        license_number: str,
        email: str | None = None,
        phone: str | None = None,
        license_type: str | None = None,
        license_expiry: str | None = None,
        emergency_contact: str | None = None,
        joining_date: str | None = None,
        linked_user_id: str | None = None,
    ) -> dict[str, Any]:
        driver_id = str(uuid.uuid4())
        now = _now_iso()
        item = {
            "PK": _tenant_pk(tenant_id),
            "SK": _driver_sk(driver_id),
            "entityType": "Driver",
            "driverId": driver_id,
            "tenantId": tenant_id,
            "name": name,
            "email": email,
            "phone": phone,
            "licenseNumber": license_number,
            "licenseType": license_type,
            "licenseExpiry": license_expiry,
            "status": DriverStatus.AVAILABLE.value,
            "emergencyContact": emergency_contact,
            "joiningDate": joining_date,
            "currentVehicleId": None,
            "currentAssignmentId": None,
            "linkedUserId": linked_user_id,
            "createdAt": now,
            "updatedAt": now,
        }
        self.table.put_item(Item=item)
        return item

    def find_driver_by_email(self, tenant_id: str, email: str) -> dict[str, Any] | None:
        target = email.strip().lower()
        for item in self.list_drivers_for_tenant(tenant_id):
            item_email = (item.get("email") or "").strip().lower()
            if item_email and item_email == target:
                return item
        return None

    def list_driver_import_candidates(self, tenant_id: str) -> list[dict[str, Any]]:
        from app.models import Role

        candidates: list[dict[str, Any]] = []
        for user in self.list_users_for_tenant(tenant_id):
            if user.get("role") != Role.DRIVER.value:
                continue
            email = user.get("email") or ""
            if not email:
                continue
            if self.find_driver_by_email(tenant_id, email):
                continue
            local = email.split("@")[0]
            name = local.replace(".", " ").replace("_", " ").title()
            candidates.append(
                {
                    "userId": user["userId"],
                    "email": email,
                    "suggestedName": name,
                }
            )
        return sorted(candidates, key=lambda x: x["email"].lower())

    def sync_driver_profiles_from_users(
        self, tenant_id: str, user_ids: list[str]
    ) -> list[dict[str, Any]]:
        from app.models import Role

        if not user_ids:
            return []
        wanted = set(user_ids)
        created: list[dict[str, Any]] = []
        for user in self.list_users_for_tenant(tenant_id):
            uid = user.get("userId")
            if uid not in wanted:
                continue
            if user.get("role") != Role.DRIVER.value:
                continue
            email = user.get("email") or ""
            if not email:
                continue
            if self.find_driver_by_email(tenant_id, email):
                wanted.discard(uid)
                continue
            local = email.split("@")[0]
            name = local.replace(".", " ").replace("_", " ").title()
            item = self.create_driver(
                tenant_id=tenant_id,
                name=name,
                email=email,
                license_number=f"PENDING-{uid[:8]}",
                linked_user_id=uid,
            )
            created.append(item)
            wanted.discard(uid)
        return created

    def list_drivers_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues={
                ":pk": _tenant_pk(tenant_id),
                ":sk": "DRIVER#",
            },
        )
        items = resp.get("Items", [])
        return sorted(items, key=lambda x: x.get("name", ""))

    def get_driver(self, tenant_id: str, driver_id: str) -> dict[str, Any] | None:
        resp = self.table.get_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": _driver_sk(driver_id)},
        )
        return resp.get("Item")

    def update_driver(
        self, tenant_id: str, driver_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        existing = self.get_driver(tenant_id, driver_id)
        if not existing:
            return None
        now = _now_iso()
        updates = {**updates, "updatedAt": now}
        expr_parts = []
        values: dict[str, Any] = {}
        names: dict[str, str] = {}
        for key, value in updates.items():
            if key in ("PK", "SK", "entityType", "driverId", "tenantId", "createdAt"):
                continue
            placeholder = f":v_{key}"
            if key == "status":
                names["#status"] = "status"
                expr_parts.append(f"#status = {placeholder}")
            else:
                expr_parts.append(f"{key} = {placeholder}")
            values[placeholder] = value
        if not expr_parts:
            return existing
        resp = self.table.update_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": _driver_sk(driver_id)},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ExpressionAttributeValues=values,
            ExpressionAttributeNames=names or None,
            ReturnValues="ALL_NEW",
        )
        return resp["Attributes"]

    def list_assignments_for_tenant(
        self, tenant_id: str, *, active_only: bool = False
    ) -> list[dict[str, Any]]:
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues={
                ":pk": _tenant_pk(tenant_id),
                ":sk": "ASSIGNMENT#",
            },
        )
        items = resp.get("Items", [])
        if active_only:
            items = [i for i in items if i.get("status") == AssignmentStatus.ACTIVE.value]
        return sorted(items, key=lambda x: x.get("startTime", ""), reverse=True)

    def get_assignment(
        self, tenant_id: str, assignment_id: str
    ) -> dict[str, Any] | None:
        resp = self.table.get_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": _assignment_sk(assignment_id)},
        )
        return resp.get("Item")

    def get_active_assignment_for_vehicle(
        self, tenant_id: str, vehicle_id: str
    ) -> dict[str, Any] | None:
        for item in self.list_assignments_for_tenant(tenant_id, active_only=True):
            if item.get("vehicleId") == vehicle_id:
                return item
        return None

    def get_active_assignment_for_driver(
        self, tenant_id: str, driver_id: str
    ) -> dict[str, Any] | None:
        for item in self.list_assignments_for_tenant(tenant_id, active_only=True):
            if item.get("driverId") == driver_id:
                return item
        return None

    def create_assignment(
        self,
        *,
        tenant_id: str,
        driver_id: str,
        vehicle_id: str,
        assigned_by: str,
        start_time: str | None = None,
    ) -> dict[str, Any]:
        assignment_id = str(uuid.uuid4())
        now = _now_iso()
        start = start_time or now
        item = {
            "PK": _tenant_pk(tenant_id),
            "SK": _assignment_sk(assignment_id),
            "entityType": "Assignment",
            "assignmentId": assignment_id,
            "tenantId": tenant_id,
            "driverId": driver_id,
            "vehicleId": vehicle_id,
            "startTime": start,
            "endTime": None,
            "status": AssignmentStatus.ACTIVE.value,
            "assignedBy": assigned_by,
            "createdAt": now,
            "updatedAt": now,
        }
        self.table.put_item(Item=item)
        return item

    def end_assignment(
        self, tenant_id: str, assignment_id: str, *, cancelled: bool = False
    ) -> dict[str, Any] | None:
        existing = self.get_assignment(tenant_id, assignment_id)
        if not existing:
            return None
        if existing.get("status") != AssignmentStatus.ACTIVE.value:
            return existing
        now = _now_iso()
        status = AssignmentStatus.CANCELLED if cancelled else AssignmentStatus.ENDED
        resp = self.table.update_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": _assignment_sk(assignment_id)},
            UpdateExpression="SET #st = :st, endTime = :et, updatedAt = :u",
            ExpressionAttributeNames={"#st": "status"},
            ExpressionAttributeValues={
                ":st": status.value,
                ":et": now,
                ":u": now,
            },
            ReturnValues="ALL_NEW",
        )
        return resp["Attributes"]

    def create_employee(
        self,
        *,
        tenant_id: str,
        name: str,
        employee_code: str | None = None,
        date_of_birth: str | None = None,
        gender: str | None = None,
        status: EmployeeStatus = EmployeeStatus.ACTIVE,
        is_driver: bool = False,
        hire_date: str | None = None,
        home_address: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        primary_contact: bool = False,
        city: str | None = None,
        state: str | None = None,
        zip_code: str | None = None,
        country: str | None = None,
        emergency_contact_name: str | None = None,
        emergency_contact_address: str | None = None,
        employment_type: str | None = None,
        employment_status: str | None = None,
        experience: str | None = None,
        daily_hours_worked: float | None = None,
        company_driver_id: str | None = None,
        department: str | None = None,
        job_role: str | None = None,
        persona: str | None = None,
        linked_user_id: str | None = None,
    ) -> dict[str, Any]:
        employee_id = str(uuid.uuid4())
        now = _now_iso()
        item = {
            "PK": _tenant_pk(tenant_id),
            "SK": _employee_sk(employee_id),
            "entityType": "Employee",
            "employeeId": employee_id,
            "tenantId": tenant_id,
            "name": name,
            "employeeCode": employee_code,
            "dateOfBirth": date_of_birth,
            "gender": gender,
            "status": status.value,
            "isDriver": is_driver,
            "hireDate": hire_date,
            "homeAddress": home_address,
            "email": email,
            "phone": phone,
            "primaryContact": primary_contact,
            "city": city,
            "state": state,
            "zipCode": zip_code,
            "country": country,
            "emergencyContactName": emergency_contact_name,
            "emergencyContactAddress": emergency_contact_address,
            "employmentType": employment_type,
            "employmentStatus": employment_status or status.value,
            "experience": experience,
            "dailyHoursWorked": Decimal(str(daily_hours_worked))
            if daily_hours_worked is not None
            else None,
            "companyDriverId": company_driver_id,
            "department": department,
            "jobRole": job_role,
            "persona": persona,
            "linkedUserId": linked_user_id,
            "createdAt": now,
            "updatedAt": now,
        }
        self.table.put_item(Item=item)
        return item

    def list_employees_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues={
                ":pk": _tenant_pk(tenant_id),
                ":sk": "EMPLOYEE#",
            },
        )
        items = resp.get("Items", [])
        return sorted(items, key=lambda x: x.get("name", ""))

    def get_employee(self, tenant_id: str, employee_id: str) -> dict[str, Any] | None:
        resp = self.table.get_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": _employee_sk(employee_id)},
        )
        return resp.get("Item")

    def update_employee(
        self, tenant_id: str, employee_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        existing = self.get_employee(tenant_id, employee_id)
        if not existing:
            return None
        now = _now_iso()
        updates = {**updates, "updatedAt": now}
        expr_parts = []
        values: dict[str, Any] = {}
        names: dict[str, str] = {}
        for key, value in updates.items():
            if key in ("PK", "SK", "entityType", "employeeId", "tenantId", "createdAt"):
                continue
            placeholder = f":v_{key}"
            if key == "status":
                names["#status"] = "status"
                expr_parts.append(f"#status = {placeholder}")
            else:
                expr_parts.append(f"{key} = {placeholder}")
            values[placeholder] = value
        if not expr_parts:
            return existing
        resp = self.table.update_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": _employee_sk(employee_id)},
            UpdateExpression="SET " + ", ".join(expr_parts),
            ExpressionAttributeValues=values,
            ExpressionAttributeNames=names or None,
            ReturnValues="ALL_NEW",
        )
        return resp["Attributes"]
