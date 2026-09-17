import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";

export function ProfilePage() {
  const api = useApiClient();
  const auth = useAuthStore();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me(),
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Profile</h1>
      <dl className="mt-8 max-w-md space-y-4 text-sm">
        <Row label="Email" value={me.data?.email ?? auth.email ?? "—"} />
        <Row label="User ID" value={me.data?.userId ?? auth.userId ?? "—"} />
        <Row label="Tenant ID" value={me.data?.tenantId ?? auth.tenantId ?? "—"} />
        <Row label="Role" value={me.data?.role ?? auth.role ?? "—"} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-800 pb-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-100">{value}</dd>
    </div>
  );
}
