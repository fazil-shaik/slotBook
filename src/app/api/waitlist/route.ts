import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { nanoid } from "nanoid";

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { event_type_id, slot_start, name, email } = body;
  if (!event_type_id || !slot_start || !name || !email) {
    return NextResponse.json(
      { error: "Missing required fields: event_type_id, slot_start, name, and email are required" },
      { status: 400 }
    );
  }

  const id = `wait_${nanoid(12)}`;

  await pool.query(
    `INSERT INTO waitlist (id, event_type_id, slot_start, guest_name, guest_email, status)
     VALUES ($1, $2, $3, $4, $5, 'waiting')`,
    [id, event_type_id, slot_start, name.trim(), email.toLowerCase().trim()]
  );

  return NextResponse.json({
    id,
    message: "Successfully added to waitlist. You will be notified if a spot opens up!",
  });
}
