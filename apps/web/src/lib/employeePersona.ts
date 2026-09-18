import { ROLES, type RoleName } from "@fleet/constants";
import type { EmployeePersona } from "@fleet/types";

export function employeePersonaToRole(
  persona: EmployeePersona | string | null | undefined,
): RoleName | null {
  switch (persona) {
    case "Fleet Admin":
      return ROLES.FLEET_ADMIN;
    case "Fleet Manager":
      return ROLES.FLEET_MANAGER;
    case "Driver":
      return ROLES.DRIVER;
    default:
      return null;
  }
}
