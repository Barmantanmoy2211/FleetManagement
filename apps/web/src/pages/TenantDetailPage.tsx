import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TenantDetail } from "@fleet/types";
import { ROLES } from "@fleet/constants";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { EditTenantModal } from "@/components/EditTenantModal";
import { TenantEmployeesPanel } from "@/components/TenantEmployeesPanel";
import { TenantVehiclesPanel } from "@/components/TenantVehiclesPanel";
import { TenantEmployeesByPersonaPanel } from "@/components/TenantEmployeesByPersonaPanel";
import { TenantLocationsPanel } from "@/components/TenantLocationsPanel";
import { TenantUsersPanel } from "@/components/TenantUsersPanel";
import {
  buildLinkedEmailSet,
  filterEmployeesByPersonaAndLinked,
} from "@/lib/employeePlatformUser";
import {
  tabLabel,
  type TenantDetailTabId,
  visibleTenantDetailTabs,
} from "@/lib/tenantDetailTabs";

function isTenantDetailTabId(value: string | null): value is TenantDetailTabId {
  return (
    value === "details" ||
    value === "locations" ||
    value === "users" ||
    value === "drivers" ||
    value === "vehicles" ||
    value === "employees" ||
    value === "fleet-managers" ||
    value === "fleet-admins"
  );
}

function normalizeTenantTabFromUrl(value: string | null): TenantDetailTabId | null {
  if (value === "profile") {
    return "details";
  }
  if (value && isTenantDetailTabId(value)) {
    return value;
  }
  return null;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-800 py-2 text-sm">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right text-slate-100">{value}</dd>
    </div>
  );
}

function EntityList({
  empty,
  children,
}: {
  empty: string;
  children: React.ReactNode | false | null;
}) {
  const hasContent = children !== null && children !== false;
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-4">
      {hasContent ? children : <p className="text-sm text-slate-500">{empty}</p>}
    </div>
  );
}

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const api = useApiClient();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const authTenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canWriteEmployees =
    role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;

  const tabs = useMemo(() => visibleTenantDetailTabs(role), [role]);
  const [activeTab, setActiveTab] = useState<TenantDetailTabId>("details");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (tabs.length && !tabs.includes(activeTab)) {
      setActiveTab(tabs[0]!);
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    const normalized = normalizeTenantTabFromUrl(tabFromUrl);
    if (normalized && tabs.includes(normalized)) {
      setActiveTab(normalized);
    }
  }, [tabFromUrl, tabs]);

  if (
    !isPlatformAdmin &&
    tenantId &&
    authTenantId &&
    tenantId !== authTenantId
  ) {
    return <Navigate to="/" replace />;
  }

  if (role && tabs.length === 0) {
    return <Navigate to="/" replace />;
  }

  const detail = useQuery({
    queryKey: ["tenant-detail", tenantId],
    queryFn: () => api.getTenantDetail(tenantId!),
    enabled: Boolean(tenantId),
  });

  const employees = useQuery({
    queryKey: ["employees", tenantId],
    queryFn: () => api.listEmployees(tenantId!),
    enabled: Boolean(tenantId),
  });

  const linkedDriverCount = useMemo(() => {
    const data = detail.data;
    if (!data) {
      return 0;
    }
    if (data.linkedDriverCount != null) {
      return data.linkedDriverCount;
    }
    if (!employees.data) {
      return data.drivers.length;
    }
    const linkedEmails = buildLinkedEmailSet(
      (data.users ?? []).map((u) => u.email),
    );
    return filterEmployeesByPersonaAndLinked(
      employees.data,
      "Driver",
      linkedEmails,
      true,
    ).length;
  }, [detail.data, employees.data]);

  const remove = useMutation({
    mutationFn: () => api.deleteTenant(tenantId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      navigate("/tenants");
    },
  });

  if (detail.isLoading) {
    return <p className="text-slate-400">Loading…</p>;
  }
  if (detail.error || !detail.data) {
    return (
      <div>
        <BackLink isPlatformAdmin={isPlatformAdmin} />
        <p className="mt-4 text-red-400">Tenant not found or failed to load.</p>
      </div>
    );
  }

  const data = detail.data;
  const { tenant } = data;
  const userCount =
    data.users?.length ??
    data.fleetAdmins.length + data.fleetManagers.length;

  const locationShort = [tenant.city, tenant.state, tenant.country].filter(Boolean).join(", ");

  return (
    <div className="max-w-5xl">
      <BackLink isPlatformAdmin={isPlatformAdmin} />

      <div className="mt-4 rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Tenant</p>
            <h1 className="text-2xl font-semibold text-white">{tenant.name}</h1>
          </div>
          {isPlatformAdmin && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="rounded-md border border-slate-500 px-4 py-2 text-sm text-white hover:bg-slate-800"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="rounded-md border border-red-800 bg-red-950/50 px-4 py-2 text-sm text-red-200 hover:bg-red-900/40"
              >
                Delete
              </button>
            </div>
          )}
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <HighlightStat label="Status" value={tenant.status} />
          <HighlightStat label="Location" value={locationShort || "—"} />
          <HighlightStat
            label="Fleet size"
            value={`${userCount} users · ${linkedDriverCount} drivers · ${data.vehicles.length} vehicles`}
          />
        </dl>
      </div>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-slate-800">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm ${
              activeTab === id
                ? "border-b-2 border-emerald-500 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tabLabel(id)}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        <TabPanel
          tab={activeTab}
          data={data}
          tenantId={tenantId!}
          canWriteEmployees={canWriteEmployees}
        />
      </div>

      <EditTenantModal open={editOpen} tenant={tenant} onClose={() => setEditOpen(false)} />

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6">
            <h2 className="text-lg font-semibold text-white">Delete tenant?</h2>
            <p className="mt-2 text-sm text-slate-400">
              This marks {tenant.name} as inactive. Users and fleet data remain in the
              system.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
                className="rounded-md bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-600"
              >
                {remove.isPending ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BackLink({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  return (
    <Link
      to={isPlatformAdmin ? "/tenants" : "/"}
      className="text-sm text-emerald-400 hover:underline"
    >
      {isPlatformAdmin ? "← Back to tenants" : "← Back to dashboard"}
    </Link>
  );
}

function HighlightStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function TabPanel({
  tab,
  data,
  tenantId,
  canWriteEmployees,
}: {
  tab: TenantDetailTabId;
  data: TenantDetail;
  tenantId: string;
  canWriteEmployees: boolean;
}) {
  const { tenant } = data;
  const locationLine = [
    tenant.street,
    tenant.city,
    tenant.state,
    tenant.zipCode,
    tenant.country,
  ]
    .filter(Boolean)
    .join(", ");

  if (tab === "details") {
    return (
      <>
        <dl className="rounded-xl border border-slate-800 p-4">
          <DetailRow label="Tenant ID" value={tenant.tenantId} />
          <DetailRow label="Address" value={locationLine || "—"} />
          {tenant.landmark ? <DetailRow label="Landmark" value={tenant.landmark} /> : null}
          <DetailRow
            label="Revenue (annual)"
            value={tenant.revenue != null ? tenant.revenue.toLocaleString() : "—"}
          />
          <DetailRow label="Established" value={tenant.establishedDate ?? "—"} />
          <DetailRow label="Platform onboarding" value={tenant.platformOnboardingDate ?? "—"} />
        </dl>
      </>
    );
  }

  if (tab === "locations") {
    return (
      <TenantLocationsPanel tenantId={tenantId} canManage={canWriteEmployees} />
    );
  }

  if (tab === "users") {
    return <TenantUsersPanel tenantId={tenantId} detailUsers={data.users} />;
  }

  if (tab === "drivers") {
    return (
      <TenantEmployeesByPersonaPanel
        tenantId={tenantId}
        persona="Driver"
        title="Drivers"
        canWrite={canWriteEmployees}
        addButtonLabel="Add drivers"
      />
    );
  }

  if (tab === "vehicles") {
    return (
      <TenantVehiclesPanel
        tenantId={tenantId}
        tenantName={tenant.name}
        canWrite={canWriteEmployees}
      />
    );
  }

  if (tab === "employees") {
    return <TenantEmployeesPanel tenantId={tenantId} canWrite={canWriteEmployees} />;
  }

  if (tab === "fleet-managers") {
    return (
      <TenantEmployeesByPersonaPanel
        tenantId={tenantId}
        persona="Fleet Manager"
        title="Fleet managers"
        canWrite={canWriteEmployees}
        addButtonLabel="Add fleet managers"
      />
    );
  }

  if (tab === "fleet-admins") {
    return (
      <TenantEmployeesByPersonaPanel
        tenantId={tenantId}
        persona="Fleet Admin"
        title="Fleet admins"
        canWrite={canWriteEmployees}
        addButtonLabel="Add fleet admins"
      />
    );
  }

  return null;
}
