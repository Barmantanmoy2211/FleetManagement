import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTenantSchema } from "@fleet/validation";
import { useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";

export function TenantsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.listTenants(),
  });

  const create = useMutation({
    mutationFn: (body: { name: string }) => api.createTenant(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      setName("");
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = createTenantSchema.safeParse({ name });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Tenants</h1>
      <form onSubmit={handleCreate} className="mt-6 flex max-w-lg gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Organization name"
          className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Create
        </button>
      </form>
      {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}

      {tenants.isLoading && <p className="mt-8 text-slate-400">Loading…</p>}
      {tenants.error && (
        <p className="mt-8 text-red-400">Failed to load tenants.</p>
      )}
      <ul className="mt-8 divide-y divide-slate-800 rounded-xl border border-slate-800">
        {tenants.data?.map((t) => (
          <li key={t.tenantId} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium text-white">{t.name}</p>
              <p className="text-xs text-slate-500">{t.tenantId}</p>
            </div>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
              {t.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
