# Feature Specification Blueprint (`features_listed.md`)

> Living prompt-style technical specification for recreating and verifying the Customer, Order Tracking & Support Platform. Updated alongside each implementation phase.

## 1. Core Architecture

- Implement a Turborepo + pnpm TypeScript monorepo containing `apps/portal` (Next.js App Router, `:3000`), `apps/admin` (Next.js App Router, `:3001`), and `apps/api` (NestJS REST + Socket.IO + BullMQ, `:4000`).
- Share pure contracts via `@portal/types`, `@portal/validators` (Zod), `@portal/api-client` (fetch + CSRF + 401 refresh mutex + Socket.IO), and `@portal/ui` (Tailwind v4 + Precision Industrial Blueprint design system).
- Persist all authoritative state in PostgreSQL via Drizzle ORM (`apps/api/src/infrastructure/database/schema`), use Redis 7 for refresh session families, rate limits, Socket.IO pub/sub, and BullMQ queues, and store private files in S3-compatible object storage (RustFS in development).

## 2. User Interface (UI)

- **Customer Portal (`apps/portal`)**: Implement a responsive sidebar/header shell (`AppShell`) with cool alabaster surfaces (`#F6F7F9`), crisp `1px` hairlines (`#DCE1E8`), `Plus Jakarta Sans` UI typography, and `JetBrains Mono` tabular IDs (`ORD-YYYY-NNNN`, `TCK-YYYY-NNNN`). Expose routes for `/login`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/` (Overview), `/orders`, `/orders/[orderId]`, `/tickets`, `/tickets/new`, `/tickets/[ticketId]`, `/documents`, `/team`, and `/profile`.
- **Admin Dashboard (`apps/admin`)**: Implement a high-density collapsible sidebar shell (`dense` mode) exposing routes for `/login`, `/` (Operations Dashboard), `/customers`, `/customers/[customerId]`, `/orders`, `/orders/new`, `/orders/[orderId]`, `/tickets`, `/tickets/[ticketId]`, `/documents`, `/employees`, `/departments`, `/audit-logs`, and `/settings`. Display an explicit amber warning surface (`--signal-amber-surface`) whenever composing internal notes or internal-only workflow updates.

## 3. Business Logic & Functional Requirements

- **Authentication & Surface Isolation**: Implement `POST /api/v1/auth/:surface/login` verifying `user_type` against `:surface` (`customer -> portal`, `employee -> admin`), Argon2id passwords, Redis rate limiting, surface-prefixed `HttpOnly` cookies (`portal_*` vs `admin_*`), CSRF double-submit validation, and rotating Redis refresh tokens with replay-detection family revocation.
- **RBAC & Tenant Isolation**: Enforce module+action permissions (`@RequirePermissions`) and `CustomerScopeGuard` across all endpoints; constrain `customer_*` actors strictly to their single `customer_id` membership (`UNIQUE(user_id)` on `customer_members`).
- **Custom Manufacturing Orders & Workflows**: Implement sequential `ORD-YYYY-NNNN` orders with optional `order_items` (part number, material, spec, quantity, unit), separate `operational_state` (`draft | active | on_hold | completed | cancelled`) from data-driven `order_workflow_statuses` (7 seeded stages), and append immutable `order_progress_events` projecting only `is_customer_visible = true` entries to customers.
- **Ticketing & Unified Conversations**: Provision a 1:1 `conversations` row for every ticket (`TCK-YYYY-NNNN`) and lazy 1:1 thread for orders; store replies and internal staff notes in `messages` (`visibility: public | internal`), stripping `internal` rows and `/realtime/admin` events from customer APIs and `/realtime/portal` sockets.
- **Presigned Document Vault**: Enforce 3-step upload (`presign-upload` -> direct S3 PUT -> `complete` magic-byte/head verification), private bucket ACLs, short-lived presigned GET downloads (`Content-Disposition: attachment`), and BullMQ orphan cleanup.
- **Notifications & Audit Trail**: Dispatch real-time Socket.IO `notification:new` events and BullMQ email jobs on status changes, ticket replies, assignments, and invites; persist before/after JSON diffs in `audit_logs` on all critical state mutations.

## 4. Data Persistence

- Maintain 26 normalized PostgreSQL tables across identity/RBAC (`users`, `auth_tokens`, `departments`, `employees`, `roles`, `permissions`, `role_permissions`, `employee_roles`), customers (`customers`, `customer_members`, `contacts`), orders/workflows (`order_workflows`, `order_workflow_statuses`, `order_workflow_transitions`, `orders`, `order_items`, `order_progress_events`), ticketing/messaging (`ticket_categories`, `tickets`, `conversations`, `conversation_participants`, `messages`), and platform services (`attachments`, `notifications`, `notification_preferences`, `audit_logs`), backed by PostgreSQL sequences (`customer_code_seq`, `employee_code_seq`, `order_number_seq`, `ticket_number_seq`).

## 5. API & Integration

- Expose versioned REST endpoints under `/api/v1` with Swagger documentation at `/api/docs`, standardized `{ data, meta }` and `{ error: { code, message, details, requestId } }` envelopes, `/api/v1/health/live` & `/api/v1/health/ready` probes, and Socket.IO namespaces `/realtime/portal` and `/realtime/admin`.
