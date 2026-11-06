import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { generateICS } from "@/lib/ics";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  const res = await pool.query(
    `SELECT b.*, 
            et.name as event_name, 
            et.description as event_description,
            h.name as host_name, 
            h.email as host_email
     FROM bookings b
     JOIN event_types et ON b.event_type_id = et.id
     JOIN hosts h ON b.host_id = h.id
     WHERE b.manage_token = $1`,
    [token]
  );

  if (res.rows.length === 0) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const b = res.rows[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const icsData = generateICS({
    uid: b.id,
    summary: `${b.event_name} with ${b.host_name}`,
    description: `Booking with ${b.host_name}.\nManage your booking: ${appUrl}/manage/${b.manage_token}\n\nNotes: ${b.guest_notes || "None"}`,
    start: new Date(b.slot_start),
    end: new Date(b.slot_end),
    organizerName: b.host_name,
    organizerEmail: b.host_email,
    attendeeName: b.guest_name || undefined,
    attendeeEmail: b.guest_email || undefined,
    status: b.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
    url: `${appUrl}/manage/${b.manage_token}`,
  });

  return new NextResponse(icsData, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="slotbook-${b.id}.ics"`,
    },
  });
}
