export interface Host {
  id: string;
  name: string;
  email: string;
  slug: string;
  time_zone: string;
  daily_cap: number | null;
  created_at: string;
  updated_at: string;
}

export interface EventType {
  id: string;
  host_id: string;
  name: string;
  slug: string;
  description: string;
  duration_min: number;
  capacity: number;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_hours: number;
  booking_horizon_days: number;
  per_guest_limit: boolean;
  created_at: string;
  updated_at: string;
}

export interface Availability {
  id: string;
  host_id: string;
  day_of_week: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  start_time: string;  // "09:00"
  end_time: string;    // "17:00"
  created_at: string;
}

export interface DateOverride {
  id: string;
  host_id: string;
  override_date: string; // "YYYY-MM-DD"
  is_unavailable: boolean;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

export type BookingStatus = "held" | "confirmed" | "cancelled" | "expired";

export interface Booking {
  id: string;
  event_type_id: string;
  host_id: string;
  slot_start: string; // ISO
  slot_end: string;   // ISO
  status: BookingStatus;
  guest_name: string | null;
  guest_email: string | null;
  guest_notes: string | null;
  manage_token: string;
  hold_expires_at: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Slot {
  start: string; // ISO 8601 UTC
  end: string;   // ISO 8601 UTC
  formatted_start: string; // formatted in requested target timezone
  formatted_end: string;
  available_capacity: number;
  max_capacity: number;
}

export interface HoldRequest {
  event_type_id: string;
  slot_start: string; // ISO
}

export interface HoldResponse {
  hold_id: string;
  slot_start: string;
  slot_end: string;
  expires_at: string;
  manage_token: string;
  remaining_seconds: number;
}

export interface ConfirmRequest {
  name: string;
  email: string;
  notes?: string;
}

export interface NotificationRecord {
  id: string;
  event_type: string;
  booking_id: string | null;
  recipient_email: string;
  recipient_name: string;
  payload: any;
  status: string;
  created_at: string;
}
