import { useQuery } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";

export function DashboardPage() {
  const api = useApiClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const scopeTenant =
    role === ROLES.PLATFORM_ADMIN ? undefined : tenantId ?? undefined;

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
  });

  const showFleetStats =
    role === ROLES.FLEET_ADMIN ||
    role === ROLES.LOCATION_HEAD ||
    role === ROLES.FLEET_MANAGER ||
    role === ROLES.VIEWER ||
    role === ROLES.DRIVER;

  const vehicles = useQuery({
    queryKey: ["vehicles", scopeTenant],
    queryFn: () => api.listVehicles(scopeTenant),
    enabled: Boolean(scopeTenant) && showFleetStats,
  });

  const drivers = useQuery({
    queryKey: ["drivers", scopeTenant],
    queryFn: () => api.listDrivers(scopeTenant),
    enabled: Boolean(scopeTenant) && showFleetStats,
  });

  const assignments = useQuery({
    queryKey: ["assignments", scopeTenant, "active"],
    queryFn: () => api.listAssignments(scopeTenant, { activeOnly: true }),
    enabled: Boolean(scopeTenant) && showFleetStats,
  });

  const locationHint =
    role === ROLES.LOCATION_HEAD
      ? "At your location"
      : role === ROLES.FLEET_MANAGER
        ? "In your scope"
        : "Registered in tenant";

  const vehicleCount = role === ROLES.PLATFORM_ADMIN && !scopeTenant
    ? "—"
    : String(vehicles.data?.length ?? (vehicles.isLoading ? "…" : "0"));
  const driverCount =
    role === ROLES.PLATFORM_ADMIN && !scopeTenant
      ? "—"
      : String(drivers.data?.length ?? (drivers.isLoading ? "…" : "0"));
  const assignmentCount =
    role === ROLES.PLATFORM_ADMIN && !scopeTenant
      ? "—"
      : String(assignments.data?.length ?? (assignments.isLoading ? "…" : "0"));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Fleet overview</h1>
      <p className="mt-2 text-slate-400">
        Welcome — role <span className="text-slate-200">{role}</span>
      </p>
      {role === ROLES.PLATFORM_ADMIN && !tenantId && (
        <p className="mt-2 text-sm text-slate-500">
          Pick a tenant on Vehicles, Drivers, or Assignments to manage fleet data.
        </p>
      )}
      {role === ROLES.LOCATION_HEAD && (
        <p className="mt-2 text-sm text-slate-500">
          Counts and fleet pages are limited to your assigned location.
        </p>
      )}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Vehicles" value={vehicleCount} hint={locationHint} />
        <StatCard label="Drivers" value={driverCount} hint={locationHint} />
        <StatCard
          label="Active assignments"
          value={assignmentCount}
          hint={locationHint}
        />
      </div>
      <p className="mt-8 text-sm text-slate-500">
        API health:{" "}
        {health.isLoading
          ? "checking…"
          : health.data?.status === "ok"
            ? "ok"
            : "unavailable"}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
