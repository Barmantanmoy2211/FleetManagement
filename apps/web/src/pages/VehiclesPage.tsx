import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { TenantScopePicker } from "@/components/TenantScopePicker";
import { AddVehicleModal } from "@/components/AddVehicleModal";
import type { Vehicle } from "@fleet/types";

export function VehiclesPage() {
  const api = useApiClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canWrite = role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;

  const [targetTenantId, setTargetTenantId] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const effectiveTenantId = isPlatformAdmin ? targetTenantId : tenantId ?? undefined;

  const vehicles = useQuery({
    queryKey: ["vehicles", effectiveTenantId],
    queryFn: () => api.listVehicles(effectiveTenantId),
    enabled: isPlatformAdmin ? Boolean(effectiveTenantId) : Boolean(tenantId),
  });

  const scopeReady = isPlatformAdmin ? Boolean(targetTenantId) : Boolean(tenantId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Vehicles</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        Register fleet vehicles for your organization. Assign drivers on the Assignments page.
      </p>

      {isPlatformAdmin && (
        <TenantScopePicker value={targetTenantId} onChange={setTargetTenantId} className="mt-6" />
      )}

      {canWrite && scopeReady && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mt-6 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Add vehicle
        </button>
      )}

      {vehicles.isLoading && <p className="mt-8 text-slate-400">Loading…</p>}
      <ul className="mt-8 divide-y divide-slate-800 rounded-xl border border-slate-800">
        {vehicles.data?.map((v: Vehicle) => {
          const detailHref = effectiveTenantId
            ? `/vehicles/${v.vehicleId}?tenantId=${encodeURIComponent(effectiveTenantId)}`
            : `/vehicles/${v.vehicleId}`;
          return (
          <li key={v.vehicleId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <Link to={detailHref} className="font-medium text-white hover:underline">
                {v.vehicleName} — {v.make} {v.model}
              </Link>
              <p className="text-xs text-slate-500">
                {v.displayVehicleId ?? v.registrationNumber} · {v.vehicleType} · {v.fuelType}
                {v.currentDriverId ? ` · driver ${v.currentDriverId.slice(0, 8)}…` : ""}
              </p>
            </div>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
              {v.status}
            </span>
          </li>
          );
        })}
      </ul>

      {scopeReady && effectiveTenantId && (
        <AddVehicleModal
          open={addOpen}
          tenantId={effectiveTenantId}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
