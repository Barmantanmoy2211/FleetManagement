import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import { useMemo, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { TenantScopePicker } from "@/components/TenantScopePicker";
import { TripRouteMap } from "@/components/TripRouteMap";

export function LiveMapPage() {
  const api = useApiClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const [targetTenantId, setTargetTenantId] = useState("");

  const effectiveTenantId = isPlatformAdmin ? targetTenantId : tenantId ?? undefined;
  const scopeReady = isPlatformAdmin ? Boolean(effectiveTenantId) : Boolean(tenantId);

  const trips = useQuery({
    queryKey: ["trips", effectiveTenantId, "route-map"],
    queryFn: () => api.listTrips(effectiveTenantId, { openOnly: true }),
    enabled: scopeReady,
  });

  const vehicles = useQuery({
    queryKey: ["vehicles", effectiveTenantId],
    queryFn: () => api.listVehicles(effectiveTenantId),
    enabled: scopeReady,
  });

  const vehicleById = useMemo(() => {
    const m = new Map(vehicles.data?.map((v) => [v.vehicleId, v]) ?? []);
    return m;
  }, [vehicles.data]);

  const rows = trips.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((t) => t.tripId === selectedId) ?? rows[0];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Trip routes</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">
        Pickup and destination for scheduled and in-progress trips. Route length is stored on each
        trip when created or edited. Live GPS tracking is planned for a later phase.
      </p>

      {isPlatformAdmin && (
        <TenantScopePicker value={targetTenantId} onChange={setTargetTenantId} className="mt-6" />
      )}

      {!scopeReady && isPlatformAdmin && (
        <p className="mt-8 text-slate-500">Select a tenant to view trip routes.</p>
      )}

      {scopeReady && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 p-4">
            <h2 className="text-sm font-medium text-white">Trips</h2>
            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No open trips.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {rows.map((t) => {
                  const v = vehicleById.get(t.vehicleId);
                  const active = selected?.tripId === t.tripId;
                  return (
                    <li key={t.tripId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.tripId)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                          active
                            ? "border-emerald-700 bg-emerald-950/20"
                            : "border-slate-800 bg-slate-950/50"
                        }`}
                      >
                        <span className="font-medium text-slate-200">
                          {v?.registrationNumber ?? v?.vehicleName ?? "Trip"}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {t.status} · {(t.routeDistanceKm ?? 0).toFixed(2)} km
                        </span>
                        <Link
                          to={`/trips/${t.tripId}?tenantId=${encodeURIComponent(effectiveTenantId ?? "")}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 inline-block text-xs text-emerald-400 hover:underline"
                        >
                          Open trip
                        </Link>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-slate-800 p-4">
            <h2 className="text-sm font-medium text-white">Route map</h2>
            {selected ? (
              <TripRouteMap
                className="mt-3"
                pickupLatitude={selected.pickupLatitude}
                pickupLongitude={selected.pickupLongitude}
                destinationLatitude={selected.destinationLatitude}
                destinationLongitude={selected.destinationLongitude}
                routeDistanceKm={selected.routeDistanceKm}
              />
            ) : (
              <p className="mt-3 text-sm text-slate-500">Create a trip with pickup and destination.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
