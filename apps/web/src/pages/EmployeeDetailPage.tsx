import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateUserResponse, Employee } from "@fleet/types";
import { ROLES } from "@fleet/constants";
import { employeePersonaToRole } from "@/lib/employeePersona";
import { useMemo, useState } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { useAuthStore } from "@/stores/authStore";
import { EditEmployeeModal } from "@/components/EditEmployeeModal";
import { EntityAssignmentsPanel } from "@/components/EntityAssignmentsPanel";
import { RecordDetailTabs } from "@/components/RecordDetailTabs";
import { ApiError } from "@fleet/api-client";
import { resolveFleetDriverIdForEmployee } from "@/lib/fleetDriverForEmployee";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2 border-b border-slate-800/80 py-3 text-sm last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100">{value ?? "—"}</span>
    </div>
  );
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-lg border border-slate-800 bg-slate-950/50"
    >
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-white marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-slate-500">▾</span>
          {title}
        </span>
      </summary>
      <div className="grid gap-0 px-4 pb-4 sm:grid-cols-2 sm:gap-x-8">{children}</div>
    </details>
  );
}

function HighlightStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function EmployeeDetailsSections({
  emp,
  driverManagerLabel,
}: {
  emp: Employee;
  driverManagerLabel?: string | null;
}) {
  return (
    <div className="mt-8 flex max-w-5xl flex-col gap-4">
      <Section title="Employee Details">
        <div>
          <Field label="Name" value={emp.name} />
          <Field label="DOB" value={fmtDate(emp.dateOfBirth)} />
          <Field label="Age" value={emp.age ?? "—"} />
          <Field label="Gender" value={emp.gender} />
          <Field
            label="Status"
            value={
              <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-300">
                {emp.status}
              </span>
            }
          />
          <Field label="Is a driver?" value={emp.isDriver ? "✓" : "—"} />
        </div>
        <div>
          <Field label="Employee ID" value={emp.employeeCode} />
          <Field label="Hire Date" value={fmtDate(emp.hireDate)} />
          <Field label="Home Address" value={emp.homeAddress} />
          <Field label="Email" value={emp.email} />
          <Field label="Phone" value={emp.phone} />
          <Field label="Persona" value={emp.persona} />
          {emp.persona === "Driver" && (
            <Field label="Driver manager" value={driverManagerLabel} />
          )}
          <Field label="Platform user" value={emp.linkedUserId ? "Linked" : "Not linked"} />
        </div>
      </Section>

      <Section title="Address & Contact Details">
        <div>
          <Field label="Primary Contact" value={emp.primaryContact ? "✓" : "—"} />
          <Field label="City/Town" value={emp.city} />
          <Field label="State" value={emp.state} />
          <Field label="ZIP Code" value={emp.zipCode} />
          <Field label="Country" value={emp.country} />
        </div>
        <div>
          <Field label="Emergency Contact Name" value={emp.emergencyContactName} />
          <Field label="Emergency Contact Address" value={emp.emergencyContactAddress} />
        </div>
      </Section>

      <Section title="Employment Details">
        <div>
          <Field label="Employment Type" value={emp.employmentType} />
          <Field label="Employment Status" value={emp.employmentStatus ?? emp.status} />
          <Field label="Experience" value={emp.experience} />
          <Field label="Daily Hours Worked" value={emp.dailyHoursWorked} />
          <Field label="Company Driver ID" value={emp.companyDriverId} />
        </div>
        <div>
          <Field label="Department" value={emp.department} />
          <Field label="Job Role" value={emp.jobRole} />
        </div>
      </Section>
    </div>
  );
}

export function EmployeeDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [searchParams] = useSearchParams();
  const queryTenantId = searchParams.get("tenantId") ?? undefined;
  const navigate = useNavigate();
  const api = useApiClient();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const tenantId = useAuthStore((s) => s.tenantId);
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canWrite = role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;
  const canAssign =
    role === ROLES.PLATFORM_ADMIN ||
    role === ROLES.FLEET_ADMIN ||
    role === ROLES.LOCATION_HEAD ||
    role === ROLES.FLEET_MANAGER;
  const effectiveTenantId = isPlatformAdmin ? queryTenantId : tenantId ?? undefined;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"details" | "assignments">("details");
  const [userResult, setUserResult] = useState<CreateUserResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const employee = useQuery({
    queryKey: ["employee", employeeId, queryTenantId, tenantId],
    queryFn: () => {
      if (!employeeId) throw new Error("Missing employee id");
      return api.getEmployee(employeeId, effectiveTenantId);
    },
    enabled:
      Boolean(employeeId) &&
      (isPlatformAdmin ? Boolean(queryTenantId) : Boolean(tenantId)),
  });

  const tenantUsers = useQuery({
    queryKey: ["users", effectiveTenantId],
    queryFn: () => api.listUsers(effectiveTenantId!),
    enabled: Boolean(effectiveTenantId) && employee.data?.persona === "Driver",
  });

  const driverManagerLabel =
    employee.data?.driverManagerEmail ??
    (employee.data?.driverManagerUserId &&
      tenantUsers.data?.find((u) => u.userId === employee.data?.driverManagerUserId)?.email);

  const fleetDrivers = useQuery({
    queryKey: ["drivers", effectiveTenantId],
    queryFn: () => api.listDrivers(effectiveTenantId!),
    enabled: Boolean(effectiveTenantId) && employee.data?.persona === "Driver",
  });

  const fleetDriverId = useMemo(() => {
    if (!employee.data || !fleetDrivers.data) {
      return null;
    }
    return resolveFleetDriverIdForEmployee(employee.data, fleetDrivers.data);
  }, [employee.data, fleetDrivers.data]);

  const remove = useMutation({
    mutationFn: () => api.deleteEmployee(employeeId!, effectiveTenantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      if (effectiveTenantId) {
        navigate(`/tenants/${effectiveTenantId}?tab=employees`);
      } else {
        navigate("/employees");
      }
    },
  });

  const createUser = useMutation({
    mutationFn: () => api.createUserFromEmployee(employeeId!, effectiveTenantId),
    onSuccess: (data) => {
      setUserResult(data);
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["employee", employeeId] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: async (err) => {
      try {
        const fresh = await api.getEmployee(employeeId!, effectiveTenantId);
        if (fresh.linkedUserId) {
          setUserResult({
            userId: fresh.linkedUserId,
            tenantId: fresh.tenantId,
            email: fresh.email ?? "",
            role: employeePersonaToRole(fresh.persona) ?? ROLES.FLEET_MANAGER,
            cognitoSub: "",
            createdAt: fresh.updatedAt,
            updatedAt: fresh.updatedAt,
            temporaryPassword: null,
            inviteEmailSent: false,
          });
          setActionError(null);
          qc.invalidateQueries({ queryKey: ["employee", employeeId] });
          qc.invalidateQueries({ queryKey: ["users"] });
          return;
        }
      } catch {
        /* fall through */
      }
      setUserResult(null);
      setActionError(
        err instanceof ApiError
          ? (typeof err.body === "object" &&
              err.body &&
              "detail" in err.body &&
              String((err.body as { detail: unknown }).detail)) ||
              err.message
          : "Could not create user",
      );
    },
  });

  if (!employeeId) {
    return <p className="text-slate-400">Invalid employee.</p>;
  }

  const backHref = effectiveTenantId
    ? `/tenants/${effectiveTenantId}?tab=employees`
    : "/employees";
  const backLabel = effectiveTenantId ? "← Back to organization" : "← Back to employees";

  const emp = employee.data;
  const canCreateUser =
    canWrite &&
    emp &&
    !emp.linkedUserId &&
    Boolean(emp.email) &&
    Boolean(emp.persona);

  return (
    <div className="max-w-5xl">
      <Link to={backHref} className="text-sm text-emerald-400 hover:underline">
        {backLabel}
      </Link>

      {employee.isLoading && <p className="mt-4 text-slate-400">Loading…</p>}
      {employee.isError && (
        <p className="mt-4 text-red-400">Could not load employee.</p>
      )}

      {emp && (
        <>
          <div className="mt-4 rounded-xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Employee</p>
                <h1 className="text-2xl font-semibold text-white">{emp.name}</h1>
                <p className="mt-1 text-sm text-slate-400">
                  {emp.employeeCode ? `ID ${emp.employeeCode}` : "No employee ID"}
                  {emp.persona ? ` · ${emp.persona}` : ""}
                </p>
              </div>
              {canWrite && (
                <div className="flex flex-wrap gap-2">
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
                  {canCreateUser && !userResult && (
                    <button
                      type="button"
                      disabled={createUser.isPending}
                      onClick={() => createUser.mutate()}
                      className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      {createUser.isPending ? "Creating…" : "Create user"}
                    </button>
                  )}
                </div>
              )}
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-4">
              <HighlightStat label="Status" value={emp.status} />
              <HighlightStat label="Persona" value={emp.persona ?? "—"} />
              <HighlightStat label="Email" value={emp.email ?? "—"} />
              <HighlightStat label="Hire date" value={fmtDate(emp.hireDate)} />
            </dl>
          </div>

          {actionError && (
            <p className="mt-4 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">
              {actionError}
            </p>
          )}

          {userResult && (
            <div className="mt-4 rounded-md border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
              <p className="font-medium">User created</p>
              <p className="mt-1 text-emerald-200/90">
                {userResult.email} · role {userResult.role}
              </p>
              {userResult.temporaryPassword && (
                <p className="mt-2 font-mono text-xs text-amber-200">
                  Temporary password: {userResult.temporaryPassword}
                </p>
              )}
              {userResult.inviteEmailSent && (
                <p className="mt-1 text-xs text-slate-400">Invite email sent.</p>
              )}
            </div>
          )}

          {emp.persona === "Driver" && (
            <RecordDetailTabs
              tabs={[
                { id: "details", label: "Details" },
                { id: "assignments", label: "Driver assignment" },
              ]}
              activeId={detailTab}
              onChange={(id) => setDetailTab(id as "details" | "assignments")}
            />
          )}

          {(emp.persona !== "Driver" || detailTab === "details") && (
            <EmployeeDetailsSections emp={emp} driverManagerLabel={driverManagerLabel} />
          )}

          {emp.persona === "Driver" && detailTab === "assignments" && effectiveTenantId && fleetDriverId && (
            <EntityAssignmentsPanel
              tenantId={effectiveTenantId}
              canAssign={canAssign}
              fixedDriverId={fleetDriverId}
              listDriverId={fleetDriverId}
              embedded
            />
          )}

          {emp.persona === "Driver" && detailTab === "assignments" && effectiveTenantId && !fleetDriverId && (
            <p className="mt-4 text-sm text-slate-500">
              Assignments appear here after this driver has a platform user and fleet driver
              profile.
            </p>
          )}

          {effectiveTenantId && (
            <EditEmployeeModal
              open={editOpen}
              employee={emp}
              tenantId={effectiveTenantId}
              onClose={() => setEditOpen(false)}
            />
          )}

          {deleteOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-950 p-6">
                <h2 className="text-lg font-semibold text-white">Delete employee?</h2>
                <p className="mt-2 text-sm text-slate-400">
                  {emp.name} will be marked inactive. You can restore by editing status later.
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
        </>
      )}
    </div>
  );
}
