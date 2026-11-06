import { NextRequest, NextResponse } from "next/server";
import { rescheduleBookingWithLock } from "@/lib/engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { new_slot_start } = body;
  if (!new_slot_start) {
    return NextResponse.json({ error: "new_slot_start is required" }, { status: 400 });
  }

  try {
    const result = await rescheduleBookingWithLock({
      token,
      newSlotStart: new_slot_start,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Reschedule error:", err);
    return NextResponse.json({ error: "Failed to reschedule booking" }, { status: 500 });
  }
}
