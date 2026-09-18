import { useQuery } from "@tanstack/react-query";
import type { TenantDetail } from "@fleet/types";
import { useApiClient } from "@/hooks/useApiClient";
import { formatUserRole } from "@/lib/tenantDetailTabs";

type Props = {
  tenantId: string;
  detailUsers?: TenantDetail["users"];
};

export function TenantUsersPanel({ tenantId, detailUsers }: Props) {
  const api = useApiClient();
  const usersQuery = useQuery({
    queryKey: ["users", tenantId],
    queryFn: () => api.listUsers(tenantId),
    enabled: Boolean(tenantId),
  });

  const users = usersQuery.data ?? detailUsers ?? [];

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/30">
      <p className="border-b border-slate-800 px-4 py-2 text-xs text-slate-500">
        All Cognito platform users for this tenant (Fleet Admin, Fleet Manager, Driver, Viewer).
      </p>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-950/80 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">User ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-200">
          {usersQuery.isLoading && users.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                Loading users…
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-10 text-center text-slate-500">
                No platform users for this tenant yet.
              </td>
            </tr>
          ) : (
            users.map((u) => (
              <tr key={u.userId} className="hover:bg-slate-900/50">
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                    {formatUserRole(u.role)}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{u.userId}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
