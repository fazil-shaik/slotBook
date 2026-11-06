import { pool } from "../src/db";
import {
  computeAvailableSlots,
  createHoldWithLock,
  confirmBookingWithLock,
  rescheduleBookingWithLock,
  cancelBookingWithLock,
  expireStaleHolds,
} from "../src/lib/engine";
import { nanoid } from "nanoid";
import assert from "assert";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

async function runUnitTests() {
  console.log("\n🧪 Running Core Engine & Unit Tests...\n");

  const testHostId = `host_unit_${nanoid(8)}`;
  const testEventId = `evt_unit_${nanoid(8)}`;

  try {
    // Setup Host
    await pool.query(
      `INSERT INTO hosts (id, name, email, slug, time_zone, daily_cap)
       VALUES ($1, 'Unit Host', $2, $3, 'America/New_York', 10)`,
      [testHostId, `host_${nanoid(6)}@example.com`, `host_${nanoid(6)}`]
    );

    // Setup Event Type with 15 min buffers
    await pool.query(
      `INSERT INTO event_types (
        id, host_id, name, slug, duration_min, capacity,
        buffer_before_min, buffer_after_min, min_notice_hours, booking_horizon_days, per_guest_limit
      ) VALUES ($1, $2, 'Unit Event', 'unit-event', 30, 1, 15, 15, 0, 30, true)`,
      [testEventId, testHostId]
    );

    // Add Monday availability: 09:00 - 17:00
    await pool.query(
      `INSERT INTO availabilities (id, host_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, 1, '09:00', '17:00')`,
      [`avl_${nanoid(6)}`, testHostId]
    );

    // Test 1: Buffer Collision Prevention
    console.log("▶ Test 1: Buffer collision detection between bookings...");
    // Create hold at 10:00 to 10:30 (with 15 min buffer before 09:45 and after 10:45)
    const slotStart1 = new Date("2026-11-09T15:00:00.000Z").toISOString(); // 10:00 AM EST
    const hold1 = await createHoldWithLock({
      eventTypeId: testEventId,
      slotStart: slotStart1,
    });
    assert.ok(hold1.response.hold_id);

    // Try booking at 10:30 (overlapping with buffer after which extends to 10:45)
    const slotStartBufferCollision = new Date("2026-11-09T15:30:00.000Z").toISOString(); // 10:30 AM EST
    let bufferFailed = false;
    try {
      await createHoldWithLock({
        eventTypeId: testEventId,
        slotStart: slotStartBufferCollision,
      });
    } catch (err: any) {
      bufferFailed = true;
      assert.strictEqual(err.status, 409);
      assert.match(err.message, /buffer/i);
    }
    assert.strictEqual(bufferFailed, true, "Buffer collision should have been rejected");
    console.log("  ✅ Buffer collision correctly blocked by 15-minute buffer!\n");

    // Test 2: Confirmation & Per-Guest Limit
    console.log("▶ Test 2: Confirming booking and enforcing per-guest limit...");
    const confirmRes = await confirmBookingWithLock({
      holdId: hold1.response.hold_id,
      name: "John Doe",
      email: "john@example.com",
      notes: "Need consultation",
    });
    assert.strictEqual(confirmRes.status, "confirmed");
    assert.ok(confirmRes.manage_token);

    // Try confirming another booking for the SAME guest on this event type
    const slotStart2 = new Date("2026-11-09T17:00:00.000Z").toISOString();
    const hold2 = await createHoldWithLock({
      eventTypeId: testEventId,
      slotStart: slotStart2,
    });
    let guestLimitFailed = false;
    try {
      await confirmBookingWithLock({
        holdId: hold2.response.hold_id,
        name: "John Doe Duplicate",
        email: "john@example.com",
      });
    } catch (err: any) {
      guestLimitFailed = true;
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /already has an active/i);
    }
    assert.strictEqual(guestLimitFailed, true, "Per-guest active limit should have rejected duplicate");
    console.log("  ✅ Per-guest active booking limit enforced!\n");

    // Test 3: Rescheduling moves booking atomically
    console.log("▶ Test 3: Rescheduling moves booking to a new slot...");
    const newSlot = new Date("2026-11-09T18:00:00.000Z").toISOString();
    const rescheduleRes = await rescheduleBookingWithLock({
      token: confirmRes.manage_token,
      newSlotStart: newSlot,
    });
    assert.strictEqual(rescheduleRes.status, "confirmed");
    assert.strictEqual(new Date(rescheduleRes.slot_start).toISOString(), newSlot);
    console.log("  ✅ Booking rescheduled atomically!\n");

    // Test 4: Cancellation releases slot and updates status
    console.log("▶ Test 4: Cancellation with reason frees up availability...");
    const cancelRes = await cancelBookingWithLock({
      token: confirmRes.manage_token,
      reason: "Scheduling conflict",
    });
    assert.strictEqual(cancelRes.status, "cancelled");

    // The newSlot should now be re-bookable!
    const rebookHold = await createHoldWithLock({
      eventTypeId: testEventId,
      slotStart: newSlot,
    });
    assert.ok(rebookHold.response.hold_id);
    console.log("  ✅ Cancellation released slot for new booking!\n");

    // Test 5: Hold Expiration
    console.log("▶ Test 5: Expired hold auto-cleanup...");
    // Manually backdate hold_expires_at to 10 minutes ago
    await pool.query(
      `UPDATE bookings SET hold_expires_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`,
      [rebookHold.response.hold_id]
    );
    const expiredCount = await expireStaleHolds();
    assert.ok(expiredCount >= 1);

    const checkRes = await pool.query(`SELECT status FROM bookings WHERE id = $1`, [rebookHold.response.hold_id]);
    assert.strictEqual(checkRes.rows[0].status, "expired");
    console.log("  ✅ Stale hold automatically expired!\n");

    // Test 6: Daylight Saving Shift Verification
    console.log("▶ Test 6: Daylight Saving Transition Verification...");
    // In America/New_York:
    // 2026-10-30 is EDT (UTC-4) -> 09:00 NY = 13:00 UTC
    // 2026-11-02 is EST (UTC-5) -> 09:00 NY = 14:00 UTC
    const edtDate = fromZonedTime("2026-10-30 09:00:00", "America/New_York");
    const estDate = fromZonedTime("2026-11-02 09:00:00", "America/New_York");

    assert.strictEqual(edtDate.toISOString(), "2026-10-30T13:00:00.000Z");
    assert.strictEqual(estDate.toISOString(), "2026-11-02T14:00:00.000Z");
    console.log("  ✅ EDT (UTC-4) and EST (UTC-5) transition accurate to the minute!\n");

    console.log("🎉 All Unit & Engine Tests Passed Successfully!\n");
  } finally {
    await pool.query(`DELETE FROM hosts WHERE id = $1`, [testHostId]);
  }
}

runUnitTests()
  .then(() => pool.end())
  .catch((err) => {
    console.error("❌ Unit tests failed:", err);
    pool.end();
    process.exit(1);
  });
