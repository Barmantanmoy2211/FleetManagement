import type {
  AssignmentStatus,
  DriverStatus,
  EmployeeStatus,
  EmployeePersona,
  FuelType,
  Gender,
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
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
} from "@fleet/constants";

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
  temporaryPassword?: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}

export interface Vehicle {
  vehicleId: string;
  tenantId: string;
  registrationNumber: string;
  vin?: string | null;
  make: string;
  model: string;
  year?: number | null;
  vehicleType: VehicleType;
  fuelType: FuelType;
  status: VehicleStatus;
  odometerKm?: number | null;
  currentDriverId?: string | null;
  currentAssignmentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVehicleRequest {
  registrationNumber: string;
  vin?: string;
  make: string;
  model: string;
  year?: number;
  vehicleType?: VehicleType;
  fuelType?: FuelType;
  odometerKm?: number;
  tenantId?: string;
}

export interface UpdateVehicleRequest {
  registrationNumber?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  vehicleType?: VehicleType;
  fuelType?: FuelType;
  status?: VehicleStatus;
  odometerKm?: number;
}

export interface Driver {
  driverId: string;
  tenantId: string;
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
  driverId: string;
  vehicleId: string;
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
  tenantId?: string;
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
}

export interface Employee {
  employeeId: string;
  tenantId: string;
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
}

export interface ImportEmployeesResponse {
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
  employees: Employee[];
}
