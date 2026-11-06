import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  const res = await pool.query(
    `SELECT b.*, 
            et.name as event_name, 
            et.slug as event_slug, 
            et.duration_min, 
            et.description as event_description,
            h.name as host_name, 
            h.slug as host_slug, 
            h.email as host_email,
            h.time_zone as host_time_zone
     FROM bookings b
     JOIN event_types et ON b.event_type_id = et.id
     JOIN hosts h ON b.host_id = h.id
     WHERE b.manage_token = $1`,
    [token]
  );

  if (res.rows.length === 0) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const b = res.rows[0];

  return NextResponse.json({
    id: b.id,
    status: b.status,
    slot_start: b.slot_start,
    slot_end: b.slot_end,
    guest_name: b.guest_name,
    guest_email: b.guest_email,
    guest_notes: b.guest_notes,
    manage_token: b.manage_token,
    cancellation_reason: b.cancellation_reason,
    created_at: b.created_at,
    event: {
      name: b.event_name,
      slug: b.event_slug,
      duration_min: b.duration_min,
      description: b.event_description,
    },
    host: {
      name: b.host_name,
      slug: b.host_slug,
      email: b.host_email,
      time_zone: b.host_time_zone,
    },
  });
}
