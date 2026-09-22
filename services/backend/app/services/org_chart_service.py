from __future__ import annotations

from fastapi import HTTPException, status

from app.core.dependencies import CurrentUser
from app.models import EmployeePersona, Role
from app.repositories.dynamodb import DynamoDBRepository
from app.schemas.location import OrgChartNode
from app.services.tenant_scope import resolve_effective_tenant


class OrgChartService:
    def __init__(self, repo: DynamoDBRepository | None = None):
        self.repo = repo or DynamoDBRepository()

    def get_org_chart(
        self, current: CurrentUser, tenant_id: str | None
    ) -> OrgChartNode:
        if current.role == Role.PLATFORM_ADMIN and not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="tenantId query required for platform admin",
            )
        effective = resolve_effective_tenant(current, tenant_id)
        tenant = self.repo.get_tenant(effective)
        if not tenant:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        self.repo.backfill_tenant_location_ids(effective)
        users = self.repo.list_users_for_tenant(effective)
        employees = self.repo.list_employees_for_tenant(effective)
        locations = self.repo.list_locations_for_tenant(effective)

        user_by_id = {str(u["userId"]): u for u in users}
        loc_name = {loc["locationId"]: loc.get("name", "") for loc in locations}

        def user_label(uid: str) -> str:
            u = user_by_id.get(uid)
            if not u:
                return uid
            for emp in employees:
                if emp.get("linkedUserId") == uid:
                    return emp.get("name") or u.get("email", uid)
            return u.get("email") or uid

        def user_node(uid: str, *, role: str | None = None, loc_id: str | None = None) -> OrgChartNode:
            u = user_by_id.get(uid, {})
            r = role or u.get("role")
            lid = loc_id if loc_id is not None else u.get("locationId")
            return OrgChartNode(
                nodeId=f"user:{uid}",
                kind="user",
                label=user_label(uid),
                role=r,
                locationName=loc_name.get(lid) if lid else None,
                isSelf=uid == current.user_id,
                children=[],
            )

        def drivers_under_manager(manager_uid: str, location_id: str) -> list[OrgChartNode]:
            nodes: list[OrgChartNode] = []
            for emp in employees:
                if emp.get("persona") != EmployeePersona.DRIVER.value:
                    continue
                if emp.get("locationId") and emp.get("locationId") != location_id:
                    continue
                if emp.get("driverManagerUserId") != manager_uid:
                    continue
                linked = emp.get("linkedUserId")
                if linked:
                    nodes.append(user_node(str(linked), role=Role.DRIVER.value, loc_id=location_id))
                elif emp.get("email"):
                    nodes.append(
                        OrgChartNode(
                            nodeId=f"emp:{emp['employeeId']}",
                            kind="user",
                            label=emp.get("name") or emp["email"],
                            role=Role.DRIVER.value,
                            locationName=loc_name.get(location_id),
                            isSelf=False,
                            children=[],
                        )
                    )
            return sorted(nodes, key=lambda n: n.label.lower())

        def managers_at_location(location_id: str, head_uid: str | None = None) -> list[OrgChartNode]:
            nodes: list[OrgChartNode] = []
            for u in users:
                if u.get("role") != Role.FLEET_MANAGER.value:
                    continue
                if u.get("locationId") != location_id:
                    continue
                if head_uid and u.get("reportsToUserId") != head_uid:
                    continue
                uid = str(u["userId"])
                mgr = user_node(uid, role=Role.FLEET_MANAGER.value, loc_id=location_id)
                mgr.children = drivers_under_manager(uid, location_id)
                nodes.append(mgr)
            return sorted(nodes, key=lambda n: n.label.lower())

        def managers_under_head(head_uid: str, location_id: str) -> list[OrgChartNode]:
            return managers_at_location(location_id, head_uid)

        def head_for_location(location_id: str) -> OrgChartNode | None:
            for u in users:
                if u.get("role") != Role.LOCATION_HEAD.value:
                    continue
                if u.get("locationId") != location_id:
                    continue
                uid = str(u["userId"])
                head = user_node(uid, role=Role.LOCATION_HEAD.value, loc_id=location_id)
                head.children = managers_under_head(uid, location_id)
                return head
            return None

        def location_subtree(loc: dict) -> OrgChartNode:
            lid = loc["locationId"]
            head = head_for_location(lid)
            loc_node = OrgChartNode(
                nodeId=f"location:{lid}",
                kind="location",
                label=loc.get("name") or lid,
                locationName=loc.get("name"),
                children=[head] if head else [],
            )
            if not head:
                loc_node.children = managers_at_location(lid, None)
            return loc_node

        admin_users = [
            u for u in users if u.get("role") == Role.FLEET_ADMIN.value
        ]

        if current.role == Role.FLEET_ADMIN:
            children = [location_subtree(loc) for loc in locations]
            return OrgChartNode(
                nodeId=f"tenant:{effective}",
                kind="tenant",
                label=tenant.get("name") or effective,
                isSelf=False,
                children=children,
            )

        if current.role == Role.LOCATION_HEAD and current.location_id:
            loc = self.repo.get_location(effective, current.location_id)
            head = head_for_location(current.location_id)
            parent = None
            if admin_users:
                admin = admin_users[0]
                parent = user_node(str(admin["userId"]), role=Role.FLEET_ADMIN.value)
            loc_node = OrgChartNode(
                nodeId=f"location:{current.location_id}",
                kind="location",
                label=loc.get("name") if loc else current.location_id,
                isSelf=False,
                children=[head] if head else [],
            )
            if parent:
                parent.children = [loc_node]
                return parent
            return loc_node if head else loc_node

        if current.role == Role.FLEET_MANAGER:
            chain: list[OrgChartNode] = []
            if admin_users:
                chain.append(user_node(str(admin_users[0]["userId"]), role=Role.FLEET_ADMIN.value))
            head_uid = current.reports_to_user_id
            if head_uid:
                chain.append(
                    user_node(head_uid, role=Role.LOCATION_HEAD.value, loc_id=current.location_id)
                )
            me = user_node(current.user_id, role=Role.FLEET_MANAGER.value, loc_id=current.location_id)
            if current.location_id:
                me.children = drivers_under_manager(current.user_id, current.location_id)
            if chain:
                chain[-1].children = [me]
                return chain[0]
            return me

        if current.role == Role.DRIVER:
            fm_uid = None
            for emp in employees:
                if emp.get("linkedUserId") == current.user_id:
                    fm_uid = emp.get("driverManagerUserId")
                    break
            chain: list[OrgChartNode] = []
            if admin_users:
                chain.append(user_node(str(admin_users[0]["userId"]), role=Role.FLEET_ADMIN.value))
            if current.reports_to_user_id:
                chain.append(
                    user_node(
                        current.reports_to_user_id,
                        role=Role.LOCATION_HEAD.value,
                        loc_id=current.location_id,
                    )
                )
            if fm_uid:
                fm = user_node(fm_uid, role=Role.FLEET_MANAGER.value, loc_id=current.location_id)
                fm.isSelf = False
                me = user_node(current.user_id, role=Role.DRIVER.value, loc_id=current.location_id)
                fm.children = [me]
                if chain:
                    chain[-1].children = [fm]
                    return chain[0]
                return fm
            return user_node(current.user_id, role=Role.DRIVER.value, loc_id=current.location_id)

        return OrgChartNode(
            nodeId=f"tenant:{effective}",
            kind="tenant",
            label=tenant.get("name") or effective,
            children=[location_subtree(loc) for loc in locations],
        )
