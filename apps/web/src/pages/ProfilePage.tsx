import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COMMON_TIME_ZONES, DEFAULT_USER_TIME_ZONE } from "@fleet/constants";
import { useState } from "react";
import { ApiError } from "@fleet/api-client";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { OrgChartTree } from "@/components/OrgChartTree";

export function ProfilePage() {
  const api = useApiClient();
  const auth = useAuthStore();
  const qc = useQueryClient();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me(),
  });

  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const effectiveTz =
    timeZone ?? me.data?.timeZone ?? DEFAULT_USER_TIME_ZONE;

  const save = useMutation({
    mutationFn: () => api.updateMe({ timeZone: effectiveTz }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      setSaveError(null);
    },
    onError: (err) => {
      setSaveError(err instanceof ApiError ? err.message : "Could not save");
    },
  });

  const orgChart = useQuery({
    queryKey: ["org-chart", me.data?.tenantId],
    queryFn: () => api.getOrgChart(me.data?.tenantId ?? undefined),
    enabled: Boolean(me.data?.tenantId),
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

      <div className="mt-10 max-w-md">
        <label className="block text-sm text-slate-300">
          Time zone
          <p className="mt-1 text-xs text-slate-500">
            Trip and schedule times across the app use this zone (default IST).
          </p>
          <select
            value={effectiveTz}
            onChange={(e) => setTimeZone(e.target.value)}
            className="mt-2 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-white"
          >
            {COMMON_TIME_ZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        {saveError && <p className="mt-2 text-sm text-red-400">{saveError}</p>}
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
        >
          {save.isPending ? "Saving…" : "Save time zone"}
        </button>
      </div>

      <div className="mt-10 max-w-xl">
        <h2 className="text-lg font-medium text-white">Organization hierarchy</h2>
        <p className="mt-1 text-sm text-slate-400">
          Your reporting structure within the tenant (locations, managers, drivers).
        </p>
        {orgChart.isLoading && <p className="mt-3 text-sm text-slate-500">Loading…</p>}
        {orgChart.isError && (
          <p className="mt-3 text-sm text-red-400">Could not load hierarchy.</p>
        )}
        {orgChart.data && (
          <div className="mt-4">
            <OrgChartTree node={orgChart.data} />
          </div>
        )}
      </div>
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
