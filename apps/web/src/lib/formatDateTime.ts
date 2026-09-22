import { DEFAULT_USER_TIME_ZONE } from "@fleet/constants";

export function formatDateTimeIso(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_USER_TIME_ZONE,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function formatDateIso(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_USER_TIME_ZONE,
): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      dateStyle: "medium",
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}
