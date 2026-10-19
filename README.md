# Newtonite Ops

> Every request accounted for. Every action traceable.

An internal operations work-management app built for the Newtonite Software Engineering Challenge
("Operations Under Pressure"). Teams create work items, assign owners, move them through an enforced
workflow, request and decide approvals, discuss, and keep an audit trail. The emphasis is correctness
under concurrent use, not feature count.

See **[ENGINEERING_DECISIONS.md](./ENGINEERING_DECISIONS.md)** for the reasoning and trade-offs.

## Core features (implemented)

- Cookie-session login/logout, bcrypt password hashing, seeded demo accounts, login rate limiting.
- Teams with per-team roles (Manager / Member / Viewer) plus a platform Admin; authorization enforced on the backend.
- Work items: create, view, edit, assign/reassign, resolve, close, reopen; human-readable references (`OPS-1001`).
- Backend-enforced workflow transition table; approval-gated types cannot be resolved without an approved request.
- Approvals: request, list, approve/reject; duplicate and simultaneous decisions are handled (409).
- Comments, plus an append-only activity timeline written in the same transaction as each change.
- Optimistic concurrency (version column, 409 on stale writes), idempotency keys, atomic assignment.
- Dashboard with counts computed from the database and links into filtered lists.
- Server-side search, filtering, sorting and pagination; in-app notifications.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form, Zod, Lucide |
| Backend | Node.js, Express, TypeScript, Zod, Prisma |
| Database | **SQLite** (see Known limitations: the brief suggested PostgreSQL) |
| Tests | Vitest, Supertest (server); Vitest + React Testing Library (client) |

## Layout

```
server/  src/{routes,services,domain,middleware,validators,lib,config}  prisma/{schema.prisma,migrations,seed.ts}  tests/
client/  src/{pages,components,lib,test}
```

Request flow: route (auth + zod validation) → service (permission checks, workflow rules, one DB
transaction: state change + audit event + notification) → Prisma.

## Prerequisites

Node.js 20+ (developed on 22) and npm. No Docker needed.

## Setup from a fresh clone

```bash
npm install                      # installs both workspaces and generates the Prisma client
cp .env.example server/.env      # Windows: copy .env.example server\.env
npm run db:migrate:deploy        # creates server/prisma/dev.db from the versioned migration
npm run db:seed                  # demo data (this DELETES existing data in that database)
npm run dev                      # API on :3001, web app on :5173
```

Open http://localhost:5173. Health check: `GET http://localhost:3001/api/health`.

Other commands: `npm run build` (compile server + client), `npm run typecheck`,
`npm run db:reset` (`prisma migrate reset`: re-applies migrations and re-seeds).

### Environment variables (`.env.example`)

`DATABASE_URL` (SQLite file, relative to `server/prisma/`), `PORT`, `NODE_ENV`, `CLIENT_ORIGIN`
(CORS origin), `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `SESSION_TTL_HOURS`, `STALE_AFTER_HOURS`
(dashboard "not updated recently" threshold). Never commit a real `.env`.

## Tests

```bash
npm test             # server + client
npm run test:server  # Supertest integration tests; builds a fresh test.db from the real migration
npm run test:client
```

Server tests cover: authentication; cross-team access (IDOR) and viewer restrictions; workflow transitions
and approval bypass; stale-update 409; **simultaneous** assignment and **simultaneous** approval decisions;
duplicate approval decision; transaction rollback when the audit write fails; filters, cross-team filter
manipulation, priority ordering across pages, pagination; idempotency; input validation.

## Demo accounts

All passwords: `Password123!`

| Email | Role |
|---|---|
| admin@newtonite.local | Platform admin |
| priya.shah@newtonite.local | Engineering: Manager; Finance & Compliance: Viewer |
| alex.kim@newtonite.local | Engineering: Member; Customer Success: Member |
| maya.chen@newtonite.local | Customer Success: Manager |
| jordan.lee@newtonite.local | Customer Success: Member |
| casey.nguyen@newtonite.local | Customer Success: Viewer |
| sam.okonkwo@newtonite.local | Finance & Compliance: Manager |
| riley.patel@newtonite.local | Finance & Compliance: Member |
| inactive.user@newtonite.local | Deactivated account (Engineering member) |

Suggested walkthrough: log in as `riley.patel` and `sam.okonkwo` (Finance & Compliance) to see the
seeded pending approval: Riley cannot decide it (403), Sam can, and a repeat decision gets 409.
Open the same Engineering item in two browsers (one as `priya.shah`, one as `admin`), save an edit in the first,
then save a different edit in the second: it is rejected with a conflict message and offers to load the latest state.

## Example API usage

```bash
curl -c jar -H 'Content-Type: application/json' \
  -d '{"email":"priya.shah@newtonite.local","password":"Password123!"}' localhost:3001/api/auth/login
curl -b jar 'localhost:3001/api/work-items?status=BLOCKED&sort=priority_desc&page=1&pageSize=20'
# stale write: send the version you last read; a mismatch returns 409 and the current version
curl -b jar -X PATCH -H 'Content-Type: application/json' -d '{"version":1,"priority":"HIGH"}' \
  localhost:3001/api/work-items/<id>
```

Errors use one shape: `{ "error": { "code", "message", "details?" } }`
(400 validation, 401 unauthenticated, 403 forbidden, 404 not found/not visible, 409 conflict, 422 idempotency-key misuse).
List endpoints accept `page` and `pageSize` (default 30, maximum 100) and return `total` and `totalPages`.

## Verification status

Honest account of what was and wasn't run:

- **Run in my build environment:** all 39 server tests and 7 client tests passed; server typecheck and
  production build, client typecheck and production build passed; the seed script ran; a scripted HTTP
  walkthrough of stale update, role checks, approval decision/repeat and dashboard scoping behaved as described.
- **Caveat:** that environment could not download Prisma's native engines. I ran the suite through a
  libSQL driver adapter on a database built by applying `server/prisma/migrations/*/migration.sql`
  directly. **I have not run `prisma migrate deploy` or the stock Prisma engine**, and the migration SQL was
  written by hand, so `prisma migrate dev` might report schema drift. Please run `npm test` on your machine.
- **Not done:** I never opened the UI in a browser; the pages other than the work-item detail page have no
  component tests. No load testing has been performed.

## Known limitations

- **SQLite, not PostgreSQL.** Single writer; the schema provider is hard-coded. `docker-compose.yml` starts
  an unused Postgres container. Moving to Postgres is not done or tested (provider change, regenerated
  migration, case-insensitive search needs `mode: 'insensitive'`).
- **Search is `LIKE '%term%'`** on title/description: not index-assisted, will degrade at large scale
  (needs full-text search or trigram indexes). **Offset pagination** gets slower on very deep pages.
- **No real-time updates.** An open item re-fetches every 15 seconds and on window focus.
- **Idempotency:** two identical in-flight requests with the same key can both execute (state guards still
  make the second fail); keys are not pruned; only the item-creation form sends a key.
- **Approval reuse after reopen:** reopening and re-resolving an approval-gated item reuses the earlier approval.
- **Notifications are in-app only**, written synchronously in the action's transaction. No queue, outbox,
  retries, email or chat. The list is not paginated.
- **Comments cannot be edited or deleted** (deliberate; history is append-only).
- **Admin management is API create-only:** no update/deactivate endpoints for users or teams; the UI for these is minimal.
- Assignee eligibility is checked just before, not inside, the assignment transaction.
- CSRF protection relies on `SameSite=Lax` cookies, JSON bodies and a restricted CORS origin; there are no CSRF tokens.
- Workflow rules are code, not configurable. No Playwright end-to-end tests.
