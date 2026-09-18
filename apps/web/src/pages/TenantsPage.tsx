import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTenantRequest } from "@fleet/types";
import { createTenantSchema } from "@fleet/validation";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useApiClient } from "@/hooks/useApiClient";

const fieldClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";

const emptyForm: CreateTenantRequest = {
  name: "",
  street: "",
  city: "",
  zipCode: "",
  state: "",
  country: "",
  landmark: "",
  revenue: undefined,
  establishedDate: "",
};

export function TenantsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateTenantRequest>({ ...emptyForm });
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.listTenants(),
  });

  const create = useMutation({
    mutationFn: (body: CreateTenantRequest) => api.createTenant(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      setForm({ ...emptyForm });
      setShowForm(false);
    },
  });

  function setField<K extends keyof CreateTenantRequest>(key: K, value: CreateTenantRequest[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const payload = {
      ...form,
      name: form.name.trim(),
      revenue: form.revenue === undefined || form.revenue === ("" as unknown as number)
        ? undefined
        : Number(form.revenue),
      establishedDate: form.establishedDate?.trim() || undefined,
      street: form.street?.trim() || undefined,
      city: form.city?.trim() || undefined,
      zipCode: form.zipCode?.trim() || undefined,
      state: form.state?.trim() || undefined,
      country: form.country?.trim() || undefined,
      landmark: form.landmark?.trim() || undefined,
    };
    const parsed = createTenantSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-white">Tenants</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          {showForm ? "Hide form" : "New tenant"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mt-6 max-w-3xl space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-6"
        >
          <p className="text-sm text-slate-400">
            Platform onboarding date is set automatically when you create the tenant.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs text-slate-400">Organization name *</span>
              <input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                className={`mt-1 ${fieldClass}`}
                required
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-slate-400">Street</span>
              <input
                value={form.street ?? ""}
                onChange={(e) => setField("street", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">City</span>
              <input
                value={form.city ?? ""}
                onChange={(e) => setField("city", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">State</span>
              <input
                value={form.state ?? ""}
                onChange={(e) => setField("state", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Zip code</span>
              <input
                value={form.zipCode ?? ""}
                onChange={(e) => setField("zipCode", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Country</span>
              <input
                value={form.country ?? ""}
                onChange={(e) => setField("country", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs text-slate-400">Landmark</span>
              <input
                value={form.landmark ?? ""}
                onChange={(e) => setField("landmark", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Revenue (annual)</span>
              <input
                type="number"
                min={0}
                step="any"
                value={form.revenue ?? ""}
                onChange={(e) =>
                  setField("revenue", e.target.value === "" ? undefined : Number(e.target.value))
                }
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Established date</span>
              <input
                type="date"
                value={form.establishedDate ?? ""}
                onChange={(e) => setField("establishedDate", e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Create tenant
          </button>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
        </form>
      )}

      {tenants.isLoading && <p className="mt-8 text-slate-400">Loading…</p>}
      {tenants.error && <p className="mt-8 text-red-400">Failed to load tenants.</p>}
      <ul className="mt-8 divide-y divide-slate-800 rounded-xl border border-slate-800">
        {tenants.data?.map((t) => (
          <li key={t.tenantId}>
            <Link
              to={`/tenants/${t.tenantId}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-900/60"
            >
              <div>
                <p className="font-medium text-white">{t.name}</p>
                <p className="text-xs text-slate-500">
                  {[t.city, t.country].filter(Boolean).join(", ") || t.tenantId}
                </p>
              </div>
              <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                {t.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
