import { pool, withTransaction } from "../src/db";
import { createHoldWithLock, expireStaleHolds } from "../src/lib/engine";
import { nanoid } from "nanoid";
import assert from "assert";

async function runConcurrencyTests() {
  console.log("\n🧪 Running Concurrency & Double-Booking Stress Tests against Postgres...\n");

  const testHostId = `host_test_${nanoid(8)}`;
  const test1on1EventId = `evt_1on1_${nanoid(8)}`;
  const testGroupEventId = `evt_grp_${nanoid(8)}`;

  try {
    // 1. Setup Test Host & Event Types
    await pool.query(
      `INSERT INTO hosts (id, name, email, slug, time_zone)
       VALUES ($1, 'Test Host', $2, $3, 'America/New_York')`,
      [testHostId, `test_${nanoid(6)}@example.com`, `testhost_${nanoid(6)}`]
    );

    // 1-on-1 event (capacity = 1)
    await pool.query(
      `INSERT INTO event_types (
        id, host_id, name, slug, duration_min, capacity,
        buffer_before_min, buffer_after_min, min_notice_hours, booking_horizon_days
      ) VALUES ($1, $2, '1-on-1 Test', 'test-1on1', 30, 1, 0, 0, 0, 30)`,
      [test1on1EventId, testHostId]
    );

    // Group event (capacity = 3)
    await pool.query(
      `INSERT INTO event_types (
        id, host_id, name, slug, duration_min, capacity,
        buffer_before_min, buffer_after_min, min_notice_hours, booking_horizon_days
      ) VALUES ($1, $2, 'Group Test', 'test-group', 30, 3, 0, 0, 0, 30)`,
      [testGroupEventId, testHostId]
    );

    // Test 1: 20 Concurrent Hold Requests for a 1-Capacity Slot
    console.log("▶ Test 1: 20 concurrent holds on a capacity=1 slot...");
    const targetSlot1 = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const results1 = await Promise.allSettled(
      Array.from({ length: 20 }).map((_, i) =>
        createHoldWithLock({
          eventTypeId: test1on1EventId,
          slotStart: targetSlot1,
          idempotencyKey: `idemp_test1_${i}_${nanoid(6)}`,
        })
      )
    );

    let successes1 = 0;
    let conflicts1 = 0;

    for (const res of results1) {
      if (res.status === "fulfilled") {
        successes1++;
      } else {
        if (res.reason.status === 409) {
          conflicts1++;
        }
      }
    }

    console.log(`  Result: ${successes1} succeeded, ${conflicts1} rejected with 409 Conflict`);
    assert.strictEqual(successes1, 1, "Expected EXACTLY 1 hold to succeed");
    assert.strictEqual(conflicts1, 19, "Expected EXACTLY 19 holds to be rejected with 409 Conflict");
    console.log("  ✅ Zero double-booking verified under 20x concurrency!\n");

    // Test 2: 10 Concurrent Hold Requests for a 3-Capacity Group Slot
    console.log("▶ Test 2: 10 concurrent holds on a capacity=3 group slot...");
    const targetSlot2 = new Date(Date.now() + 48 * 3600 * 1000).toISOString();

    const results2 = await Promise.allSettled(
      Array.from({ length: 10 }).map((_, i) =>
        createHoldWithLock({
          eventTypeId: testGroupEventId,
          slotStart: targetSlot2,
          idempotencyKey: `idemp_test2_${i}_${nanoid(6)}`,
        })
      )
    );

    let successes2 = 0;
    let conflicts2 = 0;

    for (const res of results2) {
      if (res.status === "fulfilled") {
        successes2++;
      } else {
        if (res.reason.status === 409) {
          conflicts2++;
        }
      }
    }

    console.log(`  Result: ${successes2} succeeded, ${conflicts2} rejected with 409 Conflict`);
    assert.strictEqual(successes2, 3, "Expected EXACTLY 3 holds to succeed for capacity=3");
    assert.strictEqual(conflicts2, 7, "Expected EXACTLY 7 holds to be rejected with 409 Conflict");
    console.log("  ✅ Exact capacity limit enforced under concurrency!\n");

    // Test 3: Idempotency Key Replay Verification
    console.log("▶ Test 3: Replaying hold with the same Idempotency-Key...");
    const targetSlot3 = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const idempKey = `fixed_idemp_${nanoid(10)}`;

    const firstCall = await createHoldWithLock({
      eventTypeId: test1on1EventId,
      slotStart: targetSlot3,
      idempotencyKey: idempKey,
    });
    assert.strictEqual(firstCall.fromIdempotency, false);

    const replayCall = await createHoldWithLock({
      eventTypeId: test1on1EventId,
      slotStart: targetSlot3,
      idempotencyKey: idempKey,
    });
    assert.strictEqual(replayCall.fromIdempotency, true);
    assert.strictEqual(firstCall.response.hold_id, replayCall.response.hold_id);

    // Verify only 1 booking was created in the database
    const dbBookingCount = await pool.query(
      `SELECT COUNT(*) as count FROM bookings WHERE slot_start = $1 AND event_type_id = $2`,
      [targetSlot3, test1on1EventId]
    );
    assert.strictEqual(parseInt(dbBookingCount.rows[0].count, 10), 1);
    console.log("  ✅ Idempotency key safely returned cached hold without duplicate records!\n");

    console.log("🎉 All Concurrency Tests Passed Successfully!\n");
  } finally {
    // Cleanup test data
    await pool.query(`DELETE FROM hosts WHERE id = $1`, [testHostId]);
  }
}

runConcurrencyTests()
  .then(() => pool.end())
  .catch((err) => {
    console.error("❌ Concurrency test failed:", err);
    pool.end();
    process.exit(1);
  });
