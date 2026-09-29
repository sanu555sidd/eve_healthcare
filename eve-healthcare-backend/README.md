# EVE Healthcare — Diagnostic Booking & Payments Backend

A backend service for diagnostic test bookings and simulated payments, built with **Node.js, Express, and PostgreSQL**, with **Redis** used for caching, rate limiting, and a background retry queue.

## Tech Stack

| Concern              | Choice                                   |
|----------------------|-------------------------------------------|
| Runtime / Framework  | Node.js (>=18) + Express                  |
| Database             | PostgreSQL (raw SQL via `pg`, no ORM)     |
| Auth                 | JWT (`jsonwebtoken`) + `bcryptjs` hashing |
| Caching              | Redis (`ioredis`)                         |
| Rate limiting        | `express-rate-limit` + `rate-limit-redis` |
| Background jobs      | `bullmq` (Redis-backed queue) for webhook retries |
| Logging              | `winston` (structured JSON logs)          |
| Validation           | `express-validator`                       |
| Tests                | `jest` + `supertest` + `ioredis-mock`     |

## 1. Running the project locally

### Option A — Docker Compose (recommended, zero local setup)

```bash
docker compose up --build
```

This starts PostgreSQL, Redis, and the app. The app container automatically runs the schema migration (`db/migrate.js`) before starting the server. The API will be available at `http://localhost:3000`.

### Option B — Run manually

Prerequisites: Node.js 18+, a running PostgreSQL instance, a running Redis instance.

```bash
npm install
cp .env.example .env        # edit DATABASE_URL / REDIS_URL / JWT_SECRET as needed
npm run migrate             # creates tables from db/schema.sql
npm start                   # or `npm run dev` for auto-reload
```

Health check: `GET http://localhost:3000/health` → `{ "status": "ok" }`

### Running tests

Tests are fully self-contained — they mock PostgreSQL (`pg`) and Redis (`ioredis` → `ioredis-mock` via Jest's `moduleNameMapper`) and the BullMQ queue/worker (manual mock in `__mocks__/bullmq.js`), so **no live database, Redis, or network access is required** to run them:

```bash
npm install
npm test                    # runs unit + integration tests
npm run test:coverage       # with coverage report
```

## 2. Environment variables

| Variable                          | Default                                                        | Purpose |
|------------------------------------|----------------------------------------------------------------|---------|
| `PORT`                              | `3000`                                                          | HTTP port |
| `DATABASE_URL`                      | `postgres://postgres:postgres@localhost:5432/eve_healthcare`    | Postgres connection string |
| `JWT_SECRET`                        | `change_this_secret`                                            | JWT signing secret — **change in production** |
| `JWT_EXPIRES_IN`                    | `1d`                                                             | Token lifetime |
| `REDIS_URL`                         | `redis://localhost:6379`                                        | Redis connection string |
| `PAYMENT_FAILURE_RATE`              | `0.2`                                                            | Probability (0–1) a simulated payment fails |
| `WEBHOOK_FAILURE_SIMULATION_RATE`   | `0.15`                                                           | Probability (0–1) a webhook hits a simulated transient error (to exercise retries) |

## 3. Database / schema design

```
users
 ├─ id, name, email (unique), password_hash, created_at

diagnostic_centres
 ├─ id, name, location, created_at

diagnostic_tests
 ├─ id, centre_id → diagnostic_centres, name, price, created_at

bookings
 ├─ id, user_id → users, test_id → diagnostic_tests, centre_id → diagnostic_centres,
 │  appointment_time, amount, status ∈ {PENDING, CONFIRMED, FAILED, CANCELLED},
 │  created_at, updated_at

payments
 ├─ id, booking_id → bookings, provider_payment_id (uuid), amount,
 │  status ∈ {SUCCESS, FAILED}, created_at

webhook_events
 ├─ id, event_id (UNIQUE), booking_id, payload (jsonb),
 │  status ∈ {PENDING, PROCESSED, FAILED}, attempts, last_error,
 │  processed_at, created_at
```

**Why a `webhook_events` table?** It is the backbone of idempotent webhook handling: the `UNIQUE` constraint on `event_id` guarantees that no matter how many times the same event is delivered, only one row can ever be inserted for it. A duplicate delivery hits `ON CONFLICT (event_id) DO NOTHING`, which returns zero rows, and the app treats that as "already processed" without touching the booking again. The table also tracks `attempts` / `last_error` so failed events can be safely retried without double-applying their effect.

**Concurrency safety.** Any code path that mutates a booking (`cancelBooking`, `simulatePayment`, `processWebhookEvent`) opens an explicit transaction and takes a row lock with `SELECT ... FOR UPDATE` before checking/changing state. This prevents races such as a webhook and a direct `/payments/` call both trying to confirm the same booking at once.

## 4. API endpoints

Base URL: `http://localhost:3000/api`

### Auth

| Method | Path             | Auth | Body |
|--------|------------------|------|------|
| POST   | `/auth/signup`   | –    | `{ "name", "email", "password" }` |
| POST   | `/auth/login`    | –    | `{ "email", "password" }` |

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"password123"}'

# => { "user": { "id": 1, "name": "Jane Doe", "email": "jane@example.com", ... }, "token": "<jwt>" }
```

All endpoints below that require auth expect `Authorization: Bearer <jwt>`.

### Diagnostic centres & tests

| Method | Path                          | Auth | Notes |
|--------|-------------------------------|------|-------|
| GET    | `/centres?page=&limit=`       | –    | Paginated, Redis-cached |
| GET    | `/centres/:id`                | –    | |
| POST   | `/centres`                    | JWT  | `{ "name", "location" }` |
| GET    | `/centres/:id/tests?page=&limit=` | – | Paginated, Redis-cached |
| POST   | `/centres/:id/tests`          | JWT  | `{ "name", "price" }` |
| GET    | `/tests?page=&limit=`         | –    | All tests across centres |
| GET    | `/tests/:id`                  | –    | |

```bash
curl -X POST http://localhost:3000/api/centres \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"name":"City Diagnostics","location":"MG Road, Bengaluru"}'

curl -X POST http://localhost:3000/api/centres/1/tests \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"name":"Complete Blood Count","price":499}'

curl "http://localhost:3000/api/centres?page=1&limit=10"
```

### Bookings (auth required)

| Method | Path                    | Notes |
|--------|-------------------------|-------|
| POST   | `/bookings`              | `{ "testId", "appointmentTime" }` — appointment must be a valid, future ISO8601 date |
| GET    | `/bookings?page=&limit=` | Only the caller's own bookings |
| GET    | `/bookings/:id`          | 403 if it belongs to another user |
| PATCH  | `/bookings/:id/cancel`   | 409 if already CONFIRMED/CANCELLED |

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"testId":1,"appointmentTime":"2026-10-05T09:00:00.000Z"}'
```

### Payments

| Method | Path               | Auth | Notes |
|--------|--------------------|------|-------|
| POST   | `/payments`         | JWT  | `{ "bookingId" }` — simulates a synchronous payment attempt |
| POST   | `/payments/webhook` | –    | `{ "eventId", "bookingId", "status" }` — simulated async provider callback, **idempotent** |

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"bookingId":1}'

curl -X POST http://localhost:3000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -d '{"eventId":"evt_abc123","bookingId":1,"status":"SUCCESS"}'
# Sending the exact same body again returns 200 "Event already processed (idempotent)"
# and does not touch the booking a second time.
```

## 5. Edge cases handled

- **Invalid requests** — every route validates its inputs with `express-validator`; malformed bodies/params return `400` with a field-level error list.
- **Repeated webhook events** — deduplicated via the `webhook_events.event_id` unique constraint; duplicates are a safe no-op (`200`, no state change).
- **Invalid booking IDs** — non-integer IDs fail validation (`400`); well-formed but non-existent IDs return `404`.
- **Failed payments** — the booking transitions to `FAILED` (not left `PENDING`); a failed booking cannot be paid for again until the business decides to allow a retry flow (currently `409` on `PENDING`-only guard, which is intentional — see "improvements" below).
- **Unauthorized access** — `authenticate` middleware rejects missing/invalid JWTs (`401`); booking/payment ownership is checked in the service layer (`403`) so users can never read, cancel, or pay for someone else's booking.
- **Race conditions** — row-level locks (`SELECT ... FOR UPDATE`) inside DB transactions prevent two concurrent requests (e.g. a webhook and a manual payment) from double-confirming the same booking.
- **Transient webhook failures** — a simulated failure path (`WEBHOOK_FAILURE_SIMULATION_RATE`) is retried automatically via a BullMQ-backed queue with capped exponential backoff, up to 5 attempts, instead of silently dropping the event.

## 6. Bonus features implemented

- ✅ **Pagination** — `page`/`limit` query params on all list endpoints (`utils/pagination.js`), with sane defaults and an upper bound to prevent abuse.
- ✅ **Rate limiting** — Redis-backed, per-route tiers: a generous global limiter, a strict limiter on `/auth/*` (to slow brute-forcing), and a dedicated limiter on `/payments/*`.
- ✅ **Redis caching** — `GET /centres`, `GET /centres/:id/tests`, and `GET /tests` responses are cached per page/limit combination; any write (creating a centre/test) invalidates the relevant cache keys.
- ✅ **Unit & integration tests** — `tests/unit` covers pure logic (pagination, auth service); `tests/integration` drives the Express app end-to-end with `supertest` against a mocked database, covering auth, bookings, payments, and webhook idempotency/edge cases.
- ✅ **Structured logging** — `winston` JSON logs with a per-request correlation ID, request/response summaries, and contextual fields on every warn/error (booking id, event id, etc).
- ✅ **Retry handling for webhook processing** — failed webhook processing attempts are persisted (`webhook_events.attempts`/`last_error`) and re-queued via BullMQ with exponential backoff (capped at 30s) until they succeed or exhaust `MAX_ATTEMPTS` (5).

Docker & docker-compose are also included so the whole stack (Postgres + Redis + app) runs with one command.

## 7. Important assumptions

- A single user role exists; there's no separate "admin" role, so any authenticated user can create centres/tests. In a real product this would be gated by an `is_admin` flag or a separate staff-auth flow.
- "Payment" is entirely simulated: `POST /payments` immediately resolves SUCCESS/FAILED based on `PAYMENT_FAILURE_RATE`, and `POST /payments/webhook` simulates the provider's asynchronous callback. Both paths update the same `bookings`/`payments` tables and are mutually consistent thanks to row locking.
- A booking can only be paid for while it is `PENDING`. If a payment attempt fails, the booking moves to `FAILED` rather than back to `PENDING` — this makes the state machine simpler and auditable, at the cost of not supporting automatic retries on the same booking (see below).
- `appointmentTime` must be in the future at creation time; no double-booking/slot-capacity logic is enforced (out of scope for this assignment).
- Money is stored as `NUMERIC(10,2)` and passed through the API as strings from Postgres to avoid floating-point rounding issues.

## 8. What I'd improve with more time

- Allow a `FAILED` booking to be retried (create a fresh payment attempt against the same booking) rather than requiring a brand-new booking.
- Add an `is_admin` role and protect centre/test creation behind it; add ownership checks so only the creating admin can edit a centre.
- Add OpenAPI/Swagger docs generated from the route definitions.
- Add a dead-letter queue (or an alert) for webhook events that exhaust `MAX_ATTEMPTS`, plus a small admin endpoint to inspect/replay them.
- Add database-level integration tests (against a real ephemeral Postgres via `testcontainers`) in addition to the current mocked-DB tests, to catch SQL/constraint issues the mocks can't.
- Add request-body size limits and stricter CORS origin allow-listing for production.
