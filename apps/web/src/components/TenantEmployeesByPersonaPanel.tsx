import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EmployeePersona, UserProfile } from "@fleet/types";
import { ROLES } from "@fleet/constants";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { TenantEmployeeListTable } from "@/components/TenantEmployeeListTable";
import { BulkCreateUsersModal } from "@/components/BulkCreateUsersModal";
import {
  buildLinkedEmailSet,
  filterEmployeesByPersonaAndLinked,
} from "@/lib/employeePlatformUser";

type Props = {
  tenantId: string;
  persona: EmployeePersona;
  title: string;
  canWrite: boolean;
  addButtonLabel: string;
  locationId?: string;
};

export function TenantEmployeesByPersonaPanel({
  tenantId,
  persona,
  title,
  canWrite,
  addButtonLabel,
  locationId,
}: Props) {
  const api = useApiClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const role = useAuthStore((s) => s.role);
  const authEmail = useAuthStore((s) => s.email);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me(),
    enabled: role === ROLES.FLEET_MANAGER,
  });

  const employees = useQuery({
    queryKey: ["employees", tenantId],
    queryFn: () => api.listEmployees(tenantId),
  });
  const users = useQuery({
    queryKey: ["users", tenantId],
    queryFn: () => api.listUsers(tenantId),
  });

  const linkedEmails = useMemo(
    () => buildLinkedEmailSet((users.data ?? []).map((u) => u.email)),
    [users.data],
  );

  const managerUserId = useMemo(() => {
    if (role !== ROLES.FLEET_MANAGER) {
      return null;
    }
    if (me.data?.userId) {
      return me.data.userId;
    }
    const needle = authEmail?.trim().toLowerCase();
    if (!needle) {
      return null;
    }
    return (
      users.data?.find((u) => u.email.trim().toLowerCase() === needle)?.userId ??
      null
    );
  }, [role, me.data?.userId, authEmail, users.data]);

  const scopedEmployees = useMemo(() => {
    let list = employees.data ?? [];
    if (locationId) {
      list = list.filter((e) => e.locationId === locationId);
    }
    if (role === ROLES.FLEET_MANAGER && persona === "Driver") {
      if (!managerUserId) {
        return [];
      }
      return list.filter((e) => e.driverManagerUserId === managerUserId);
    }
    return list;
  }, [employees.data, role, persona, managerUserId, locationId]);

  const linked = useMemo(
    () =>
      filterEmployeesByPersonaAndLinked(
        scopedEmployees,
        persona,
        linkedEmails,
        true,
      ),
    [scopedEmployees, persona, linkedEmails],
  );

  const pending = useMemo(
    () =>
      filterEmployeesByPersonaAndLinked(
        scopedEmployees,
        persona,
        linkedEmails,
        false,
      ),
    [scopedEmployees, persona, linkedEmails],
  );

  const usersById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of users.data ?? []) {
      map.set(u.userId, u);
    }
    return map;
  }, [users.data]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Employees with persona {persona} who already have a platform user.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
          >
            {addButtonLabel}
            {pending.length > 0 ? ` (${pending.length})` : ""}
          </button>
        )}
      </div>
      <TenantEmployeeListTable
        tenantId={tenantId}
        employees={linked}
        isLoading={employees.isLoading || users.isLoading}
        emptyMessage={`No ${title.toLowerCase()} with a platform user yet. Use "${addButtonLabel}" to create users from employees.`}
        showPersona={false}
        showDriverManager={persona === "Driver"}
        usersById={usersById}
      />

      <BulkCreateUsersModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        tenantId={tenantId}
        persona={persona}
        title={title}
        candidates={pending}
      />
    </div>
  );
}
