import { pool } from "@/db";
import { PoolClient, Pool } from "pg";
import { nanoid } from "nanoid";

export interface EmitNotificationParams {
  eventType: "booking.confirmed" | "booking.rescheduled" | "booking.cancelled" | "waitlist.offered";
  bookingId?: string | null;
  recipientEmail: string;
  recipientName: string;
  payload: Record<string, any>;
}

export async function emitNotification(clientOrPool: PoolClient | Pool, params: EmitNotificationParams) {
  const id = `notif_${nanoid(12)}`;
  const executor = clientOrPool || pool;

  await executor.query(
    `INSERT INTO notifications (id, event_type, booking_id, recipient_email, recipient_name, payload, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'delivered')`,
    [
      id,
      params.eventType,
      params.bookingId || null,
      params.recipientEmail,
      params.recipientName,
      JSON.stringify(params.payload),
    ]
  );

  console.log(
    JSON.stringify({
      level: "INFO",
      timestamp: new Date().toISOString(),
      type: "NOTIFICATION_EMITTED",
      notification_id: id,
      event_type: params.eventType,
      recipient: params.recipientEmail,
      booking_id: params.bookingId,
    })
  );

  return id;
}
