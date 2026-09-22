import type { Assignment } from "@fleet/types";
import { formatDateIso } from "@/lib/formatDateTime";

export function formatAssignmentDate(
  value: string | null | undefined,
  timeZone?: string,
): string {
  if (!value) return "—";
  const day = value.length >= 10 ? value.slice(0, 10) : value;
  return formatDateIso(day, timeZone);
}

export function assignmentChangeDate(a: Assignment): string | undefined {
  if (a.changeDate) {
    return a.changeDate.slice(0, 10);
  }
  if (a.startTime && a.startTime.length >= 10) {
    return a.startTime.slice(0, 10);
  }
  return undefined;
}

export function assignmentReleaseDate(a: Assignment): string | null | undefined {
  return a.releaseDate ?? null;
}
