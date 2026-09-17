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

**GSI1** resolves a Cognito `sub` to a user profile after login.

## Phase 2+ expansion

Vehicle, driver, assignment, and trip items will use the same PK (`TENANT#<tenantId>`) with distinct SK prefixes (`VEHICLE#`, `DRIVER#`, `ASSIGNMENT#`, `TRIP#`, …).

**Telemetry** will move to a separate time-series table (partition by vehicle/trip + sort by timestamp) to avoid hot partitions and large item scans on the operational table.
