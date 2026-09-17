import { NavLink } from "react-router-dom";
import { ROLES } from "@fleet/constants";
import { useAuthStore } from "@/stores/authStore";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm ${isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-900"}`;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { email, role, logout } = useAuthStore();
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN;
  const canManageUsers =
    role === ROLES.PLATFORM_ADMIN || role === ROLES.FLEET_ADMIN;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col border-r border-slate-800 bg-slate-950 p-4">
        <div className="mb-8">
          <p className="text-lg font-semibold text-white">Fleet Intelligence</p>
          <p className="text-xs text-slate-400">Phase 1</p>
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
          {canManageUsers && (
            <NavLink to="/users" className={navLinkClass}>
              Users
            </NavLink>
          )}
          <NavLink to="/profile" className={navLinkClass}>
            Profile
          </NavLink>
          <span className="mt-4 px-3 text-xs uppercase tracking-wide text-slate-500">
            Coming soon
          </span>
          <span className="px-3 py-2 text-sm text-slate-600">Vehicles</span>
          <span className="px-3 py-2 text-sm text-slate-600">Drivers</span>
          <span className="px-3 py-2 text-sm text-slate-600">Trips</span>
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
