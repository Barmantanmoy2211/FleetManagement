import { Link } from "react-router-dom";
import type { Employee } from "@fleet/types";

type Props = {
  tenantId: string;
  employees: Employee[];
  isLoading: boolean;
  emptyMessage: string;
  showPersona?: boolean;
};

export function TenantEmployeeListTable({
  tenantId,
  employees,
  isLoading,
  emptyMessage,
  showPersona = false,
}: Props) {
  const colSpan = showPersona ? 5 : 4;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-950/80 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Employee ID</th>
            {showPersona && (
              <th className="px-4 py-3 font-medium">Persona</th>
            )}
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-200">
          {isLoading && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500">
                Loading…
              </td>
            </tr>
          )}
          {!isLoading &&
            employees.map((emp) => (
              <tr key={emp.employeeId} className="hover:bg-slate-900/50">
                <td className="px-4 py-3">
                  <Link
                    to={`/employees/${emp.employeeId}?tenantId=${encodeURIComponent(tenantId)}`}
                    className="font-medium text-emerald-400 hover:underline"
                  >
                    {emp.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-400">{emp.employeeCode ?? "—"}</td>
                {showPersona && (
                  <td className="px-4 py-3">{emp.persona ?? "—"}</td>
                )}
                <td className="px-4 py-3 text-slate-400">{emp.email ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-300">
                    {emp.status}
                  </span>
                </td>
              </tr>
            ))}
          {!isLoading && employees.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-10 text-center text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
