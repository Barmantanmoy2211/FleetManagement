import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { AddEmployeeModal } from "@/components/AddEmployeeModal";
import { TenantEmployeeListTable } from "@/components/TenantEmployeeListTable";

type Props = {
  tenantId: string;
  canWrite: boolean;
};

export function TenantEmployeesPanel({ tenantId, canWrite }: Props) {
  const api = useApiClient();
  const [addOpen, setAddOpen] = useState(false);

  const employees = useQuery({
    queryKey: ["employees", tenantId],
    queryFn: () => api.listEmployees(tenantId),
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-medium text-white">Employees</h2>
        {canWrite && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
          >
            Add employee
          </button>
        )}
      </div>

      <TenantEmployeeListTable
        tenantId={tenantId}
        employees={employees.data ?? []}
        isLoading={employees.isLoading}
        emptyMessage={
          canWrite
            ? "No employees yet. Click Add employee to get started."
            : "No employees yet."
        }
        showPersona
      />

      <AddEmployeeModal
        open={addOpen}
        tenantId={tenantId}
        onClose={() => setAddOpen(false)}
      />
    </div>
  );
}
