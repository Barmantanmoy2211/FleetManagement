export const API_V1_PREFIX = "/api/v1";

export const ROLES = {
  PLATFORM_ADMIN: "PlatformAdmin",
  FLEET_ADMIN: "FleetAdmin",
  FLEET_MANAGER: "FleetManager",
  DRIVER: "Driver",
  VIEWER: "Viewer",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const ENV_KEYS = {
  VITE_API_URL: "VITE_API_URL",
  VITE_COGNITO_USER_POOL_ID: "VITE_COGNITO_USER_POOL_ID",
  VITE_COGNITO_CLIENT_ID: "VITE_COGNITO_CLIENT_ID",
  VITE_COGNITO_REGION: "VITE_COGNITO_REGION",
} as const;
