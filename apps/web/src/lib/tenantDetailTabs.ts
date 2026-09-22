import { ROLES, type RoleName } from "@fleet/constants";

export type TenantDetailTabId =
  | "details"
  | "locations"
  | "users"
  | "drivers"
  | "vehicles"
  | "employees"
  | "fleet-managers"
  | "fleet-admins";

export const TENANT_DETAIL_TABS: { id: TenantDetailTabId; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "locations", label: "Locations" },
  { id: "users", label: "Users" },
  { id: "drivers", label: "Drivers" },
  { id: "vehicles", label: "Vehicles" },
  { id: "employees", label: "Employees" },
  { id: "fleet-managers", label: "Fleet managers" },
  { id: "fleet-admins", label: "Fleet admins" },
];

export function visibleTenantDetailTabs(role: RoleName | null): TenantDetailTabId[] {
  if (role === ROLES.PLATFORM_ADMIN) {
    return TENANT_DETAIL_TABS.map((t) => t.id);
  }
  if (role === ROLES.FLEET_ADMIN) {
    return [
      "details",
      "locations",
      "users",
      "drivers",
      "vehicles",
      "employees",
      "fleet-managers",
    ];
  }
  if (role === ROLES.FLEET_MANAGER) {
    return ["users", "drivers", "vehicles", "employees"];
  }
  if (role === ROLES.LOCATION_HEAD) {
    return ["users", "drivers", "vehicles", "employees", "fleet-managers"];
  }
  return [];
}

export function tabLabel(id: TenantDetailTabId): string {
  return TENANT_DETAIL_TABS.find((t) => t.id === id)?.label ?? id;
}

export function formatUserRole(role: string): string {
  switch (role) {
    case ROLES.FLEET_ADMIN:
      return "Fleet Admin";
    case ROLES.LOCATION_HEAD:
      return "Location Head";
    case ROLES.FLEET_MANAGER:
      return "Fleet Manager";
    case ROLES.DRIVER:
      return "Driver";
    case ROLES.VIEWER:
      return "Viewer";
    case ROLES.PLATFORM_ADMIN:
      return "Platform Admin";
    default:
      return role;
  }
}
