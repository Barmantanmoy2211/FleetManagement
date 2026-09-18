import type { Employee } from "@fleet/types";

export function buildLinkedEmailSet(emails: string[]): Set<string> {
  const set = new Set<string>();
  for (const email of emails) {
    set.add(email.trim().toLowerCase());
  }
  return set;
}

export function isEmployeeLinkedToPlatformUser(
  employee: Employee,
  linkedEmails: Set<string>,
): boolean {
  if (employee.linkedUserId) {
    return true;
  }
  const email = employee.email?.trim().toLowerCase();
  return Boolean(email && linkedEmails.has(email));
}

export function filterEmployeesByPersonaAndLinked(
  employees: Employee[],
  persona: Employee["persona"],
  linkedEmails: Set<string>,
  linkedOnly: boolean,
): Employee[] {
  return employees.filter((e) => {
    if (e.persona !== persona) {
      return false;
    }
    const linked = isEmployeeLinkedToPlatformUser(e, linkedEmails);
    return linkedOnly ? linked : !linked;
  });
}

export const BULK_CREATE_USERS_LIMIT = 5;
