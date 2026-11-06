import { NextRequest, NextResponse } from "next/server";
import { cancelBookingWithLock } from "@/lib/engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Body optional for cancel
  }

  try {
    const result = await cancelBookingWithLock({
      token,
      reason: body.reason,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Cancel error:", err);
    return NextResponse.json({ error: "Failed to cancel booking" }, { status: 500 });
  }
}
