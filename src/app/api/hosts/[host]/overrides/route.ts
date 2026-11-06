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
    `SELECT * FROM date_overrides WHERE host_id = $1 ORDER BY override_date ASC`,
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

  const { override_date, is_unavailable = false, start_time, end_time } = body;
  if (!override_date) {
    return NextResponse.json({ error: "override_date is required (YYYY-MM-DD)" }, { status: 400 });
  }

  const id = `ovr_${nanoid(12)}`;

  const res = await pool.query(
    `INSERT INTO date_overrides (id, host_id, override_date, is_unavailable, start_time, end_time)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, host.id, override_date, is_unavailable, start_time || null, end_time || null]
  );

  return NextResponse.json(res.rows[0], { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { host: string } }
) {
  const host = await getHostBySlug(params.host);
  if (!host) {
    return NextResponse.json({ error: "Host not found" }, { status: 404 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query parameter required" }, { status: 400 });
  }

  await pool.query(
    `DELETE FROM date_overrides WHERE id = $1 AND host_id = $2`,
    [id, host.id]
  );

  return NextResponse.json({ message: "Override deleted successfully" });
}
