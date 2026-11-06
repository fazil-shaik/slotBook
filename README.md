# Slotbook — Reliable Booking & Scheduling Engine

> Built for the **Slotbook Take-Home Assignment**.
> Hosts publish when they are free, guests book a slot, and **nobody is ever double-booked** — even under extreme network concurrency, misbehaving clocks, or race conditions.
> Powered by **Postgres 15+** as the single source of truth for correctness (no Redis or external lock service).

---

## ⚡ Quickstart (One-Command Run)

### Option 1: Docker Compose (All-in-One)
```bash
docker compose up --build
```
This starts PostgreSQL 16, compiles the Next.js application, applies all database migrations, and seeds the demo host (`rachit`) with two pre-configured event types.

### Option 2: Local Node & Postgres
Ensure PostgreSQL is running locally on port 5432 with database `slotbook` (or configure `DATABASE_URL` in `.env`):
```bash
# 1. Install dependencies
pnpm install # or npm install

# 2. Run migrations and seed demo host
pnpm db:seed

# 3. Start development server
pnpm dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Running the Concurrency & Engine Tests

Run the full test suite (including the **20x concurrent double-booking stress test against real Postgres**):
```bash
pnpm test
```

### Individual Test Suites:
- **Concurrency Test**: `pnpm test:concurrency`
  - Fires 20 simultaneous hold requests against a 1-capacity slot at the exact same millisecond. Verifies that **exactly 1 succeeds** and **19 are rejected with 409 Conflict**.
  - Fires 10 concurrent requests on a 3-capacity group session; verifies exactly 3 succeed and 7 are rejected.
  - Verifies Idempotency-Key replay safety.
- **Unit & Engine Test**: `pnpm test:unit`
  - Tests buffer intervals, per-guest limits, hold expiration (5 min), atomic rescheduling, cancellation, and Daylight Saving Time (EDT $\to$ EST) transitions.

---

## 🧭 60-Second Tour of the UI

1. **Home / Navigational Hub (`/`)**:
   - Quick launchpad to dashboard, sample booking flows, system architecture summary, and health endpoint.
2. **Host Dashboard (`/dashboard`)**:
   - **Authenticated host profile**: Set home IANA timezone (e.g. `America/New_York`, `Asia/Kolkata`) and optional daily booking cap.
   - **Event Types**: Create and view events with customized duration (15–120 min), capacity (1 = 1-on-1, $>1$ = group session), buffer before & after (0–30 min), minimum notice (e.g. 4 hours), and booking horizon (e.g. 30 days).
   - **Weekly Availability**: Visual schedule with multiple operating windows per day (e.g. Mon–Fri `09:00–12:00` and `13:00–17:00`).
   - **Date Overrides**: Mark specific calendar dates as days off or set custom hours.
   - **Upcoming Bookings**: View confirmed bookings and active holds; cancel bookings with a reason.
   - **Notification Sink Audit**: Real-time event log of emitted notifications.
3. **Public Booking Page (`/{host}/{event-slug}`)**:
   - Public guest booking surface (e.g. `/rachit/30-min-intro` or `/rachit/60-min-deep-dive`).
   - Browser timezone auto-detected with instant timezone switcher.
   - 30-day interactive date and slot picker showing real-time capacity.
   - **5-Minute Hold Countdown**: Clicking a slot triggers a transactional hold with a live timer badge (`04:59`).
   - Name and email entry with per-guest active booking check.
   - Instant confirmation with **Private Manage Link** and **Add to Calendar (.ics)** download.
4. **Private Guest Manage Page (`/manage/{token}`)**:
   - Private link generated per booking.
   - **Reschedule**: Select a new slot from available times; atomically releases the old slot and reserves the new one.
   - **Cancel**: Cancel the booking with an optional reason, which immediately frees the slot and triggers waitlist dispatch.
   - **Download .ics**: Standard RFC 5545 iCalendar invite.
5. **Embeddable Widget (`/embed/{host}/{slug}`)**:
   - Clean, headerless iframe-ready embed for third-party websites.

---

## 📡 Minimum JSON API Reference

All endpoints conform strictly to the assignment specifications:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hosts/{host}/events/{slug}/slots?from&to&tz` | Returns available slots computed in guest timezone |
| `POST` | `/api/holds` | Reserves a slot for 5 minutes. Accepts `Idempotency-Key` header |
| `POST` | `/api/holds/{id}/confirm` | Confirms held slot with guest name, email, and notes |
| `POST` | `/api/bookings/{token}/reschedule` | Atomically moves confirmed booking to `new_slot_start` |
| `POST` | `/api/bookings/{token}/cancel` | Cancels booking with optional reason; frees capacity |
| `GET` | `/api/bookings/{token}` | Fetches booking metadata for guest manage surface |
| `GET` | `/api/bookings/{token}/ics` | Downloads RFC 5545 `.ics` calendar invite |
| `POST` | `/api/waitlist` | Joins waitlist when a slot is fully booked |
| `GET` | `/health` | Observability endpoint (metrics, active/expired holds, DB ping) |

---

## 🎁 Optional Extensions Implemented

1. **Calendar Invites (.ics)**:
   - Full RFC 5545 compliant `.ics` generator supporting `METHOD:REQUEST` and `METHOD:CANCEL` with persistent UIDs, timestamps, organizer, and attendee details.
2. **Notification Sink**:
   - Database event audit log with structured logging and automatic webhook dispatch for `booking.confirmed`, `booking.rescheduled`, `booking.cancelled`, and `waitlist.offered`.
3. **Waitlist System**:
   - When a slot is full or unavailable, guests can join a slot-specific waitlist. Upon cancellation, the next guest in line is offered the slot with a time-limited hold.
4. **Daily Booking Cap & Per-Guest Limit**:
   - Host can set a daily booking cap per local day.
   - System enforces that a guest email cannot hold more than one active booking per event type.
5. **Abuse Protection / Rate Limiting**:
   - Sliding-window rate limiter on hold endpoints to protect against malicious bots holding all available slots.
6. **Observability & Request IDs**:
   - Structured JSON logging with `x-request-id` correlation.
   - `/health` endpoint returning database latency, confirmed bookings, active holds, expired holds, and notification stats.
7. **Embeddable Widget**:
   - Clean embed route at `/embed/{host}/{slug}`.

---

## 🏗️ Architecture & Correctness Guarantee

- **Database**: PostgreSQL 15+
- **Isolation & Locking**:
  - Hold operations execute inside a transaction acquiring a PostgreSQL transaction-scoped advisory lock on the host (`SELECT pg_advisory_xact_lock(hashtext('host_lock_' || host_id))`).
  - Row locking (`FOR UPDATE`) is used on booking confirmation, reschedule, and cancellation.
  - This eliminates race conditions without relying on Redis, external distributed locks, or memory locks.
- **DST & Timezones**:
  - Host weekly schedules and overrides are stored and evaluated in the host's IANA home timezone.
  - Conversion between host wall-clock time and UTC is executed with `date-fns-tz` to guarantee exact DST shifts (e.g. EDT $\to$ EST).
