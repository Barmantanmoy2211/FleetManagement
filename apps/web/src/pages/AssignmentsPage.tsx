import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { TenantScopePicker } from "@/components/TenantScopePicker";
import { EntityAssignmentsPanel } from "@/components/EntityAssignmentsPanel";

export function AssignmentsPage() {
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canAssign =
    role === ROLES.PLATFORM_ADMIN ||
    role === ROLES.FLEET_ADMIN ||
    role === ROLES.LOCATION_HEAD ||
    role === ROLES.FLEET_MANAGER;

  const [targetTenantId, setTargetTenantId] = useState("");

  const effectiveTenantId = isPlatformAdmin ? targetTenantId : tenantId ?? undefined;
  const scopeReady = isPlatformAdmin ? Boolean(effectiveTenantId) : Boolean(tenantId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Assignments</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        Plan driver–vehicle assignments with a change date and optional tentative release date.
        Future change dates create scheduled assignments; the driver and vehicle stay available until
        activation or the change date.
      </p>

      {isPlatformAdmin && (
        <TenantScopePicker value={targetTenantId} onChange={setTargetTenantId} className="mt-6" />
      )}

      {scopeReady && effectiveTenantId && (
        <EntityAssignmentsPanel tenantId={effectiveTenantId} canAssign={canAssign} />
      )}
    </div>
  );
}
