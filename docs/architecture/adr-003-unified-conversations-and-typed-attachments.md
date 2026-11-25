# ADR-003: Unified Conversations, Dual-Visibility Messages & Typed Attachment FKs

## Status
Accepted

## Context
- **Problem**: Support tickets, custom manufacturing orders, and general customer threads all need threaded communication, attachments, and internal staff notes; attachments also belong to orders, progress milestones, tickets, or messages.
- **Constraints**: Avoid duplicated message tables (`TicketMessage` + `Message`), guarantee internal notes never leak to customers, and enforce PostgreSQL referential integrity on attachments.

## Options Considered
| Option | Pros | Cons | Complexity |
| :--- | :--- | :--- | :--- |
| Separate `ticket_messages` + `messages` + polymorphic `(entity_type, entity_id)` attachments | Quick initial guess | Duplicate schemas/UI/WS logic; no SQL FK constraints on attachments | Medium |
| **Unified `conversations` + `messages` (`visibility`) and typed nullable FKs on `attachments`** | Single messaging pipeline, SQL-enforced integrity, strict `public`/`internal` separation | Requires `CHECK` constraints for context exclusivity | Medium |

## Decision
Eliminate `TicketMessage` in favor of a 1:1 `conversations` row per ticket (`context_type = 'ticket'`) and per active order thread (`context_type = 'order'`), storing all replies and internal notes in `messages` (`visibility: 'public' | 'internal'`). Model `attachments` with typed nullable foreign keys (`customer_id`, `order_id`, `order_progress_event_id`, `ticket_id`, `message_id`) and a PostgreSQL `CHECK` constraint.

## Rationale
One conversation engine cleanly powers MVP Ticket/Order threads and Phase 2 standalone Inbox without schema migration, while typed foreign keys guarantee referential integrity and O(1) customer ownership checks.

## Consequences
- **Positive**: Zero duplicated messaging code, atomic file cleanup, and uniform Socket.IO room isolation (`conv:{id}:public` vs `conv:{id}:internal`).
- **Negative**: Adding a brand-new attachable entity later requires adding one nullable FK column via migration.
- **Mitigation**: Acceptable tradeoff for strong database-level integrity and query speed.

## Revisit Trigger
Revisit if the platform introduces >10 unrelated attachable entity types, at which point explicit join tables (`entity_attachments`) can replace sparse columns cleanly.
