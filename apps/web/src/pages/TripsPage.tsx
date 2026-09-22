import { Link } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ROLES } from "@fleet/constants";
import type { Trip } from "@fleet/types";

import { useMemo, useState } from "react";

import { useApiClient } from "@/hooks/useApiClient";

import { useAuthStore } from "@/stores/authStore";

import { useUserTimeZone } from "@/hooks/useUserTimeZone";

import { TenantScopePicker } from "@/components/TenantScopePicker";

import { CreateTripModal } from "@/components/CreateTripModal";
import { EndTripModal } from "@/components/EndTripModal";
import {
  formatTripWindow,
  tripCanEnd,
  tripNeedsStart,
} from "@/lib/tripScheduling";



export function TripsPage() {

  const api = useApiClient();

  const qc = useQueryClient();

  const role = useAuthStore((s) => s.role);

  const tenantId = useAuthStore((s) => s.tenantId);

  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;

  const canManage =
    role === ROLES.PLATFORM_ADMIN ||
    role === ROLES.FLEET_ADMIN ||
    role === ROLES.LOCATION_HEAD ||
    role === ROLES.FLEET_MANAGER ||
    role === ROLES.DRIVER;



  const [targetTenantId, setTargetTenantId] = useState("");

  const [showHistory, setShowHistory] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [endTripTarget, setEndTripTarget] = useState<Trip | null>(null);



  const effectiveTenantId = isPlatformAdmin ? targetTenantId : tenantId ?? undefined;

  const scopeReady = isPlatformAdmin ? Boolean(effectiveTenantId) : Boolean(tenantId);

  const timeZone = useUserTimeZone();



  const trips = useQuery({

    queryKey: ["trips", effectiveTenantId, showHistory],

    queryFn: () =>

      showHistory

        ? api.listTrips(effectiveTenantId)

        : api.listTrips(effectiveTenantId, { openOnly: true }),

    enabled: scopeReady,

  });



  const assignments = useQuery({

    queryKey: ["assignments", effectiveTenantId, "active"],

    queryFn: () => api.listAssignments(effectiveTenantId, { activeOnly: true }),

    enabled: scopeReady && canManage,

  });



  const drivers = useQuery({

    queryKey: ["drivers", effectiveTenantId],

    queryFn: () => api.listDrivers(effectiveTenantId),

    enabled: scopeReady,

  });



  const vehicles = useQuery({

    queryKey: ["vehicles", effectiveTenantId],

    queryFn: () => api.listVehicles(effectiveTenantId),

    enabled: scopeReady,

  });



  const driverMap = useMemo(() => {

    const m = new Map<string, string>();

    drivers.data?.forEach((d) => m.set(d.driverId, d.name));

    return m;

  }, [drivers.data]);



  const vehicleMap = useMemo(() => {

    const m = new Map<string, string>();

    vehicles.data?.forEach((v) =>

      m.set(v.vehicleId, v.vehicleName || v.registrationNumber),

    );

    return m;

  }, [vehicles.data]);



  const cancelTrip = useMutation({
    mutationFn: (tripId: string) =>
      api.endTrip(tripId, { cancel: true }, effectiveTenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });



  const activateTrip = useMutation({

    mutationFn: (tripId: string) => api.activateTrip(tripId, effectiveTenantId),

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ["trips"] });

      qc.invalidateQueries({ queryKey: ["drivers"] });

      qc.invalidateQueries({ queryKey: ["vehicles"] });

    },

  });



  const openTrips = trips.data ?? [];



  return (

    <div>

      <div className="flex flex-wrap items-start justify-between gap-4">

        <div>

          <h1 className="text-2xl font-semibold text-white">Trips</h1>

          <p className="mt-2 max-w-2xl text-sm text-slate-400">

            Fleet managers create trips from active assignments. Each trip is master–detail

            with its assignment. While a trip is in progress or scheduled, that assignment

            cannot be double-booked for overlapping times; non-overlapping future trips are

            allowed.

          </p>

        </div>

        {scopeReady && canManage && (

          <button

            type="button"

            onClick={() => setCreateOpen(true)}

            className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"

          >

            New trip

          </button>

        )}

      </div>



      {isPlatformAdmin && (

        <TenantScopePicker value={targetTenantId} onChange={setTargetTenantId} className="mt-6" />

      )}



      {scopeReady && canManage && (

        <CreateTripModal

          open={createOpen}

          tenantId={effectiveTenantId!}

          assignments={assignments.data ?? []}

          trips={openTrips}

          driverMap={driverMap}

          vehicleMap={vehicleMap}

          onClose={() => setCreateOpen(false)}

        />

      )}

      {scopeReady && endTripTarget && (
        <EndTripModal
          open={Boolean(endTripTarget)}
          trip={endTripTarget}
          tenantId={effectiveTenantId!}
          onClose={() => setEndTripTarget(null)}
        />
      )}



      <div className="mt-6 flex items-center gap-3">

        <label className="flex items-center gap-2 text-sm text-slate-400">

          <input

            type="checkbox"

            checked={showHistory}

            onChange={(e) => setShowHistory(e.target.checked)}

          />

          Show completed / cancelled

        </label>

      </div>



      {trips.isLoading && <p className="mt-6 text-slate-400">Loading…</p>}

      <ul className="mt-4 divide-y divide-slate-800 rounded-xl border border-slate-800">

        {openTrips.map((t) => (

          <li key={t.tripId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">

            <div>

              <p className="font-medium text-white">

                <Link

                  to={`/trips/${t.tripId}?tenantId=${encodeURIComponent(effectiveTenantId ?? "")}`}

                  className="text-emerald-400 hover:underline"

                >

                  {driverMap.get(t.driverId) ?? "Driver"} ·{" "}

                  {vehicleMap.get(t.vehicleId) ?? "Vehicle"}

                </Link>

              </p>

              <p className="text-xs text-slate-500">
                {t.status} · {formatTripWindow(t, timeZone)}
                {t.routeDistanceKm != null && t.routeDistanceKm > 0
                  ? ` · ${t.routeDistanceKm.toFixed(1)} km`
                  : ""}
              </p>

            </div>

            <div className="flex flex-wrap gap-2">

              {tripNeedsStart(t) && canManage && (

                <>

                  <button

                    type="button"

                    disabled={activateTrip.isPending}

                    onClick={() => activateTrip.mutate(t.tripId)}

                    className="rounded-md border border-emerald-800 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950"

                  >

                    Start

                  </button>

                  {t.status === "SCHEDULED" && (

                  <button

                    type="button"

                    disabled={cancelTrip.isPending}

                    onClick={() => cancelTrip.mutate(t.tripId)}

                    className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"

                  >

                    Cancel

                  </button>

                  )}

                </>

              )}

              {tripCanEnd(t) && canManage && (

                <button

                  type="button"

                  onClick={() => setEndTripTarget(t)}

                  className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"

                >

                  End trip

                </button>

              )}

            </div>

          </li>

        ))}

      </ul>

      {!trips.isLoading && openTrips.length === 0 && (

        <p className="mt-4 text-sm text-slate-500">No trips yet.</p>

      )}

    </div>

  );

}

