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

  const vehicles = useQuery({
    queryKey: ["vehicles", scopeTenant],
    queryFn: () => api.listVehicles(scopeTenant),
    enabled: Boolean(scopeTenant),
  });

  const drivers = useQuery({
    queryKey: ["drivers", scopeTenant],
    queryFn: () => api.listDrivers(scopeTenant),
    enabled: Boolean(scopeTenant),
  });

  const assignments = useQuery({
    queryKey: ["assignments", scopeTenant, "active"],
    queryFn: () => api.listAssignments(scopeTenant, true),
    enabled: Boolean(scopeTenant),
  });

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
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Vehicles" value={vehicleCount} hint="Registered in tenant" />
        <StatCard label="Drivers" value={driverCount} hint="Driver profiles" />
        <StatCard
          label="Active assignments"
          value={assignmentCount}
          hint="Driver ↔ vehicle now"
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
