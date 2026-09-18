from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status

from app.core.dependencies import CurrentUser
from app.models import EmployeePersona, Role, TenantStatus
from app.repositories.dynamodb import DynamoDBRepository
from app.schemas import (
    CreateTenantRequest,
    TenantDetailResponse,
    TenantResponse,
    UpdateTenantRequest,
    UserResponse,
)
from app.services.fleet_service import DriverService, VehicleService
from app.services.user_service import UserService


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value)


def _date_to_str(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _ensure_tenant_detail_access(current: CurrentUser, tenant_id: str) -> None:
    if current.role == Role.PLATFORM_ADMIN:
        return
    if current.role not in (Role.FLEET_ADMIN, Role.FLEET_MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )
    if not current.tenant_id or current.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-tenant access denied",
        )


class TenantService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def list_tenants(self) -> list[TenantResponse]:
        items = self.repo.list_tenants()
        responses: list[TenantResponse] = []
        for idx in items:
            full = self.repo.get_tenant(idx["tenantId"]) or idx
            responses.append(self._to_response(full))
        return responses

    def get_tenant(self, tenant_id: str) -> TenantResponse:
        item = self.repo.get_tenant(tenant_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        return self._to_response(item)

    def get_tenant_detail(self, current: CurrentUser, tenant_id: str) -> TenantDetailResponse:
        _ensure_tenant_detail_access(current, tenant_id)
        item = self.repo.get_tenant(tenant_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

        users = self.repo.list_users_for_tenant(tenant_id)
        all_users = sorted(
            [UserService._to_response(u) for u in users],
            key=lambda u: u.email.lower(),
        )
        fleet_admins: list[UserResponse] = []
        fleet_managers: list[UserResponse] = []
        visible_users: list[UserResponse] = []

        if current.role == Role.FLEET_MANAGER:
            visible_users = all_users
        elif current.role == Role.FLEET_ADMIN:
            visible_users = all_users
            fleet_managers = [u for u in all_users if u.role == Role.FLEET_MANAGER]
        else:
            visible_users = all_users
            fleet_admins = [u for u in all_users if u.role == Role.FLEET_ADMIN]
            fleet_managers = [u for u in all_users if u.role == Role.FLEET_MANAGER]
        drivers = [
            DriverService._to_response(d) for d in self.repo.list_drivers_for_tenant(tenant_id)
        ]
        vehicles = [
            VehicleService._to_response(v) for v in self.repo.list_vehicles_for_tenant(tenant_id)
        ]
        linked_driver_count = self._count_linked_driver_employees(tenant_id, users)

        return TenantDetailResponse(
            tenant=self._to_response(item),
            users=visible_users,
            fleetAdmins=fleet_admins,
            fleetManagers=fleet_managers,
            drivers=drivers,
            vehicles=vehicles,
            linkedDriverCount=linked_driver_count,
        )

    def create_tenant(self, body: CreateTenantRequest, actor_user_id: str) -> TenantResponse:
        item = self.repo.create_tenant(
            name=body.name.strip(),
            status=body.status,
            street=body.street,
            city=body.city,
            zip_code=body.zipCode,
            state=body.state,
            country=body.country,
            landmark=body.landmark,
            revenue=body.revenue,
            established_date=_date_to_str(body.establishedDate),
        )
        self.repo.write_audit(
            tenant_id=item["tenantId"],
            actor_user_id=actor_user_id,
            action="TENANT_CREATE",
            resource=f"tenant:{item['tenantId']}",
            after={"name": item["name"], "status": item["status"]},
        )
        return self._to_response(item)

    def update_tenant(
        self,
        tenant_id: str,
        body: UpdateTenantRequest,
        actor_user_id: str,
    ) -> TenantResponse:
        before_item = self.repo.get_tenant(tenant_id)
        if not before_item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

        fields = body.model_dump(exclude_unset=True)
        if "establishedDate" in fields:
            fields["establishedDate"] = _date_to_str(fields.get("establishedDate"))
        if "status" in fields and fields["status"] is not None:
            fields["status"] = fields["status"]  # enum passed to repo as TenantStatus

        updated = self.repo.update_tenant(
            tenant_id,
            name=fields.get("name"),
            status=fields.get("status"),
            street=fields.get("street"),
            city=fields.get("city"),
            zip_code=fields.get("zipCode"),
            state=fields.get("state"),
            country=fields.get("country"),
            landmark=fields.get("landmark"),
            revenue=fields.get("revenue"),
            established_date=fields.get("establishedDate"),
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

        self.repo.write_audit(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="TENANT_UPDATE",
            resource=f"tenant:{tenant_id}",
            before={"name": before_item.get("name"), "status": before_item.get("status")},
            after={"name": updated.get("name"), "status": updated.get("status")},
        )
        return self._to_response(updated)

    def delete_tenant(self, tenant_id: str, actor_user_id: str) -> TenantResponse:
        before_item = self.repo.get_tenant(tenant_id)
        if not before_item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        updated = self.repo.update_tenant(tenant_id, status=TenantStatus.INACTIVE)
        assert updated
        self.repo.write_audit(
            tenant_id=tenant_id,
            actor_user_id=actor_user_id,
            action="TENANT_DELETE",
            resource=f"tenant:{tenant_id}",
            before={"status": before_item.get("status")},
            after={"status": TenantStatus.INACTIVE.value},
        )
        return self._to_response(updated)

    def _count_linked_driver_employees(self, tenant_id: str, users: list[dict]) -> int:
        """Drivers tab: employees with Driver persona who have a platform user."""
        user_emails = {
            (u.get("email") or "").strip().lower()
            for u in users
            if u.get("email")
        }
        count = 0
        for emp in self.repo.list_employees_for_tenant(tenant_id):
            if emp.get("persona") != EmployeePersona.DRIVER.value:
                continue
            if emp.get("linkedUserId"):
                count += 1
                continue
            email = (emp.get("email") or "").strip().lower()
            if email and email in user_emails:
                count += 1
        return count

    @staticmethod
    def _to_response(item: dict) -> TenantResponse:
        return TenantResponse(
            tenantId=item["tenantId"],
            name=item["name"],
            status=TenantStatus(item["status"]),
            street=item.get("street"),
            city=item.get("city"),
            zipCode=item.get("zipCode"),
            state=item.get("state"),
            country=item.get("country"),
            landmark=item.get("landmark"),
            revenue=item.get("revenue"),
            establishedDate=_parse_date(item.get("establishedDate")),
            platformOnboardingDate=_parse_date(item.get("platformOnboardingDate")),
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )
