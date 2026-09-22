import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { TenantScopePicker } from "@/components/TenantScopePicker";
import { ImportDriversModal } from "@/components/ImportDriversModal";
import { ApiError } from "@fleet/api-client";

export function DriversPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canImport = role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;

  const [targetTenantId, setTargetTenantId] = useState("");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const effectiveTenantId = isPlatformAdmin ? targetTenantId : tenantId ?? undefined;

  const drivers = useQuery({
    queryKey: ["drivers", effectiveTenantId],
    queryFn: () => api.listDrivers(effectiveTenantId),
    enabled: isPlatformAdmin ? Boolean(effectiveTenantId) : Boolean(tenantId),
  });

  const listError =
    drivers.error instanceof ApiError
      ? typeof drivers.error.body === "object" &&
        drivers.error.body &&
        "detail" in (drivers.error.body as object)
        ? String((drivers.error.body as { detail: unknown }).detail)
        : drivers.error.message
      : drivers.error
        ? "Failed to load drivers."
        : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Drivers</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        {role === ROLES.FLEET_MANAGER
          ? "Drivers assigned to you (from Employees). Profiles are created automatically for platform users linked to those employees."
          : "Fleet driver profiles are created by importing users with role Driver from the Users page, or appear when Fleet Managers load assigned drivers."}
      </p>

      {isPlatformAdmin && (
        <TenantScopePicker value={targetTenantId} onChange={setTargetTenantId} className="mt-6" />
      )}

      {canImport && (isPlatformAdmin ? targetTenantId : tenantId) && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSyncMessage(null);
              setImportOpen(true);
            }}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900"
          >
            Import driver users
          </button>
        </div>
      )}
      {syncMessage && <p className="mt-2 text-sm text-emerald-400">{syncMessage}</p>}

      <ImportDriversModal
        open={importOpen}
        tenantId={effectiveTenantId}
        onClose={() => setImportOpen(false)}
        onImported={(msg) => {
          setSyncMessage(msg);
          qc.invalidateQueries({ queryKey: ["drivers"] });
        }}
      />

      {drivers.isLoading && <p className="mt-8 text-slate-400">Loading…</p>}
      {listError && <p className="mt-8 text-sm text-red-400">{listError}</p>}
      {!drivers.isLoading && !listError && drivers.data?.length === 0 && (
        <p className="mt-8 text-sm text-slate-500">
          {role === ROLES.FLEET_MANAGER
            ? "No drivers assigned to you yet, or assigned drivers do not have a platform user. Link employees under Organization → Employees."
            : "No driver profiles yet. Invite users with role Driver on the Users page, then import them here."}
        </p>
      )}
      <ul className="mt-8 divide-y divide-slate-800 rounded-xl border border-slate-800">
        {drivers.data?.map((d) => (
          <li key={d.driverId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <p className="font-medium text-white">{d.name}</p>
              <p className="text-xs text-slate-500">
                {d.licenseNumber}
                {d.email ? ` · ${d.email}` : ""}
                {d.phone ? ` · ${d.phone}` : ""}
              </p>
            </div>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
              {d.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
