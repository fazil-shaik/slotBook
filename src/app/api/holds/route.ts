import { NextRequest, NextResponse } from "next/server";
import { createHoldWithLock } from "@/lib/engine";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // 1. Abuse Protection / Rate Limiting
  const ip = req.headers.get("x-forwarded-for") || "local_client";
  const rateLimit = checkRateLimit(ip, 30, 60000); // 30 holds per minute
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many hold requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateLimit.resetMs / 1000)) } }
    );
  }

  // 2. Read headers and body
  const idempotencyKey = req.headers.get("idempotency-key") || req.headers.get("Idempotency-Key");
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { event_type_id, slot_start } = body;
  if (!event_type_id || !slot_start) {
    return NextResponse.json(
      { error: "Missing required fields: event_type_id and slot_start are required" },
      { status: 400 }
    );
  }

  try {
    const result = await createHoldWithLock({
      eventTypeId: event_type_id,
      slotStart: slot_start,
      idempotencyKey,
    });

    const headers: Record<string, string> = {};
    if (result.fromIdempotency) {
      headers["X-Idempotent-Replay"] = "true";
    }

    return NextResponse.json(result.response, {
      status: result.fromIdempotency ? 200 : 201,
      headers,
    });
  } catch (err: any) {
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Hold creation error:", err);
    return NextResponse.json({ error: "Failed to create hold" }, { status: 500 });
  }
}
