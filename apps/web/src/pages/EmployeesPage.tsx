import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES, EMPLOYEE_PERSONAS } from "@fleet/constants";
import { createEmployeeSchema } from "@fleet/validation";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { TenantScopePicker } from "@/components/TenantScopePicker";

export function EmployeesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canWrite = role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;

  const [targetTenantId, setTargetTenantId] = useState("");
  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [persona, setPersona] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveTenantId = isPlatformAdmin ? targetTenantId : tenantId ?? undefined;

  const employees = useQuery({
    queryKey: ["employees", effectiveTenantId],
    queryFn: () => api.listEmployees(effectiveTenantId),
    enabled: isPlatformAdmin ? Boolean(effectiveTenantId) : Boolean(tenantId),
  });

  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.createEmployee>[0]) => api.createEmployee(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setName("");
      setEmployeeCode("");
      setPersona("");
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createEmployeeSchema.safeParse({
      name,
      employeeCode: employeeCode || undefined,
      persona: persona || undefined,
      tenantId: isPlatformAdmin ? targetTenantId : undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Employees</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        HR employee records for your organization. Open a row to view full details in three
        sections (employee, address &amp; contact, employment).
      </p>

      {isPlatformAdmin && (
        <TenantScopePicker value={targetTenantId} onChange={setTargetTenantId} className="mt-6" />
      )}

      {canWrite && (isPlatformAdmin ? targetTenantId : tenantId) && (
        <form onSubmit={handleCreate} className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white sm:col-span-2"
          />
          <input
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            placeholder="Employee ID / code (optional)"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white sm:col-span-2"
          />
          <select
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white sm:col-span-2"
          >
            <option value="">Persona (optional)</option>
            {EMPLOYEE_PERSONAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {formError && (
            <p className="text-sm text-red-400 sm:col-span-2">{formError}</p>
          )}
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 sm:col-span-2"
          >
            {create.isPending ? "Adding…" : "Add employee"}
          </button>
        </form>
      )}

      <div className="mt-8 overflow-x-auto rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Employee ID</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Persona</th>
              <th className="px-4 py-3 font-medium">Driver</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {(employees.data ?? []).map((emp) => (
              <tr key={emp.employeeId} className="hover:bg-slate-900/50">
                <td className="px-4 py-3">
                  <Link
                    to={`/employees/${emp.employeeId}?tenantId=${encodeURIComponent(emp.tenantId)}`}
                    className="text-amber-400 hover:underline"
                  >
                    {emp.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{emp.employeeCode ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-300">
                    {emp.status}
                  </span>
                </td>
                <td className="px-4 py-3">{emp.persona ?? "—"}</td>
                <td className="px-4 py-3">{emp.isDriver ? "Yes" : "No"}</td>
              </tr>
            ))}
            {!employees.isLoading && (employees.data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No employees yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
