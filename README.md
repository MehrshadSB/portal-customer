# Customer, Order Tracking & Support Platform

Production-oriented B2B manufacturing customer service portal, internal operations dashboard, and NestJS API built with Turborepo, pnpm, TypeScript, Next.js App Router, Drizzle ORM, PostgreSQL, Redis, BullMQ, Socket.IO, and S3-compatible storage.

## Workspace Layout

- `apps/portal` — Customer Service Portal (`http://localhost:3000`)
- `apps/admin` — Admin Operations Dashboard (`http://localhost:3001`)
- `apps/api` — NestJS REST API, Socket.IO gateway (`/realtime/portal`, `/realtime/admin`) & BullMQ workers (`http://localhost:4000`, Swagger at `/api/docs`)
- `packages/ui` — Shared Precision Industrial Blueprint UI components & tokens
- `packages/api-client` — Shared HTTP client (CSRF + 401 refresh lock + S3 presigned upload) & Socket.IO connector
- `packages/validators` — Pure Zod schemas shared by frontend forms & backend DTOs
- `packages/types` — Shared domain enums, permission keys, and API/WS contracts
- `packages/eslint-config` & `packages/typescript-config` — Shared linting & TypeScript presets

## Local Quickstart

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm build
pnpm db:migrate
pnpm db:seed
pnpm dev
```

### Seeded Development Accounts (Passwordless: SMS OTP / OIDC SSO)

- **Admin (`http://localhost:3001`)**: `+989120000001` (`admin@platform.local`)
- **Order Manager (`http://localhost:3001`)**: `+989120000002` (`orders@platform.local`)
- **Support Agent (`http://localhost:3001`)**: `+989120000003` (`support@platform.local`)
- **Customer Admin (`http://localhost:3000`)**: `+989120000004` (`buyer@apex-aero.local`, `Apex Aerospace Mfg`)

> In development (`SMS_PROVIDER=console`), requesting an OTP logs the 6-digit code to the API server console. Unprovisioned phone numbers and SSO identities are rejected (`403 PROFILE_NOT_PROVISIONED`) until an Admin creates their profile.

### Local Service Consoles

- **Swagger API Docs**: `http://localhost:4000/api/docs`
- **RustFS S3 Console**: `http://localhost:9011` (`rustfsadmin` / `rustfssecret123`)
- **Mailpit Email UI**: `http://localhost:8025`
- **Dozzle Logs & Container Terminals**: `http://localhost:8080`

## Dockerized Apps & Dozzle

To run the infrastructure (`postgres`, `redis`, `s3`, `mailpit`), all three apps (`api`, `portal`, `admin`), and Dozzle (`dozzle`) together in Docker:

```bash
cp .env.example .env
pnpm docker:up
```

If you only want infrastructure containers in Docker while running `pnpm dev` locally:

```bash
pnpm infra:up
pnpm dev
```
