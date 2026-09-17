export const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const ROLE_NAMES = [
  "PlatformAdmin",
  "FleetAdmin",
  "FleetManager",
  "Driver",
  "Viewer",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export interface Tenant {
  tenantId: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  userId: string;
  tenantId: string;
  email: string;
  role: RoleName;
  cognitoSub: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserResponse extends UserProfile {
  temporaryPassword?: string | null;
  inviteEmailSent?: boolean;
}

export interface MeResponse {
  userId: string;
  tenantId: string | null;
  email: string;
  role: RoleName;
}

export interface CreateTenantRequest {
  name: string;
  status?: TenantStatus;
}

export interface UpdateTenantRequest {
  name?: string;
  status?: TenantStatus;
}

export interface CreateUserRequest {
  email: string;
  role: RoleName;
  tenantId?: string;
  temporaryPassword?: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}
