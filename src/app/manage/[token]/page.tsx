"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Slot } from "@/lib/types";

export default function GuestManagePage() {
  const params = useParams();
  const token = params.token as string;

  const [booking, setBooking] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reschedule state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [selectedNewSlot, setSelectedNewSlot] = useState<Slot | null>(null);
  const [reschedulingLoading, setReschedulingLoading] = useState(false);

  // Cancel state
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancellingLoading, setCancellingLoading] = useState(false);

  const fetchBooking = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookings/${token}`);
      if (!res.ok) {
        throw new Error("Booking not found");
      }
      const data = await res.json();
      setBooking(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooking();
  }, [token]);

  const loadSlotsForReschedule = async () => {
    if (!booking) return;
    setIsRescheduling(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await fetch(
        `/api/hosts/${booking.host.slug}/events/${booking.event.slug}/slots?tz=${encodeURIComponent(tz)}`
      );
      if (res.ok) {
        const data = await res.json();
        setAvailableSlots(data.slots || []);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!selectedNewSlot) return;
    setReschedulingLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_slot_start: selectedNewSlot.start,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reschedule");
      }

      setSuccessMsg("Booking rescheduled successfully!");
      setIsRescheduling(false);
      setSelectedNewSlot(null);
      fetchBooking();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReschedulingLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    setCancellingLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${token}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason || "Cancelled by guest",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to cancel");
      }

      setSuccessMsg("Booking cancelled.");
      setIsCancelling(false);
      fetchBooking();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancellingLoading(false);
    }
  };

  if (loading) {
    return <div className="max-w-xl mx-auto py-16 text-center text-slate-400">Loading booking...</div>;
  }

  if (error && !booking) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center">
        <div className="p-6 bg-white rounded-xl border border-rose-200 text-rose-700">
          <h2 className="text-lg font-bold mb-2">Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      {successMsg && (
        <div className="p-4 mb-6 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm font-semibold flex justify-between items-center">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-slate-500 font-bold">&times;</button>
        </div>
      )}

      {error && (
        <div className="p-4 mb-6 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-sm font-semibold flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-slate-500 font-bold">&times;</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden p-8">
        <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-6">
          <div>
            <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold block">
              Manage Booking
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
              {booking.event.name}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Host: <strong className="text-slate-800">{booking.host.name}</strong> ({booking.host.email})
            </p>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              booking.status === "confirmed"
                ? "bg-emerald-100 text-emerald-800"
                : booking.status === "cancelled"
                ? "bg-rose-100 text-rose-800"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {booking.status}
          </span>
        </div>

        {/* Details Card */}
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-8 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Date & Time:</span>
            <strong className="text-slate-900">
              {new Date(booking.slot_start).toLocaleString(undefined, {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Duration:</span>
            <strong className="text-slate-900">{booking.event.duration_min} minutes</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Guest Name:</span>
            <strong className="text-slate-900">{booking.guest_name}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Guest Email:</span>
            <strong className="text-slate-900">{booking.guest_email}</strong>
          </div>
          {booking.guest_notes && (
            <div className="pt-2 border-t border-slate-200">
              <span className="text-slate-500 block mb-1">Notes:</span>
              <p className="text-xs text-slate-700 italic bg-white p-2.5 rounded border border-slate-200">
                &quot;{booking.guest_notes}&quot;
              </p>
            </div>
          )}
          {booking.cancellation_reason && (
            <div className="pt-2 border-t border-rose-200 text-rose-700">
              <span className="font-semibold block mb-1">Cancellation Reason:</span>
              <p className="text-xs italic">&quot;{booking.cancellation_reason}&quot;</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {booking.status === "confirmed" && !isRescheduling && !isCancelling && (
          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/bookings/${token}/ics`}
              className="flex-1 py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-sm text-center shadow-sm"
            >
              📅 Download Calendar Invite (.ics)
            </a>
            <button
              onClick={loadSlotsForReschedule}
              className="py-2.5 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-sm"
            >
              Reschedule Slot
            </button>
            <button
              onClick={() => setIsCancelling(true)}
              className="py-2.5 px-4 border border-rose-200 hover:bg-rose-50 text-rose-600 font-semibold rounded-lg text-sm"
            >
              Cancel Booking
            </button>
          </div>
        )}

        {/* Reschedule View */}
        {isRescheduling && (
          <div className="pt-6 border-t border-slate-200">
            <h3 className="font-bold text-slate-900 mb-2">Select a New Slot to Reschedule</h3>
            <p className="text-xs text-slate-500 mb-4">
              Your previous slot will be atomically released and moved to the new chosen time.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto mb-4 p-1">
              {availableSlots.slice(0, 15).map((s) => (
                <button
                  key={s.start}
                  onClick={() => setSelectedNewSlot(s)}
                  className={`p-2.5 border rounded-lg text-xs font-semibold text-center transition-all ${
                    selectedNewSlot?.start === s.start
                      ? "border-sky-600 bg-sky-50 text-sky-900 ring-2 ring-sky-500"
                      : "border-slate-200 hover:border-slate-400 text-slate-700"
                  }`}
                >
                  <div>{new Date(s.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                  <div>{new Date(s.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsRescheduling(false);
                  setSelectedNewSlot(null);
                }}
                className="px-4 py-2 border rounded-lg text-sm font-semibold text-slate-600"
              >
                Back
              </button>
              <button
                onClick={handleConfirmReschedule}
                disabled={!selectedNewSlot || reschedulingLoading}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {reschedulingLoading ? "Moving..." : "Confirm Move"}
              </button>
            </div>
          </div>
        )}

        {/* Cancel View */}
        {isCancelling && (
          <div className="pt-6 border-t border-slate-200">
            <h3 className="font-bold text-slate-900 mb-2 text-rose-600">Cancel Booking</h3>
            <p className="text-xs text-slate-500 mb-4">
              Are you sure? This will permanently cancel the booking and notify the host.
            </p>
            <textarea
              rows={2}
              placeholder="Reason for cancellation (optional)..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCancelling(false)}
                className="px-4 py-2 border rounded-lg text-sm font-semibold text-slate-600"
              >
                Dismiss
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={cancellingLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {cancellingLoading ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
