import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Tenant, UpdateTenantRequest } from "@fleet/types";
import { updateTenantSchema } from "@fleet/validation";
import { useEffect, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { ApiError } from "@fleet/api-client";

const fieldClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";

type EditTenantModalProps = {
  open: boolean;
  tenant: Tenant;
  onClose: () => void;
};

export function EditTenantModal({ open, tenant, onClose }: EditTenantModalProps) {
  const api = useApiClient();
  const qc = useQueryClient();
  const [form, setForm] = useState<UpdateTenantRequest>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({
        name: tenant.name,
        street: tenant.street ?? undefined,
        city: tenant.city ?? undefined,
        zipCode: tenant.zipCode ?? undefined,
        state: tenant.state ?? undefined,
        country: tenant.country ?? undefined,
        landmark: tenant.landmark ?? undefined,
        revenue: tenant.revenue ?? undefined,
        establishedDate: tenant.establishedDate ?? undefined,
        status: tenant.status,
      });
      setError(null);
    }
  }, [open, tenant]);

  const save = useMutation({
    mutationFn: (body: UpdateTenantRequest) => api.updateTenant(tenant.tenantId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-detail", tenant.tenantId] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Update failed");
    },
  });

  if (!open) {
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = updateTenantSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    save.mutate(parsed.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white">Edit tenant</h2>
        <p className="mt-1 text-xs text-slate-500">
          Platform onboarding date: {tenant.platformOnboardingDate ?? "—"} (read-only)
        </p>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs text-slate-400">Name</span>
            <input
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={`mt-1 ${fieldClass}`}
              required
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-slate-400">Street</span>
            <input
              value={form.street ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">City</span>
            <input
              value={form.city ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">State</span>
            <input
              value={form.state ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Zip</span>
            <input
              value={form.zipCode ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Country</span>
            <input
              value={form.country ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs text-slate-400">Landmark</span>
            <input
              value={form.landmark ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, landmark: e.target.value }))}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Revenue</span>
            <input
              type="number"
              min={0}
              value={form.revenue ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  revenue: e.target.value === "" ? undefined : Number(e.target.value),
                }))
              }
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Established</span>
            <input
              type="date"
              value={form.establishedDate ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, establishedDate: e.target.value }))}
              className={`mt-1 ${fieldClass}`}
            />
          </label>
          {error && (
            <p className="text-sm text-red-400 sm:col-span-2">{error}</p>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={save.isPending}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
