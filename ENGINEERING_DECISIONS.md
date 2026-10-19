# Engineering Decisions

This document describes what the code **actually does**. Where something is not built, it says so.
File references are relative to the repository root.

## 1. Data model and architecture: a modular monolith on a relational schema

**Problem.** Operational work involves people, teams, a lifecycle, approvals, discussion and an
audit trail. These facts reference each other and must stay consistent.

**Approach.** One Express API (`server/`) plus one React SPA (`client/`), on a relational schema
(`server/prisma/schema.prisma`): `User`, `Team`, `TeamMembership` (an explicit join table carrying the
per-team role), `WorkItem`, `Comment`, `ActivityEvent`, `Approval`, `Notification`, `Session`,
`IdempotencyKey` and `Counter`. Server code is layered: routes (HTTP + zod validation) → services
(business rules, transactions) → Prisma. Workflow and permission rules are pure functions in
`server/src/domain/`.

**Why.** Almost every action needs multi-row atomicity (item + audit event + notification). One
database transaction provides that directly; separate services would need distributed coordination.
Foreign keys use `Restrict` for history (`creator`, `actor`, `team`), so deleting a user or team cannot
erase audit history; users and teams are deactivated (`isActive`) rather than deleted. Statuses,
priorities and event types are enums. Indexes cover the list filters (status, priority, team,
assignee, updatedAt, dueAt, type, createdAt, plus composites). Reference numbers (`OPS-1001`, ...) come
from a `Counter` row incremented inside the create transaction.

**Alternatives.** Microservices (rejected: no benefit at this scale, large cost). Event sourcing
(rejected: more machinery than needed; `ActivityEvent` already gives the audit view required).

**Trade-offs and limitations.**
- **The database is SQLite, not PostgreSQL.** The challenge suggested PostgreSQL. SQLite was chosen so a
  reviewer can run the project without Docker. The schema's `provider` is hard-coded to `sqlite`;
  moving to Postgres means changing the provider and regenerating the migration, which I did **not**
  do or test. SQLite allows one writer at a time, which is not appropriate for the stated scale of
  thousands of concurrent users. `docker-compose.yml` starts a Postgres container that the application
  does not currently use.
- Enum columns are text on SQLite, so they do not sort meaningfully. `priorityRank` (1-4) is a
  denormalised copy of `priority`, maintained on create/update, so the database can sort by priority
  correctly across pages.

## 2. Authorization: team-scoped roles enforced in the service layer

**Problem.** Different people may do different things, and a user must never reach another team's work
by guessing an ID.

**Approach.** Two role levels: `User.platformRole` (`ADMIN` | `USER`) and `TeamMembership.role`
(`MANAGER` | `MEMBER` | `VIEWER`). Every service function loads the resource and calls
`assertTeamAccess` (`server/src/domain/permissions.ts`). Non-members receive **404, not 403**, so the
existence of other teams' items is not revealed. Within a team:

| Action | Manager | Member | Viewer |
|---|---|---|---|
| Read items, comments, history | yes | yes | yes |
| Create item, add comment | yes | yes | no |
| Edit title / description / priority / due date | yes | only items assigned to them | no |
| Assign / reassign | yes | no | no |
| Status transitions | yes | if assignee, or item is unassigned | no |
| Close, reopen | yes | no | no |
| Request approval | yes | if assignee | no |
| Decide approval | yes, but **not on their own request** | no | no |

`ADMIN` may do everything (including deciding their own approval request). List, search, dashboard,
activity, approval and notification queries are **scoped inside the database query**
(`teamId IN (user's teams)`), not filtered afterwards. Assignees must be active members of the owning
team. Frontend controls are hidden for convenience only; the tests call the API directly.

**Alternatives.** A generic policy engine / RBAC library (rejected: three team roles and about ten rules
do not justify it).

**Limitations.** User and team management exists only as API *create* endpoints (no update or
deactivate endpoint). Authorization is evaluated before the version check, so an unauthorized user
gets 403, never 409.

## 3. Concurrent updates: optimistic concurrency with an atomic conditional write

**Problem.** Two people edit or assign the same item; one must not silently overwrite the other.

**Approach.** `WorkItem.version`. Clients send the version they last saw. `mutateByVersion`
(`server/src/services/workItemService.ts`) runs a single `UPDATE ... WHERE id = ? AND version = ?` that
also increments the version. If zero rows match, someone else wrote first and the API returns **409**
with the current version in `details`. There is no read-then-write window: the check *is* the write.
The same function guards edits, assignment, every status transition and approval requests.

Approval decisions use the same idea on a different column: `UPDATE approval ... WHERE id = ? AND
status = 'PENDING'`. Of two simultaneous deciders exactly one matches. `Approval.pendingKey` is unique
and set to the work item id while pending, so the database itself prevents two pending approvals on one
item.

*Duplicate operations.* Assigning to the current assignee is a no-op with no audit event. A no-op edit
(for example an identical due date) neither bumps the version nor logs an event. A repeated approval
decision returns 409. Requests may carry an `Idempotency-Key` header
(`server/src/middleware/idempotency.ts`); the web client sends one when creating an item. Only 2xx
results are stored, and a key used on one endpoint cannot be replayed on another (422).

*Client side.* The detail page sends the version the user **started editing from**, not the latest
polled version, and sends only the fields the user changed. It re-fetches every 15 seconds, warns when
the item changed under an edit, and on 409 offers "discard my edits and load latest". There are no
optimistic UI updates, so there is nothing to roll back: the server response is the source of truth.

**Alternatives.** Pessimistic row locks (rejected: they would be held across human think-time).
Last-write-wins (rejected: it is exactly the failure described). WebSockets (not worth it at this scope).

**Limitations.** Two *simultaneous, in-flight* requests with the same idempotency key can both run;
the version and status guards still make the second fail, but it will not replay the first result.
Stored idempotency keys are never pruned. Assignee eligibility is checked just before, not inside, the
transaction.

## 4. Workflow, audit history and transactions

**Problem.** Status must follow rules, and every meaningful change must be traceable and consistent with
the state it describes.

**Approach.** An explicit table (`ALLOWED_TRANSITIONS`, `server/src/domain/workflow.ts`):

```
OPEN              -> IN_PROGRESS, CLOSED
IN_PROGRESS       -> BLOCKED, IN_REVIEW, AWAITING_APPROVAL, RESOLVED
BLOCKED           -> IN_PROGRESS
IN_REVIEW         -> IN_PROGRESS, AWAITING_APPROVAL, RESOLVED
AWAITING_APPROVAL -> (none; only an approval decision may leave this state)
RESOLVED          -> CLOSED, IN_PROGRESS   (reopen)
CLOSED            -> IN_PROGRESS           (reopen)
```

`PATCH` cannot change status. Payment investigations, compliance requests and production incidents
**cannot be resolved unless their latest approval is APPROVED**. Approving moves the item to
`IN_REVIEW`; rejecting returns it to `IN_PROGRESS`.

Each mutation runs in one `prisma.$transaction` containing the conditional update, the `ActivityEvent`
row(s) and any `Notification` rows. If any statement fails everything rolls back; a test proves this by
making the audit insert fail with a database trigger. Events and timestamps are generated on the server
from the authenticated session. There is no API to edit or delete an event or a comment.

**Alternatives.** Free-form status with UI-only rules (rejected). Writing audit events after commit
(rejected: a crash would leave state with no history).

**Limitations.** The transition table is code, not configuration. After a reopen, re-resolving an
approval-gated item reuses the earlier approval rather than requiring a fresh one.

## 5. Synchronous by design, and what was deliberately not built

**Problem.** The brief invites asynchronous processing where it improves the design.

**Approach.** **Everything is synchronous.** In-app notifications are rows written in the *same
transaction* as the action that causes them, so they cannot be lost or duplicated independently of it.
Implemented types: assigned, reassigned, approval requested, approval decided, critical item blocked.
There is no queue, worker, retry loop or email/chat delivery.

**Why.** A half-built queue is worse than none. Because the notification is part of the transaction,
the usual questions (lost, duplicated, delayed) have a simple answer. The cost is that a slow
notification write slows the request.

**Intentionally deferred.** PostgreSQL support and load testing; real-time push; full-text search
(search is `LIKE '%q%'` on title/description, not index-assisted); cursor pagination (offset pagination,
capped at 100 rows per page); an outbox with workers for external delivery; comment editing; team and
user update endpoints; Playwright end-to-end tests.

## What the tests protect

`server/tests/` drive the real HTTP app with Supertest: authentication and sessions; cross-team access
and viewer restrictions; valid and invalid transitions and approval-bypass attempts; stale-update 409;
*simultaneous* assignment (exactly one winner, one audit event); *simultaneous* approval decisions
(exactly one winner); duplicate decision returns 409; rollback when the audit write fails; filter
combination and cross-team filter manipulation; cross-page priority ordering and pagination metadata;
idempotency replay and key misuse; malformed input returns 400 rather than 500.
`client/src/pages/WorkDetailPage.test.tsx` and `client/src/lib/api.test.ts` protect the edit and
conflict behaviour from decision 3.
