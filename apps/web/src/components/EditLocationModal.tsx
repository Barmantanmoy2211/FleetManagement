import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TenantLocation } from "@fleet/types";
import { useEffect, useState } from "react";
import { ApiError } from "@fleet/api-client";
import { useApiClient } from "@/hooks/useApiClient";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";

type Props = {
  open: boolean;
  tenantId: string;
  location: TenantLocation;
  onClose: () => void;
};

export function EditLocationModal({ open, tenantId, location, onClose }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const [name, setName] = useState(location.name);
  const [city, setCity] = useState(location.city ?? "");
  const [state, setState] = useState(location.state ?? "");
  const [zipCode, setZipCode] = useState(location.code ?? "");
  const [country, setCountry] = useState(location.country ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(location.name);
      setCity(location.city ?? "");
      setState(location.state ?? "");
      setZipCode(location.code ?? "");
      setCountry(location.country ?? "");
      setError(null);
    }
  }, [open, location]);

  const save = useMutation({
    mutationFn: () =>
      api.updateLocation(
        location.locationId,
        {
          name: name.trim(),
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          country: country.trim() || undefined,
          code: zipCode.trim() || undefined,
        },
        tenantId,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations", tenantId] });
      qc.invalidateQueries({
        queryKey: ["location", tenantId, location.locationId],
      });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not save location");
    },
  });

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Location name is required");
      return;
    }
    save.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">Edit location</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`mt-1 ${inputClass}`}
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-slate-400">City</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">State</span>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-slate-400">Zip number</span>
              <input
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder={location.isPrimary ? "Leave blank if not applicable" : undefined}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Country</span>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
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
