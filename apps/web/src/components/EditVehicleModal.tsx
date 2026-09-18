import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Vehicle } from "@fleet/types";
import {
  FUEL_TYPES,
  LEASE_OWNERSHIP_TYPES,
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
} from "@fleet/constants";
import { updateVehicleSchema } from "@fleet/validation";
import { useEffect, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { ApiError } from "@fleet/api-client";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";

type Props = {
  open: boolean;
  vehicle: Vehicle;
  tenantId: string;
  onClose: () => void;
};

export function EditVehicleModal({ open, vehicle, tenantId, onClose }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();

  const [vehicleName, setVehicleName] = useState(vehicle.vehicleName);
  const [make, setMake] = useState(vehicle.make);
  const [model, setModel] = useState(vehicle.model);
  const [year, setYear] = useState(String(vehicle.year ?? ""));
  const [registrationNumber, setRegistrationNumber] = useState(vehicle.registrationNumber);
  const [vin, setVin] = useState(vehicle.vin ?? "");
  const [color, setColor] = useState(vehicle.color ?? "");
  const [dotNumber, setDotNumber] = useState(vehicle.dotNumber ?? "");
  const [leaseOwnershipType, setLeaseOwnershipType] = useState(vehicle.leaseOwnershipType ?? "");
  const [vehicleStatus, setVehicleStatus] = useState(vehicle.status);
  const [policyNumber, setPolicyNumber] = useState(vehicle.policyNumber ?? "");
  const [coveredUnderPolicy, setCoveredUnderPolicy] = useState(
    Boolean(vehicle.coveredUnderPolicy),
  );
  const [cargoType, setCargoType] = useState(vehicle.cargoType ?? "");
  const [weightLbs, setWeightLbs] = useState(
    vehicle.weightLbs != null ? String(vehicle.weightLbs) : "",
  );
  const [vehicleType, setVehicleType] = useState(vehicle.vehicleType);
  const [fuelType, setFuelType] = useState(vehicle.fuelType);
  const [vehicleSubtype, setVehicleSubtype] = useState(vehicle.vehicleSubtype ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVehicleName(vehicle.vehicleName);
    setMake(vehicle.make);
    setModel(vehicle.model);
    setYear(vehicle.year != null ? String(vehicle.year) : "");
    setRegistrationNumber(vehicle.registrationNumber);
    setVin(vehicle.vin ?? "");
    setColor(vehicle.color ?? "");
    setDotNumber(vehicle.dotNumber ?? "");
    setLeaseOwnershipType(vehicle.leaseOwnershipType ?? "");
    setVehicleStatus(vehicle.status);
    setPolicyNumber(vehicle.policyNumber ?? "");
    setCoveredUnderPolicy(Boolean(vehicle.coveredUnderPolicy));
    setCargoType(vehicle.cargoType ?? "");
    setWeightLbs(vehicle.weightLbs != null ? String(vehicle.weightLbs) : "");
    setVehicleType(vehicle.vehicleType);
    setFuelType(vehicle.fuelType);
    setVehicleSubtype(vehicle.vehicleSubtype ?? "");
    setError(null);
  }, [open, vehicle]);

  const save = useMutation({
    mutationFn: (body: Parameters<typeof api.updateVehicle>[1]) =>
      api.updateVehicle(vehicle.vehicleId, body, tenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle", vehicle.vehicleId] });
      qc.invalidateQueries({ queryKey: ["vehicles", tenantId] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Update failed");
    },
  });

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = updateVehicleSchema.safeParse({
      vehicleName,
      registrationNumber,
      vin: vin || undefined,
      make,
      model,
      year: year ? Number(year) : undefined,
      color: color || undefined,
      dotNumber: dotNumber || undefined,
      leaseOwnershipType: leaseOwnershipType || undefined,
      status: vehicleStatus,
      policyNumber: policyNumber || undefined,
      coveredUnderPolicy,
      cargoType: cargoType || undefined,
      weightLbs: weightLbs || undefined,
      vehicleType,
      fuelType,
      vehicleSubtype: vehicleSubtype || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white">Edit vehicle</h2>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs text-slate-400">Vehicle name</span>
            <input
              value={vehicleName}
              onChange={(e) => setVehicleName(e.target.value)}
              className={`mt-1 ${inputClass}`}
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Make</span>
            <input value={make} onChange={(e) => setMake(e.target.value)} className={`mt-1 ${inputClass}`} required />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Model</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} className={`mt-1 ${inputClass}`} required />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Year</span>
            <input value={year} onChange={(e) => setYear(e.target.value)} className={`mt-1 ${inputClass}`} required />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Registration</span>
            <input
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">VIN</span>
            <input value={vin} onChange={(e) => setVin(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Color</span>
            <input value={color} onChange={(e) => setColor(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">DOT number</span>
            <input value={dotNumber} onChange={(e) => setDotNumber(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Lease / ownership</span>
            <select
              value={leaseOwnershipType}
              onChange={(e) => setLeaseOwnershipType(e.target.value)}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">— None —</option>
              {LEASE_OWNERSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Status</span>
            <select
              value={vehicleStatus}
              onChange={(e) => setVehicleStatus(e.target.value as Vehicle["status"])}
              className={`mt-1 ${inputClass}`}
            >
              {VEHICLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Policy number</span>
            <input
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={coveredUnderPolicy}
              onChange={(e) => setCoveredUnderPolicy(e.target.checked)}
            />
            <span className="text-sm text-slate-300">Covered under policy</span>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Cargo type</span>
            <input value={cargoType} onChange={(e) => setCargoType(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Weight (lbs)</span>
            <input value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Vehicle type</span>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as Vehicle["vehicleType"])}
              className={`mt-1 ${inputClass}`}
            >
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Fuel type</span>
            <select
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as Vehicle["fuelType"])}
              className={`mt-1 ${inputClass}`}
            >
              {FUEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-slate-400">Subtype</span>
            <input
              value={vehicleSubtype}
              onChange={(e) => setVehicleSubtype(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
