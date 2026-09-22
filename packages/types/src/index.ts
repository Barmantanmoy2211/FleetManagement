import type {
  AssignmentStatus,
  DriverStatus,
  EmployeeStatus,
  EmployeePersona,
  FuelType,
  Gender,
  LeaseOwnershipType,
  TripStatus,
  VehicleStatus,
  VehicleType,
} from "@fleet/constants";

export type {
  AssignmentStatus,
  DriverStatus,
  EmployeeStatus,
  EmployeePersona,
  FuelType,
  Gender,
  LeaseOwnershipType,
  TripStatus,
  VehicleStatus,
  VehicleType,
};

export const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export {
  ASSIGNMENT_STATUSES,
  DRIVER_STATUSES,
  EMPLOYEE_PERSONAS,
  EMPLOYEE_STATUSES,
  FUEL_TYPES,
  GENDERS,
  LEASE_OWNERSHIP_TYPES,
  TRIP_STATUSES,
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
} from "@fleet/constants";

export const ROLE_NAMES = [
  "PlatformAdmin",
  "FleetAdmin",
  "LocationHead",
  "FleetManager",
  "Driver",
  "Viewer",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export interface Tenant {
  tenantId: string;
  name: string;
  status: TenantStatus;
  street?: string | null;
  city?: string | null;
  zipCode?: string | null;
  state?: string | null;
  country?: string | null;
  landmark?: string | null;
  revenue?: number | null;
  establishedDate?: string | null;
  platformOnboardingDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantLocation {
  locationId: string;
  tenantId: string;
  name: string;
  code?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  status: "ACTIVE" | "INACTIVE";
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationRequest {
  name: string;
  code?: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  tenantId?: string;
}

export interface UpdateLocationRequest {
  name?: string;
  code?: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  status?: "ACTIVE" | "INACTIVE";
}

export interface OrgChartNode {
  nodeId: string;
  kind: string;
  label: string;
  role?: RoleName;
  locationName?: string | null;
  isSelf?: boolean;
  children?: OrgChartNode[];
}

export interface UserProfile {
  userId: string;
  tenantId: string;
  email: string;
  role: RoleName;
  cognitoSub: string;
  locationId?: string | null;
  reportsToUserId?: string | null;
  timeZone?: string | null;
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
  timeZone?: string;
}

export interface UpdateMeRequest {
  timeZone: string;
}

export interface CreateTenantRequest {
  name: string;
  status?: TenantStatus;
  street?: string;
  city?: string;
  zipCode?: string;
  state?: string;
  country?: string;
  landmark?: string;
  revenue?: number;
  establishedDate?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  status?: TenantStatus;
  street?: string;
  city?: string;
  zipCode?: string;
  state?: string;
  country?: string;
  landmark?: string;
  revenue?: number;
  establishedDate?: string;
}

export interface CreateUserRequest {
  email: string;
  role: RoleName;
  tenantId?: string;
  locationId?: string;
  reportsToUserId?: string;
  temporaryPassword?: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}

export interface Vehicle {
  vehicleId: string;
  tenantId: string;
  locationId?: string | null;
  vehicleName: string;
  displayVehicleId?: string;
  registrationNumber: string;
  vin?: string | null;
  make: string;
  model: string;
  year?: number | null;
  age?: number | null;
  color?: string | null;
  dotNumber?: string | null;
  leaseOwnershipType?: LeaseOwnershipType | null;
  vehicleType: VehicleType;
  vehicleSubtype?: string | null;
  fuelType: FuelType;
  cargoType?: string | null;
  weightLbs?: number | null;
  policyNumber?: string | null;
  coveredUnderPolicy?: boolean;
  status: VehicleStatus;
  odometerKm?: number | null;
  currentDriverId?: string | null;
  currentAssignmentId?: string | null;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleRequest {
  vehicleName: string;
  registrationNumber?: string;
  vin?: string;
  make: string;
  model: string;
  year: number;
  color?: string;
  dotNumber?: string;
  leaseOwnershipType?: LeaseOwnershipType;
  vehicleType?: VehicleType;
  vehicleSubtype?: string;
  fuelType?: FuelType;
  cargoType?: string;
  weightLbs?: number;
  policyNumber?: string;
  coveredUnderPolicy?: boolean;
  status?: VehicleStatus;
  odometerKm?: number;
  tenantId?: string;
  locationId?: string;
}

export interface UpdateVehicleRequest {
  vehicleName?: string;
  registrationNumber?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  dotNumber?: string;
  leaseOwnershipType?: LeaseOwnershipType;
  vehicleType?: VehicleType;
  vehicleSubtype?: string;
  fuelType?: FuelType;
  cargoType?: string;
  weightLbs?: number;
  policyNumber?: string;
  coveredUnderPolicy?: boolean;
  status?: VehicleStatus;
  odometerKm?: number;
}

export interface ImportVehiclesResponse {
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
  vehicles: Vehicle[];
}

export interface Driver {
  driverId: string;
  tenantId: string;
  locationId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  licenseNumber: string;
  licenseType?: string | null;
  licenseExpiry?: string | null;
  status: DriverStatus;
  emergencyContact?: string | null;
  joiningDate?: string | null;
  currentVehicleId?: string | null;
  currentAssignmentId?: string | null;
  linkedUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDriverRequest {
  name: string;
  email?: string;
  phone?: string;
  licenseNumber: string;
  licenseType?: string;
  licenseExpiry?: string;
  emergencyContact?: string;
  joiningDate?: string;
  tenantId?: string;
}

export interface UpdateDriverRequest {
  name?: string;
  email?: string;
  phone?: string;
  licenseNumber?: string;
  licenseType?: string;
  licenseExpiry?: string;
  status?: DriverStatus;
  emergencyContact?: string;
  joiningDate?: string;
}

export interface Assignment {
  assignmentId: string;
  tenantId: string;
  locationId?: string | null;
  driverId: string;
  vehicleId: string;
  changeDate: string;
  releaseDate?: string | null;
  startTime: string;
  endTime?: string | null;
  status: AssignmentStatus;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssignmentRequest {
  driverId: string;
  vehicleId: string;
  changeDate: string;
  releaseDate?: string | null;
  tenantId?: string;
}

export interface UpdateAssignmentRequest {
  changeDate?: string;
  releaseDate?: string | null;
}

export interface Trip {
  tripId: string;
  tenantId: string;
  locationId?: string | null;
  assignmentId: string;
  driverId: string;
  vehicleId: string;
  status: TripStatus;
  /** Present on trips created after scheduling; legacy trips use startTime only. */
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  actualStartTime?: string | null;
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  routeDistanceKm: number;
  /** Minutes from actual start to end; set when trip is completed. */
  timeTakenMinutes?: number | null;
  /** Liters consumed; required when completing a trip. */
  fuelRequiredLiters?: number | null;
  startTime: string;
  endTime?: string | null;
  lastLatitude?: number | null;
  lastLongitude?: number | null;
  startedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTripRequest {
  assignmentId: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  pickupLatitude: number;
  pickupLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  tenantId?: string;
}

export interface UpdateTripRequest {
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
}

export type StartTripRequest = CreateTripRequest;

export interface UpdateTripLocationRequest {
  latitude: number;
  longitude: number;
}

export interface EndTripRequest {
  cancel?: boolean;
  fuelRequiredLiters?: number;
}

export interface DriverImportCandidate {
  userId: string;
  email: string;
  suggestedName: string;
}

export interface ImportDriversFromUsersRequest {
  userIds: string[];
  tenantId?: string;
}

export interface TenantDetail {
  tenant: Tenant;
  users?: UserProfile[];
  fleetAdmins: UserProfile[];
  fleetManagers: UserProfile[];
  drivers: Driver[];
  vehicles: Vehicle[];
  /** Employees with Driver persona + platform user (Drivers tab). */
  linkedDriverCount?: number;
}

export interface Employee {
  employeeId: string;
  tenantId: string;
  locationId?: string | null;
  name: string;
  employeeCode?: string | null;
  dateOfBirth?: string | null;
  age?: number | null;
  gender?: Gender | null;
  status: EmployeeStatus;
  persona?: EmployeePersona | null;
  isDriver: boolean;
  hireDate?: string | null;
  homeAddress?: string | null;
  email?: string | null;
  phone?: string | null;
  primaryContact: boolean;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  emergencyContactName?: string | null;
  emergencyContactAddress?: string | null;
  employmentType?: string | null;
  employmentStatus?: string | null;
  experience?: string | null;
  dailyHoursWorked?: number | null;
  companyDriverId?: string | null;
  department?: string | null;
  jobRole?: string | null;
  linkedUserId?: string | null;
  driverManagerUserId?: string | null;
  driverManagerEmail?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeRequest {
  name: string;
  employeeCode?: string;
  dateOfBirth?: string;
  gender?: Gender;
  status?: EmployeeStatus;
  persona?: EmployeePersona;
  isDriver?: boolean;
  hireDate?: string;
  homeAddress?: string;
  email?: string;
  phone?: string;
  primaryContact?: boolean;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  emergencyContactName?: string;
  emergencyContactAddress?: string;
  employmentType?: string;
  employmentStatus?: string;
  experience?: string;
  dailyHoursWorked?: number;
  companyDriverId?: string;
  department?: string;
  jobRole?: string;
  driverManagerUserId?: string;
  locationId?: string;
  tenantId?: string;
}

export interface UpdateEmployeeRequest {
  name?: string;
  employeeCode?: string;
  dateOfBirth?: string;
  gender?: Gender;
  status?: EmployeeStatus;
  persona?: EmployeePersona;
  isDriver?: boolean;
  hireDate?: string;
  homeAddress?: string;
  email?: string;
  phone?: string;
  primaryContact?: boolean;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  emergencyContactName?: string;
  emergencyContactAddress?: string;
  employmentType?: string;
  employmentStatus?: string;
  experience?: string;
  dailyHoursWorked?: number;
  companyDriverId?: string;
  department?: string;
  jobRole?: string;
  linkedUserId?: string;
  driverManagerUserId?: string | null;
}

export interface ImportEmployeesResponse {
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
  employees: Employee[];
}
