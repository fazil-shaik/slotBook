import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { getHostBySlug } from "@/lib/engine";
import { nanoid } from "nanoid";

export async function GET(
  req: NextRequest,
  { params }: { params: { host: string } }
) {
  const host = await getHostBySlug(params.host);
  if (!host) {
    return NextResponse.json({ error: "Host not found" }, { status: 404 });
  }

  const res = await pool.query(
    `SELECT * FROM event_types WHERE host_id = $1 ORDER BY created_at ASC`,
    [host.id]
  );
  return NextResponse.json(res.rows);
}

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

  const {
    name,
    slug,
    description,
    duration_min,
    capacity = 1,
    buffer_before_min = 0,
    buffer_after_min = 0,
    min_notice_hours = 4,
    booking_horizon_days = 30,
    per_guest_limit = true,
  } = body;

  if (!name || !slug || !duration_min) {
    return NextResponse.json(
      { error: "name, slug, and duration_min are required" },
      { status: 400 }
    );
  }

  if (duration_min < 15 || duration_min > 120) {
    return NextResponse.json(
      { error: "duration_min must be between 15 and 120 minutes" },
      { status: 400 }
    );
  }

  const id = `evt_${nanoid(12)}`;

  try {
    const res = await pool.query(
      `INSERT INTO event_types (
        id, host_id, name, slug, description, duration_min, capacity,
        buffer_before_min, buffer_after_min, min_notice_hours,
        booking_horizon_days, per_guest_limit
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        id,
        host.id,
        name,
        slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "-"),
        description || "",
        duration_min,
        capacity,
        buffer_before_min,
        buffer_after_min,
        min_notice_hours,
        booking_horizon_days,
        per_guest_limit,
      ]
    );
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (err: any) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Event slug already exists for this host" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
