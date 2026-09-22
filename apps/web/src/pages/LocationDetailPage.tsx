import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { Employee, TenantLocation, UserProfile } from "@fleet/types";
import { ROLES } from "@fleet/constants";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { EditLocationModal } from "@/components/EditLocationModal";
import { TenantEmployeesByPersonaPanel } from "@/components/TenantEmployeesByPersonaPanel";
import { TenantEmployeesPanel } from "@/components/TenantEmployeesPanel";
import {
  LOCATION_DETAIL_TABS,
  locationDetailTabLabel,
  type LocationDetailTabId,
} from "@/lib/locationDetailTabs";

function formatZip(loc: TenantLocation): string {
  if (loc.code && !(loc.isPrimary && loc.code.toUpperCase() === "PRIMARY")) {
    return loc.code;
  }
  return "—";
}

function resolveLocationHeadName(
  locationId: string,
  users: UserProfile[],
  employees: Employee[],
): string {
  const headUsers = users.filter(
    (u) => u.role === ROLES.LOCATION_HEAD && u.locationId === locationId,
  );
  if (headUsers.length === 0) {
    const emp = employees.find(
      (e) => e.persona === "Location Head" && e.locationId === locationId,
    );
    return emp?.name ?? "—";
  }
  const head = headUsers[0]!;
  const linked = employees.find(
    (e) =>
      e.linkedUserId === head.userId ||
      (e.email &&
        head.email &&
        e.email.trim().toLowerCase() === head.email.trim().toLowerCase()),
  );
  return linked?.name ?? head.email;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-slate-800 py-3 text-sm last:border-0">
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-100">{value}</dd>
    </div>
  );
}

export function LocationDetailPage() {
  const { tenantId, locationId } = useParams<{ tenantId: string; locationId: string }>();
  const api = useApiClient();
  const role = useAuthStore((s) => s.role);
  const authTenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canManage =
    role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;
  const [activeTab, setActiveTab] = useState<LocationDetailTabId>("details");
  const [editOpen, setEditOpen] = useState(false);

  const enabled = Boolean(tenantId && locationId);

  const location = useQuery({
    queryKey: ["location", tenantId, locationId],
    queryFn: () => api.getLocation(locationId!, tenantId!),
    enabled,
  });

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me(),
    enabled: role === ROLES.LOCATION_HEAD,
  });

  const users = useQuery({
    queryKey: ["users", tenantId],
    queryFn: () => api.listUsers(tenantId!),
    enabled,
  });

  const employees = useQuery({
    queryKey: ["employees", tenantId],
    queryFn: () => api.listEmployees(tenantId!),
    enabled,
  });

  const headName = useMemo(() => {
    if (!locationId || !location.data) {
      return "—";
    }
    return resolveLocationHeadName(
      locationId,
      users.data ?? [],
      employees.data ?? [],
    );
  }, [location.data, locationId, users.data, employees.data]);

  const backTo = tenantId ? `/tenants/${tenantId}` : "/";

  if (
    !isPlatformAdmin &&
    tenantId &&
    authTenantId &&
    tenantId !== authTenantId
  ) {
    return <Navigate to="/" replace />;
  }

  if (!tenantId || !locationId) {
    return <Navigate to="/" replace />;
  }

  if (role && !canManage && role !== ROLES.LOCATION_HEAD) {
    return <Navigate to="/" replace />;
  }

  if (
    role === ROLES.LOCATION_HEAD &&
    me.data?.locationId &&
    me.data.locationId !== locationId
  ) {
    return <Navigate to="/" replace />;
  }

  if (location.isLoading) {
    return <p className="text-slate-400">Loading…</p>;
  }

  if (location.error || !location.data) {
    return (
      <div>
        <Link to={backTo} className="text-sm text-emerald-400 hover:underline">
          ← Back to organization
        </Link>
        <p className="mt-4 text-red-400">Location not found.</p>
      </div>
    );
  }

  const loc = location.data;
  const addressLine = [loc.city, loc.state, formatZip(loc), loc.country]
    .filter((p) => p && p !== "—")
    .join(", ");

  return (
    <div className="max-w-5xl">
      <Link to={backTo} className="text-sm text-emerald-400 hover:underline">
        ← Back to organization
      </Link>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {loc.name}
              {loc.isPrimary && (
                <span className="ml-2 align-middle text-sm font-normal text-emerald-400">
                  Primary
                </span>
              )}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {addressLine || "No address on file"}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Location head: <span className="text-slate-300">{headName}</span>
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-slate-800">
        {LOCATION_DETAIL_TABS.map(({ id }) => (
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
            {locationDetailTabLabel(id)}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {activeTab === "details" && (
          <dl className="rounded-xl border border-slate-800 p-4">
            <DetailRow label="Name" value={loc.name} />
            <DetailRow label="City" value={loc.city ?? "—"} />
            <DetailRow label="State" value={loc.state ?? "—"} />
            <DetailRow label="Zip number" value={formatZip(loc)} />
            <DetailRow label="Country" value={loc.country ?? "—"} />
            <DetailRow label="Location head" value={headName} />
            <DetailRow label="Status" value={loc.status} />
          </dl>
        )}

        {activeTab === "employees" && (
          <TenantEmployeesPanel
            tenantId={tenantId}
            canWrite={canManage}
            locationId={locationId}
          />
        )}

        {activeTab === "drivers" && (
          <TenantEmployeesByPersonaPanel
            tenantId={tenantId}
            persona="Driver"
            title="Drivers"
            canWrite={canManage}
            addButtonLabel="Add drivers"
            locationId={locationId}
          />
        )}

        {activeTab === "fleet-managers" && (
          <TenantEmployeesByPersonaPanel
            tenantId={tenantId}
            persona="Fleet Manager"
            title="Fleet managers"
            canWrite={canManage}
            addButtonLabel="Add fleet managers"
            locationId={locationId}
          />
        )}

        {activeTab === "location-head" && (
          <TenantEmployeesByPersonaPanel
            tenantId={tenantId}
            persona="Location Head"
            title="Location head"
            canWrite={canManage}
            addButtonLabel="Add location heads"
            locationId={locationId}
          />
        )}
      </div>

      <EditLocationModal
        open={editOpen}
        tenantId={tenantId}
        location={loc}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
