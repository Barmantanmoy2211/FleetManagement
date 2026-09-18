import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Vehicle } from "@fleet/types";
import { ROLES } from "@fleet/constants";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { EditVehicleModal } from "@/components/EditVehicleModal";
import { ApiError } from "@fleet/api-client";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 border-b border-slate-800/80 py-3 text-sm last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100">{value ?? "—"}</span>
    </div>
  );
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-lg border border-slate-800 bg-slate-950/50"
    >
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-white marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-slate-500">▾</span>
          {title}
        </span>
      </summary>
      <div className="grid gap-0 px-4 pb-4 sm:grid-cols-2 sm:gap-x-8">{children}</div>
    </details>
  );
}

function HighlightStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function VehicleDetailsSections({ v }: { v: Vehicle }) {
  return (
    <div className="mt-8 flex max-w-5xl flex-col gap-4">
      <Section title="Vehicle identification">
        <div>
          <Field label="Vehicle ID" value={v.displayVehicleId ?? v.vehicleId} />
          <Field label="Vehicle name" value={v.vehicleName} />
          <Field label="Make" value={v.make} />
          <Field label="Model" value={v.model} />
          <Field label="Year of manufacture" value={v.year} />
          <Field label="Age" value={v.age != null ? `${v.age} years` : "—"} />
          <Field label="VIN" value={v.vin} />
          <Field label="Color" value={v.color} />
        </div>
        <div>
          <Field label="Registration / plate" value={v.registrationNumber} />
          <Field label="DOT number" value={v.dotNumber} />
          <Field label="Lease / ownership" value={v.leaseOwnershipType} />
          <Field
            label="Vehicle status"
            value={
              <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-300">
                {v.status}
              </span>
            }
          />
          <Field label="Policy number" value={v.policyNumber} />
          <Field label="Covered under policy" value={v.coveredUnderPolicy ? "Yes" : "No"} />
        </div>
      </Section>

      <Section title="Classification & technical">
        <div>
          <Field label="Cargo type" value={v.cargoType} />
          <Field label="Weight (lbs)" value={v.weightLbs} />
          <Field label="Vehicle type" value={v.vehicleType} />
        </div>
        <div>
          <Field label="Fuel type" value={v.fuelType} />
          <Field label="Subtype" value={v.vehicleSubtype} />
          <Field label="Odometer (km)" value={v.odometerKm} />
          <Field
            label="Current assignment"
            value={v.currentDriverId ? `Driver ${v.currentDriverId.slice(0, 8)}…` : "None"}
          />
        </div>
      </Section>
    </div>
  );
}

export function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [searchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenantId") ?? undefined;
  const navigate = useNavigate();
  const api = useApiClient();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canWrite = role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;
  const effectiveTenantId = isPlatformAdmin ? queryTenantId : tenantId ?? undefined;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const vehicle = useQuery({
    queryKey: ["vehicle", vehicleId, queryTenantId, tenantId],
    queryFn: () => {
      if (!vehicleId) throw new Error("Missing vehicle id");
      return api.getVehicle(vehicleId, effectiveTenantId);
    },
    enabled:
      Boolean(vehicleId) &&
      (isPlatformAdmin ? Boolean(queryTenantId) : Boolean(tenantId)),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteVehicle(vehicleId!, effectiveTenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      if (effectiveTenantId) {
        navigate(`/tenants/${effectiveTenantId}?tab=vehicles`);
      } else {
        navigate("/vehicles");
      }
    },
    onError: (err) => {
      setDeleteError(
        err instanceof ApiError
          ? (typeof err.body === "object" &&
              err.body &&
              "detail" in err.body &&
              String((err.body as { detail: unknown }).detail)) ||
              err.message
          : "Could not delete vehicle",
      );
    },
  });

  if (!vehicleId) {
    return <p className="text-slate-400">Invalid vehicle.</p>;
  }

  const backHref = effectiveTenantId
    ? `/tenants/${effectiveTenantId}?tab=vehicles`
    : "/vehicles";
  const backLabel = effectiveTenantId ? "← Back to organization" : "← Back to vehicles";

  const v = vehicle.data;

  return (
    <div className="max-w-5xl">
      <Link to={backHref} className="text-sm text-emerald-400 hover:underline">
        {backLabel}
      </Link>

      {vehicle.isLoading && <p className="mt-4 text-slate-400">Loading…</p>}
      {vehicle.isError && <p className="mt-4 text-red-400">Could not load vehicle.</p>}

      {v && (
        <>
          <div className="mt-4 rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Vehicle</p>
                <h1 className="text-2xl font-semibold text-white">{v.vehicleName}</h1>
                <p className="mt-1 text-sm text-slate-400">
                  {v.displayVehicleId ?? v.vehicleId.slice(0, 8)} · {v.make} {v.model}
                </p>
              </div>
              {canWrite && (
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
                      setDeleteError(null);
                      setDeleteOpen(true);
                    }}
                    className="rounded-md border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-200 hover:bg-red-900/40"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-4">
              <HighlightStat label="Status" value={v.status} />
              <HighlightStat
                label="Make / model"
                value={`${v.make} ${v.model}`}
              />
              <HighlightStat
                label="Year"
                value={v.year != null ? `${v.year}${v.age != null ? ` (${v.age}y)` : ""}` : "—"}
              />
              <HighlightStat label="Registration" value={v.registrationNumber} />
            </dl>
          </div>

          <VehicleDetailsSections v={v} />

          {canWrite && (
            <EditVehicleModal
              open={editOpen}
              vehicle={v}
              tenantId={effectiveTenantId ?? v.tenantId}
              onClose={() => setEditOpen(false)}
            />
          )}

          {deleteOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6">
                <h2 className="text-lg font-semibold text-white">Delete vehicle?</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {v.vehicleName} will be marked inactive. End any active assignment first if
                  delete is blocked.
                </p>
                {deleteError && (
                  <p className="mt-3 text-sm text-red-300">{deleteError}</p>
                )}
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
