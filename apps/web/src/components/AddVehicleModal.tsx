import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FUEL_TYPES,
  LEASE_OWNERSHIP_TYPES,
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
} from "@fleet/constants";
import { createVehicleSchema } from "@fleet/validation";
import { useRef, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { ApiError } from "@fleet/api-client";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";

type Props = {
  open: boolean;
  tenantId: string;
  tenantName?: string;
  onClose: () => void;
  queryKey?: unknown[];
};

export function AddVehicleModal({
  open,
  tenantId,
  tenantName,
  onClose,
  queryKey = ["vehicles", tenantId],
}: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [vehicleName, setVehicleName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [vin, setVin] = useState("");
  const [color, setColor] = useState("");
  const [dotNumber, setDotNumber] = useState("");
  const [leaseOwnershipType, setLeaseOwnershipType] = useState("");
  const [vehicleStatus, setVehicleStatus] = useState("AVAILABLE");
  const [policyNumber, setPolicyNumber] = useState("");
  const [coveredUnderPolicy, setCoveredUnderPolicy] = useState(false);
  const [cargoType, setCargoType] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [vehicleType, setVehicleType] = useState<string>("TRUCK");
  const [fuelType, setFuelType] = useState<string>("DIESEL");
  const [vehicleSubtype, setVehicleSubtype] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  function resetForm() {
    setVehicleName("");
    setMake("");
    setModel("");
    setYear("");
    setRegistrationNumber("");
    setVin("");
    setColor("");
    setDotNumber("");
    setLeaseOwnershipType("");
    setVehicleStatus("AVAILABLE");
    setPolicyNumber("");
    setCoveredUnderPolicy(false);
    setCargoType("");
    setWeightLbs("");
    setVehicleType("TRUCK");
    setFuelType("DIESEL");
    setVehicleSubtype("");
    setFormError(null);
    setImportMessage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.createVehicle>[0]) => api.createVehicle(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey });
      handleClose();
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Could not create vehicle");
    },
  });

  const importExcel = useMutation({
    mutationFn: (file: File) => api.importVehiclesFromExcel(file, tenantId),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey });
      setImportMessage(
        `Imported ${result.created} vehicle(s).` +
          (result.failed ? ` ${result.failed} row(s) had errors.` : ""),
      );
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (err) => {
      let msg = "Upload failed. Check the file format and try again.";
      if (err instanceof ApiError) {
        if (err.status === 404 || err.status === 405) {
          msg =
            "Vehicle import is not available on the server yet. Redeploy the backend (FleetFoundation-dev), then try again.";
        } else {
          msg = err.message || msg;
        }
      }
      setImportMessage(msg);
    },
  });

  async function handleDownloadTemplate() {
    setImportMessage(null);
    try {
      const blob = await api.downloadVehicleImportTemplate(tenantId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vehicle-import-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "Could not download template.";
      setImportMessage(msg);
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createVehicleSchema.safeParse({
      vehicleName,
      registrationNumber: registrationNumber || undefined,
      vin: vin || undefined,
      make,
      model,
      year: year || undefined,
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
      tenantId,
    });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    create.mutate(parsed.data);
  }

  const computedAge =
    year && /^\d{4}$/.test(year) ? Math.max(0, new Date().getFullYear() - Number(year)) : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Add vehicle</h2>
            <p className="mt-1 text-sm text-slate-400">
              Enter details manually or import from Excel. VIN and DOT can stay empty for now.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Excel import</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadTemplate()}
              className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Download template
            </button>
            <label className="cursor-pointer rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30">
              {importExcel.isPending ? "Uploading…" : "Upload Excel"}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importExcel.mutate(file);
                }}
              />
            </label>
          </div>
          {importMessage && <p className="mt-3 text-sm text-slate-300">{importMessage}</p>}
          {importExcel.data?.errors?.length ? (
            <ul className="mt-2 list-inside list-disc text-sm text-amber-400/90">
              {importExcel.data.errors.slice(0, 5).map((err) => (
                <li key={`${err.row}-${err.message}`}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <form onSubmit={handleCreate} className="mt-6 space-y-6">
          <section>
            <h3 className="text-sm font-medium text-emerald-400/90">Vehicle identification</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs text-slate-400">
                  Vehicle name <span className="text-red-400">*</span>
                </span>
                <input
                  value={vehicleName}
                  onChange={(e) => setVehicleName(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">
                  Make <span className="text-red-400">*</span>
                </span>
                <input
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">
                  Model <span className="text-red-400">*</span>
                </span>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">
                  Year of manufacture <span className="text-red-400">*</span>
                </span>
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  inputMode="numeric"
                  className={`mt-1 ${inputClass}`}
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">VIN (optional for now)</span>
                <input value={vin} onChange={(e) => setVin(e.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Color</span>
                <input value={color} onChange={(e) => setColor(e.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">
                  Tenant <span className="text-red-400">*</span>
                </span>
                <input
                  readOnly
                  value={tenantName ?? tenantId}
                  className={`mt-1 ${inputClass} text-slate-400`}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Registration / plate</span>
                <input
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                  placeholder="Optional — auto-generated if blank"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">DOT number (optional for now)</span>
                <input
                  value={dotNumber}
                  onChange={(e) => setDotNumber(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                  placeholder="Calculated later when enabled"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Lease / ownership type</span>
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
                <span className="text-xs text-slate-400">
                  Vehicle status <span className="text-red-400">*</span>
                </span>
                <select
                  value={vehicleStatus}
                  onChange={(e) => setVehicleStatus(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                >
                  {VEHICLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === "AVAILABLE" ? "Active (Available)" : s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Policy number (stored for later use)</span>
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
                  className="rounded border-slate-600"
                />
                <span className="text-sm text-slate-300">Covered under policy (for later use)</span>
              </label>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium text-emerald-400/90">Classification &amp; technical</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-slate-400">Cargo type</span>
                <input value={cargoType} onChange={(e) => setCargoType(e.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Weight of vehicle (lbs)</span>
                <input
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(e.target.value)}
                  inputMode="decimal"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <div className="block">
                <span className="text-xs text-slate-400">Age</span>
                <p className="mt-2 text-sm text-slate-300">
                  {computedAge != null ? computedAge : "—"}
                  <span className="mt-1 block text-xs text-slate-500">Calculated from year on save</span>
                </p>
              </div>
              <label className="block">
                <span className="text-xs text-slate-400">
                  Vehicle type <span className="text-red-400">*</span>
                </span>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === "TRUCK" ? "Heavy Truck / Truck" : t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Fuel type</span>
                <select
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                >
                  {FUEL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-slate-400">Subtype</span>
                <input
                  value={vehicleSubtype}
                  onChange={(e) => setVehicleSubtype(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            </div>
          </section>

          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
            >
              {create.isPending ? "Saving…" : "Save vehicle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
