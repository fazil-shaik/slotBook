# AI Collaboration Log (`AI_LOG.md`)

This log documents the usage of AI coding assistance during the design, development, and testing of **Slotbook**.

---

## 1. Approach & Collaboration Strategy
- **Pair Programming Model**: AI was utilized as an accelerated pair programmer for scaffolding, type definitions, SQL migration authoring, test scenario drafting, and algorithmic boundary condition analysis.
- **Human Oversight**: Architectural decisions regarding PostgreSQL concurrency guarantees (`pg_advisory_xact_lock` vs table locks vs Redis), DST edge cases, buffer arithmetic, and Next.js route structures were deliberately guided and verified.

---

## 2. Key Prompts & Iterations

### Prompt 1: Postgres Concurrency Guarantee without Redis
- **Intent**: How to ensure zero double-booking under extreme concurrency purely within Postgres, without Redis or distributed lock services.
- **AI Suggestion**: AI initially suggested either `SERIALIZABLE` isolation or a unique constraint on `(host_id, slot_start)`.
- **Where It Got Things Wrong**:
  1. A simple unique constraint on `(host_id, slot_start)` does **not** work for group sessions where `capacity > 1`.
  2. A unique constraint does **not** handle buffer periods before and after an event (e.g., a 30-min event starting at 10:00 with a 15-min buffer blocks 09:45–10:45, making a 10:30 booking illegal even though the start timestamp differs).
  3. `SERIALIZABLE` isolation can result in frequent serialization failure rollbacks (Postgres error `40001: could not serialize access due to read/write dependencies`), requiring complex client retry logic.
- **What Was Changed by Hand**:
  - Replaced the approach with **PostgreSQL transaction-scoped advisory locks** (`SELECT pg_advisory_xact_lock(hashtext('host_lock_' || host_id))`) paired with explicit row locks (`FOR UPDATE`) during hold confirmation and rescheduling.
  - Formulated the exact interval collision formula:
    $$\max(\text{neededStart}, \text{blockedStart}) < \min(\text{neededEnd}, \text{blockedEnd})$$
    which seamlessly accounts for `buffer_before_min` and `buffer_after_min` across disparate event types.

### Prompt 2: Timezone & Daylight Saving Transitions
- **Intent**: Accurately convert host recurring availability windows into UTC slots and project them into the guest's browser timezone across DST shifts.
- **AI Suggestion**: AI attempted to perform raw offset math using UTC offsets (e.g. subtracting `4 * 3600 * 1000` for Eastern Time).
- **Where It Got Things Wrong**:
  - Hardcoded or fixed UTC offsets break during Daylight Saving Time switches (e.g. Eastern Daylight Time `UTC-4` shifting to Eastern Standard Time `UTC-5` in November).
- **What Was Changed by Hand**:
  - Switched to standard IANA timezone identifiers (e.g. `America/New_York`, `Asia/Kolkata`) parsed via `fromZonedTime` and `formatInTimeZone` from `date-fns-tz`.
  - Added an explicit test case in `tests/unit.test.ts` verifying that `09:00` in New York on `2026-10-30` yields `13:00 UTC`, whereas `09:00` on `2026-11-02` yields `14:00 UTC`.

### Prompt 3: TypeScript Type Checking on Postgres Query Client
- **Intent**: Production Next.js build verification with strict TypeScript compiler checks.
- **AI Mistake**: During Next.js production build (`pnpm build`), untyped `client.query<T>` calls triggered `TS2554: Untyped function calls may not accept type arguments` because the transaction client was typed as `any`.
- **What Was Changed by Hand**:
  - Explicitly typed the connection client with `PoolClient` from `pg`, updating `src/db/index.ts`, `src/lib/engine.ts`, and `src/lib/notifications.ts`.
  - Configured `"target": "es2022"` in `tsconfig.json` to natively support Map iterators without downlevel compilation overhead.

---

## 3. Hand-Crafted Components
- **20x Concurrent Double-Booking Stress Test**: Hand-crafted `tests/concurrency.test.ts` to fire 20 simultaneous asynchronous hold requests with distinct idempotency keys against the exact same slot, asserting strictly that 1 succeeds and 19 fail with HTTP 409 Conflict.
- **Interactive UI with 5-minute Countdown Timer**: Built the real-time hold countdown badge on the guest booking view that ticks down live and releases expired holds automatically.
- **RFC 5545 iCalendar (`.ics`) Generator**: Clean RFC 5545 calendar implementation supporting `METHOD:REQUEST` and `METHOD:CANCEL` for confirmation, reschedule, and cancellation.

---

## 4. Key Takeaways
Using AI accelerated the generation of boilerplate and CRUD endpoints, while rigorous systems engineering, transactional locking design, and boundary-value test verification ensured the booking engine's bulletproof correctness.
