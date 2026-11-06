"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Slot } from "@/lib/types";

export default function GuestBookingPage() {
  const params = useParams();
  const router = useRouter();
  const hostSlug = params.host as string;
  const eventSlug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState<any>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [guestTz, setGuestTz] = useState<string>("UTC");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Hold State
  const [activeHold, setActiveHold] = useState<{
    hold_id: string;
    slot_start: string;
    slot_end: string;
    expires_at: string;
    remaining_seconds: number;
    manage_token: string;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(300);

  // Form State
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestNotes, setGuestNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmed State
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);

  // Waitlist State
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);

  // Detect browser timezone on mount
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setGuestTz(detected);
    } catch {
      setGuestTz("UTC");
    }
  }, []);

  // Fetch slots whenever timezone or host/event changes
  const fetchSlots = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/hosts/${hostSlug}/events/${eventSlug}/slots?tz=${encodeURIComponent(guestTz)}`
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load slots");
      }
      const data = await res.json();
      setEventData(data);
      setSlots(data.slots);

      // Auto-select first available date if none selected
      if (data.slots.length > 0 && !selectedDate) {
        const firstDate = data.slots[0].start.slice(0, 10);
        setSelectedDate(firstDate);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [hostSlug, eventSlug, guestTz]);

  // Hold countdown timer
  useEffect(() => {
    if (!activeHold) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const expiry = new Date(activeHold.expires_at).getTime();
      const diffSec = Math.max(0, Math.floor((expiry - now) / 1000));
      setSecondsLeft(diffSec);

      if (diffSec <= 0) {
        clearInterval(interval);
        setActiveHold(null);
        setErrorMessage("Your 5-minute hold expired. Please select a slot again.");
        fetchSlots();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeHold]);

  // Request a 5-minute hold on a slot
  const handleSelectSlot = async (slot: Slot) => {
    setErrorMessage(null);
    setSubmitting(true);
    const idempotencyKey = `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await fetch(`/api/holds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          event_type_id: eventData.event_type.id,
          slot_start: slot.start,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to hold slot");
      }

      setActiveHold(data);
      setSecondsLeft(data.remaining_seconds || 300);
    } catch (err: any) {
      setErrorMessage(err.message);
      fetchSlots(); // refresh in case it was booked
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm booking
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeHold) return;

    setErrorMessage(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/holds/${activeHold.hold_id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: guestName,
          email: guestEmail,
          notes: guestNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to confirm booking");
      }

      setConfirmedBooking(data);
      setActiveHold(null);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Join waitlist
  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !eventData) return;
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type_id: eventData.event_type.id,
          slot_start: new Date(selectedDate + "T14:00:00Z").toISOString(),
          name: guestName,
          email: guestEmail,
        }),
      });
      if (res.ok) {
        setWaitlistSuccess(true);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Group slots by date string (YYYY-MM-DD in guest timezone)
  const slotsByDate = slots.reduce((acc, slot) => {
    const d = slot.formatted_start.slice(0, 10);
    if (!acc[d]) acc[d] = [];
    acc[d].push(slot);
    return acc;
  }, {} as Record<string, Slot[]>);

  const availableDates = Object.keys(slotsByDate).sort();

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Confirmed State View */}
      {confirmedBooking ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xl text-center max-w-lg mx-auto">
          <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl mb-4">
            ✓
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Booking Confirmed!</h2>
          <p className="text-sm text-slate-600 mb-6">
            You are scheduled with <strong className="text-slate-800">{eventData?.host.name}</strong> for{" "}
            <strong>{eventData?.event_type.name}</strong>.
          </p>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left text-sm mb-6 space-y-2">
            <div>
              <span className="text-slate-500">When:</span>{" "}
              <strong className="text-slate-800">
                {new Date(confirmedBooking.slot_start).toLocaleString(undefined, {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Attendee:</span>{" "}
              <strong className="text-slate-800">{confirmedBooking.guest_name} ({confirmedBooking.guest_email})</strong>
            </div>
            <div>
              <span className="text-slate-500">Time Zone:</span>{" "}
              <span className="font-mono text-xs text-slate-700">{guestTz}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href={`/api/bookings/${confirmedBooking.manage_token}/ics`}
              className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-sm shadow-sm transition-all"
            >
              📅 Add to Calendar (.ics)
            </a>
            <a
              href={`/manage/${confirmedBooking.manage_token}`}
              className="w-full py-3 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg text-sm transition-all"
            >
              Manage / Reschedule / Cancel
            </a>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden grid md:grid-cols-12">
          {/* Event Summary Left Column */}
          <div className="p-8 border-b md:border-b-0 md:border-r border-slate-200 md:col-span-5 bg-slate-50/50">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {eventData?.host.name || "Host"}
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1 mb-2">
              {eventData?.event_type.name || "Loading..."}
            </h1>
            <div className="flex items-center gap-3 text-sm text-slate-600 mb-6 font-medium">
              <span>⏱️ {eventData?.event_type.duration_min} mins</span>
              <span>👥 Capacity: {eventData?.event_type.capacity}</span>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              {eventData?.event_type.description || "Schedule a meeting directly on my calendar."}
            </p>

            {/* Timezone Switcher */}
            <div className="pt-6 border-t border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                🌐 Time Zone
              </label>
              <select
                value={guestTz}
                onChange={(e) => setGuestTz(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded px-2.5 py-2 bg-white font-medium"
              >
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="America/New_York">America/New_York (Eastern)</option>
                <option value="America/Chicago">America/Chicago (Central)</option>
                <option value="America/Denver">America/Denver (Mountain)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (Pacific)</option>
                <option value="Europe/London">Europe/London (UK)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEST)</option>
              </select>
              <span className="text-2xs text-slate-400 mt-1 block">
                Slots automatically shift to your selected timezone.
              </span>
            </div>
          </div>

          {/* Slots & Booking Form Right Column */}
          <div className="p-8 md:col-span-7">
            {errorMessage && (
              <div className="p-3 mb-6 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {errorMessage}
              </div>
            )}

            {activeHold ? (
              /* Step 2: Slot Held - Fill Details */
              <div>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-amber-800 uppercase block">
                      Slot Reserved
                    </span>
                    <strong className="text-sm text-slate-900">
                      {new Date(activeHold.slot_start).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      -{" "}
                      {new Date(activeHold.slot_end).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
                  </div>
                  <div className="text-right">
                    <span className="text-2xs text-amber-700 font-semibold uppercase block">
                      Hold Expires in
                    </span>
                    <span className="font-mono text-lg font-bold text-amber-900">
                      {Math.floor(secondsLeft / 60)}:
                      {String(secondsLeft % 60).padStart(2, "0")}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleConfirmBooking} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Your Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jane Doe"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Your Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. jane@example.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Additional Notes or Questions
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Brief note on what you would like to discuss..."
                      value={guestNotes}
                      onChange={(e) => setGuestNotes(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveHold(null)}
                      className="px-4 py-2.5 border border-slate-300 text-slate-700 font-semibold text-sm rounded-lg hover:bg-slate-50"
                    >
                      Choose Different Slot
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm rounded-lg shadow-sm disabled:opacity-50"
                    >
                      {submitting ? "Confirming..." : "Confirm Booking"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Step 1: Browse Dates & Pick Slot */
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-4">Select Date & Time</h2>

                {loading ? (
                  <div className="py-12 text-center text-slate-400">Computing available slots...</div>
                ) : availableDates.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-sm text-slate-500 mb-3">No available slots found for the next 30 days.</p>
                    <button
                      onClick={() => setShowWaitlistModal(true)}
                      className="px-4 py-2 text-xs font-semibold bg-sky-600 text-white rounded-md"
                    >
                      Join Waitlist
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* Date Horizontal Selector */}
                    <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
                      {availableDates.map((dateStr) => {
                        const dateObj = new Date(dateStr + "T00:00:00");
                        const isSelected = selectedDate === dateStr;
                        return (
                          <button
                            key={dateStr}
                            onClick={() => setSelectedDate(dateStr)}
                            className={`p-3 rounded-xl border text-center min-w-[76px] transition-all ${
                              isSelected
                                ? "border-sky-600 bg-sky-50 text-sky-900 font-bold shadow-xs"
                                : "border-slate-200 hover:border-slate-300 text-slate-700"
                            }`}
                          >
                            <span className="text-2xs block uppercase text-slate-400 font-semibold">
                              {dateObj.toLocaleDateString(undefined, { weekday: "short" })}
                            </span>
                            <span className="text-lg block font-mono">
                              {dateObj.getDate()}
                            </span>
                            <span className="text-2xs block text-slate-500">
                              {dateObj.toLocaleDateString(undefined, { month: "short" })}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Time Slots for Selected Date */}
                    {selectedDate && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Available Times for {selectedDate}
                          </span>
                          <span className="text-2xs text-slate-400">
                            {slotsByDate[selectedDate]?.length || 0} slots
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                          {slotsByDate[selectedDate]?.map((slot) => {
                            const timeStr = new Date(slot.start).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                            return (
                              <button
                                key={slot.start}
                                onClick={() => handleSelectSlot(slot)}
                                disabled={submitting}
                                className="p-3 border border-slate-200 hover:border-sky-500 hover:bg-sky-50 text-slate-800 rounded-lg text-sm font-semibold text-center transition-all group flex flex-col items-center justify-center"
                              >
                                <span>{timeStr}</span>
                                {slot.max_capacity > 1 && (
                                  <span className="text-2xs text-slate-500 font-normal group-hover:text-sky-700">
                                    {slot.available_capacity} left
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Waitlist Modal */}
      {showWaitlistModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Join Waitlist</h3>
            <p className="text-sm text-slate-500 mb-4">
              Enter your email and you will be notified as soon as a slot becomes available.
            </p>
            {waitlistSuccess ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded text-sm text-center">
                ✓ You have been added to the waitlist!
              </div>
            ) : (
              <form onSubmit={handleJoinWaitlist} className="space-y-4">
                <input
                  type="text"
                  required
                  placeholder="Your Name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded p-2"
                />
                <input
                  type="email"
                  required
                  placeholder="Your Email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded p-2"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWaitlistModal(false)}
                    className="px-4 py-2 border rounded text-sm font-semibold text-slate-600"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-sky-600 text-white rounded text-sm font-semibold"
                  >
                    Submit
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
