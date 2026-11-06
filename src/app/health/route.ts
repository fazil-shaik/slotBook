import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";

export async function GET(req: NextRequest) {
  const start = Date.now();
  const requestId = req.headers.get("x-request-id") || `req_${Date.now()}`;

  try {
    // Check DB connection
    await pool.query("SELECT 1");

    // Bookings count by status
    const statusCountsRes = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM bookings 
      GROUP BY status
    `);
    const statusCounts: Record<string, number> = {};
    for (const row of statusCountsRes.rows) {
      statusCounts[row.status] = parseInt(row.count, 10);
    }

    // Active holds count
    const activeHoldsRes = await pool.query(`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE status = 'held' AND hold_expires_at > NOW()
    `);
    const activeHolds = parseInt(activeHoldsRes.rows[0].count, 10);

    // Expired holds count
    const expiredHoldsRes = await pool.query(`
      SELECT COUNT(*) as count
      FROM bookings
      WHERE status = 'expired'
    `);
    const expiredHolds = parseInt(expiredHoldsRes.rows[0].count, 10);

    // Total confirmed bookings
    const confirmedCount = statusCounts["confirmed"] || 0;

    // Notifications metrics
    const notifStatsRes = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
             MAX(created_at) as last_emitted_at
      FROM notifications
    `);
    const notifStats = notifStatsRes.rows[0];

    const latencyMs = Date.now() - start;

    return NextResponse.json(
      {
        status: "healthy",
        uptime_seconds: process.uptime(),
        timestamp: new Date().toISOString(),
        request_id: requestId,
        database: {
          status: "connected",
          ping_ms: latencyMs,
        },
        metrics: {
          confirmed_bookings: confirmedCount,
          active_holds: activeHolds,
          expired_holds: expiredHolds,
          cancelled_bookings: statusCounts["cancelled"] || 0,
          notifications: {
            total_emitted: parseInt(notifStats.total, 10),
            delivered: parseInt(notifStats.delivered, 10),
            last_emitted_at: notifStats.last_emitted_at,
          },
        },
      },
      {
        headers: {
          "x-request-id": requestId,
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        status: "unhealthy",
        error: err.message,
        timestamp: new Date().toISOString(),
        request_id: requestId,
      },
      {
        status: 503,
        headers: {
          "x-request-id": requestId,
        },
      }
    );
  }
}
