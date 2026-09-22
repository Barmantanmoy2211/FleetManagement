import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useAuthStore } from "@/stores/authStore";
import {
  assignmentChangeDate,
  assignmentReleaseDate,
  formatAssignmentDate,
} from "@/lib/assignmentDates";
import { ApiError } from "@fleet/api-client";
import { EditTripModal } from "@/components/EditTripModal";
import { EndTripModal } from "@/components/EndTripModal";
import { TripRoutePanel } from "@/components/TripRoutePanel";
import { RecordDetailTabs } from "@/components/RecordDetailTabs";
import {
  formatTripDateTime,
  formatTimeTaken,
  tripActualStart,
  tripCanEnd,
  tripNeedsStart,
  tripScheduledEnd,
  tripScheduledStart,
} from "@/lib/tripScheduling";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 border-b border-slate-800/80 py-3 text-sm last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100">{value ?? "—"}</span>
    </div>
  );
}

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenantId") ?? undefined;
  const [tab, setTab] = useState<"details" | "route" | "assignment">("details");
  const [editOpen, setEditOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
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
  const effectiveTenantId = isPlatformAdmin
    ? queryTenantId
    : (tenantId ?? queryTenantId ?? undefined);
  const timeZone = useUserTimeZone();

  const trip = useQuery({
    queryKey: ["trip", tripId, effectiveTenantId],
    queryFn: () => api.getTrip(tripId!, effectiveTenantId),
    enabled: Boolean(tripId) && Boolean(effectiveTenantId),
  });

  const assignment = useQuery({
    queryKey: ["assignment", trip.data?.assignmentId, effectiveTenantId],
    queryFn: async () => {
      const id = trip.data!.assignmentId;
      try {
        return await api.getAssignment(id, effectiveTenantId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          const list = await api.listAssignments(effectiveTenantId!, {});
          return list.find((a) => a.assignmentId === id) ?? null;
        }
        throw err;
      }
    },
    enabled: Boolean(trip.data?.assignmentId) && Boolean(effectiveTenantId),
  });

  const drivers = useQuery({
    queryKey: ["drivers", effectiveTenantId],
    queryFn: () => api.listDrivers(effectiveTenantId!),
    enabled: Boolean(effectiveTenantId),
  });
  const vehicles = useQuery({
    queryKey: ["vehicles", effectiveTenantId],
    queryFn: () => api.listVehicles(effectiveTenantId!),
    enabled: Boolean(effectiveTenantId),
  });

  const activate = useMutation({
    mutationFn: () => api.activateTrip(tripId!, effectiveTenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  const t = trip.data;
  const driverName =
    drivers.data?.find((d) => d.driverId === t?.driverId)?.name ?? t?.driverId;
  const vehicleLabel =
    vehicles.data?.find((v) => v.vehicleId === t?.vehicleId)?.registrationNumber ??
    t?.vehicleId;
  const canEditRoute =
    canManage &&
    t &&
    (t.status === "SCHEDULED" || t.status === "IN_PROGRESS");
  const a = assignment.data;

  return (
    <div className="max-w-3xl">
      <Link to="/trips" className="text-sm text-emerald-400 hover:underline">
        ← Back to trips
      </Link>

      {trip.isLoading && <p className="mt-4 text-slate-400">Loading…</p>}
      {trip.isError && (
        <p className="mt-4 text-red-400">Could not load trip.</p>
      )}

      {t && effectiveTenantId && (
        <>
          <div className="mt-4 rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Trip</p>
                <h1 className="text-2xl font-semibold text-white">
                  {driverName} · {vehicleLabel}
                </h1>
                <p className="mt-1 text-sm text-slate-400">{t.status}</p>
              </div>
              {canManage && tripNeedsStart(t) && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={activate.isPending}
                    onClick={() => activate.mutate()}
                    className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
                  >
                    Start trip
                  </button>
                  {t.status === "SCHEDULED" && (
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      className="rounded-md border border-slate-500 px-4 py-2 text-sm text-white hover:bg-slate-800"
                    >
                      Edit
                    </button>
                  )}
                </div>
              )}
              {canManage && tripCanEnd(t) && (
                <button
                  type="button"
                  onClick={() => setEndOpen(true)}
                  className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
                >
                  End trip
                </button>
              )}
            </div>
          </div>

          <RecordDetailTabs
            tabs={[
              { id: "details", label: "Details" },
              { id: "route", label: "Route map" },
              { id: "assignment", label: "Assignment" },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as "details" | "route" | "assignment")}
          />

          {tab === "details" && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-2">
              <Field
                label="Scheduled start"
                value={formatTripDateTime(tripScheduledStart(t), timeZone)}
              />
              <Field
                label="Scheduled end"
                value={formatTripDateTime(tripScheduledEnd(t), timeZone)}
              />
              <Field
                label="Actual start"
                value={formatTripDateTime(tripActualStart(t), timeZone)}
              />
              <Field
                label="Ended"
                value={t.endTime ? formatTripDateTime(t.endTime, timeZone) : "—"}
              />
              <Field label="Driver" value={driverName} />
              <Field label="Vehicle" value={vehicleLabel} />
              <Field
                label="Route distance"
                value={
                  t.routeDistanceKm > 0 ? `${t.routeDistanceKm.toFixed(2)} km` : "—"
                }
              />
              <Field
                label="Time taken"
                value={
                  t.timeTakenMinutes != null && t.timeTakenMinutes > 0
                    ? formatTimeTaken(t.timeTakenMinutes)
                    : "—"
                }
              />
              <Field
                label="Fuel required"
                value={
                  t.fuelRequiredLiters != null && t.fuelRequiredLiters > 0
                    ? `${t.fuelRequiredLiters.toFixed(2)} L`
                    : "—"
                }
              />
            </div>
          )}

          {tab === "route" && (
            <div className="mt-4">
              <TripRoutePanel
                trip={t}
                tenantId={effectiveTenantId}
                canEdit={canEditRoute}
              />
            </div>
          )}

          {tab === "assignment" && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-2">
              {assignment.isLoading && (
                <p className="py-2 text-sm text-slate-500">Loading assignment…</p>
              )}
              {a && (
                <>
                  <Field
                    label="Assignment"
                    value={
                      <Link
                        to={`/assignments/${a.assignmentId}?tenantId=${encodeURIComponent(effectiveTenantId)}`}
                        className="text-emerald-400 hover:underline"
                      >
                        {driverName} → {vehicleLabel}
                      </Link>
                    }
                  />
                  <Field label="Status" value={a.status} />
                  <Field
                    label="Date of change"
                    value={formatAssignmentDate(assignmentChangeDate(a), timeZone)}
                  />
                  <Field
                    label="Release (tentative)"
                    value={formatAssignmentDate(assignmentReleaseDate(a), timeZone)}
                  />
                </>
              )}
              {!assignment.isLoading && !a && (
                <p className="py-2 text-sm text-slate-500">Assignment not found.</p>
              )}
            </div>
          )}

          <EditTripModal
            open={editOpen}
            trip={t}
            tenantId={effectiveTenantId}
            onClose={() => setEditOpen(false)}
          />
          <EndTripModal
            open={endOpen}
            trip={t}
            tenantId={effectiveTenantId}
            onClose={() => setEndOpen(false)}
          />
        </>
      )}
    </div>
  );
}
