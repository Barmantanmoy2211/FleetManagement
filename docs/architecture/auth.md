# Authentication (Phase 1)

## Flow

1. React web authenticates against **Amazon Cognito** (SRP / email password).
2. The SPA sends **Cognito access tokens** as `Authorization: Bearer` to API Gateway.
3. **HTTP API JWT authorizer** validates issuer and signature before invoking Lambda.
4. FastAPI reads claims from API Gateway (`ApiGatewayJwtMiddleware`) or validates JWT locally when not behind API Gateway.
5. **Local dev** can set `SKIP_JWT_VERIFY=true` and pass `X-Dev-User` JSON for tests.

## Claims

| Claim | Usage |
|-------|--------|
| `sub` | Cognito user ID (`userId`) |
| `email` | Display / audit |
| `cognito:groups` | Maps to application role (highest precedence group wins) |
| `custom:tenant_id` | Tenant scope for all non–platform-admin users |

Platform administrators may have no tenant; tenant-scoped APIs require `tenantId` in query/body when acting as platform admin.

## Roles (Cognito groups)

- `PlatformAdmin` — tenant CRUD, cross-tenant user creation (with explicit `tenantId`)
- `FleetAdmin` — users within own tenant
- `FleetManager`, `Driver`, `Viewer` — reserved for later phases

Authorization is enforced in FastAPI dependencies and services (never trust client-supplied tenant IDs for access control).
