import type { Driver, Employee } from "@fleet/types";

export function resolveFleetDriverIdForEmployee(
  employee: Employee,
  drivers: Driver[],
): string | null {
  if (employee.persona !== "Driver") {
    return null;
  }
  const linked = employee.linkedUserId;
  if (linked) {
    const byLink = drivers.find((d) => d.linkedUserId === linked);
    if (byLink) {
      return byLink.driverId;
    }
  }
  const email = (employee.email ?? "").trim().toLowerCase();
  if (email) {
    const byEmail = drivers.find(
      (d) => (d.email ?? "").trim().toLowerCase() === email,
    );
    if (byEmail) {
      return byEmail.driverId;
    }
  }
  return null;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
