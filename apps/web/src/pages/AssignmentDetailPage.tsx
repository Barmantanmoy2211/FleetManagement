import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { EditAssignmentModal } from "@/components/EditAssignmentModal";
import { AssignmentTripsPanel } from "@/components/AssignmentTripsPanel";
import { RecordDetailTabs } from "@/components/RecordDetailTabs";
import { ApiError } from "@fleet/api-client";
import {
  assignmentChangeDate,
  assignmentReleaseDate,
  formatAssignmentDate,
} from "@/lib/assignmentDates";
import { formatTripDateTime } from "@/lib/tripScheduling";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 border-b border-slate-800/80 py-3 text-sm last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100">{value ?? "—"}</span>
    </div>
  );
}

export function AssignmentDetailPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [searchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenantId") ?? undefined;
  const navigate = useNavigate();
  const api = useApiClient();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canAssign =
    role === ROLES.PLATFORM_ADMIN ||
    role === ROLES.FLEET_ADMIN ||
    role === ROLES.LOCATION_HEAD ||
    role === ROLES.FLEET_MANAGER;
  const effectiveTenantId = isPlatformAdmin
    ? queryTenantId
    : (tenantId ?? queryTenantId ?? undefined);
  const timeZone = useUserTimeZone();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<"details" | "trips">("details");

  const assignment = useQuery({
    queryKey: ["assignment", assignmentId, effectiveTenantId],
    queryFn: async () => {
      const id = assignmentId!;
      const tid = effectiveTenantId!;
      try {
        return await api.getAssignment(id, tid);
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.status === 404 || err.status === 405)
        ) {
          const list = await api.listAssignments(tid, {});
          const found = list.find((x) => x.assignmentId === id);
          if (found) return found;
        }
        throw err;
      }
    },
    enabled: Boolean(assignmentId) && Boolean(effectiveTenantId),
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

  const remove = useMutation({
    mutationFn: () => api.deleteAssignment(assignmentId!, effectiveTenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      navigate("/assignments");
    },
    onError: (err) => {
      setActionError(
        err instanceof ApiError ? err.message : "Could not delete assignment",
      );
      setDeleteOpen(false);
    },
  });

  if (!assignmentId) {
    return <p className="text-slate-400">Invalid assignment.</p>;
  }

  const a = assignment.data;
  const driverName =
    drivers.data?.find((d) => d.driverId === a?.driverId)?.name ?? a?.driverId;
  const vehicleLabel =
    vehicles.data?.find((v) => v.vehicleId === a?.vehicleId)?.registrationNumber ??
    a?.vehicleId;

  return (
    <div className="max-w-3xl">
      <Link to="/assignments" className="text-sm text-emerald-400 hover:underline">
        ← Back to assignments
      </Link>

      {assignment.isLoading && <p className="mt-4 text-slate-400">Loading…</p>}
      {assignment.isError && (
        <p className="mt-4 text-red-400">
          {assignment.error instanceof ApiError
            ? (typeof assignment.error.body === "object" &&
              assignment.error.body !== null &&
              "detail" in assignment.error.body &&
              typeof (assignment.error.body as { detail: unknown }).detail ===
                "string"
                ? (assignment.error.body as { detail: string }).detail
                : assignment.error.message) || "Could not load assignment."
            : "Could not load assignment."}
        </p>
      )}

      {a && effectiveTenantId && (
        <>
          <div className="mt-4 rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Assignment
                </p>
                <h1 className="text-2xl font-semibold text-white">
                  {driverName} → {vehicleLabel}
                </h1>
                <p className="mt-1 text-sm text-slate-400">{a.status}</p>
              </div>
              {canAssign &&
                (a.status === "ACTIVE" || a.status === "SCHEDULED") && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      className="rounded-md border border-slate-500 px-4 py-2 text-sm text-white hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setDeleteOpen(true);
                      }}
                      className="rounded-md border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-200 hover:bg-red-900/40"
                    >
                      Delete
                    </button>
                  </div>
                )}
            </div>
          </div>

          {actionError && (
            <p className="mt-4 text-sm text-red-400">{actionError}</p>
          )}

          <RecordDetailTabs
            tabs={[
              { id: "details", label: "Details" },
              { id: "trips", label: "Trips" },
            ]}
            activeId={tab}
            onChange={(id) => setTab(id as "details" | "trips")}
          />

          {tab === "details" && (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-2">
            <Field
              label="Date of change"
              value={formatAssignmentDate(assignmentChangeDate(a), timeZone)}
            />
            <Field
              label="Date of release (tentative)"
              value={formatAssignmentDate(assignmentReleaseDate(a), timeZone)}
            />
            <Field
              label="Started (system)"
              value={formatTripDateTime(a.startTime, timeZone)}
            />
            <Field
              label="Ended"
              value={a.endTime ? formatTripDateTime(a.endTime, timeZone) : "—"}
            />
            <Field label="Driver" value={driverName} />
            <Field label="Vehicle" value={vehicleLabel} />
          </div>
          )}

          {tab === "trips" && (
            <AssignmentTripsPanel
              tenantId={effectiveTenantId}
              assignmentId={a.assignmentId}
            />
          )}

          <EditAssignmentModal
            open={editOpen}
            assignment={a}
            tenantId={effectiveTenantId}
            onClose={() => setEditOpen(false)}
          />

          {deleteOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6">
                <h2 className="text-lg font-semibold text-white">
                  Delete assignment?
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {a.status === "SCHEDULED"
                    ? "This will cancel the scheduled assignment."
                    : "This will end the active assignment and free the driver and vehicle."}
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(false)}
                    className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                    className="rounded-md bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-600"
                  >
                    {remove.isPending ? "Deleting…" : "Confirm delete"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
