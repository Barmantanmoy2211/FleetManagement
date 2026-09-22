import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Employee, UserProfile } from "@fleet/types";
import { ROLES } from "@fleet/constants";
import { useApiClient } from "@/hooks/useApiClient";
import { CreateLocationModal } from "@/components/CreateLocationModal";

type Props = {
  tenantId: string;
  canManage: boolean;
};

function formatZipDisplay(code: string | null | undefined, isPrimary: boolean): string {
  if (!code || (isPrimary && code.toUpperCase() === "PRIMARY")) {
    return "—";
  }
  return code;
}

function resolveLocationHeadName(
  locationId: string,
  users: UserProfile[],
  employees: Employee[],
): string {
  const headUsers = users.filter(
    (u) => u.role === ROLES.LOCATION_HEAD && u.locationId === locationId,
  );
  if (headUsers.length === 0) {
    const emp = employees.find(
      (e) => e.persona === "Location Head" && e.locationId === locationId,
    );
    return emp?.name ?? "—";
  }
  const head = headUsers[0]!;
  const linked = employees.find(
    (e) =>
      e.linkedUserId === head.userId ||
      (e.email &&
        head.email &&
        e.email.trim().toLowerCase() === head.email.trim().toLowerCase()),
  );
  return linked?.name ?? head.email;
}

export function TenantLocationsPanel({ tenantId, canManage }: Props) {
  const api = useApiClient();
  const [createOpen, setCreateOpen] = useState(false);

  const locations = useQuery({
    queryKey: ["locations", tenantId],
    queryFn: () => api.listLocations(tenantId),
  });

  const users = useQuery({
    queryKey: ["users", tenantId],
    queryFn: () => api.listUsers(tenantId),
  });

  const employees = useQuery({
    queryKey: ["employees", tenantId],
    queryFn: () => api.listEmployees(tenantId),
  });

  const headByLocation = useMemo(() => {
    const u = users.data ?? [];
    const e = employees.data ?? [];
    const map = new Map<string, string>();
    for (const loc of locations.data ?? []) {
      map.set(loc.locationId, resolveLocationHeadName(loc.locationId, u, e));
    }
    return map;
  }, [locations.data, users.data, employees.data]);

  return (
    <>
      <div className="rounded-xl border border-slate-800 bg-slate-900/30">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-white">Locations</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Branches such as Kolkata, Delhi, or Siliguri
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Create location
            </button>
          )}
        </div>

        {locations.isLoading && (
          <p className="px-4 py-6 text-sm text-slate-400">Loading…</p>
        )}
        {!locations.isLoading && (locations.data?.length ?? 0) === 0 && (
          <p className="px-4 py-6 text-sm text-slate-400">
            {canManage
              ? "No locations yet. Click Create location to add a site."
              : "No locations yet."}
          </p>
        )}
        {(locations.data?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">City</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2 font-medium">Zip number</th>
                  <th className="px-4 py-2 font-medium">Country</th>
                  <th className="px-4 py-2 font-medium">Location head</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {(locations.data ?? []).map((loc) => (
                  <tr key={loc.locationId} className="text-slate-200">
                    <td className="px-4 py-3">
                      <Link
                        to={`/tenants/${tenantId}/locations/${loc.locationId}`}
                        className="font-medium text-emerald-400 hover:underline"
                      >
                        {loc.name}
                      </Link>
                      {loc.isPrimary && (
                        <span className="ml-2 text-xs text-emerald-400/80">Primary</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{loc.city ?? "—"}</td>
                    <td className="px-4 py-3">{loc.state ?? "—"}</td>
                    <td className="px-4 py-3">
                      {formatZipDisplay(loc.code, loc.isPrimary)}
                    </td>
                    <td className="px-4 py-3">{loc.country ?? "—"}</td>
                    <td className="px-4 py-3">
                      {headByLocation.get(loc.locationId) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateLocationModal
        open={createOpen}
        tenantId={tenantId}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
