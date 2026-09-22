import type { Trip } from "@fleet/types";
import { formatDateTimeIso } from "@/lib/formatDateTime";

function parseMs(iso: string | undefined | null): number {
  if (!iso) return Number.NaN;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NaN : t;
}

function legacyDefaultEndIso(startIso: string): string | null {
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(d.getHours() + 8);
  return d.toISOString();
}

export function tripScheduledStart(trip: Trip): string {
  return trip.scheduledStartTime ?? trip.startTime;
}

export function tripScheduledEnd(trip: Trip): string | null {
  if (trip.scheduledEndTime) return trip.scheduledEndTime;
  if (trip.endTime) return trip.endTime;
  if (trip.status === "IN_PROGRESS" || trip.status === "COMPLETED") {
    return legacyDefaultEndIso(trip.startTime);
  }
  return null;
}

/** Only set when user presses Start trip (not the planned schedule). */
export function tripActualStart(trip: Trip): string | null {
  return trip.actualStartTime ?? null;
}

export function tripNeedsStart(trip: Trip): boolean {
  return (
    trip.status === "SCHEDULED" ||
    (trip.status === "IN_PROGRESS" && !trip.actualStartTime)
  );
}

export function tripCanEnd(trip: Trip): boolean {
  return trip.status === "IN_PROGRESS" && Boolean(trip.actualStartTime);
}

/** Elapsed minutes from actual start to an end instant (default: now). */
export function computeTimeTakenMinutes(
  actualStartIso: string,
  endMs: number = Date.now(),
): number {
  const startMs = Date.parse(actualStartIso);
  if (Number.isNaN(startMs)) return 0;
  const minutes = (endMs - startMs) / 60_000;
  return Math.max(0, Math.round(minutes * 100) / 100);
}

export function formatTimeTaken(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const totalMin = Math.round(minutes);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function formatTripDateTime(
  iso: string | null | undefined,
  timeZone?: string,
): string {
  return formatDateTimeIso(iso, timeZone);
}

export function formatTripWindow(trip: Trip, timeZone?: string): string {
  const start = formatTripDateTime(tripScheduledStart(trip), timeZone);
  const endRaw = tripScheduledEnd(trip);
  const end =
    endRaw != null
      ? formatTripDateTime(endRaw, timeZone)
      : trip.status === "IN_PROGRESS"
        ? "ongoing"
        : "—";
  return `${start} – ${end}`;
}

function tripWindow(trip: Trip): { start: number; end: number } | null {
  if (trip.status === "COMPLETED" || trip.status === "CANCELLED") {
    return null;
  }
  const startMs = parseMs(tripScheduledStart(trip));
  if (Number.isNaN(startMs)) return null;
  if (trip.status === "IN_PROGRESS") {
    const liveStart = parseMs(tripActualStart(trip));
    const liveEnd = parseMs(tripScheduledEnd(trip));
    return {
      start: Number.isNaN(liveStart) ? startMs : liveStart,
      end: Number.isNaN(liveEnd) ? Number.MAX_SAFE_INTEGER : liveEnd,
    };
  }
  const endMs = parseMs(tripScheduledEnd(trip));
  if (Number.isNaN(endMs)) return null;
  return { start: startMs, end: endMs };
}

export function windowsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

export function assignmentBlockedForWindow(
  trips: Trip[],
  assignmentId: string,
  startIso: string,
  endIso: string,
): boolean {
  const candidate = { start: parseMs(startIso), end: parseMs(endIso) };
  if (Number.isNaN(candidate.start) || Number.isNaN(candidate.end)) return true;
  if (candidate.end <= candidate.start) return true;
  for (const trip of trips) {
    if (trip.assignmentId !== assignmentId) continue;
    const window = tripWindow(trip);
    if (window && windowsOverlap(candidate, window)) return true;
  }
  return false;
}

export function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localDateTimeInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** @deprecated use tripScheduledStart */
export function tripWindowStart(trip: Trip): string {
  return tripScheduledStart(trip);
}

/** @deprecated use tripScheduledEnd */
export function tripWindowEnd(trip: Trip): string | null {
  return tripScheduledEnd(trip);
}
