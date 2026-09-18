import { useQuery } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";

export function TenantScopePicker({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (tenantId: string) => void;
  className?: string;
}) {
  const api = useApiClient();
  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.listTenants(),
  });

  return (
    <label className={`block max-w-md text-sm ${className}`}>
      <span className="text-slate-400">Tenant</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
      >
        <option value="">Select tenant…</option>
        {tenants.data?.map((t) => (
          <option key={t.tenantId} value={t.tenantId}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function useEffectiveTenantId() {
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  return {
    isPlatformAdmin: role === ROLES.PLATFORM_ADMIN,
    tenantId,
  };
}
