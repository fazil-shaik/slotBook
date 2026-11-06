import { NextRequest, NextResponse } from "next/server";
import { pool, withTransaction } from "@/db";
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
    `SELECT * FROM availabilities WHERE host_id = $1 ORDER BY day_of_week, start_time`,
    [host.id]
  );
  return NextResponse.json(res.rows);
}

export async function PUT(
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

  // Expecting windows: Array<{ day_of_week: number, start_time: string, end_time: string }>
  const { windows } = body;
  if (!Array.isArray(windows)) {
    return NextResponse.json({ error: "windows must be an array" }, { status: 400 });
  }

  await withTransaction(async (client) => {
    // Delete existing
    await client.query(`DELETE FROM availabilities WHERE host_id = $1`, [host.id]);

    // Insert new
    for (const w of windows) {
      const id = `avl_${nanoid(12)}`;
      await client.query(
        `INSERT INTO availabilities (id, host_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, host.id, w.day_of_week, w.start_time, w.end_time]
      );
    }
  });

  const updated = await pool.query(
    `SELECT * FROM availabilities WHERE host_id = $1 ORDER BY day_of_week, start_time`,
    [host.id]
  );
  return NextResponse.json(updated.rows);
}
