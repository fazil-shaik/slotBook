import { NextRequest, NextResponse } from "next/server";
import { getHostBySlug, getEventTypeBySlug, computeAvailableSlots } from "@/lib/engine";
import { addDays } from "date-fns";

export async function GET(
  req: NextRequest,
  { params }: { params: { host: string; slug: string } }
) {
  const { host: hostSlug, slug: eventSlug } = params;
  const searchParams = req.nextUrl.searchParams;

  const tz = searchParams.get("tz") || "UTC";
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const host = await getHostBySlug(hostSlug);
  if (!host) {
    return NextResponse.json({ error: "Host not found" }, { status: 404 });
  }

  const eventType = await getEventTypeBySlug(host.id, eventSlug);
  if (!eventType) {
    return NextResponse.json({ error: "Event type not found" }, { status: 404 });
  }

  const now = new Date();
  const fromDate = fromParam ? new Date(fromParam) : now;
  const toDate = toParam ? new Date(toParam) : addDays(now, eventType.booking_horizon_days);

  try {
    const slots = await computeAvailableSlots({
      host,
      eventType,
      fromDate,
      toDate,
      guestTz: tz,
      now,
    });

    return NextResponse.json({
      host: {
        name: host.name,
        slug: host.slug,
        time_zone: host.time_zone,
      },
      event_type: {
        id: eventType.id,
        name: eventType.name,
        slug: eventType.slug,
        duration_min: eventType.duration_min,
        capacity: eventType.capacity,
        buffer_before_min: eventType.buffer_before_min,
        buffer_after_min: eventType.buffer_after_min,
        min_notice_hours: eventType.min_notice_hours,
        booking_horizon_days: eventType.booking_horizon_days,
      },
      time_zone: tz,
      slots,
    });
  } catch (err: any) {
    console.error("Error computing slots:", err);
    return NextResponse.json({ error: err.message || "Failed to compute slots" }, { status: 500 });
  }
}
