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

**GSI1** resolves a Cognito `sub` to a user profile after login.

## Phase 2 assignments

Each assignment row is immutable history: `startTime`, optional `endTime`, and `status` (`ACTIVE`, `ENDED`, `CANCELLED`). Vehicle and driver items mirror the current assignment via `currentDriverId` / `currentVehicleId` for fast UI reads.

## Phase 3+ expansion

Trip items will use `TRIP#` under the same tenant PK.

**Telemetry** will move to a separate time-series table (partition by vehicle/trip + sort by timestamp) to avoid hot partitions and large item scans on the operational table.
