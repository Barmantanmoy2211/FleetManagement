import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Assignment } from "@fleet/types";
import { createAssignmentSchema } from "@fleet/validation";
import { useMemo, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { todayIsoDate } from "@/lib/fleetDriverForEmployee";
import {
  assignmentChangeDate,
  assignmentReleaseDate,
  formatAssignmentDate,
} from "@/lib/assignmentDates";

type Props = {
  tenantId: string;
  canAssign: boolean;
  fixedDriverId?: string;
  fixedVehicleId?: string;
  listDriverId?: string;
  listVehicleId?: string;
  embedded?: boolean;
};

export function EntityAssignmentsPanel({
  tenantId,
  canAssign,
  fixedDriverId,
  fixedVehicleId,
  listDriverId,
  listVehicleId,
  embedded = false,
}: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [driverId, setDriverId] = useState(fixedDriverId ?? "");
  const [vehicleId, setVehicleId] = useState(fixedVehicleId ?? "");
  const [changeDate, setChangeDate] = useState(todayIsoDate());
  const [releaseDate, setReleaseDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const drivers = useQuery({
    queryKey: ["drivers", tenantId],
    queryFn: () => api.listDrivers(tenantId),
  });
  const vehicles = useQuery({
    queryKey: ["vehicles", tenantId],
    queryFn: () => api.listVehicles(tenantId),
  });
  const assignments = useQuery({
    queryKey: ["assignments", tenantId, listDriverId, listVehicleId],
    queryFn: () =>
      api.listAssignments(tenantId, {
        driverId: listDriverId,
        vehicleId: listVehicleId,
      }),
  });

  const driverMap = useMemo(() => {
    const m = new Map<string, string>();
    drivers.data?.forEach((d) => m.set(d.driverId, d.name));
    return m;
  }, [drivers.data]);

  const vehicleMap = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.data?.forEach((v) => m.set(v.vehicleId, v.registrationNumber));
    return m;
  }, [vehicles.data]);

  const availableDrivers =
    drivers.data?.filter((d) => d.status === "AVAILABLE") ?? [];
  const availableVehicles =
    vehicles.data?.filter((v) => v.status === "AVAILABLE") ?? [];

  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.createAssignment>[0]) =>
      api.createAssignment(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      setFormOpen(false);
      setReleaseDate("");
      setFormError(null);
    },
  });

  const endAssignment = useMutation({
    mutationFn: (a: Assignment) =>
      api.endAssignment(a.assignmentId, tenantId, a.status === "SCHEDULED"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  const activate = useMutation({
    mutationFn: (assignmentId: string) =>
      api.activateAssignment(assignmentId, tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  function openForm() {
    setDriverId(fixedDriverId ?? "");
    setVehicleId(fixedVehicleId ?? "");
    setChangeDate(todayIsoDate());
    setReleaseDate("");
    setFormError(null);
    setFormOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createAssignmentSchema.safeParse({
      driverId: fixedDriverId ?? driverId,
      vehicleId: fixedVehicleId ?? vehicleId,
      changeDate,
      releaseDate: releaseDate || null,
      tenantId,
    });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    create.mutate(parsed.data);
  }

  const rows = assignments.data ?? [];

  return (
    <div
      className={
        embedded
          ? "rounded-xl border border-slate-800 bg-slate-900/30"
          : "mt-8 rounded-xl border border-slate-800 bg-slate-900/30"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-white">Assignments</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Driver–vehicle assignments with change and tentative release dates.
          </p>
        </div>
        {canAssign && (
          <button
            type="button"
            onClick={openForm}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"
          >
            New assignment
          </button>
        )}
      </div>

      {assignments.isLoading && (
        <p className="px-4 py-6 text-sm text-slate-500">Loading assignments…</p>
      )}

      {!assignments.isLoading && rows.length === 0 && (
        <p className="px-4 py-6 text-sm text-slate-500">No assignments yet.</p>
      )}

      <ul className="divide-y divide-slate-800">
        {rows.map((a) => (
          <li
            key={a.assignmentId}
            className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm"
          >
            <div>
              <p className="font-medium text-white">
                <Link
                  to={`/assignments/${a.assignmentId}?tenantId=${encodeURIComponent(tenantId)}`}
                  className="text-emerald-400 hover:underline"
                >
                  {driverMap.get(a.driverId) ?? "Driver"} →{" "}
                  {vehicleMap.get(a.vehicleId) ?? "Vehicle"}
                </Link>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Change: {formatAssignmentDate(assignmentChangeDate(a))}
                {" · "}
                Release (tentative):{" "}
                {formatAssignmentDate(assignmentReleaseDate(a))}
              </p>
              {a.endTime && (
                <p className="text-xs text-slate-600">
                  Ended: {new Date(a.endTime).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                {a.status}
              </span>
              {canAssign && a.status === "SCHEDULED" && (
                <>
                  <button
                    type="button"
                    onClick={() => activate.mutate(a.assignmentId)}
                    disabled={activate.isPending}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    Activate
                  </button>
                  <button
                    type="button"
                    onClick={() => endAssignment.mutate(a)}
                    disabled={endAssignment.isPending}
                    className="text-xs text-slate-400 hover:underline"
                  >
                    Cancel
                  </button>
                </>
              )}
              {canAssign && a.status === "ACTIVE" && (
                <button
                  type="button"
                  onClick={() => endAssignment.mutate(a)}
                  disabled={endAssignment.isPending}
                  className="text-xs text-amber-400 hover:underline"
                >
                  End
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">New assignment</h3>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
              {!fixedDriverId && (
                <label className="block">
                  <span className="text-xs text-slate-400">Driver</span>
                  <select
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    required
                  >
                    <option value="">Select driver</option>
                    {availableDrivers.map((d) => (
                      <option key={d.driverId} value={d.driverId}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!fixedVehicleId && (
                <label className="block">
                  <span className="text-xs text-slate-400">Vehicle</span>
                  <select
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    required
                  >
                    <option value="">Select vehicle</option>
                    {availableVehicles.map((v) => (
                      <option key={v.vehicleId} value={v.vehicleId}>
                        {v.registrationNumber}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="text-xs text-slate-400">Date of change</span>
                <input
                  type="date"
                  value={changeDate}
                  onChange={(e) => setChangeDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">
                  Date of release (tentative)
                </span>
                <input
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </label>
              {formError && <p className="text-sm text-red-400">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={create.isPending}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
                >
                  {create.isPending ? "Saving…" : "Create assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
