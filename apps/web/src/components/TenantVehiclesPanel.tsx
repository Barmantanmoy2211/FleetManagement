import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { AddVehicleModal } from "@/components/AddVehicleModal";
import type { Vehicle } from "@fleet/types";

type Props = {
  tenantId: string;
  tenantName: string;
  canWrite: boolean;
};

export function TenantVehiclesPanel({ tenantId, tenantName, canWrite }: Props) {
  const api = useApiClient();
  const [addOpen, setAddOpen] = useState(false);

  const vehicles = useQuery({
    queryKey: ["vehicles", tenantId],
    queryFn: () => api.listVehicles(tenantId),
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-medium text-white">Vehicles</h2>
        {canWrite && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
          >
            Add vehicle
          </button>
        )}
      </div>

      {vehicles.isLoading && <p className="px-4 py-6 text-sm text-slate-400">Loading…</p>}
      {!vehicles.isLoading && (vehicles.data?.length ?? 0) === 0 && (
        <p className="px-4 py-6 text-sm text-slate-400">
          {canWrite ? "No vehicles yet. Click Add vehicle to create or import." : "No vehicles yet."}
        </p>
      )}
      {(vehicles.data?.length ?? 0) > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Make / model</th>
                <th className="px-4 py-2 font-medium">Year</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.data?.map((v: Vehicle) => (
                <tr key={v.vehicleId} className="border-b border-slate-800/80 hover:bg-slate-900/40">
                  <td className="px-4 py-2 text-slate-400">
                    <Link
                      to={`/vehicles/${v.vehicleId}?tenantId=${encodeURIComponent(tenantId)}`}
                      className="text-emerald-400/90 hover:underline"
                    >
                      {v.displayVehicleId ?? v.vehicleId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      to={`/vehicles/${v.vehicleId}?tenantId=${encodeURIComponent(tenantId)}`}
                      className="text-slate-200 hover:text-white hover:underline"
                    >
                      {v.vehicleName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-300">
                    {v.make} {v.model}
                  </td>
                  <td className="px-4 py-2 text-slate-400">
                    {v.year ?? "—"}
                    {v.age != null ? ` (${v.age}y)` : ""}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{v.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddVehicleModal
        open={addOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        onClose={() => setAddOpen(false)}
      />
    </div>
  );
}
