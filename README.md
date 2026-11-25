# Customer, Order Tracking & Support Platform

Production-oriented B2B manufacturing customer portal, internal operations dashboard, and NestJS API built with Turborepo, pnpm, TypeScript, Next.js App Router, Drizzle ORM, PostgreSQL, Redis, BullMQ, Socket.IO, and S3-compatible storage.

## Workspace Layout

- `apps/portal` — Customer Portal (`http://localhost:3000`)
- `apps/admin` — Admin Operations Dashboard (`http://localhost:3001`)
- `apps/api` — NestJS REST API, Socket.IO gateway & BullMQ workers (`http://localhost:4000`, Swagger at `/api/docs`)
- `packages/ui` — Shared Precision Industrial Blueprint UI components & tokens
- `packages/api-client` — Shared HTTP client (CSRF + 401 refresh lock) & Socket.IO connector
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

### Seeded Development Accounts (Password: `DevPassword123!`)

- **Admin (`http://localhost:3001`)**: `admin@platform.local`
- **Order Manager (`http://localhost:3001`)**: `orders@platform.local`
- **Support Agent (`http://localhost:3001`)**: `support@platform.local`
- **Customer Admin (`http://localhost:3000`)**: `buyer@apex-aero.local` (`Apex Aerospace Mfg`)

### Local Service Consoles

- **Swagger API Docs**: `http://localhost:4000/api/docs`
- **RustFS S3 Console**: `http://localhost:9011` (`rustfsadmin` / `rustfssecret123`)
- **Mailpit Email UI**: `http://localhost:8025`
