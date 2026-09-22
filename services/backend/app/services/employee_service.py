from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.core.dependencies import CurrentUser
from app.models import EmployeePersona, EmployeeStatus, Gender, Role
from app.repositories.dynamodb import DynamoDBRepository
from app.schemas import CreateUserRequest, CreateUserResponse
from app.schemas.employee import (
    CreateEmployeeRequest,
    EmployeeResponse,
    ImportEmployeeRowError,
    ImportEmployeesResponse,
    UpdateEmployeeRequest,
)
from app.services.employee_excel import (
    build_employee_import_template_bytes,
    parse_employee_import_rows,
)
from app.services.tenant_scope import resolve_effective_tenant
from app.services.location_scope import (
    ALL_LOCATIONS,
    assert_location_access,
    resolve_effective_location_id,
    resolve_location_scope,
)
from app.services.user_service import UserService


PERSONA_TO_ROLE: dict[EmployeePersona, Role] = {
    EmployeePersona.FLEET_ADMIN: Role.FLEET_ADMIN,
    EmployeePersona.LOCATION_HEAD: Role.LOCATION_HEAD,
    EmployeePersona.FLEET_MANAGER: Role.FLEET_MANAGER,
    EmployeePersona.DRIVER: Role.DRIVER,
}


def _date_to_str(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


class EmployeeService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def _validate_driver_manager_user_id(
        self, tenant_id: str, driver_manager_user_id: str | None
    ) -> None:
        if not driver_manager_user_id:
            return
        for user in self.repo.list_users_for_tenant(tenant_id):
            if user.get("userId") == driver_manager_user_id:
                if user.get("role") != Role.FLEET_MANAGER.value:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Driver manager must be a Fleet Manager user",
                    )
                return
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Driver manager user not found in this tenant",
        )

    def _filter_for_fleet_manager(
        self, current: CurrentUser, items: list[dict]
    ) -> list[dict]:
        if current.role != Role.FLEET_MANAGER:
            return items
        return [
            i
            for i in items
            if i.get("persona") != EmployeePersona.DRIVER.value
            or i.get("driverManagerUserId") == current.user_id
        ]

    def _ensure_fleet_manager_can_access(self, current: CurrentUser, item: dict) -> None:
        if current.role != Role.FLEET_MANAGER:
            return
        if item.get("persona") == EmployeePersona.DRIVER.value:
            if item.get("driverManagerUserId") != current.user_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found"
                )

    def list_employees(
        self, current: CurrentUser, tenant_id: str | None
    ) -> list[EmployeeResponse]:
        effective = resolve_effective_tenant(current, tenant_id)
        self.repo.backfill_tenant_location_ids(effective)
        scope = resolve_location_scope(current, effective, self.repo)
        if scope is ALL_LOCATIONS:
            items = self.repo.list_employees_for_tenant(effective)
        else:
            items = self.repo.list_employees_for_tenant(
                effective, location_id=next(iter(scope))
            )
        if current.role == Role.FLEET_MANAGER:
            items = self._filter_for_fleet_manager(current, items)
        return [self._to_response(self._with_resolved_user_link(effective, i)) for i in items]

    def get_employee(
        self, current: CurrentUser, employee_id: str, tenant_id: str | None
    ) -> EmployeeResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_employee(effective, employee_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found"
            )
        self._ensure_fleet_manager_can_access(current, item)
        return self._to_response(self._with_resolved_user_link(effective, item))

    def _with_resolved_user_link(self, tenant_id: str, item: dict) -> dict:
        if item.get("linkedUserId"):
            return item
        email = item.get("email")
        if not email:
            return item
        user = self.repo.find_user_by_email(tenant_id, email)
        if not user:
            return item
        return {**item, "linkedUserId": user["userId"]}

    def build_import_template(self) -> bytes:
        return build_employee_import_template_bytes()

    def import_from_excel(
        self,
        current: CurrentUser,
        tenant_id: str | None,
        file_bytes: bytes,
    ) -> ImportEmployeesResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        rows, parse_errors = parse_employee_import_rows(file_bytes)
        errors = [ImportEmployeeRowError(**e) for e in parse_errors]
        created_items: list[dict] = []

        for offset, row in enumerate(rows):
            excel_row = offset + 2
            try:
                body = self._row_to_create_request(row, effective)
                item = self._persist_create(effective, body)
                created_items.append(item)
            except ValidationError as exc:
                msg = exc.errors()[0]["msg"] if exc.errors() else "Validation failed"
                errors.append(ImportEmployeeRowError(row=excel_row, message=msg))
            except ValueError as exc:
                errors.append(ImportEmployeeRowError(row=excel_row, message=str(exc)))

        if created_items:
            self.repo.write_audit(
                tenant_id=effective,
                actor_user_id=current.user_id,
                action="EMPLOYEE_IMPORT",
                resource="employees",
                after={"created": len(created_items)},
            )

        return ImportEmployeesResponse(
            created=len(created_items),
            failed=len(errors),
            errors=errors,
            employees=[self._to_response(i) for i in created_items],
        )

    def create_employee(
        self, current: CurrentUser, body: CreateEmployeeRequest
    ) -> EmployeeResponse:
        effective = resolve_effective_tenant(current, body.tenantId)
        item = self._persist_create(effective, body)
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="EMPLOYEE_CREATE",
            resource=f"employee:{item['employeeId']}",
            after={"name": item["name"]},
        )
        return self._to_response(item)

    def _persist_create(self, tenant_id: str, body: CreateEmployeeRequest) -> dict:
        is_driver = body.isDriver
        if body.persona == EmployeePersona.DRIVER:
            is_driver = True
        if body.driverManagerUserId and body.persona != EmployeePersona.DRIVER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Driver manager applies only to Driver persona",
            )
        self._validate_driver_manager_user_id(tenant_id, body.driverManagerUserId)
        loc: str | None = None
        if body.persona and body.persona != EmployeePersona.FLEET_ADMIN:
            loc = resolve_effective_location_id(self.repo, tenant_id, body.locationId)
        return self.repo.create_employee(
            tenant_id=tenant_id,
            name=body.name,
            employee_code=body.employeeCode,
            date_of_birth=_date_to_str(body.dateOfBirth),
            gender=body.gender.value if body.gender else None,
            status=body.status,
            is_driver=is_driver,
            hire_date=_date_to_str(body.hireDate),
            home_address=body.homeAddress,
            email=str(body.email) if body.email else None,
            phone=body.phone,
            primary_contact=body.primaryContact,
            city=body.city,
            state=body.state,
            zip_code=body.zipCode,
            country=body.country,
            emergency_contact_name=body.emergencyContactName,
            emergency_contact_address=body.emergencyContactAddress,
            employment_type=body.employmentType,
            employment_status=body.employmentStatus,
            experience=body.experience,
            daily_hours_worked=body.dailyHoursWorked,
            company_driver_id=body.companyDriverId,
            department=body.department,
            job_role=body.jobRole,
            persona=body.persona.value if body.persona else None,
            driver_manager_user_id=body.driverManagerUserId,
            location_id=loc,
        )

    def _resolve_driver_manager_user_id(
        self, tenant_id: str, row: dict[str, Any]
    ) -> str | None:
        email = row.get("driverManagerEmail")
        if not email:
            return None
        user = self.repo.find_user_by_email(tenant_id, email)
        if not user:
            raise ValueError(f"Driver manager user not found for email '{email}'")
        if user.get("role") != Role.FLEET_MANAGER.value:
            raise ValueError(f"User '{email}' is not a Fleet Manager")
        return user["userId"]

    def _row_to_create_request(self, row: dict, tenant_id: str) -> CreateEmployeeRequest:
        persona = EmployeePersona(row["persona"]) if row.get("persona") else None
        driver_manager_user_id = self._resolve_driver_manager_user_id(tenant_id, row)
        return CreateEmployeeRequest(
            tenantId=tenant_id,
            name=row["name"],
            employeeCode=row.get("employeeCode"),
            persona=persona,
            driverManagerUserId=driver_manager_user_id,
            dateOfBirth=_parse_date(row.get("dateOfBirth")),
            gender=Gender(row["gender"]) if row.get("gender") else None,
            status=EmployeeStatus(row.get("status") or EmployeeStatus.ACTIVE.value),
            isDriver=bool(row.get("isDriver")),
            hireDate=_parse_date(row.get("hireDate")),
            homeAddress=row.get("homeAddress"),
            email=row.get("email"),
            phone=row.get("phone"),
            primaryContact=bool(row.get("primaryContact")),
            city=row.get("city"),
            state=row.get("state"),
            zipCode=row.get("zipCode"),
            country=row.get("country"),
            emergencyContactName=row.get("emergencyContactName"),
            emergencyContactAddress=row.get("emergencyContactAddress"),
            employmentType=row.get("employmentType"),
            employmentStatus=row.get("employmentStatus"),
            experience=row.get("experience"),
            dailyHoursWorked=row.get("dailyHoursWorked"),
            companyDriverId=row.get("companyDriverId"),
            department=row.get("department"),
            jobRole=row.get("jobRole"),
        )

    def update_employee(
        self,
        current: CurrentUser,
        employee_id: str,
        body: UpdateEmployeeRequest,
        tenant_id: str | None,
    ) -> EmployeeResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_employee(effective, employee_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found"
            )

        self._ensure_fleet_manager_can_access(current, item)

        updates = body.model_dump(exclude_unset=True)
        if "email" in updates and updates["email"] is not None:
            updates["email"] = str(updates["email"])
        if "dateOfBirth" in updates:
            updates["dateOfBirth"] = _date_to_str(updates.get("dateOfBirth"))
        if "hireDate" in updates:
            updates["hireDate"] = _date_to_str(updates.get("hireDate"))
        if "driverManagerUserId" in updates:
            self._validate_driver_manager_user_id(
                effective, updates.get("driverManagerUserId")
            )
        effective_persona = updates.get("persona")
        if effective_persona is None and "persona" not in updates:
            effective_persona = item.get("persona")
            if effective_persona and not isinstance(effective_persona, str):
                effective_persona = effective_persona.value  # type: ignore[union-attr]
        elif effective_persona is not None:
            effective_persona = effective_persona.value
        if "driverManagerUserId" in updates and updates["driverManagerUserId"]:
            persona_str = effective_persona or item.get("persona")
            if persona_str != EmployeePersona.DRIVER.value:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Driver manager applies only to Driver persona",
                )
        if "persona" in updates and updates["persona"] is not None:
            updates["persona"] = updates["persona"].value
            if updates["persona"] != EmployeePersona.DRIVER.value:
                updates["driverManagerUserId"] = None
            if updates["persona"] == EmployeePersona.DRIVER.value:
                updates["isDriver"] = True
        if "gender" in updates and updates["gender"] is not None:
            updates["gender"] = updates["gender"].value
        if "status" in updates and updates["status"] is not None:
            updates["status"] = updates["status"].value
        if "dailyHoursWorked" in updates and updates["dailyHoursWorked"] is not None:
            updates["dailyHoursWorked"] = Decimal(str(updates["dailyHoursWorked"]))

        updated = self.repo.update_employee(effective, employee_id, updates)
        assert updated
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="EMPLOYEE_UPDATE",
            resource=f"employee:{employee_id}",
            after=updates,
        )
        return self._to_response(updated)

    def delete_employee(
        self,
        current: CurrentUser,
        employee_id: str,
        tenant_id: str | None,
    ) -> EmployeeResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_employee(effective, employee_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found"
            )
        updated = self.repo.update_employee(
            effective,
            employee_id,
            {"status": EmployeeStatus.INACTIVE.value},
        )
        assert updated
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="EMPLOYEE_DELETE",
            resource=f"employee:{employee_id}",
            after={"status": EmployeeStatus.INACTIVE.value},
        )
        return self._to_response(updated)

    def create_user_from_employee(
        self,
        current: CurrentUser,
        employee_id: str,
        tenant_id: str | None,
    ) -> CreateUserResponse:
        effective = resolve_effective_tenant(current, tenant_id)
        item = self.repo.get_employee(effective, employee_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found"
            )
        if item.get("linkedUserId"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A platform user is already linked to this employee",
            )
        email = item.get("email")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee must have an email before creating a user",
            )
        persona_raw = item.get("persona")
        if not persona_raw:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Employee must have a persona (Fleet Admin, Fleet Manager, or Driver)",
            )
        try:
            persona = EmployeePersona(persona_raw)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid employee persona",
            ) from exc
        role = PERSONA_TO_ROLE.get(persona)
        if not role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Persona cannot be provisioned as a user",
            )

        existing = self.repo.find_user_by_email(effective, email)
        if existing:
            self._link_employee_user(effective, employee_id, existing["userId"])
            return self._user_profile_to_create_response(existing)

        try:
            user_resp = UserService().create_user(
                current,
                CreateUserRequest(email=email, role=role, tenantId=effective),
            )
        except HTTPException:
            existing = self.repo.find_user_by_email(effective, email)
            if existing:
                self._link_employee_user(effective, employee_id, existing["userId"])
                return self._user_profile_to_create_response(existing)
            raise

        self._link_employee_user(effective, employee_id, user_resp.userId)
        self.repo.write_audit(
            tenant_id=effective,
            actor_user_id=current.user_id,
            action="EMPLOYEE_CREATE_USER",
            resource=f"employee:{employee_id}",
            after={"userId": user_resp.userId, "role": role.value},
        )
        return user_resp

    def _link_employee_user(
        self, tenant_id: str, employee_id: str, user_id: str
    ) -> None:
        try:
            self.repo.update_employee(
                tenant_id, employee_id, {"linkedUserId": user_id}
            )
        except Exception:
            return

    @staticmethod
    def _user_profile_to_create_response(item: dict) -> CreateUserResponse:
        base = UserService._to_response(item)
        return CreateUserResponse(
            **base.model_dump(),
            temporaryPassword=None,
            inviteEmailSent=False,
        )

    def _driver_manager_email(
        self, tenant_id: str, driver_manager_user_id: str | None
    ) -> str | None:
        if not driver_manager_user_id:
            return None
        for user in self.repo.list_users_for_tenant(tenant_id):
            if user.get("userId") == driver_manager_user_id:
                return user.get("email")
        return None

    def _to_response(self, item: dict) -> EmployeeResponse:
        gender_raw = item.get("gender")
        gender = None
        if gender_raw:
            try:
                gender = Gender(gender_raw)
            except ValueError:
                gender = None

        persona_raw = item.get("persona")
        persona = None
        if persona_raw:
            try:
                persona = EmployeePersona(persona_raw)
            except ValueError:
                persona = None

        daily = item.get("dailyHoursWorked")
        if isinstance(daily, Decimal):
            daily = float(daily)

        return EmployeeResponse(
            employeeId=item["employeeId"],
            tenantId=item["tenantId"],
            locationId=item.get("locationId"),
            name=item["name"],
            employeeCode=item.get("employeeCode"),
            dateOfBirth=_parse_date(item.get("dateOfBirth")),
            gender=gender,
            status=item["status"],
            persona=persona,
            isDriver=bool(item.get("isDriver")),
            hireDate=_parse_date(item.get("hireDate")),
            homeAddress=item.get("homeAddress"),
            email=item.get("email"),
            phone=item.get("phone"),
            primaryContact=bool(item.get("primaryContact")),
            city=item.get("city"),
            state=item.get("state"),
            zipCode=item.get("zipCode"),
            country=item.get("country"),
            emergencyContactName=item.get("emergencyContactName"),
            emergencyContactAddress=item.get("emergencyContactAddress"),
            employmentType=item.get("employmentType"),
            employmentStatus=item.get("employmentStatus"),
            experience=item.get("experience"),
            dailyHoursWorked=daily,
            companyDriverId=item.get("companyDriverId"),
            department=item.get("department"),
            jobRole=item.get("jobRole"),
            linkedUserId=item.get("linkedUserId"),
            driverManagerUserId=item.get("driverManagerUserId"),
            driverManagerEmail=self._driver_manager_email(
                item["tenantId"], item.get("driverManagerUserId")
            ),
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )
