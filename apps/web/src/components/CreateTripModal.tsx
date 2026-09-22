import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Assignment, Trip } from "@fleet/types";
import { useMemo, useState } from "react";
import { ApiError } from "@fleet/api-client";
import { useApiClient } from "@/hooks/useApiClient";
import {
  assignmentBlockedForWindow,
  localDateTimeInputToIso,
  toLocalDateTimeInput,
} from "@/lib/tripScheduling";
import { TripRouteMap } from "@/components/TripRouteMap";
import { DEFAULT_DESTINATION, DEFAULT_PICKUP } from "@/lib/tripRouteDefaults";
import {
  assignmentChangeDate,
  assignmentReleaseDate,
  formatAssignmentDate,
} from "@/lib/assignmentDates";

type Props = {
  open: boolean;
  tenantId: string;
  assignments: Assignment[];
  trips: Trip[];
  driverMap: Map<string, string>;
  vehicleMap: Map<string, string>;
  onClose: () => void;
  onCreated?: (tripId: string) => void;
};

export function CreateTripModal({
  open,
  tenantId,
  assignments,
  trips,
  driverMap,
  vehicleMap,
  onClose,
  onCreated,
}: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === "ACTIVE"),
    [assignments],
  );

  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - (d.getMinutes() % 15));
    return toLocalDateTimeInput(d.toISOString());
  }, [open]);

  const defaultEnd = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - (d.getMinutes() % 15));
    d.setHours(d.getHours() + 4);
    return toLocalDateTimeInput(d.toISOString());
  }, [open]);

  const [assignmentId, setAssignmentId] = useState("");
  const [startLocal, setStartLocal] = useState(defaultStart);
  const [endLocal, setEndLocal] = useState(defaultEnd);
  const [pickupLat, setPickupLat] = useState(String(DEFAULT_PICKUP.lat));
  const [pickupLng, setPickupLng] = useState(String(DEFAULT_PICKUP.lng));
  const [destLat, setDestLat] = useState(String(DEFAULT_DESTINATION.lat));
  const [destLng, setDestLng] = useState(String(DEFAULT_DESTINATION.lng));
  const [error, setError] = useState<string | null>(null);

  const selectedAssignment = activeAssignments.find(
    (a) => a.assignmentId === assignmentId,
  );

  const startIso = startLocal ? localDateTimeInputToIso(startLocal) : "";
  const endIso = endLocal ? localDateTimeInputToIso(endLocal) : "";

  const assignmentOptions = useMemo(() => {
    return activeAssignments.map((a) => {
      const blocked =
        startIso && endIso
          ? assignmentBlockedForWindow(trips, a.assignmentId, startIso, endIso)
          : false;
      const label = `${driverMap.get(a.driverId) ?? "Driver"} → ${
        vehicleMap.get(a.vehicleId) ?? "Vehicle"
      }`;
      return { assignment: a, blocked, label };
    });
  }, [activeAssignments, trips, startIso, endIso, driverMap, vehicleMap]);

  const create = useMutation({
    mutationFn: () =>
      api.createTrip({
        assignmentId,
        scheduledStartTime: startIso,
        scheduledEndTime: endIso,
        pickupLatitude: Number(pickupLat),
        pickupLongitude: Number(pickupLng),
        destinationLatitude: Number(destLat),
        destinationLongitude: Number(destLng),
        tenantId,
      }),
    onSuccess: (trip) => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      onClose();
      if (onCreated) {
        onCreated(trip.tripId);
      } else {
        navigate(
          `/trips/${trip.tripId}?tenantId=${encodeURIComponent(tenantId)}`,
        );
      }
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Could not create trip");
    },
  });

  if (!open) return null;

  const selectedBlocked =
    assignmentId && startIso && endIso
      ? assignmentBlockedForWindow(trips, assignmentId, startIso, endIso)
      : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-6">
        <h2 className="text-lg font-semibold text-white">New trip</h2>
        <p className="mt-1 text-sm text-slate-400">
          Link a trip to an active driver–vehicle assignment. Overlapping trips on
          the same assignment are blocked; future windows stay available when they
          do not overlap an in-progress or scheduled trip.
        </p>

        <label className="mt-4 block text-sm text-slate-300">
          Assignment
          <select
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
          >
            <option value="">Select assignment…</option>
            {assignmentOptions.map(({ assignment, blocked, label }) => (
              <option
                key={assignment.assignmentId}
                value={assignment.assignmentId}
                disabled={blocked}
              >
                {label}
                {blocked ? " (unavailable for this time)" : ""}
              </option>
            ))}
          </select>
        </label>

        {selectedAssignment && (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
            <p className="font-medium text-slate-300">Assignment details</p>
            <p className="mt-1">
              Change: {formatAssignmentDate(assignmentChangeDate(selectedAssignment))}
              {" · "}
              Release (tentative):{" "}
              {formatAssignmentDate(assignmentReleaseDate(selectedAssignment))}
            </p>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-slate-300">
            Trip start
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Trip end
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
            />
          </label>
        </div>

        <p className="mt-6 text-sm font-medium text-slate-300">Route (pickup → destination)</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">
            Pickup latitude
            <input
              type="number"
              step="any"
              value={pickupLat}
              onChange={(e) => setPickupLat(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Pickup longitude
            <input
              type="number"
              step="any"
              value={pickupLng}
              onChange={(e) => setPickupLng(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Destination latitude
            <input
              type="number"
              step="any"
              value={destLat}
              onChange={(e) => setDestLat(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Destination longitude
            <input
              type="number"
              step="any"
              value={destLng}
              onChange={(e) => setDestLng(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        <TripRouteMap
          className="mt-4"
          pickupLatitude={Number(pickupLat)}
          pickupLongitude={Number(pickupLng)}
          destinationLatitude={Number(destLat)}
          destinationLongitude={Number(destLng)}
        />

        {selectedBlocked && (
          <p className="mt-3 text-sm text-amber-400">
            This assignment already has a trip during part of this window.
          </p>
        )}
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
            disabled={
              !assignmentId ||
              !startLocal ||
              !endLocal ||
              selectedBlocked ||
              create.isPending
            }
            onClick={() => {
              setError(null);
              create.mutate();
            }}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            {create.isPending ? "Creating…" : "Create trip"}
          </button>
        </div>
      </div>
    </div>
  );
}
