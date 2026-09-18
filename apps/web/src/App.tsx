import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AssignmentsPage } from "@/pages/AssignmentsPage";
import { EmployeeDetailPage } from "@/pages/EmployeeDetailPage";
import { EmployeesPage } from "@/pages/EmployeesPage";
import { DriversPage } from "@/pages/DriversPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { TenantDetailPage } from "@/pages/TenantDetailPage";
import { TenantsPage } from "@/pages/TenantsPage";
import { UsersPage } from "@/pages/UsersPage";
import { VehicleDetailPage } from "@/pages/VehicleDetailPage";
import { VehiclesPage } from "@/pages/VehiclesPage";
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

const FLEET_READ = [
  ROLES.PLATFORM_ADMIN,
  ROLES.FLEET_ADMIN,
  ROLES.FLEET_MANAGER,
  ROLES.VIEWER,
  ROLES.DRIVER,
];

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
          path="tenants/:tenantId"
          element={
            <RoleRoute
              allowed={[ROLES.PLATFORM_ADMIN, ROLES.FLEET_ADMIN, ROLES.FLEET_MANAGER]}
            >
              <TenantDetailPage />
            </RoleRoute>
          }
        />
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
        <Route
          path="vehicles/:vehicleId"
          element={
            <RoleRoute allowed={FLEET_READ}>
              <VehicleDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="vehicles"
          element={
            <RoleRoute allowed={FLEET_READ}>
              <VehiclesPage />
            </RoleRoute>
          }
        />
        <Route
          path="drivers"
          element={
            <RoleRoute allowed={FLEET_READ}>
              <DriversPage />
            </RoleRoute>
          }
        />
        <Route
          path="employees/:employeeId"
          element={
            <RoleRoute allowed={FLEET_READ}>
              <EmployeeDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="employees"
          element={
            <RoleRoute allowed={FLEET_READ}>
              <EmployeesPage />
            </RoleRoute>
          }
        />
        <Route
          path="assignments"
          element={
            <RoleRoute allowed={FLEET_READ}>
              <AssignmentsPage />
            </RoleRoute>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
