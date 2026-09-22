import {
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  type SignInInput,
} from "aws-amplify/auth";
import { ROLES, type RoleName } from "@fleet/constants";
import { create } from "zustand";
import { getApiBaseUrl } from "@/lib/amplify";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  email: string | null;
  role: RoleName | null;
  tenantId: string | null;
  userId: string | null;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (input: SignInInput) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

function roleFromGroups(groups: string[] | undefined): RoleName | null {
  if (!groups?.length) return null;
  const order: RoleName[] = [
    ROLES.PLATFORM_ADMIN,
    ROLES.FLEET_ADMIN,
    ROLES.LOCATION_HEAD,
    ROLES.FLEET_MANAGER,
    ROLES.DRIVER,
    ROLES.VIEWER,
  ];
  for (const role of order) {
    if (groups.includes(role)) return role;
  }
  return null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  isLoading: true,
  email: null,
  role: null,
  tenantId: null,
  userId: null,
  error: null,

  hydrate: async () => {
    try {
      const user = await getCurrentUser();
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken ?? session.tokens?.accessToken;
      const payload = token?.payload;
      const groupsRaw = payload?.["cognito:groups"];
      const groups = Array.isArray(groupsRaw)
        ? (groupsRaw as string[])
        : groupsRaw
          ? [String(groupsRaw)]
          : [];
      let tenantId = (payload?.["custom:tenant_id"] as string) || null;
      let role = roleFromGroups(groups);
      if (token) {
        try {
          const { API_V1_PREFIX } = await import("@fleet/constants");
          const res = await fetch(`${getApiBaseUrl()}${API_V1_PREFIX}/me`, {
            headers: { Authorization: `Bearer ${token.toString()}` },
          });
          if (res.ok) {
            const me = (await res.json()) as {
              tenantId?: string | null;
              role?: RoleName;
            };
            if (me.tenantId) {
              tenantId = me.tenantId;
            }
            if (me.role && !role) {
              role = me.role;
            }
          }
        } catch {
          /* use token claims only */
        }
      }
      set({
        isAuthenticated: true,
        isLoading: false,
        email: (payload?.email as string) || user.signInDetails?.loginId || null,
        userId: user.userId,
        role,
        tenantId,
        error: null,
      });
    } catch {
      set({
        isAuthenticated: false,
        isLoading: false,
        email: null,
        role: null,
        tenantId: null,
        userId: null,
      });
    }
  },

  login: async (input) => {
    set({ isLoading: true, error: null });
    try {
      await signIn(input);
      await get().hydrate();
    } catch (e) {
      set({
        isLoading: false,
        error: e instanceof Error ? e.message : "Login failed",
      });
      throw e;
    }
  },

  logout: async () => {
    await signOut();
    set({
      isAuthenticated: false,
      email: null,
      role: null,
      tenantId: null,
      userId: null,
    });
  },

  getAccessToken: async () => {
    try {
      const session = await fetchAuthSession();
      // HTTP API JWT authorizer (Cognito) validates `aud` — use ID token, not access token.
      const idToken = session.tokens?.idToken?.toString();
      if (idToken) return idToken;
      return session.tokens?.accessToken?.toString() ?? null;
    } catch {
      return null;
    }
  },
}));
