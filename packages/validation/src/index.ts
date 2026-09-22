import { EMPLOYEE_PERSONAS, EMPLOYEE_STATUSES, FUEL_TYPES, GENDERS, LEASE_OWNERSHIP_TYPES, ROLES, TENANT_STATUSES, VEHICLE_STATUSES, VEHICLE_TYPES } from "@fleet/constants";
import { z } from "zod";

const roleEnum = z.enum([
  ROLES.PLATFORM_ADMIN,
  ROLES.FLEET_ADMIN,
  ROLES.LOCATION_HEAD,
  ROLES.FLEET_MANAGER,
  ROLES.DRIVER,
  ROLES.VIEWER,
]);

export const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(TENANT_STATUSES).optional(),
  street: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  zipCode: z.string().max(32).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  landmark: z.string().max(200).optional(),
  revenue: z.number().min(0).optional(),
  establishedDate: z.string().optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(TENANT_STATUSES).optional(),
  street: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  zipCode: z.string().max(32).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  landmark: z.string().max(200).optional(),
  revenue: z.number().min(0).optional(),
  establishedDate: z.string().optional(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  role: roleEnum,
  tenantId: z.string().uuid().optional(),
  temporaryPassword: z.string().min(8).optional(),
  locationId: z.string().uuid().optional().nullable(),
  reportsToUserId: z.string().uuid().optional().nullable(),
});

const vehicleTypeEnum = z.enum(VEHICLE_TYPES);
const fuelTypeEnum = z.enum(FUEL_TYPES);
const vehicleStatusEnum = z.enum(VEHICLE_STATUSES);
const leaseOwnershipEnum = z.enum(LEASE_OWNERSHIP_TYPES);

export const createVehicleSchema = z.object({
  vehicleName: z.string().min(1).max(160),
  registrationNumber: z.string().max(32).optional(),
  vin: z.string().max(32).optional(),
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
  year: z.coerce.number().int().min(1980).max(2100),
  color: z.string().max(80).optional(),
  dotNumber: z.string().max(32).optional(),
  leaseOwnershipType: leaseOwnershipEnum.optional(),
  vehicleType: vehicleTypeEnum.optional(),
  vehicleSubtype: z.string().max(80).optional(),
  fuelType: fuelTypeEnum.optional(),
  cargoType: z.string().max(80).optional(),
  weightLbs: z.coerce.number().min(0).optional(),
  policyNumber: z.string().max(64).optional(),
  coveredUnderPolicy: z.boolean().optional(),
  status: vehicleStatusEnum.optional(),
  odometerKm: z.number().min(0).optional(),
  tenantId: z.string().uuid().optional(),
});

export const updateVehicleSchema = createVehicleSchema.omit({ tenantId: true }).partial();

export const createDriverSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional(),
  phone: z.string().max(32).optional(),
  licenseNumber: z.string().min(1).max(64),
  licenseType: z.string().max(64).optional(),
  licenseExpiry: z.string().optional(),
  emergencyContact: z.string().max(120).optional(),
  joiningDate: z.string().optional(),
  tenantId: z.string().uuid().optional(),
});

export const createAssignmentSchema = z
  .object({
    driverId: z.string().uuid(),
    vehicleId: z.string().uuid(),
    changeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    releaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    tenantId: z.string().uuid().optional(),
  })
  .refine(
    (data) => !data.releaseDate || data.releaseDate >= data.changeDate,
    { message: "Release date cannot be before change date", path: ["releaseDate"] },
  );

export const updateAssignmentSchema = z
  .object({
    changeDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    releaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
  })
  .refine(
    (data) =>
      !data.changeDate ||
      !data.releaseDate ||
      data.releaseDate >= data.changeDate,
    { message: "Release date cannot be before change date", path: ["releaseDate"] },
  );

export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

const employeeStatusEnum = z.enum(EMPLOYEE_STATUSES);
const genderEnum = z.enum(GENDERS);
const employeePersonaEnum = z.enum(EMPLOYEE_PERSONAS);

export const createEmployeeSchema = z.object({
  name: z.string().min(1).max(160),
  employeeCode: z.string().max(64).optional(),
  dateOfBirth: z.string().optional(),
  gender: genderEnum.optional(),
  status: employeeStatusEnum.optional(),
  persona: employeePersonaEnum.optional(),
  isDriver: z.boolean().optional(),
  hireDate: z.string().optional(),
  homeAddress: z.string().max(500).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(32).optional(),
  primaryContact: z.boolean().optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  zipCode: z.string().max(32).optional(),
  country: z.string().max(120).optional(),
  emergencyContactName: z.string().max(160).optional(),
  emergencyContactAddress: z.string().max(500).optional(),
  employmentType: z.string().max(80).optional(),
  employmentStatus: z.string().max(80).optional(),
  experience: z.string().max(120).optional(),
  dailyHoursWorked: z.number().min(0).max(24).optional(),
  companyDriverId: z.string().max(64).optional(),
  department: z.string().max(120).optional(),
  jobRole: z.string().max(120).optional(),
  driverManagerUserId: z.string().uuid().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  tenantId: z.string().uuid().optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.omit({ tenantId: true }).partial();

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type CreateDriverInput = z.infer<typeof createDriverSchema>;
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
