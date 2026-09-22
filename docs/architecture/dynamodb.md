# DynamoDB access patterns (Phase 1)

## Table

Single operational table per environment: `fleet-{env}-operational` (see CDK).

## Keys

| Entity | PK | SK | GSI1PK | GSI1SK |
|--------|----|----|--------|--------|
| Tenant metadata | `TENANT#<tenantId>` | `META` | — | — |
| Tenant list index | `PLATFORM` | `TENANT#<tenantId>` | — | — |
| User profile | `TENANT#<tenantId>` | `USER#<userId>` | `USER#<cognitoSub>` | `META` |
| Audit (Phase 1 minimal) | `TENANT#<tenantId>` | `AUDIT#<iso>#<uuid>` | — | — |
| Vehicle (Phase 2) | `TENANT#<tenantId>` | `VEHICLE#<vehicleId>` | — | — |
| Driver (Phase 2) | `TENANT#<tenantId>` | `DRIVER#<driverId>` | — | — |
| Assignment (Phase 2) | `TENANT#<tenantId>` | `ASSIGNMENT#<assignmentId>` | — | — |
| Trip (Phase 3) | `TENANT#<tenantId>` | `TRIP#<tripId>` | — | — |
| Employee | `TENANT#<tenantId>` | `EMPLOYEE#<employeeId>` | — | — |
| Location | `TENANT#<tenantId>` | `LOCATION#<locationId>` | — | — |

**GSI1** resolves a Cognito `sub` to a user profile after login.

## Phase 2 assignments

Each assignment row is immutable history: `startTime`, optional `endTime`, and `status` (`ACTIVE`, `ENDED`, `CANCELLED`). Vehicle and driver items mirror the current assignment via `currentDriverId` / `currentVehicleId` for fast UI reads.

## Phase 3 trips

Trip rows link to an **active assignment**. Starting a trip sets driver `ON_TRIP` and vehicle `IN_TRIP`. Ending a trip returns both to `ASSIGNED` (assignment remains active). Location pings update `lastLatitude` / `lastLongitude` on the trip and vehicle.

Scheduled trips store `scheduledStartTime`, `scheduledEndTime`, `actualStartTime` when started, **pickup/destination coordinates**, **`routeDistanceKm`**, and on completion **`timeTakenMinutes`** (actual start → end) plus **`fuelRequiredLiters`** (entered when ending the trip). The web app shows a **route map** on trip detail and **Trip routes** in the sidebar.

Starting/ending a trip may update driver and vehicle status; **`lastLatitude` / `lastLongitude`** on trip and vehicle are updated when **`POST /trips/{id}/location`** is called (Phase 4 consumers — not used by Phase 3 admin UI).

## Phase 4 — live tracking & telemetry *(last implementation phase)*

- Append-only GPS history and live position on map
- High-frequency telemetry time series
- Admin UI for location ping / live map (optional); primary callers: mobile / IoT via `POST /trips/{id}/location`
