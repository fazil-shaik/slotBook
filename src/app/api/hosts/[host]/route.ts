import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { getHostBySlug } from "@/lib/engine";

export async function GET(
  req: NextRequest,
  { params }: { params: { host: string } }
) {
  const host = await getHostBySlug(params.host);
  if (!host) {
    return NextResponse.json({ error: "Host not found" }, { status: 404 });
  }
  return NextResponse.json(host);
}

export async function PATCH(
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

  const { time_zone, name, daily_cap } = body;

  const res = await pool.query(
    `UPDATE hosts
     SET time_zone = COALESCE($1, time_zone),
         name = COALESCE($2, name),
         daily_cap = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [time_zone, name, daily_cap !== undefined ? daily_cap : host.daily_cap, host.id]
  );

  return NextResponse.json(res.rows[0]);
}
