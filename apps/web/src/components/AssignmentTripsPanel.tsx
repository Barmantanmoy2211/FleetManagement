import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTripWindow } from "@/lib/tripScheduling";

type Props = {
  tenantId: string;
  assignmentId: string;
};

export function AssignmentTripsPanel({ tenantId, assignmentId }: Props) {
  const api = useApiClient();
  const timeZone = useUserTimeZone();

  const trips = useQuery({
    queryKey: ["trips", tenantId, "assignment", assignmentId],
    queryFn: async () => {
      try {
        return await api.listTrips(tenantId, { assignmentId });
      } catch {
        const all = await api.listTrips(tenantId);
        return all.filter((t) => t.assignmentId === assignmentId);
      }
    },
  });

  const drivers = useQuery({
    queryKey: ["drivers", tenantId],
    queryFn: () => api.listDrivers(tenantId),
  });
  const vehicles = useQuery({
    queryKey: ["vehicles", tenantId],
    queryFn: () => api.listVehicles(tenantId),
  });

  const driverMap = useMemo(() => {
    const m = new Map<string, string>();
    drivers.data?.forEach((d) => m.set(d.driverId, d.name));
    return m;
  }, [drivers.data]);

  const vehicleMap = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.data?.forEach((v) =>
      m.set(v.vehicleId, v.registrationNumber || v.vehicleName),
    );
    return m;
  }, [vehicles.data]);

  const rows = trips.data ?? [];

  return (
    <div className="mt-6 rounded-xl border border-slate-800">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-medium text-white">Trips</h2>
        <p className="text-xs text-slate-500">
          All trips linked to this assignment (master–detail).
        </p>
      </div>
      {trips.isLoading && (
        <p className="px-4 py-6 text-sm text-slate-500">Loading trips…</p>
      )}
      {!trips.isLoading && rows.length === 0 && (
        <p className="px-4 py-6 text-sm text-slate-500">No trips for this assignment.</p>
      )}
      <ul className="divide-y divide-slate-800">
        {rows.map((t) => (
          <li key={t.tripId} className="px-4 py-3 text-sm">
            <Link
              to={`/trips/${t.tripId}?tenantId=${encodeURIComponent(tenantId)}`}
              className="font-medium text-emerald-400 hover:underline"
            >
              {driverMap.get(t.driverId) ?? "Driver"} ·{" "}
              {vehicleMap.get(t.vehicleId) ?? "Vehicle"}
            </Link>
            <p className="mt-1 text-xs text-slate-500">
              {t.status} · {formatTripWindow(t, timeZone)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
