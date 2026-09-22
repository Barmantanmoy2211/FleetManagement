export const API_V1_PREFIX = "/api/v1";

export const ROLES = {
  PLATFORM_ADMIN: "PlatformAdmin",
  FLEET_ADMIN: "FleetAdmin",
  LOCATION_HEAD: "LocationHead",
  FLEET_MANAGER: "FleetManager",
  DRIVER: "Driver",
  VIEWER: "Viewer",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/** Default when user profile has no timeZone set (IST). */
export const DEFAULT_USER_TIME_ZONE = "Asia/Kolkata";

export const COMMON_TIME_ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
] as const;

export const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const VEHICLE_STATUSES = [
  "AVAILABLE",
  "ASSIGNED",
  "IN_TRIP",
  "IDLE",
  "MAINTENANCE",
  "OFFLINE",
  "INACTIVE",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const DRIVER_STATUSES = [
  "AVAILABLE",
  "ASSIGNED",
  "ON_TRIP",
  "ON_BREAK",
  "OFF_DUTY",
  "SUSPENDED",
  "INACTIVE",
] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ["SCHEDULED", "ACTIVE", "ENDED", "CANCELLED"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const TRIP_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const VEHICLE_TYPES = ["TRUCK", "VAN", "CAR", "BUS", "BIKE", "OTHER"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const FUEL_TYPES = [
  "DIESEL",
  "PETROL",
  "CNG",
  "ELECTRIC",
  "HYBRID",
  "OTHER",
] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const LEASE_OWNERSHIP_TYPES = ["LEASE", "OWNED", "RENTED", "OTHER"] as const;
export type LeaseOwnershipType = (typeof LEASE_OWNERSHIP_TYPES)[number];

export const EMPLOYEE_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "ON_LEAVE",
  "TERMINATED",
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const GENDERS = ["Male", "Female", "Other", "PreferNotToSay"] as const;
export type Gender = (typeof GENDERS)[number];

export const LOCATION_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

export const EMPLOYEE_PERSONAS = [
  "Fleet Admin",
  "Location Head",
  "Fleet Manager",
  "Driver",
] as const;
export type EmployeePersona = (typeof EMPLOYEE_PERSONAS)[number];

export const ENV_KEYS = {
  VITE_API_URL: "VITE_API_URL",
  VITE_COGNITO_USER_POOL_ID: "VITE_COGNITO_USER_POOL_ID",
  VITE_COGNITO_CLIENT_ID: "VITE_COGNITO_CLIENT_ID",
  VITE_COGNITO_REGION: "VITE_COGNITO_REGION",
} as const;
