import { pool, withTransaction } from "./index";
import { runMigrations } from "./migrate";
import { format, addDays } from "date-fns";

export async function runSeed() {
  await runMigrations();
  console.log("Seeding database...");

  await withTransaction(async (client) => {
    // 1. Upsert Demo Host 'rachit'
    const hostId = "host_rachit_demo";
    await client.query(
      `INSERT INTO hosts (id, name, email, slug, time_zone, daily_cap)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           email = EXCLUDED.email,
           time_zone = EXCLUDED.time_zone,
           daily_cap = EXCLUDED.daily_cap,
           updated_at = NOW()`,
      [
        hostId,
        "Rachit",
        "rachit@example.com",
        "rachit",
        "America/New_York",
        10,
      ]
    );

    // 2. Clear old event types, availabilities, overrides for fresh seed
    await client.query(`DELETE FROM availabilities WHERE host_id = $1`, [hostId]);
    await client.query(`DELETE FROM date_overrides WHERE host_id = $1`, [hostId]);
    await client.query(`DELETE FROM event_types WHERE host_id = $1`, [hostId]);

    // 3. Insert Event Types
    // Event 1: 30 Min 1-on-1
    const event1Id = "evt_30min_intro";
    await client.query(
      `INSERT INTO event_types (
        id, host_id, name, slug, description, duration_min, capacity,
        buffer_before_min, buffer_after_min, min_notice_hours,
        booking_horizon_days, per_guest_limit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        event1Id,
        hostId,
        "30-Minute Intro Chat",
        "30-min-intro",
        "A quick 1-on-1 intro conversation to discuss projects, ideas, or questions.",
        30,
        1,  // 1-on-1
        10, // 10 min buffer before
        10, // 10 min buffer after
        4,  // 4 hours minimum notice
        30, // 30 days horizon
        true,
      ]
    );

    // Event 2: 60 Min Group Deep Dive
    const event2Id = "evt_60min_deepdive";
    await client.query(
      `INSERT INTO event_types (
        id, host_id, name, slug, description, duration_min, capacity,
        buffer_before_min, buffer_after_min, min_notice_hours,
        booking_horizon_days, per_guest_limit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        event2Id,
        hostId,
        "60-Minute Architectural Deep Dive",
        "60-min-deep-dive",
        "Group session to review system design, distributed locking, and Postgres internals.",
        60,
        3,  // capacity = 3 for group session
        15, // 15 min buffer before
        15, // 15 min buffer after
        4,  // 4 hours minimum notice
        30, // 30 days horizon
        true,
      ]
    );

    // 4. Insert Weekly Availability: Mon(1) - Fri(5) 09:00-12:00 and 13:00-17:00
    for (let day = 1; day <= 5; day++) {
      // Morning window
      await client.query(
        `INSERT INTO availabilities (id, host_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3, $4, $5)`,
        [`avl_${day}_am`, hostId, day, "09:00", "12:00"]
      );
      // Afternoon window
      await client.query(
        `INSERT INTO availabilities (id, host_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3, $4, $5)`,
        [`avl_${day}_pm`, hostId, day, "13:00", "17:00"]
      );
    }

    // 5. Insert Date Overrides
    // Date override 1: Day off in 7 days
    const dayOff = format(addDays(new Date(), 7), "yyyy-MM-dd");
    await client.query(
      `INSERT INTO date_overrides (id, host_id, override_date, is_unavailable, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["ovr_dayoff", hostId, dayOff, true, null, null]
    );

    // Date override 2: Custom hours in 10 days (10:00 - 14:00)
    const customDay = format(addDays(new Date(), 10), "yyyy-MM-dd");
    await client.query(
      `INSERT INTO date_overrides (id, host_id, override_date, is_unavailable, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["ovr_custom", hostId, customDay, false, "10:00", "14:00"]
    );

    // 6. Seed a sample confirmed booking 2 days from now at 14:00 UTC
    const sampleBookingStart = new Date(Date.now() + 2 * 24 * 3600 * 1000);
    sampleBookingStart.setUTCHours(14, 0, 0, 0);
    const sampleBookingEnd = new Date(sampleBookingStart.getTime() + 30 * 60 * 1000);

    await client.query(
      `INSERT INTO bookings (
        id, event_type_id, host_id, slot_start, slot_end, status,
        guest_name, guest_email, guest_notes, manage_token
      ) VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING`,
      [
        "bkg_seed_demo_1",
        event1Id,
        hostId,
        sampleBookingStart.toISOString(),
        sampleBookingEnd.toISOString(),
        "Alice Walker",
        "alice@example.com",
        "Excited to discuss system architecture!",
        "tok_seed_demo_alice",
      ]
    );

    console.log("Demo seed complete!");
    console.log(`- Host: http://localhost:3000/dashboard`);
    console.log(`- Public Booking (30-min): http://localhost:3000/rachit/30-min-intro`);
    console.log(`- Public Booking (60-min): http://localhost:3000/rachit/60-min-deep-dive`);
  });
}

if (require.main === module || process.argv[1]?.endsWith("seed.ts")) {
  runSeed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
