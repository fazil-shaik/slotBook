import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { getHostBySlug, cancelBookingWithLock, expireStaleHolds } from "@/lib/engine";

export async function GET(
  req: NextRequest,
  { params }: { params: { host: string } }
) {
  const host = await getHostBySlug(params.host);
  if (!host) {
    return NextResponse.json({ error: "Host not found" }, { status: 404 });
  }

  await expireStaleHolds();

  const res = await pool.query(
    `SELECT b.*, et.name as event_name, et.duration_min
     FROM bookings b
     JOIN event_types et ON b.event_type_id = et.id
     WHERE b.host_id = $1
     ORDER BY b.slot_start DESC`,
    [host.id]
  );

  return NextResponse.json(res.rows);
}

// Host cancel booking with a reason
export async function POST(
  req: NextRequest,
  { params }: { params: { host: string } }
) {
  const host = await getHostBySlug(params.host);
  if (!host) {
    return NextResponse.json({ error: "Host not found" }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { booking_id, reason } = body;
  if (!booking_id) {
    return NextResponse.json({ error: "booking_id is required" }, { status: 400 });
  }

  const bkgRes = await pool.query(
    `SELECT manage_token FROM bookings WHERE id = $1 AND host_id = $2`,
    [booking_id, host.id]
  );
  if (bkgRes.rows.length === 0) {
    return NextResponse.json({ error: "Booking not found for this host" }, { status: 404 });
  }

  const token = bkgRes.rows[0].manage_token;
  const result = await cancelBookingWithLock({
    token,
    reason: reason || "Cancelled by host",
  });

  return NextResponse.json(result);
}
