import { pool } from "./index";

export async function runMigrations() {
  console.log("Running migrations...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Hosts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS hosts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        time_zone TEXT NOT NULL DEFAULT 'America/New_York',
        daily_cap INTEGER DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Event Types table
    await client.query(`
      CREATE TABLE IF NOT EXISTS event_types (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        description TEXT DEFAULT '',
        duration_min INTEGER NOT NULL CHECK (duration_min >= 15 AND duration_min <= 120),
        capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1),
        buffer_before_min INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before_min >= 0 AND buffer_before_min <= 30),
        buffer_after_min INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after_min >= 0 AND buffer_after_min <= 30),
        min_notice_hours INTEGER NOT NULL DEFAULT 4 CHECK (min_notice_hours >= 0),
        booking_horizon_days INTEGER NOT NULL DEFAULT 30 CHECK (booking_horizon_days >= 1),
        per_guest_limit BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(host_id, slug)
      );
    `);

    // 3. Weekly Availabilities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS availabilities (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        start_time VARCHAR(5) NOT NULL, -- "09:00"
        end_time VARCHAR(5) NOT NULL,   -- "17:00"
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_availabilities_host_day ON availabilities(host_id, day_of_week);
    `);

    // 4. Date Overrides table
    await client.query(`
      CREATE TABLE IF NOT EXISTS date_overrides (
        id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        override_date DATE NOT NULL,
        is_unavailable BOOLEAN NOT NULL DEFAULT FALSE,
        start_time VARCHAR(5) DEFAULT NULL,
        end_time VARCHAR(5) DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_overrides_host_date ON date_overrides(host_id, override_date);
    `);

    // 5. Bookings table (holds + confirmed + cancelled)
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        event_type_id TEXT NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
        host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        slot_start TIMESTAMPTZ NOT NULL,
        slot_end TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('held', 'confirmed', 'cancelled', 'expired')),
        guest_name TEXT DEFAULT NULL,
        guest_email TEXT DEFAULT NULL,
        guest_notes TEXT DEFAULT NULL,
        manage_token TEXT NOT NULL UNIQUE,
        hold_expires_at TIMESTAMPTZ DEFAULT NULL,
        cancellation_reason TEXT DEFAULT NULL,
        cancelled_at TIMESTAMPTZ DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_bookings_host_time ON bookings(host_id, slot_start, slot_end);
      CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
      CREATE INDEX IF NOT EXISTS idx_bookings_token ON bookings(manage_token);
      CREATE INDEX IF NOT EXISTS idx_bookings_event_slot ON bookings(event_type_id, slot_start);
    `);

    // 6. Idempotency Keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
        booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
        response_payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
    `);

    // 7. Notifications Log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
        recipient_email TEXT NOT NULL,
        recipient_name TEXT NOT NULL,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'emitted',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
    `);

    // 8. Waitlist table (optional extension)
    await client.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id TEXT PRIMARY KEY,
        event_type_id TEXT NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
        slot_start TIMESTAMPTZ NOT NULL,
        guest_name TEXT NOT NULL,
        guest_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'offered', 'claimed', 'expired')),
        offer_expires_at TIMESTAMPTZ DEFAULT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_waitlist_event_slot ON waitlist(event_type_id, slot_start);
    `);

    await client.query("COMMIT");
    console.log("Migrations applied successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module || process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
