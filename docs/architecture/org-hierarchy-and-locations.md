# Organization hierarchy and locations

## Model

- **Tenant** — top-level customer org (e.g. Prime Logistics).
- **Location** — branch/site (`LOCATION#` SK): Kolkata, Delhi, Siliguri, etc. One **Primary** location is created per tenant automatically.
- **Users** — Cognito role + profile fields `locationId`, `reportsToUserId`.
- **Employees** — persona includes **Location Head**; drivers keep `driverManagerUserId` (Fleet Manager).

## Hierarchy

```text
Fleet Admin (tenant-wide, no locationId)
  └── Location Head (per location, reportsTo → Fleet Admin)
        └── Fleet Manager (per location, reportsTo → Location Head)
              └── Driver (driverManagerUserId → Fleet Manager)
```

## Operational scoping

Vehicles, drivers, assignments, trips, and employees carry **`locationId`**. List/read APIs filter by the caller’s allowed location(s). Fleet Admin and Platform Admin see all locations in the tenant.

## APIs

- `GET/POST /api/v1/locations`, `GET/PATCH /locations/{id}`, `POST …/set-primary`
- `GET /api/v1/me/org-chart?tenantId=` — role-based tree for Profile UI

## Migration

Existing tenants receive a **Primary** location on first access; `backfill_tenant_location_ids` assigns missing `locationId` on fleet entities.
