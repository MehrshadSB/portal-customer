# ADR-002: Surface-Isolated HttpOnly Cookies & Redis Refresh Sessions

## Status
Accepted

## Context
- **Problem**: Both `apps/portal` (`:3000`) and `apps/admin` (`:3001`) communicate with `apps/api` (`:4000`) and Socket.IO gateways, and developers/QA tests frequently sign into both apps in the same browser.
- **Constraints**: Must prevent XSS token exfiltration, prevent CSRF, allow instant session revocation, and stop customer tokens from accessing admin namespaces or overwriting cookies.

## Options Considered
| Option | Pros | Cons | Complexity |
| :--- | :--- | :--- | :--- |
| Bearer JWT in `localStorage` | Simple cross-origin headers | Vulnerable to XSS, awkward Next.js SSR auth, no instant revocation | Low |
| Shared `HttpOnly` cookie names | Works across SSR & WS | Cookie collision on `localhost` between `:3000` and `:3001` | Low |
| **Surface-prefixed `HttpOnly` cookies (`portal_*` / `admin_*`) + Redis refresh families** | XSS-resistant, simultaneous Portal+Admin sessions, replay detection, instant logout-all | Requires explicit surface header/namespace + CSRF token | Medium |

## Decision
Issue short-lived JWT access tokens (`15m`, `aud: 'portal' | 'admin'`) and opaque rotated refresh tokens backed by Redis under surface-specific cookie names (`portal_access_token`, `portal_refresh_token`, `portal_csrf_token` vs `admin_access_token`, `admin_refresh_token`, `admin_csrf_token`), paired with Double-Submit `X-CSRF-Token` validation and separate Socket.IO namespaces (`/realtime/portal`, `/realtime/admin`).

## Rationale
Eliminates cross-surface session hijacking and `localhost` cookie clobbering while providing strong XSS protection and immediate revocation via Redis + `users.token_version`.

## Consequences
- **Positive**: Safe simultaneous multi-surface development/E2E testing, SSR-ready cookie forwarding, replay-attack family revocation.
- **Negative**: Every state-changing request from the browser must send `X-CSRF-Token`.
- **Mitigation**: Centralize CSRF header injection and single-flight 401 refresh handling once inside `@portal/api-client`.

## Revisit Trigger
Revisit if external OAuth2/SSO machine clients require third-party OAuth bearer tokens; add a dedicated client-credentials API gateway without weakening browser cookie isolation.
