# ADR-001: Separate Portal & Admin Next.js Applications with Modular NestJS API

## Status
Accepted

## Context
- **Problem**: The platform serves two fundamentally different user audiences—external B2B manufacturing customers and internal operations/support/production staff—requiring clean bundle isolation, distinct operational policies, and shared domain contracts.
- **Constraints**: Small-to-medium full-stack engineering team, Turborepo + pnpm monorepo, TypeScript end-to-end, need to ship MVP rapidly without microservices overhead.

## Options Considered
| Option | Pros | Cons | Complexity |
| :--- | :--- | :--- | :--- |
| Single `apps/web` Next.js app with route groups | Single frontend process | Shared client bundle risk, coupled deployments, path prefixes | Low |
| **Separate `apps/portal` + `apps/admin` + modular `apps/api`** | Strict source/bundle isolation, clean root URLs, independent deployment/WAF, shared UI & Zod contracts | Two Next.js dev servers locally | Medium |
| Full backend microservices | Independent service scaling | Premature distributed transactions & high ops overhead | High |

## Decision
Use two separate Next.js App Router applications (`apps/portal` on `:3000`, `apps/admin` on `:3001`) backed by a single modular-monolith NestJS API (`apps/api` on `:4000`, with a dedicated `worker.ts` entrypoint for BullMQ jobs), sharing `@portal/ui`, `@portal/api-client`, `@portal/validators`, and `@portal/types`.

## Rationale
Separating the frontend source trees removes any risk of internal admin workflows leaking into customer-facing client bundles while keeping backend transactions ACID inside a single PostgreSQL database and Drizzle repository layer.

## Consequences
- **Positive**: Zero accidental cross-surface routing, independent frontend scaling/security rules, clean `portal.*` and `admin.*` origins.
- **Negative**: Requires surface-scoped cookie names (`portal_*` vs `admin_*`) to avoid `localhost` cookie collisions during local dev/E2E.
- **Mitigation**: `packages/api-client` and `apps/api` enforce explicit surface isolation and JWT `aud` verification (see ADR-002).

## Revisit Trigger
Revisit backend extraction only if a heavy workload (e.g., CAD rendering or high-throughput telemetry ingestion) saturates API worker pools independently of transactional PostgreSQL operations.
