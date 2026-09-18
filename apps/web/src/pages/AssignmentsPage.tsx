import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import { createAssignmentSchema } from "@fleet/validation";
import { useMemo, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { TenantScopePicker } from "@/components/TenantScopePicker";

export function AssignmentsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canAssign =
    role === ROLES.PLATFORM_ADMIN ||
    role === ROLES.FLEET_ADMIN ||
    role === ROLES.FLEET_MANAGER;

  const [targetTenantId, setTargetTenantId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const effectiveTenantId = isPlatformAdmin ? targetTenantId : tenantId ?? undefined;
  const scopeReady = isPlatformAdmin ? Boolean(effectiveTenantId) : Boolean(tenantId);

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

  const assignments = useQuery({
    queryKey: ["assignments", effectiveTenantId, showHistory],
    queryFn: () => api.listAssignments(effectiveTenantId, !showHistory),
    enabled: scopeReady,
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

  const availableDrivers = drivers.data?.filter((d) => d.status === "AVAILABLE") ?? [];
  const availableVehicles = vehicles.data?.filter((v) => v.status === "AVAILABLE") ?? [];

  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.createAssignment>[0]) =>
      api.createAssignment(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      setDriverId("");
      setVehicleId("");
    },
  });

  const endAssignment = useMutation({
    mutationFn: (assignmentId: string) =>
      api.endAssignment(assignmentId, effectiveTenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createAssignmentSchema.safeParse({
      driverId,
      vehicleId,
      tenantId: isPlatformAdmin ? targetTenantId : undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Assignments</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        Time-based driver–vehicle assignments. End an assignment to free the driver and vehicle;
        history is kept for audit.
      </p>

      {isPlatformAdmin && (
        <TenantScopePicker value={targetTenantId} onChange={setTargetTenantId} className="mt-6" />
      )}

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={showHistory}
          onChange={(e) => setShowHistory(e.target.checked)}
        />
        Show full assignment history
      </label>

      {canAssign && scopeReady && (
        <form onSubmit={handleCreate} className="mt-6 flex max-w-2xl flex-wrap gap-2">
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="min-w-[160px] flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">Driver…</option>
            {availableDrivers.map((d) => (
              <option key={d.driverId} value={d.driverId}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="min-w-[160px] flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="">Vehicle…</option>
            {availableVehicles.map((v) => (
              <option key={v.vehicleId} value={v.vehicleId}>
                {v.registrationNumber}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={create.isPending || !driverId || !vehicleId}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Assign
          </button>
        </form>
      )}
      {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}

      {assignments.isLoading && <p className="mt-8 text-slate-400">Loading…</p>}
      <ul className="mt-8 divide-y divide-slate-800 rounded-xl border border-slate-800">
        {assignments.data?.map((a) => (
          <li key={a.assignmentId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <p className="font-medium text-white">
                {driverMap.get(a.driverId) ?? a.driverId.slice(0, 8)} →{" "}
                {vehicleMap.get(a.vehicleId) ?? a.vehicleId.slice(0, 8)}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(a.startTime).toLocaleString()}
                {a.endTime ? ` — ${new Date(a.endTime).toLocaleString()}` : " — active"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                {a.status}
              </span>
              {canAssign && a.status === "ACTIVE" && (
                <button
                  type="button"
                  onClick={() => endAssignment.mutate(a.assignmentId)}
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
    </div>
  );
}
