import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { TenantsPage } from "@/pages/TenantsPage";
import { UsersPage } from "@/pages/UsersPage";
import { useAuthStore } from "@/stores/authStore";
import { ROLES } from "@fleet/constants";

function RoleRoute({
  allowed,
  children,
}: {
  allowed: string[];
  children: React.ReactNode;
}) {
  const role = useAuthStore((s) => s.role);
  if (!role || !allowed.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route index element={<DashboardPage />} />
        <Route
          path="tenants"
          element={
            <RoleRoute allowed={[ROLES.PLATFORM_ADMIN]}>
              <TenantsPage />
            </RoleRoute>
          }
        />
        <Route
          path="users"
          element={
            <RoleRoute allowed={[ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN]}>
              <UsersPage />
            </RoleRoute>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
