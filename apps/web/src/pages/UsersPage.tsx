import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES } from "@fleet/constants";
import type { CreateUserResponse } from "@fleet/types";
import { createUserSchema } from "@fleet/validation";
import { useMemo, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";

const inputClass =
  "w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white";

export function UsersPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;

  const [email, setEmail] = useState("");
  const [userRole, setUserRole] = useState<string>(ROLES.FLEET_MANAGER);
  const [targetTenantId, setTargetTenantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [reportsToUserId, setReportsToUserId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<CreateUserResponse | null>(null);

  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api.listTenants(),
    enabled: isPlatformAdmin,
  });

  const effectiveTenantId = isPlatformAdmin ? targetTenantId : tenantId ?? undefined;

  const users = useQuery({
    queryKey: ["users", effectiveTenantId],
    queryFn: () => api.listUsers(effectiveTenantId),
    enabled: isPlatformAdmin ? Boolean(effectiveTenantId) : Boolean(tenantId),
  });

  const locations = useQuery({
    queryKey: ["locations", effectiveTenantId],
    queryFn: () => api.listLocations(effectiveTenantId!),
    enabled: Boolean(effectiveTenantId),
  });

  const reportsToOptions = useMemo(() => {
    const list = users.data ?? [];
    if (userRole === ROLES.FLEET_MANAGER) {
      return list.filter((u) => u.role === ROLES.LOCATION_HEAD);
    }
    if (userRole === ROLES.LOCATION_HEAD) {
      return list.filter((u) => u.role === ROLES.FLEET_ADMIN);
    }
    return [];
  }, [users.data, userRole]);

  const needsLocation =
    userRole === ROLES.LOCATION_HEAD ||
    userRole === ROLES.FLEET_MANAGER ||
    userRole === ROLES.DRIVER ||
    userRole === ROLES.VIEWER;

  const create = useMutation({
    mutationFn: (body: Parameters<typeof api.createUser>[0]) => api.createUser(body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setInviteResult(data);
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setInviteResult(null);
    const parsed = createUserSchema.safeParse({
      email,
      role: userRole,
      tenantId: isPlatformAdmin ? targetTenantId : undefined,
      locationId:
        needsLocation && userRole !== ROLES.FLEET_ADMIN ? locationId || undefined : null,
      reportsToUserId: reportsToUserId || undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    create.mutate(parsed.data);
    setEmail("");
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Users</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-400">
        Invited users receive an email from Amazon Cognito with a temporary password and
        must set a new password on first sign-in.
      </p>

      {isPlatformAdmin && (
        <label className="mt-4 block max-w-md text-sm text-slate-300">
          Tenant
          <select
            value={targetTenantId}
            onChange={(e) => {
              setTargetTenantId(e.target.value);
              setLocationId("");
              setReportsToUserId("");
            }}
            className={`mt-1 ${inputClass}`}
          >
            <option value="">Select tenant…</option>
            {tenants.data?.map((t) => (
              <option key={t.tenantId} value={t.tenantId}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <form onSubmit={handleCreate} className="mt-6 grid max-w-lg gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputClass}
        />
        <select
          value={userRole}
          onChange={(e) => {
            setUserRole(e.target.value);
            setReportsToUserId("");
          }}
          className={inputClass}
        >
          {Object.values(ROLES)
            .filter((r) => r !== ROLES.PLATFORM_ADMIN)
            .map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
        </select>
        {needsLocation && (
          <label className="block text-sm text-slate-300">
            Location
            <select
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setReportsToUserId("");
              }}
              className={`mt-1 ${inputClass}`}
              required
            >
              <option value="">Select location…</option>
              {(locations.data ?? []).map((loc) => (
                <option key={loc.locationId} value={loc.locationId}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {reportsToOptions.length > 0 && (
          <label className="block text-sm text-slate-300">
            Reports to
            <select
              value={reportsToUserId}
              onChange={(e) => setReportsToUserId(e.target.value)}
              className={`mt-1 ${inputClass}`}
            >
              <option value="">Optional</option>
              {reportsToOptions
                .filter((u) => !locationId || u.locationId === locationId || userRole === ROLES.LOCATION_HEAD)
                .map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.email}
                  </option>
                ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Invite user
        </button>
      </form>
      {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}

      {inviteResult?.inviteEmailSent && (
        <div className="mt-6 max-w-lg rounded-lg border border-emerald-800/60 bg-emerald-950/30 p-4 text-sm text-emerald-100">
          <p className="font-medium">Invitation email sent to {inviteResult.email}</p>
          <p className="mt-2 text-slate-300">
            They should open the email, sign in with the temporary password, then choose a
            new password on the login page. Check spam if it does not arrive within a few
            minutes.
          </p>
        </div>
      )}

      {inviteResult?.temporaryPassword && (
        <div className="mt-6 max-w-lg rounded-lg border border-amber-800/60 bg-amber-950/30 p-4 text-sm text-amber-100">
          <p className="font-medium">User invited: {inviteResult.email}</p>
          <p className="mt-2">Temporary password (share securely — shown once):</p>
          <code className="mt-1 block rounded bg-slate-950 px-2 py-1 font-mono text-white">
            {inviteResult.temporaryPassword}
          </code>
        </div>
      )}

      <ul className="mt-8 divide-y divide-slate-800 rounded-xl border border-slate-800">
        {users.data?.map((u) => (
          <li key={u.userId} className="px-4 py-3">
            <p className="font-medium text-white">{u.email}</p>
            <p className="text-xs text-slate-500">
              {u.role} · {u.userId}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
