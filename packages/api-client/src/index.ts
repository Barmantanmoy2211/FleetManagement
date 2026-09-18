import { API_V1_PREFIX, ROLES, type RoleName } from "@fleet/constants";
import type {
  Assignment,
  CreateAssignmentRequest,
  CreateTenantRequest,
  CreateUserRequest,
  CreateUserResponse,
  CreateVehicleRequest,
  CreateEmployeeRequest,
  Driver,
  DriverImportCandidate,
  Employee,
  HealthResponse,
  ImportDriversFromUsersRequest,
  ImportEmployeesResponse,
  ImportVehiclesResponse,
  MeResponse,
  Tenant,
  TenantDetail,
  UpdateEmployeeRequest,
  UpdateTenantRequest,
  UpdateVehicleRequest,
  UserProfile,
  Vehicle,
} from "@fleet/types";

export type TokenProvider = () => Promise<string | null>;

function employeePersonaToRole(
  persona: string | null | undefined,
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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class FleetApiClient {
  constructor(
    private baseUrl: string,
    private getAccessToken: TokenProvider,
  ) {}

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    const headers: HeadersInit = {
      ...(options.headers ?? {}),
    };
    const isFormData =
      typeof FormData !== "undefined" && options.body instanceof FormData;
    if (!isFormData) {
      (headers as Record<string, string>)["Content-Type"] = "application/json";
    }
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }

    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      throw new ApiError(res.status, res.statusText, body);
    }

    if (res.status === 204) {
      return undefined as T;
    }
    return res.json() as Promise<T>;
  }

  health(): Promise<HealthResponse> {
    return this.request(`${API_V1_PREFIX}/health`);
  }

  me(): Promise<MeResponse> {
    return this.request(`${API_V1_PREFIX}/me`);
  }

  listTenants(): Promise<Tenant[]> {
    return this.request(`${API_V1_PREFIX}/tenants`);
  }

  getTenantDetail(tenantId: string): Promise<TenantDetail> {
    return this.request(`${API_V1_PREFIX}/tenants/${tenantId}`);
  }

  createTenant(body: CreateTenantRequest): Promise<Tenant> {
    return this.request(`${API_V1_PREFIX}/tenants`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  updateTenant(tenantId: string, body: UpdateTenantRequest): Promise<Tenant> {
    return this.request(`${API_V1_PREFIX}/tenants/${tenantId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  deleteTenant(tenantId: string): Promise<Tenant> {
    return this.request(`${API_V1_PREFIX}/tenants/${tenantId}`, {
      method: "DELETE",
    });
  }

  listUsers(tenantId?: string): Promise<UserProfile[]> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/users${qs}`);
  }

  createUser(body: CreateUserRequest): Promise<CreateUserResponse> {
    return this.request(`${API_V1_PREFIX}/users`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  listVehicles(tenantId?: string): Promise<Vehicle[]> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/vehicles${qs}`);
  }

  createVehicle(body: CreateVehicleRequest): Promise<Vehicle> {
    return this.request(`${API_V1_PREFIX}/vehicles`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  getVehicle(vehicleId: string, tenantId?: string): Promise<Vehicle> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/vehicles/${vehicleId}${qs}`);
  }

  updateVehicle(
    vehicleId: string,
    body: UpdateVehicleRequest,
    tenantId?: string,
  ): Promise<Vehicle> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/vehicles/${vehicleId}${qs}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  deleteVehicle(vehicleId: string, tenantId?: string): Promise<Vehicle> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/vehicles/${vehicleId}${qs}`, {
      method: "DELETE",
    });
  }

  async downloadVehicleImportTemplate(tenantId: string): Promise<Blob> {
    const token = await this.getAccessToken();
    const qs = `?tenantId=${encodeURIComponent(tenantId)}`;
    const url = `${this.baseUrl.replace(/\/$/, "")}${API_V1_PREFIX}/vehicles/import-template${qs}`;
    const headers: HeadersInit = {};
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(url, { headers });
    if (res.ok) {
      return res.blob();
    }
    // Older deployed APIs may not have this route yet (404 on /vehicles/import-template).
    if (res.status === 404 || res.status === 405) {
      return this.downloadStaticVehicleImportTemplate();
    }
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body && typeof body === "object" && "detail" in body) {
        detail = String((body as { detail: unknown }).detail);
      }
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* keep statusText */
      }
    }
    throw new ApiError(res.status, detail);
  }

  /** Same workbook as backend template; works when API route is not deployed yet. */
  async downloadStaticVehicleImportTemplate(): Promise<Blob> {
    const staticUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/vehicle-import-template.xlsx`
        : "/vehicle-import-template.xlsx";
    const res = await fetch(staticUrl);
    if (!res.ok) {
      throw new ApiError(
        res.status,
        "Vehicle template file is missing. Redeploy the API or refresh the web app.",
      );
    }
    return res.blob();
  }

  importVehiclesFromExcel(
    file: File,
    tenantId: string,
  ): Promise<ImportVehiclesResponse> {
    const form = new FormData();
    form.append("file", file);
    const qs = `?tenantId=${encodeURIComponent(tenantId)}`;
    return this.request(`${API_V1_PREFIX}/vehicles/import${qs}`, {
      method: "POST",
      body: form,
    });
  }

  listDrivers(tenantId?: string): Promise<Driver[]> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/drivers${qs}`);
  }

  syncDriversFromUsers(
    body: ImportDriversFromUsersRequest,
  ): Promise<{ created: number; drivers: Driver[] }> {
    return this.request(`${API_V1_PREFIX}/drivers/sync-from-users`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  listDriverImportCandidates(tenantId?: string): Promise<DriverImportCandidate[]> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/drivers/import-candidates${qs}`);
  }

  listAssignments(tenantId?: string, activeOnly = false): Promise<Assignment[]> {
    const params = new URLSearchParams();
    if (tenantId) params.set("tenantId", tenantId);
    if (activeOnly) params.set("activeOnly", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request(`${API_V1_PREFIX}/assignments${qs}`);
  }

  createAssignment(body: CreateAssignmentRequest): Promise<Assignment> {
    return this.request(`${API_V1_PREFIX}/assignments`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  endAssignment(
    assignmentId: string,
    tenantId?: string,
    cancel = false,
  ): Promise<Assignment> {
    const params = new URLSearchParams();
    if (tenantId) params.set("tenantId", tenantId);
    if (cancel) params.set("cancel", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request(`${API_V1_PREFIX}/assignments/${assignmentId}/end${qs}`, {
      method: "POST",
    });
  }

  listEmployees(tenantId?: string): Promise<Employee[]> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/employees${qs}`);
  }

  getEmployee(employeeId: string, tenantId?: string): Promise<Employee> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/employees/${employeeId}${qs}`);
  }

  createEmployee(body: CreateEmployeeRequest): Promise<Employee> {
    return this.request(`${API_V1_PREFIX}/employees`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  updateEmployee(
    employeeId: string,
    body: UpdateEmployeeRequest,
    tenantId?: string,
  ): Promise<Employee> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/employees/${employeeId}${qs}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async downloadEmployeeImportTemplate(tenantId: string): Promise<Blob> {
    const token = await this.getAccessToken();
    const qs = `?tenantId=${encodeURIComponent(tenantId)}`;
    const url = `${this.baseUrl.replace(/\/$/, "")}${API_V1_PREFIX}/employees/import-template${qs}`;
    const headers: HeadersInit = {};
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText);
    }
    return res.blob();
  }

  importEmployeesFromExcel(
    file: File,
    tenantId: string,
  ): Promise<ImportEmployeesResponse> {
    const form = new FormData();
    form.append("file", file);
    const qs = `?tenantId=${encodeURIComponent(tenantId)}`;
    return this.request(`${API_V1_PREFIX}/employees/import${qs}`, {
      method: "POST",
      body: form,
    });
  }

  deleteEmployee(employeeId: string, tenantId?: string): Promise<Employee> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return this.request(`${API_V1_PREFIX}/employees/${employeeId}${qs}`, {
      method: "DELETE",
    });
  }

  async createUserFromEmployee(
    employeeId: string,
    tenantId?: string,
  ): Promise<CreateUserResponse> {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    try {
      return await this.request(
        `${API_V1_PREFIX}/employees/${employeeId}/create-user${qs}`,
        { method: "POST" },
      );
    } catch (err) {
      const recovered = await this.tryRecoverCreateUserFromEmployee(
        employeeId,
        tenantId,
        err,
      );
      if (recovered) {
        return recovered;
      }
      throw err;
    }
  }

  private async tryRecoverCreateUserFromEmployee(
    employeeId: string,
    tenantId: string | undefined,
    err: unknown,
  ): Promise<CreateUserResponse | null> {
    if (!(err instanceof ApiError)) {
      return null;
    }
    if (err.status === 404) {
      const emp = await this.getEmployee(employeeId, tenantId);
      if (!emp.email) {
        throw new ApiError(400, "Employee must have an email before creating a user");
      }
      const role = employeePersonaToRole(emp.persona ?? undefined);
      if (!role) {
        throw new ApiError(
          400,
          "Employee must have persona Fleet Admin, Fleet Manager, or Driver",
        );
      }
      try {
        return await this.createUser({
          email: emp.email,
          role,
          tenantId,
        });
      } catch (inner) {
        return this.matchExistingUserResponse(emp.email, tenantId, inner);
      }
    }
    if (err.status >= 500 || err.status === 400) {
      try {
        const emp = await this.getEmployee(employeeId, tenantId);
        if (emp.email) {
          return this.matchExistingUserResponse(emp.email, tenantId, err);
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  private async matchExistingUserResponse(
    email: string,
    tenantId: string | undefined,
    originalErr: unknown,
  ): Promise<CreateUserResponse | null> {
    if (!tenantId) {
      return null;
    }
    const users = await this.listUsers(tenantId);
    const match = users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!match) {
      if (originalErr instanceof ApiError) {
        throw originalErr;
      }
      return null;
    }
    return {
      ...match,
      temporaryPassword: null,
      inviteEmailSent: false,
    };
  }
}
