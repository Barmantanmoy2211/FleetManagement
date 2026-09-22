import { NavLink } from "react-router-dom";
import { ROLES } from "@fleet/constants";
import { useAuthStore } from "@/stores/authStore";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm ${isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900"}`;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, role, logout, tenantId } = useAuthStore();
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canManageUsers =
    role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;
  const canSeeFleet =
    role === ROLES.PLATFORM_ADMIN ||
    role === ROLES.FLEET_ADMIN ||
    role === ROLES.LOCATION_HEAD ||
    role === ROLES.FLEET_MANAGER ||
    role === ROLES.VIEWER ||
    role === ROLES.DRIVER;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-slate-800 bg-slate-950 p-4">
        <div className="mb-8">
          <p className="text-lg font-semibold text-white">Fleet Intelligence</p>
          <p className="text-xs text-slate-400">Phase 3 — Trips</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Dashboard
          </NavLink>
          {isPlatformAdmin && (
            <NavLink to="/tenants" className={navLinkClass}>
              Tenants
            </NavLink>
          )}
          {(role === ROLES.FLEET_ADMIN || role === ROLES.FLEET_MANAGER || role === ROLES.LOCATION_HEAD) && tenantId && (
            <NavLink to={`/tenants/${tenantId}`} className={navLinkClass}>
              Organization
            </NavLink>
          )}
          {canManageUsers && (
            <NavLink to="/users" className={navLinkClass}>
              Users
            </NavLink>
          )}
          {canSeeFleet && (
            <>
              <NavLink to="/vehicles" className={navLinkClass}>
                Vehicles
              </NavLink>
              <NavLink to="/drivers" className={navLinkClass}>
                Drivers
              </NavLink>
              <NavLink to="/employees" className={navLinkClass}>
                Employees
              </NavLink>
              <NavLink to="/assignments" className={navLinkClass}>
                Assignments
              </NavLink>
              <NavLink to="/trips" className={navLinkClass}>
                Trips
              </NavLink>
              <NavLink to="/live-map" className={navLinkClass}>
                Trip routes
              </NavLink>
            </>
          )}
          <NavLink to="/profile" className={navLinkClass}>
            Profile
          </NavLink>
          <span className="mt-4 px-3 text-xs uppercase tracking-wide text-slate-500">
            Phase 4 (last)
          </span>
          <span className="px-3 py-2 text-sm text-slate-600" title="Live GPS, location history, telemetry">
            Live tracking & telemetry
          </span>
        </nav>
        <div className="border-t border-slate-800 pt-4 text-sm">
          <p className="truncate text-slate-300">{email}</p>
          <p className="text-xs text-slate-500">{role}</p>
          <button
            type="button"
            onClick={() => logout()}
            className="mt-2 text-xs text-amber-400 hover:underline"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
