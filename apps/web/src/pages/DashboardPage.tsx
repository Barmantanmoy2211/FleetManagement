import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";

export function DashboardPage() {
  const api = useApiClient();
  const role = useAuthStore((s) => s.role);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Fleet overview</h1>
      <p className="mt-2 text-slate-400">
        Welcome — role <span className="text-slate-200">{role}</span>
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Vehicles" value="—" hint="Phase 2" />
        <StatCard label="Drivers" value="—" hint="Phase 2" />
        <StatCard label="Active trips" value="—" hint="Phase 3" />
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
