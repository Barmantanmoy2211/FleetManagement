import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EmployeePersona } from "@fleet/types";
import { useApiClient } from "@/hooks/useApiClient";
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
};

export function TenantEmployeesByPersonaPanel({
  tenantId,
  persona,
  title,
  canWrite,
  addButtonLabel,
}: Props) {
  const api = useApiClient();
  const [bulkOpen, setBulkOpen] = useState(false);

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

  const linked = useMemo(
    () =>
      filterEmployeesByPersonaAndLinked(
        employees.data ?? [],
        persona,
        linkedEmails,
        true,
      ),
    [employees.data, persona, linkedEmails],
  );

  const pending = useMemo(
    () =>
      filterEmployeesByPersonaAndLinked(
        employees.data ?? [],
        persona,
        linkedEmails,
        false,
      ),
    [employees.data, persona, linkedEmails],
  );

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
