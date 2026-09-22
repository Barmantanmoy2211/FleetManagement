import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@fleet/types";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@fleet/api-client";
import { useApiClient } from "@/hooks/useApiClient";
import { TripRouteMap } from "@/components/TripRouteMap";
import {
  localDateTimeInputToIso,
  toLocalDateTimeInput,
  tripScheduledEnd,
  tripScheduledStart,
} from "@/lib/tripScheduling";

type Props = {
  open: boolean;
  trip: Trip;
  tenantId: string;
  onClose: () => void;
};

export function EditTripModal({ open, trip, tenantId, onClose }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();

  const initialStart = useMemo(
    () => toLocalDateTimeInput(tripScheduledStart(trip)),
    [trip],
  );
  const initialEnd = useMemo(() => {
    const end = tripScheduledEnd(trip);
    return end ? toLocalDateTimeInput(end) : initialStart;
  }, [trip, initialStart]);

  const [startLocal, setStartLocal] = useState(initialStart);
  const [endLocal, setEndLocal] = useState(initialEnd);
  const [pickupLat, setPickupLat] = useState(String(trip.pickupLatitude));
  const [pickupLng, setPickupLng] = useState(String(trip.pickupLongitude));
  const [destLat, setDestLat] = useState(String(trip.destinationLatitude));
  const [destLng, setDestLng] = useState(String(trip.destinationLongitude));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStartLocal(initialStart);
      setEndLocal(initialEnd);
      setPickupLat(String(trip.pickupLatitude));
      setPickupLng(String(trip.pickupLongitude));
      setDestLat(String(trip.destinationLatitude));
      setDestLng(String(trip.destinationLongitude));
      setError(null);
    }
  }, [open, initialStart, initialEnd, trip]);

  const save = useMutation({
    mutationFn: () =>
      api.updateTrip(
        trip.tripId,
        {
          scheduledStartTime: localDateTimeInputToIso(startLocal),
          scheduledEndTime: localDateTimeInputToIso(endLocal),
          pickupLatitude: Number(pickupLat),
          pickupLongitude: Number(pickupLng),
          destinationLatitude: Number(destLat),
          destinationLongitude: Number(destLng),
        },
        tenantId,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", trip.tripId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not update trip");
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-6">
        <h2 className="text-lg font-semibold text-white">Edit trip</h2>
        <p className="mt-1 text-sm text-slate-400">
          Adjust schedule and route before the trip is started. Distance is recalculated on save.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-300">
            Scheduled start
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Scheduled end
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
            />
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">
            Pickup lat
            <input
              type="number"
              step="any"
              value={pickupLat}
              onChange={(e) => setPickupLat(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Pickup lng
            <input
              type="number"
              step="any"
              value={pickupLng}
              onChange={(e) => setPickupLng(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Destination lat
            <input
              type="number"
              step="any"
              value={destLat}
              onChange={(e) => setDestLat(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Destination lng
            <input
              type="number"
              step="any"
              value={destLng}
              onChange={(e) => setDestLng(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-white"
            />
          </label>
        </div>
        <TripRouteMap
          className="mt-4"
          pickupLatitude={Number(pickupLat)}
          pickupLongitude={Number(pickupLng)}
          destinationLatitude={Number(destLat)}
          destinationLongitude={Number(destLng)}
          routeDistanceKm={trip.routeDistanceKm}
        />
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
            disabled={save.isPending}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
