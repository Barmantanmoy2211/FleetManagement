# Fleet & Driver Intelligence Platform

Multi-tenant fleet and driver intelligence platform — Phase 1 (Foundation).

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

## Phase 1 acceptance checklist

- [ ] Platform admin can create a tenant and see it in the list
- [ ] Tenant A user cannot access tenant B data
- [ ] `/api/v1/me` returns correct user, tenant, and role after login
- [ ] Health succeeds via API Gateway in deployed dev stack

See [docs/architecture](docs/architecture/) for auth and DynamoDB patterns.
