import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const res = await pool.query(
    `SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return NextResponse.json(res.rows);
}
