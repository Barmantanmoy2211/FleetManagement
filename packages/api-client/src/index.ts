import { API_V1_PREFIX } from "@fleet/constants";
import type {
  CreateTenantRequest,
  CreateUserRequest,
  CreateUserResponse,
  HealthResponse,
  MeResponse,
  Tenant,
  UpdateTenantRequest,
  UserProfile,
} from "@fleet/types";

export type TokenProvider = () => Promise<string | null>;

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
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };
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
}
