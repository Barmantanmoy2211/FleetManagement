import { ROLES, TENANT_STATUSES } from "@fleet/constants";
import { z } from "zod";

const roleEnum = z.enum([
  ROLES.PLATFORM_ADMIN,
  ROLES.FLEET_ADMIN,
  ROLES.FLEET_MANAGER,
  ROLES.DRIVER,
  ROLES.VIEWER,
]);

export const createTenantSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(TENANT_STATUSES).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(TENANT_STATUSES).optional(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  role: roleEnum,
  tenantId: z.string().uuid().optional(),
  temporaryPassword: z.string().min(8).optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
