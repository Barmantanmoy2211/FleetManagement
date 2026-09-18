import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES, VEHICLE_TYPES } from "@fleet/constants";
import { createVehicleSchema } from "@fleet/validation";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { TenantScopePicker } from "@/components/TenantScopePicker";

export function VehiclesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canWrite = role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;

  const [targetTenantId, setTargetTenantId] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [vehicleType, setVehicleType] = useState<string>("TRUCK");
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveTenantId = isPlatformAdmin ? targetTenantId : tenantId ?? undefined;

  const vehicles = useQuery({
    queryKey: ["vehicles", effectiveTenantId],
    queryFn: () => api.listVehicles(effectiveTenantId),
    enabled: isPlatformAdmin ? Boolean(effectiveTenantId) : Boolean(tenantId),
  });

  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.createVehicle>[0]) => api.createVehicle(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      setRegistrationNumber("");
      setMake("");
      setModel("");
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createVehicleSchema.safeParse({
      registrationNumber,
      make,
      model,
      vehicleType,
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
      <h1 className="text-2xl font-semibold text-white">Vehicles</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        Register fleet vehicles for your organization. Assign drivers on the Assignments page.
      </p>

      {isPlatformAdmin && (
        <TenantScopePicker value={targetTenantId} onChange={setTargetTenantId} className="mt-6" />
      )}

      {canWrite && (isPlatformAdmin ? targetTenantId : tenantId) && (
        <form onSubmit={handleCreate} className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-2">
          <input
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            placeholder="Registration number"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white sm:col-span-2"
          />
          <input
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="Make"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white sm:col-span-2"
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 sm:col-span-2 sm:w-fit"
          >
            Add vehicle
          </button>
        </form>
      )}
      {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}

      {vehicles.isLoading && <p className="mt-8 text-slate-400">Loading…</p>}
      <ul className="mt-8 divide-y divide-slate-800 rounded-xl border border-slate-800">
        {vehicles.data?.map((v) => (
          <li key={v.vehicleId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div>
              <p className="font-medium text-white">
                {v.registrationNumber} — {v.make} {v.model}
              </p>
              <p className="text-xs text-slate-500">
                {v.vehicleType} · {v.fuelType}
                {v.currentDriverId ? ` · driver ${v.currentDriverId.slice(0, 8)}…` : ""}
              </p>
            </div>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
              {v.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
