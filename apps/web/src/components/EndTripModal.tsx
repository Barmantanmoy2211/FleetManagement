import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@fleet/types";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@fleet/api-client";
import { useApiClient } from "@/hooks/useApiClient";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  computeTimeTakenMinutes,
  formatTimeTaken,
  formatTripDateTime,
  tripActualStart,
} from "@/lib/tripScheduling";

type Props = {
  open: boolean;
  trip: Trip;
  tenantId: string;
  onClose: () => void;
};

export function EndTripModal({ open, trip, tenantId, onClose }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const timeZone = useUserTimeZone();
  const actualStart = tripActualStart(trip);

  const [fuelLiters, setFuelLiters] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setFuelLiters("");
    setError(null);
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open, trip.tripId]);

  const timeTakenMinutes = useMemo(() => {
    if (!actualStart) return 0;
    return computeTimeTakenMinutes(actualStart, nowMs);
  }, [actualStart, nowMs]);

  const endTrip = useMutation({
    mutationFn: () => {
      const fuel = Number(fuelLiters);
      if (!Number.isFinite(fuel) || fuel <= 0) {
        throw new Error("Enter fuel used (liters), greater than zero.");
      }
      return api.endTrip(trip.tripId, { fuelRequiredLiters: fuel }, tenantId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", trip.tripId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      onClose();
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not end trip",
      );
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6">
        <h2 className="text-lg font-semibold text-white">End trip</h2>
        <p className="mt-1 text-sm text-slate-400">
          Confirm completion details. Time taken is calculated from actual start to now.
        </p>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-slate-800 pb-2">
            <dt className="text-slate-400">Actual start</dt>
            <dd className="text-right text-slate-100">
              {actualStart ? formatTripDateTime(actualStart, timeZone) : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-slate-800 pb-2">
            <dt className="text-slate-400">Time taken</dt>
            <dd className="text-right font-medium text-white">
              {formatTimeTaken(timeTakenMinutes)}
              <span className="ml-1 text-xs font-normal text-slate-500">
                ({timeTakenMinutes.toFixed(2)} min)
              </span>
            </dd>
          </div>
        </dl>

        <label className="mt-4 block text-sm text-slate-300">
          Fuel required (liters)
          <input
            type="number"
            min={0}
            step="any"
            value={fuelLiters}
            onChange={(e) => setFuelLiters(e.target.value)}
            placeholder="e.g. 25.5"
            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
          />
        </label>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={endTrip.isPending}
            onClick={() => {
              setError(null);
              endTrip.mutate();
            }}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {endTrip.isPending ? "Ending…" : "End trip"}
          </button>
        </div>
      </div>
    </div>
  );
}
