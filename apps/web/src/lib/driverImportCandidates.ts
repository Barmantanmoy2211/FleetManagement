import type { DriverImportCandidate } from "@fleet/types";
import { ROLES } from "@fleet/constants";
import type { FleetApiClient } from "@fleet/api-client";
import { ApiError } from "@fleet/api-client";

function suggestedNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function loadDriverImportCandidates(
  api: FleetApiClient,
  tenantId?: string,
): Promise<DriverImportCandidate[]> {
  try {
    return await api.listDriverImportCandidates(tenantId);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
      return loadDriverImportCandidatesFromUsersList(api, tenantId);
    }
    throw err;
  }
}

async function loadDriverImportCandidatesFromUsersList(
  api: FleetApiClient,
  tenantId?: string,
): Promise<DriverImportCandidate[]> {
  const [users, drivers] = await Promise.all([
    api.listUsers(tenantId),
    api.listDrivers(tenantId),
  ]);
  const importedEmails = new Set(
    drivers
      .map((d) => (d.email ?? "").trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
  return users
    .filter((u) => u.role === ROLES.DRIVER)
    .filter((u) => !importedEmails.has(u.email.trim().toLowerCase()))
    .map((u) => ({
      userId: u.userId,
      email: u.email,
      suggestedName: suggestedNameFromEmail(u.email),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
