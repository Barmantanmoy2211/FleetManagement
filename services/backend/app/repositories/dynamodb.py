from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import boto3

from app.core.config import get_settings
from app.models import Role, TenantStatus


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tenant_pk(tenant_id: str) -> str:
    return f"TENANT#{tenant_id}"


def _user_sk(user_id: str) -> str:
    return f"USER#{user_id}"


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
        name: str,
        status: TenantStatus = TenantStatus.ACTIVE,
    ) -> dict[str, Any]:
        tenant_id = str(uuid.uuid4())
        now = _now_iso()
        item = {
            "PK": _tenant_pk(tenant_id),
            "SK": "META",
            "entityType": "Tenant",
            "tenantId": tenant_id,
            "name": name,
            "status": status.value,
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
        name: str | None = None,
        status: TenantStatus | None = None,
    ) -> dict[str, Any] | None:
        existing = self.get_tenant(tenant_id)
        if not existing:
            return None

        now = _now_iso()
        update_parts = ["updatedAt = :u"]
        values: dict[str, Any] = {":u": now}
        if name is not None:
            update_parts.append("#name = :n")
            values[":n"] = name
        if status is not None:
            update_parts.append("#status = :s")
            values[":s"] = status.value

        names = {}
        if name is not None:
            names["#name"] = "name"
        if status is not None:
            names["#status"] = "status"

        resp = self.table.update_item(
            Key={"PK": _tenant_pk(tenant_id), "SK": "META"},
            UpdateExpression="SET " + ", ".join(update_parts),
            ExpressionAttributeValues=values,
            ExpressionAttributeNames=names or None,
            ReturnValues="ALL_NEW",
        )
        updated = resp["Attributes"]

        list_key = {"PK": "PLATFORM", "SK": f"TENANT#{tenant_id}"}
        list_updates = ["updatedAt = :u"]
        list_values: dict[str, Any] = {":u": now}
        if name is not None:
            list_updates.append("#name = :n")
            list_values[":n"] = name
        if status is not None:
            list_updates.append("#status = :s")
            list_values[":s"] = status.value
        self.table.update_item(
            Key=list_key,
            UpdateExpression="SET " + ", ".join(list_updates),
            ExpressionAttributeValues=list_values,
            ExpressionAttributeNames=names or None,
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
        self.table.put_item(
            Item={
                "PK": _tenant_pk(tenant_id),
                "SK": f"AUDIT#{ts}#{uuid.uuid4()}",
                "entityType": "Audit",
                "tenantId": tenant_id,
                "actorUserId": actor_user_id,
                "action": action,
                "resource": resource,
                "timestamp": ts,
                "before": before,
                "after": after,
            }
        )

    def ensure_tenant_exists(self, tenant_id: str) -> bool:
        return self.get_tenant(tenant_id) is not None
