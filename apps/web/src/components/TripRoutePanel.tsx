import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@fleet/types";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@fleet/api-client";
import { useApiClient } from "@/hooks/useApiClient";
import { TripRouteMap } from "@/components/TripRouteMap";
import { DEFAULT_DESTINATION, DEFAULT_PICKUP } from "@/lib/tripRouteDefaults";
import { tripHasSavedRoute } from "@/lib/tripRouteDistance";

type Props = {
  trip: Trip;
  tenantId: string;
  canEdit: boolean;
};

function coordOrDefault(value: number, fallback: number): string {
  return value === 0 ? String(fallback) : String(value);
}

function syncCoordsFromTrip(trip: Trip) {
  return {
    pickupLat: coordOrDefault(trip.pickupLatitude, DEFAULT_PICKUP.lat),
    pickupLng: coordOrDefault(trip.pickupLongitude, DEFAULT_PICKUP.lng),
    destLat: coordOrDefault(trip.destinationLatitude, DEFAULT_DESTINATION.lat),
    destLng: coordOrDefault(trip.destinationLongitude, DEFAULT_DESTINATION.lng),
  };
}

export function TripRoutePanel({ trip, tenantId, canEdit }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(
    () => canEdit && !tripHasSavedRoute(trip),
  );
  const [pickupLat, setPickupLat] = useState(() => syncCoordsFromTrip(trip).pickupLat);
  const [pickupLng, setPickupLng] = useState(() => syncCoordsFromTrip(trip).pickupLng);
  const [destLat, setDestLat] = useState(() => syncCoordsFromTrip(trip).destLat);
  const [destLng, setDestLng] = useState(() => syncCoordsFromTrip(trip).destLng);
  const [previewDistanceKm, setPreviewDistanceKm] = useState<number | null>(null);
  const [savedDistanceKm, setSavedDistanceKm] = useState(trip.routeDistanceKm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = syncCoordsFromTrip(trip);
    setPickupLat(c.pickupLat);
    setPickupLng(c.pickupLng);
    setDestLat(c.destLat);
    setDestLng(c.destLng);
    setSavedDistanceKm(trip.routeDistanceKm);
  }, [trip]);

  const preview = {
    pickupLatitude: Number(pickupLat),
    pickupLongitude: Number(pickupLng),
    destinationLatitude: Number(destLat),
    destinationLongitude: Number(destLng),
  };

  const onRouteDistanceComputed = useCallback((km: number) => {
    setPreviewDistanceKm(km);
  }, []);

  const save = useMutation({
    mutationFn: () =>
      api.updateTrip(
        trip.tripId,
        {
          pickupLatitude: preview.pickupLatitude,
          pickupLongitude: preview.pickupLongitude,
          destinationLatitude: preview.destinationLatitude,
          destinationLongitude: preview.destinationLongitude,
        },
        tenantId,
      ),
    onSuccess: (updated) => {
      const km =
        updated.routeDistanceKm > 0
          ? updated.routeDistanceKm
          : (previewDistanceKm ?? 0);
      qc.setQueryData(["trip", trip.tripId, tenantId], {
        ...updated,
        routeDistanceKm: km > 0 ? km : updated.routeDistanceKm,
      });
      qc.invalidateQueries({ queryKey: ["trip", trip.tripId, tenantId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      setSavedDistanceKm(km > 0 ? km : updated.routeDistanceKm);
      setEditing(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not save route");
    },
  });

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-2 text-sm text-white disabled:opacity-70 disabled:cursor-not-allowed";

  const showInputs = canEdit && editing;
  const readonlyCoords = syncCoordsFromTrip(trip);

  const mapCoords = showInputs
    ? preview
    : {
        pickupLatitude:
          trip.pickupLatitude !== 0 ? trip.pickupLatitude : Number(readonlyCoords.pickupLat),
        pickupLongitude:
          trip.pickupLongitude !== 0 ? trip.pickupLongitude : Number(readonlyCoords.pickupLng),
        destinationLatitude:
          trip.destinationLatitude !== 0
            ? trip.destinationLatitude
            : Number(readonlyCoords.destLat),
        destinationLongitude:
          trip.destinationLongitude !== 0
            ? trip.destinationLongitude
            : Number(readonlyCoords.destLng),
      };

  const mapHasPoints =
    mapCoords.pickupLatitude !== 0 ||
    mapCoords.pickupLongitude !== 0 ||
    mapCoords.destinationLatitude !== 0 ||
    mapCoords.destinationLongitude !== 0;

  const distanceLabel =
    savedDistanceKm > 0
      ? savedDistanceKm
      : previewDistanceKm != null && previewDistanceKm > 0
        ? previewDistanceKm
        : null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      {canEdit && (
        <p className="text-sm text-slate-400">
          {editing
            ? "Enter coordinates, check the driving route on the map, then save. Distance is recalculated on save."
            : "Route is saved on this trip. Edit to change pickup or destination and recalculate."}
        </p>
      )}
      {!canEdit && (
        <p className="text-sm text-slate-500">Route coordinates for this trip.</p>
      )}

      {(canEdit || mapHasPoints) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">
            Pickup latitude
            <input
              type="number"
              step="any"
              value={
                showInputs
                  ? pickupLat
                  : trip.pickupLatitude !== 0
                    ? String(trip.pickupLatitude)
                    : readonlyCoords.pickupLat
              }
              readOnly={!showInputs}
              disabled={!showInputs}
              onChange={(e) => setPickupLat(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-xs text-slate-400">
            Pickup longitude
            <input
              type="number"
              step="any"
              value={
                showInputs
                  ? pickupLng
                  : trip.pickupLongitude !== 0
                    ? String(trip.pickupLongitude)
                    : readonlyCoords.pickupLng
              }
              readOnly={!showInputs}
              disabled={!showInputs}
              onChange={(e) => setPickupLng(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-xs text-slate-400">
            Destination latitude
            <input
              type="number"
              step="any"
              value={
                showInputs
                  ? destLat
                  : trip.destinationLatitude !== 0
                    ? String(trip.destinationLatitude)
                    : readonlyCoords.destLat
              }
              readOnly={!showInputs}
              disabled={!showInputs}
              onChange={(e) => setDestLat(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-xs text-slate-400">
            Destination longitude
            <input
              type="number"
              step="any"
              value={
                showInputs
                  ? destLng
                  : trip.destinationLongitude !== 0
                    ? String(trip.destinationLongitude)
                    : readonlyCoords.destLng
              }
              readOnly={!showInputs}
              disabled={!showInputs}
              onChange={(e) => setDestLng(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      )}

      {distanceLabel != null && !editing && (
        <p className="mt-3 text-sm text-slate-300">
          Saved route length:{" "}
          <span className="font-semibold text-white">{distanceLabel.toFixed(2)} km</span>
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {canEdit && (
        <div className="mt-4 flex justify-end gap-2">
          {editing ? (
            <>
              {tripHasSavedRoute(trip) && (
                <button
                  type="button"
                  onClick={() => {
                    const c = syncCoordsFromTrip(trip);
                    setPickupLat(c.pickupLat);
                    setPickupLng(c.pickupLng);
                    setDestLat(c.destLat);
                    setDestLng(c.destLng);
                    setEditing(false);
                    setError(null);
                  }}
                  className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate()}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                {save.isPending ? "Saving…" : "Save route"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                const c = syncCoordsFromTrip(trip);
                setPickupLat(c.pickupLat);
                setPickupLng(c.pickupLng);
                setDestLat(c.destLat);
                setDestLng(c.destLng);
                setEditing(true);
                setError(null);
              }}
              className="rounded-md border border-slate-500 px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              Edit route
            </button>
          )}
        </div>
      )}

      <TripRouteMap
        className="mt-4"
        heightClass="h-80"
        pickupLatitude={mapCoords.pickupLatitude}
        pickupLongitude={mapCoords.pickupLongitude}
        destinationLatitude={mapCoords.destinationLatitude}
        destinationLongitude={mapCoords.destinationLongitude}
        routeDistanceKm={editing ? previewDistanceKm : savedDistanceKm}
        onRouteDistanceComputed={editing ? onRouteDistanceComputed : undefined}
        showPlaceholder={!canEdit && !mapHasPoints}
      />
    </div>
  );
}
