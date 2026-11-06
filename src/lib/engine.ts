import { pool, withTransaction } from "@/db";
import { PoolClient, Pool } from "pg";
import { Host, EventType, Availability, DateOverride, Slot, Booking } from "./types";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { addDays, format, parseISO } from "date-fns";
import { nanoid } from "nanoid";
import { emitNotification } from "./notifications";

export async function expireStaleHolds(clientOrPool: PoolClient | Pool = pool): Promise<number> {
  const res = await clientOrPool.query(
    `UPDATE bookings
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'held' AND hold_expires_at <= NOW()
     RETURNING id`
  );
  return res.rowCount || 0;
}

export async function getHostBySlug(slug: string): Promise<Host | null> {
  const res = await pool.query(`SELECT * FROM hosts WHERE slug = $1`, [slug]);
  return res.rows[0] || null;
}

export async function getEventTypeBySlug(hostId: string, slug: string): Promise<EventType | null> {
  const res = await pool.query(
    `SELECT * FROM event_types WHERE host_id = $1 AND slug = $2`,
    [hostId, slug]
  );
  return res.rows[0] || null;
}

export async function computeAvailableSlots({
  host,
  eventType,
  fromDate,
  toDate,
  guestTz,
  now = new Date(),
}: {
  host: Host;
  eventType: EventType;
  fromDate: Date;
  toDate: Date;
  guestTz: string;
  now?: Date;
}): Promise<Slot[]> {
  // First expire any past holds
  await expireStaleHolds();

  // 1. Fetch weekly availability
  const availRes = await pool.query<Availability>(
    `SELECT * FROM availabilities WHERE host_id = $1 ORDER BY day_of_week, start_time`,
    [host.id]
  );
  const availabilities = availRes.rows;

  // 2. Fetch date overrides in range
  const fromDateStr = format(fromDate, "yyyy-MM-dd");
  const toDateStr = format(toDate, "yyyy-MM-dd");
  const overrideRes = await pool.query<DateOverride>(
    `SELECT * FROM date_overrides 
     WHERE host_id = $1 AND override_date >= $2 AND override_date <= $3`,
    [host.id, fromDateStr, toDateStr]
  );
  const overridesMap = new Map<string, DateOverride[]>();
  for (const o of overrideRes.rows) {
    const dStr = format(new Date(o.override_date), "yyyy-MM-dd");
    if (!overridesMap.has(dStr)) {
      overridesMap.set(dStr, []);
    }
    overridesMap.get(dStr)!.push(o);
  }

  // 3. Fetch all active bookings for this host in range (including buffer window)
  const rangeStartWithBuffer = new Date(fromDate.getTime() - 24 * 60 * 60 * 1000);
  const rangeEndWithBuffer = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);

  const bookingsRes = await pool.query<
    Booking & { buffer_before_min: number; buffer_after_min: number }
  >(
    `SELECT b.*, et.buffer_before_min, et.buffer_after_min
     FROM bookings b
     JOIN event_types et ON b.event_type_id = et.id
     WHERE b.host_id = $1
       AND b.slot_end >= $2
       AND b.slot_start <= $3
       AND (
         b.status = 'confirmed' 
         OR (b.status = 'held' AND b.hold_expires_at > NOW())
       )`,
    [host.id, rangeStartWithBuffer.toISOString(), rangeEndWithBuffer.toISOString()]
  );
  const activeBookings = bookingsRes.rows;

  // 4. Calculate notice and horizon limits
  const minNoticeTime = new Date(now.getTime() + eventType.min_notice_hours * 60 * 60 * 1000);
  const horizonTime = new Date(now.getTime() + eventType.booking_horizon_days * 24 * 60 * 60 * 1000);

  // Group active bookings by host local date to enforce daily cap
  const dailyBookingsCount = new Map<string, number>();
  if (host.daily_cap !== null && host.daily_cap > 0) {
    for (const b of activeBookings) {
      const bDateStr = formatInTimeZone(new Date(b.slot_start), host.time_zone, "yyyy-MM-dd");
      dailyBookingsCount.set(bDateStr, (dailyBookingsCount.get(bDateStr) || 0) + 1);
    }
  }

  const resultSlots: Slot[] = [];

  // Iterate day by day in host timezone
  let currentDay = new Date(fromDate);
  while (currentDay <= toDate) {
    const dayStr = formatInTimeZone(currentDay, host.time_zone, "yyyy-MM-dd");

    // Check daily cap
    if (host.daily_cap !== null && host.daily_cap > 0) {
      const dayCount = dailyBookingsCount.get(dayStr) || 0;
      if (dayCount >= host.daily_cap) {
        currentDay = addDays(currentDay, 1);
        continue;
      }
    }

    // Determine availability windows for this date
    let windows: { start: string; end: string }[] = [];
    const dateOverrides = overridesMap.get(dayStr);

    if (dateOverrides && dateOverrides.length > 0) {
      const isUnavailable = dateOverrides.some((o) => o.is_unavailable);
      if (isUnavailable) {
        windows = []; // day off
      } else {
        windows = dateOverrides
          .filter((o) => o.start_time && o.end_time)
          .map((o) => ({ start: o.start_time!, end: o.end_time! }));
      }
    } else {
      // Use weekly availability
      // Get day of week in host timezone (0 = Sunday)
      const dayOfWeek = parseInt(formatInTimeZone(currentDay, host.time_zone, "i"), 10) % 7;
      windows = availabilities
        .filter((a) => a.day_of_week === dayOfWeek)
        .map((a) => ({ start: a.start_time, end: a.end_time }));
    }

    // Generate candidate slots within each window
    for (const win of windows) {
      const winStartStr = `${dayStr} ${win.start}:00`;
      const winEndStr = `${dayStr} ${win.end}:00`;

      const winStartUtc = fromZonedTime(winStartStr, host.time_zone);
      const winEndUtc = fromZonedTime(winEndStr, host.time_zone);

      const durationMs = eventType.duration_min * 60 * 1000;
      // Step interval: e.g. 15 or 30 min, or duration if <= 30 min
      const stepMs = eventType.duration_min <= 30 ? eventType.duration_min * 60 * 1000 : 30 * 60 * 1000;

      let candidateStart = new Date(winStartUtc);
      while (candidateStart.getTime() + durationMs <= winEndUtc.getTime()) {
        const candidateEnd = new Date(candidateStart.getTime() + durationMs);

        // Check Notice & Horizon constraints
        if (candidateStart.getTime() >= minNoticeTime.getTime() && candidateStart.getTime() <= horizonTime.getTime()) {
          // Check overlaps and capacity
          const candidateNeededStart = candidateStart.getTime() - eventType.buffer_before_min * 60 * 1000;
          const candidateNeededEnd = candidateEnd.getTime() + eventType.buffer_after_min * 60 * 1000;

          let capacityUsedForThisSlot = 0;
          let blockedByBufferOrOtherEvent = false;

          for (const b of activeBookings) {
            const bStart = new Date(b.slot_start).getTime();
            const bEnd = new Date(b.slot_end).getTime();

            // Check if this booking is for the EXACT SAME slot and SAME event type
            if (b.event_type_id === eventType.id && bStart === candidateStart.getTime() && bEnd === candidateEnd.getTime()) {
              capacityUsedForThisSlot++;
            } else {
              // Different slot or different event: check buffer interval collision
              const bBlockedStart = bStart - (b.buffer_before_min || 0) * 60 * 1000;
              const bBlockedEnd = bEnd + (b.buffer_after_min || 0) * 60 * 1000;

              // Overlap formula: max(start1, start2) < min(end1, end2)
              if (Math.max(candidateNeededStart, bBlockedStart) < Math.min(candidateNeededEnd, bBlockedEnd)) {
                blockedByBufferOrOtherEvent = true;
                break;
              }
            }
          }

          if (!blockedByBufferOrOtherEvent && capacityUsedForThisSlot < eventType.capacity) {
            const availableCapacity = eventType.capacity - capacityUsedForThisSlot;

            resultSlots.push({
              start: candidateStart.toISOString(),
              end: candidateEnd.toISOString(),
              formatted_start: formatInTimeZone(candidateStart, guestTz, "yyyy-MM-dd HH:mm:ss zzz"),
              formatted_end: formatInTimeZone(candidateEnd, guestTz, "HH:mm:ss zzz"),
              available_capacity: availableCapacity,
              max_capacity: eventType.capacity,
            });
          }
        }

        candidateStart = new Date(candidateStart.getTime() + stepMs);
      }
    }

    currentDay = addDays(currentDay, 1);
  }

  return resultSlots;
}

export async function createHoldWithLock({
  eventTypeId,
  slotStart,
  idempotencyKey,
}: {
  eventTypeId: string;
  slotStart: string;
  idempotencyKey?: string | null;
}) {
  return await withTransaction(async (client) => {
    // 1. Check idempotency key if provided
    if (idempotencyKey) {
      const existingKey = await client.query(
        `SELECT response_payload FROM idempotency_keys WHERE key = $1`,
        [idempotencyKey]
      );
      if (existingKey.rows.length > 0) {
        return {
          fromIdempotency: true,
          response: existingKey.rows[0].response_payload,
        };
      }
    }

    // 2. Fetch event type and host
    const etRes = await client.query<EventType>(
      `SELECT * FROM event_types WHERE id = $1`,
      [eventTypeId]
    );
    if (etRes.rows.length === 0) {
      throw { status: 404, message: "Event type not found" };
    }
    const eventType = etRes.rows[0];

    const hostRes = await client.query<Host>(
      `SELECT * FROM hosts WHERE id = $1`,
      [eventType.host_id]
    );
    const host = hostRes.rows[0];

    // 3. POSTGRES TRANSACTION ADVISORY LOCK on the host
    // Guarantees strict serialization for all holds/bookings on this host
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('host_lock_' || $1))`,
      [host.id]
    );

    // 4. Clean up any expired holds
    await expireStaleHolds(client);

    const slotStartDate = parseISO(slotStart);
    const slotDurationMs = eventType.duration_min * 60 * 1000;
    const slotEndDate = new Date(slotStartDate.getTime() + slotDurationMs);
    const now = new Date();

    // 5. Notice & Horizon validation
    const minNoticeTime = new Date(now.getTime() + eventType.min_notice_hours * 60 * 60 * 1000);
    const horizonTime = new Date(now.getTime() + eventType.booking_horizon_days * 24 * 60 * 60 * 1000);

    if (slotStartDate.getTime() < minNoticeTime.getTime()) {
      throw { status: 400, message: `Slot is within the minimum notice period (${eventType.min_notice_hours} hours)` };
    }
    if (slotStartDate.getTime() > horizonTime.getTime()) {
      throw { status: 400, message: `Slot is beyond the booking horizon (${eventType.booking_horizon_days} days)` };
    }

    // 6. Check host daily cap
    if (host.daily_cap !== null && host.daily_cap > 0) {
      const hostDateStr = formatInTimeZone(slotStartDate, host.time_zone, "yyyy-MM-dd");
      const dailyCountRes = await client.query(
        `SELECT COUNT(*) as count FROM bookings
         WHERE host_id = $1 
           AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > NOW()))
           AND (slot_start AT TIME ZONE $2)::date = $3::date`,
        [host.id, host.time_zone, hostDateStr]
      );
      if (parseInt(dailyCountRes.rows[0].count, 10) >= host.daily_cap) {
        throw { status: 409, message: "Host daily booking cap reached for this date" };
      }
    }

    // 7. Check capacity & buffer conflicts against other active bookings
    const activeBookingsRes = await client.query<
      Booking & { buffer_before_min: number; buffer_after_min: number }
    >(
      `SELECT b.*, et.buffer_before_min, et.buffer_after_min
       FROM bookings b
       JOIN event_types et ON b.event_type_id = et.id
       WHERE b.host_id = $1
         AND (b.status = 'confirmed' OR (b.status = 'held' AND b.hold_expires_at > NOW()))
         AND b.slot_end >= $2
         AND b.slot_start <= $3`,
      [
        host.id,
        new Date(slotStartDate.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        new Date(slotEndDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      ]
    );

    const neededStart = slotStartDate.getTime() - eventType.buffer_before_min * 60 * 1000;
    const neededEnd = slotEndDate.getTime() + eventType.buffer_after_min * 60 * 1000;

    let slotCurrentCapacityCount = 0;
    for (const b of activeBookingsRes.rows) {
      const bStart = new Date(b.slot_start).getTime();
      const bEnd = new Date(b.slot_end).getTime();

      if (b.event_type_id === eventType.id && bStart === slotStartDate.getTime() && bEnd === slotEndDate.getTime()) {
        slotCurrentCapacityCount++;
      } else {
        const bBlockedStart = bStart - (b.buffer_before_min || 0) * 60 * 1000;
        const bBlockedEnd = bEnd + (b.buffer_after_min || 0) * 60 * 1000;

        if (Math.max(neededStart, bBlockedStart) < Math.min(neededEnd, bBlockedEnd)) {
          throw { status: 409, message: "Host is unavailable at this time due to another booking or buffer" };
        }
      }
    }

    if (slotCurrentCapacityCount >= eventType.capacity) {
      throw { status: 409, message: "Slot capacity reached" };
    }

    // 8. Create hold (5 minutes expiration)
    const holdId = `bkg_${nanoid(14)}`;
    const manageToken = `tok_${nanoid(24)}`;
    const holdExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    await client.query(
      `INSERT INTO bookings (id, event_type_id, host_id, slot_start, slot_end, status, manage_token, hold_expires_at)
       VALUES ($1, $2, $3, $4, $5, 'held', $6, $7)`,
      [
        holdId,
        eventType.id,
        host.id,
        slotStartDate.toISOString(),
        slotEndDate.toISOString(),
        manageToken,
        holdExpiresAt.toISOString(),
      ]
    );

    const response = {
      hold_id: holdId,
      slot_start: slotStartDate.toISOString(),
      slot_end: slotEndDate.toISOString(),
      expires_at: holdExpiresAt.toISOString(),
      manage_token: manageToken,
      remaining_seconds: 300,
    };

    // Store idempotency record if requested
    if (idempotencyKey) {
      await client.query(
        `INSERT INTO idempotency_keys (key, host_id, booking_id, response_payload)
         VALUES ($1, $2, $3, $4)`,
        [idempotencyKey, host.id, holdId, JSON.stringify(response)]
      );
    }

    return {
      fromIdempotency: false,
      response,
    };
  });
}

export async function confirmBookingWithLock({
  holdId,
  name,
  email,
  notes,
}: {
  holdId: string;
  name: string;
  email: string;
  notes?: string;
}) {
  return await withTransaction(async (client) => {
    // Row lock on booking
    const bkgRes = await client.query<Booking>(
      `SELECT * FROM bookings WHERE id = $1 FOR UPDATE`,
      [holdId]
    );

    if (bkgRes.rows.length === 0) {
      throw { status: 404, message: "Hold not found" };
    }
    const booking = bkgRes.rows[0];

    if (booking.status === "confirmed") {
      return {
        booking_id: booking.id,
        status: "confirmed",
        manage_token: booking.manage_token,
      };
    }

    if (booking.status !== "held") {
      throw { status: 400, message: `Cannot confirm booking with status '${booking.status}'` };
    }

    if (booking.hold_expires_at && new Date(booking.hold_expires_at).getTime() <= Date.now()) {
      await client.query(`UPDATE bookings SET status = 'expired' WHERE id = $1`, [holdId]);
      throw { status: 410, message: "Hold has expired" };
    }

    // Fetch event type
    const etRes = await client.query<EventType>(
      `SELECT * FROM event_types WHERE id = $1`,
      [booking.event_type_id]
    );
    const eventType = etRes.rows[0];

    // Check per-guest limit extension
    if (eventType.per_guest_limit) {
      const guestActiveRes = await client.query(
        `SELECT id FROM bookings
         WHERE event_type_id = $1
           AND guest_email = $2
           AND id != $3
           AND status = 'confirmed'`,
        [eventType.id, email.toLowerCase().trim(), holdId]
      );
      if (guestActiveRes.rows.length > 0) {
        throw {
          status: 400,
          message: "Guest already has an active confirmed booking for this event type",
        };
      }
    }

    // Confirm booking
    await client.query(
      `UPDATE bookings
       SET status = 'confirmed',
           guest_name = $1,
           guest_email = $2,
           guest_notes = $3,
           hold_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $4`,
      [name.trim(), email.toLowerCase().trim(), notes || null, holdId]
    );

    // Emit event to notifications sink
    await emitNotification(client, {
      eventType: "booking.confirmed",
      bookingId: booking.id,
      recipientEmail: email.toLowerCase().trim(),
      recipientName: name.trim(),
      payload: {
        event_name: eventType.name,
        slot_start: booking.slot_start,
        slot_end: booking.slot_end,
        manage_token: booking.manage_token,
      },
    });

    return {
      booking_id: booking.id,
      status: "confirmed",
      manage_token: booking.manage_token,
      slot_start: booking.slot_start,
      slot_end: booking.slot_end,
      guest_name: name.trim(),
      guest_email: email.toLowerCase().trim(),
    };
  });
}

export async function rescheduleBookingWithLock({
  token,
  newSlotStart,
}: {
  token: string;
  newSlotStart: string;
}) {
  return await withTransaction(async (client) => {
    // 1. Find existing confirmed booking by token
    const bkgRes = await client.query<Booking>(
      `SELECT * FROM bookings WHERE manage_token = $1 FOR UPDATE`,
      [token]
    );
    if (bkgRes.rows.length === 0) {
      throw { status: 404, message: "Booking not found" };
    }
    const booking = bkgRes.rows[0];
    if (booking.status !== "confirmed") {
      throw { status: 400, message: `Only confirmed bookings can be rescheduled (current: ${booking.status})` };
    }

    // 2. Fetch event type & host
    const etRes = await client.query<EventType>(
      `SELECT * FROM event_types WHERE id = $1`,
      [booking.event_type_id]
    );
    const eventType = etRes.rows[0];

    // Host lock
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('host_lock_' || $1))`,
      [booking.host_id]
    );

    await expireStaleHolds(client);

    const oldStart = booking.slot_start;
    const newStartDate = parseISO(newSlotStart);
    const newEndDate = new Date(newStartDate.getTime() + eventType.duration_min * 60 * 1000);
    const now = new Date();

    // Check notice & horizon
    const minNoticeTime = new Date(now.getTime() + eventType.min_notice_hours * 60 * 60 * 1000);
    const horizonTime = new Date(now.getTime() + eventType.booking_horizon_days * 24 * 60 * 60 * 1000);

    if (newStartDate.getTime() < minNoticeTime.getTime()) {
      throw { status: 400, message: "New slot is within the minimum notice period" };
    }
    if (newStartDate.getTime() > horizonTime.getTime()) {
      throw { status: 400, message: "New slot is beyond the booking horizon" };
    }

    // Check overlaps against all OTHER bookings
    const activeBookingsRes = await client.query<
      Booking & { buffer_before_min: number; buffer_after_min: number }
    >(
      `SELECT b.*, et.buffer_before_min, et.buffer_after_min
       FROM bookings b
       JOIN event_types et ON b.event_type_id = et.id
       WHERE b.host_id = $1
         AND b.id != $2
         AND (b.status = 'confirmed' OR (b.status = 'held' AND b.hold_expires_at > NOW()))
         AND b.slot_end >= $3
         AND b.slot_start <= $4`,
      [
        booking.host_id,
        booking.id,
        new Date(newStartDate.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        new Date(newEndDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      ]
    );

    const neededStart = newStartDate.getTime() - eventType.buffer_before_min * 60 * 1000;
    const neededEnd = newEndDate.getTime() + eventType.buffer_after_min * 60 * 1000;

    let slotCurrentCapacityCount = 0;
    for (const b of activeBookingsRes.rows) {
      const bStart = new Date(b.slot_start).getTime();
      const bEnd = new Date(b.slot_end).getTime();

      if (b.event_type_id === eventType.id && bStart === newStartDate.getTime() && bEnd === newEndDate.getTime()) {
        slotCurrentCapacityCount++;
      } else {
        const bBlockedStart = bStart - (b.buffer_before_min || 0) * 60 * 1000;
        const bBlockedEnd = bEnd + (b.buffer_after_min || 0) * 60 * 1000;

        if (Math.max(neededStart, bBlockedStart) < Math.min(neededEnd, bBlockedEnd)) {
          throw { status: 409, message: "Host is unavailable at this new slot due to another booking or buffer" };
        }
      }
    }

    if (slotCurrentCapacityCount >= eventType.capacity) {
      throw { status: 409, message: "New slot capacity reached" };
    }

    // Update booking slot
    await client.query(
      `UPDATE bookings
       SET slot_start = $1,
           slot_end = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [newStartDate.toISOString(), newEndDate.toISOString(), booking.id]
    );

    // Emit reschedule notification
    if (booking.guest_email) {
      await emitNotification(client, {
        eventType: "booking.rescheduled",
        bookingId: booking.id,
        recipientEmail: booking.guest_email,
        recipientName: booking.guest_name || "Guest",
        payload: {
          previous_slot_start: oldStart,
          new_slot_start: newStartDate.toISOString(),
          new_slot_end: newEndDate.toISOString(),
          manage_token: booking.manage_token,
        },
      });
    }

    return {
      booking_id: booking.id,
      status: "confirmed",
      slot_start: newStartDate.toISOString(),
      slot_end: newEndDate.toISOString(),
      manage_token: booking.manage_token,
    };
  });
}

export async function cancelBookingWithLock({
  token,
  reason,
}: {
  token: string;
  reason?: string;
}) {
  return await withTransaction(async (client) => {
    const bkgRes = await client.query<Booking>(
      `SELECT * FROM bookings WHERE manage_token = $1 FOR UPDATE`,
      [token]
    );
    if (bkgRes.rows.length === 0) {
      throw { status: 404, message: "Booking not found" };
    }
    const booking = bkgRes.rows[0];

    if (booking.status === "cancelled") {
      return { booking_id: booking.id, status: "cancelled" };
    }

    await client.query(
      `UPDATE bookings
       SET status = 'cancelled',
           cancellation_reason = $1,
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [reason || "Cancelled by guest/host", booking.id]
    );

    if (booking.guest_email) {
      await emitNotification(client, {
        eventType: "booking.cancelled",
        bookingId: booking.id,
        recipientEmail: booking.guest_email,
        recipientName: booking.guest_name || "Guest",
        payload: {
          reason: reason || "Cancelled",
          slot_start: booking.slot_start,
          slot_end: booking.slot_end,
        },
      });
    }

    // Waitlist notification (Optional extension)
    // Check if there are guests on waitlist for this slot
    const waitlistRes = await client.query(
      `SELECT * FROM waitlist
       WHERE event_type_id = $1
         AND slot_start = $2
         AND status = 'waiting'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [booking.event_type_id, booking.slot_start]
    );

    if (waitlistRes.rows.length > 0) {
      const waitEntry = waitlistRes.rows[0];
      const offerExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins to claim
      await client.query(
        `UPDATE waitlist
         SET status = 'offered',
             offer_expires_at = $1
         WHERE id = $2`,
        [offerExpiry.toISOString(), waitEntry.id]
      );

      await emitNotification(client, {
        eventType: "waitlist.offered",
        recipientEmail: waitEntry.guest_email,
        recipientName: waitEntry.guest_name,
        payload: {
          slot_start: booking.slot_start,
          offer_expires_at: offerExpiry.toISOString(),
        },
      });
    }

    return {
      booking_id: booking.id,
      status: "cancelled",
      cancellation_reason: reason || "Cancelled",
    };
  });
}
