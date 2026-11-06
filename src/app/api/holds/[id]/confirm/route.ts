import { NextRequest, NextResponse } from "next/server";
import { confirmBookingWithLock } from "@/lib/engine";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, email, notes } = body;
  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  // Basic email regex validation
  if (!email.includes("@") || !email.includes(".")) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  try {
    const result = await confirmBookingWithLock({
      holdId: id,
      name,
      email,
      notes,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Confirmation error:", err);
    return NextResponse.json({ error: "Failed to confirm booking" }, { status: 500 });
  }
}
