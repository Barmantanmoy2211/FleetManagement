# Fleet & Driver Intelligence Platform

Multi-tenant fleet and driver intelligence platform — **Phase 3 trips & route maps** (Phase 1 foundation, Phase 2 fleet + employees). **Organization & locations** (multi-site hierarchy, location-scoped fleet ops, Profile org chart). **Phase 4 (last)** adds live GPS and telemetry.

## Monorepo layout

| Path | Purpose |
|------|---------|
| `apps/web` | React admin web application |
| `services/backend` | FastAPI backend (Lambda + local uvicorn) |
| `packages/*` | Shared TypeScript types, API client, validation |
| `infrastructure/cdk` | AWS CDK (Cognito, API Gateway, Lambda, DynamoDB) |
| `docs/architecture` | Auth and data model notes |

## Prerequisites

- Node.js 20+
- Python 3.11+
- AWS CLI configured (for deploy)
- AWS CDK CLI (`npm install -g aws-cdk`)
- Python 3.11+ on PATH (CDK bundles the API Lambda with local `pip`; Docker is optional)

## Quick start (local)

```bash
npm install
cd services/backend && pip install -r requirements.txt && cd ../..

# Terminal 1 — API (set env or use .env — see services/backend/.env.example)
npm run dev:api

# Terminal 2 — Web (copy apps/web/.env.example to .env.local)
npm run dev:web
```

## Deploy (dev)

**One-time per account + region** (required before first deploy):

```bash
cd infrastructure/cdk
npm install
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/ap-south-1
```

Use your account ID from `aws sts get-caller-identity`. If deploy fails with  
`SSM parameter /cdk-bootstrap/hnb659fds/version not found`, bootstrap has not been run in that region.

Then deploy:

```bash
npx cdk deploy FleetFoundation-dev --context env=dev
```

After deploy, copy stack **Outputs** into `apps/web/.env.local`:

- `VITE_API_URL` ← `ApiUrl`
- `VITE_COGNITO_USER_POOL_ID` ← `UserPoolId`
- `VITE_COGNITO_CLIENT_ID` ← `UserPoolClientId`

Create the first **PlatformAdmin** in Cognito (console or CLI), add to `PlatformAdmin` group, set a permanent password. Tenant and user management are then available in the web UI.

### Invited user login

1. As **PlatformAdmin** or **FleetAdmin**, invite the user on **Users** (pick tenant if you are platform admin).
2. Cognito sends an **invitation email** with a **temporary password** (no email is sent when `SEND_INVITE_EMAIL=false` in local API config).
3. The user opens the email, goes to the login page (`http://localhost:5173/login` in dev), and signs in with email + temporary password.
4. They set a **new password** when prompted (pool rules: 10+ chars, upper, lower, number).

**Email delivery:** Dev uses Cognito’s default mail (daily limits; may land in spam). For production, configure **Amazon SES** on the user pool in CDK (`webLoginUrl` context for the link in the email body).

If email is disabled locally, the UI may show the temporary password once for manual sharing.

### Local API without AWS

```bash
cd services/backend
copy .env.example .env
# SKIP_JWT_VERIFY=true — use X-Dev-User header (see tests) or disable for real JWT
python -m uvicorn app.main:app --reload --port 8000
```

## Phase 2 — Fleet management

API (tenant-scoped, JWT or dev headers):

| Method | Path | Roles |
|--------|------|--------|
| GET/POST | `/api/v1/vehicles` | Read: all fleet roles; write: PlatformAdmin, FleetAdmin |
| GET/PATCH | `/api/v1/vehicles/{id}` | Same |
| GET | `/api/v1/drivers` | Read: all fleet roles |
| GET | `/api/v1/drivers/import-candidates` | FleetAdmin, PlatformAdmin |
| POST | `/api/v1/drivers/sync-from-users` | Import selected driver users (body: `userIds`) |
| GET/PATCH | `/api/v1/drivers/{id}` | Read / update (no manual create) |
| GET/POST | `/api/v1/assignments` | Read: all fleet roles; assign/end: PlatformAdmin, FleetAdmin, FleetManager |
| POST | `/api/v1/assignments/{id}/end` | Assign roles |

Web: **Vehicles**, **Drivers**, **Assignments** in the sidebar. Platform admins choose a tenant first.

### Phase 2 acceptance checklist

- [ ] Fleet admin can import driver profiles from Users (role Driver) for their tenant
- [ ] Fleet manager can assign an available driver to an available vehicle
- [ ] Ending an assignment returns driver/vehicle to `AVAILABLE` and keeps history
- [ ] Tenant B admin cannot list tenant A vehicles (`tenantId` query blocked)

## Organization & locations

Tenant **locations** (sites/branches), reporting hierarchy (**Fleet Admin → Location Head → Fleet Manager → Driver**), **location-scoped** vehicles/drivers/assignments/trips/employees, and **Profile → Organization hierarchy** org chart. See [docs/architecture/org-hierarchy-and-locations.md](docs/architecture/org-hierarchy-and-locations.md).

| Method | Path | Notes |
|--------|------|--------|
| GET/POST | `/api/v1/locations` | CRUD for tenant sites |
| GET | `/api/v1/me/org-chart` | Role-based hierarchy tree |

Redeploy CDK once to add Cognito group `LocationHead`.

## Phase 3 — Trips & route maps

Trips are created from an **active assignment** with a **scheduled window**, then **started** explicitly. Overlapping trips on the same assignment are blocked. Times in the web app use the user’s **Profile → Time zone** (default `Asia/Kolkata`).

Pickup and destination coordinates plus **driving route distance** (`routeDistanceKm`) are stored on the trip; the admin UI shows a **route map** (not live vehicle tracking).

| Method | Path | Roles |
|--------|------|--------|
| GET | `/api/v1/trips` | Read: all fleet roles (`activeOnly`, `openOnly`, `assignmentId` query params) |
| POST | `/api/v1/trips` | Create scheduled trip (`assignmentId`, schedule, pickup/destination lat/lng → `routeDistanceKm`) |
| GET | `/api/v1/trips/{id}` | Read |
| PATCH | `/api/v1/trips/{id}` | Edit schedule while `SCHEDULED`; update route coords on `SCHEDULED` or `IN_PROGRESS` |
| POST | `/api/v1/trips/{id}/start` | Start trip (sets `actualStartTime`) |
| POST | `/api/v1/trips/{id}/end` | End trip: body `{ fuelRequiredLiters }` required to complete; sets `timeTakenMinutes` from actual start → end |
| PATCH | `/api/v1/me` | Update profile `timeZone` |

Web: **Trips**, **Trip detail** (Details \| Route map \| Assignment), **Trip routes** (pickup → destination overview).

### Phase 3 acceptance checklist

- [ ] Fleet manager creates a trip with pickup/destination; `routeDistanceKm` is stored
- [ ] Route map shows pickup (green) and destination (red) with driving distance on OpenStreetMap
- [ ] Ending an in-progress trip requires fuel (L); time taken is stored from actual start to end
- [ ] Start/end trip updates driver and vehicle status correctly
- [ ] Tenant B user cannot read tenant A trips (`403` on cross-tenant `tenantId`)

## Phase 4 — Live tracking & telemetry *(last implementation phase)*

Implement **after** Phase 3 is accepted. Not in scope for the current admin web release.

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/v1/trips/{id}/location` | GPS ping — **API exists today**; admin UI and history **Phase 4** |

Planned work:

- Live GPS tracking on map (current position, not just planned route)
- Location history (append-only trail / time series)
- High-frequency telemetry ingestion and **Telemetry history** in the web UI
- Mobile / IoT clients calling `POST /trips/{id}/location` (admin ping UI optional)

Phase 3 intentionally does **not** include live tracking UI or telemetry dashboards.

## Phase 1 acceptance checklist

- [ ] Platform admin can create a tenant and see it in the list
- [ ] Tenant A user cannot access tenant B data
- [ ] `/api/v1/me` returns correct user, tenant, and role after login
- [ ] Health succeeds via API Gateway in deployed dev stack

See [docs/architecture](docs/architecture/) for auth and DynamoDB patterns.
