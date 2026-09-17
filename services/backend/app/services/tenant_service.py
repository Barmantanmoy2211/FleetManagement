from __future__ import annotations

from fastapi import HTTPException, status

from app.models import TenantStatus
from app.repositories.dynamodb import DynamoDBRepository
from app.schemas import CreateTenantRequest, TenantResponse, UpdateTenantRequest


class TenantService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def list_tenants(self) -> list[TenantResponse]:
        items = self.repo.list_tenants()
        return [self._to_response(i) for i in items]

    def create_tenant(self, body: CreateTenantRequest, actor_user_id: str) -> TenantResponse:
        item = self.repo.create_tenant(body.name, body.status)
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

        updated = self.repo.update_tenant(tenant_id, body.name, body.status)
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

    @staticmethod
    def _to_response(item: dict) -> TenantResponse:
        return TenantResponse(
            tenantId=item["tenantId"],
            name=item["name"],
            status=TenantStatus(item["status"]),
            createdAt=item["createdAt"],
            updatedAt=item["updatedAt"],
        )
