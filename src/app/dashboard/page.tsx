"use client";

import { useState, useEffect } from "react";
import { Host, EventType, Availability, DateOverride, Booking } from "@/lib/types";

export default function HostDashboardPage() {
  const [hostSlug, setHostSlug] = useState("rachit");
  const [host, setHost] = useState<Host | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [availabilities, setAvailabilities] = useState<Availability[]>([]);
  const [overrides, setOverrides] = useState<DateOverride[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"events" | "availability" | "overrides" | "bookings" | "notifications" | "settings">("bookings");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Forms
  const [newTz, setNewTz] = useState("");
  const [newDailyCap, setNewDailyCap] = useState<number | string>("");

  // New Event Form
  const [eventForm, setEventForm] = useState({
    name: "",
    slug: "",
    description: "",
    duration_min: 30,
    capacity: 1,
    buffer_before_min: 10,
    buffer_after_min: 10,
    min_notice_hours: 4,
    booking_horizon_days: 30,
    per_guest_limit: true,
  });

  // New Override Form
  const [overrideForm, setOverrideForm] = useState({
    override_date: "",
    is_unavailable: false,
    start_time: "09:00",
    end_time: "17:00",
  });

  // Cancellation Modal
  const [cancelModalBookingId, setCancelModalBookingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [hRes, etRes, avRes, ovRes, bkRes, notifRes] = await Promise.all([
        fetch(`/api/hosts/${hostSlug}`),
        fetch(`/api/hosts/${hostSlug}/events`),
        fetch(`/api/hosts/${hostSlug}/availability`),
        fetch(`/api/hosts/${hostSlug}/overrides`),
        fetch(`/api/hosts/${hostSlug}/bookings`),
        fetch(`/api/notifications?limit=20`),
      ]);

      if (hRes.ok) {
        const hData = await hRes.json();
        setHost(hData);
        setNewTz(hData.time_zone);
        setNewDailyCap(hData.daily_cap ?? "");
      }
      if (etRes.ok) setEventTypes(await etRes.json());
      if (avRes.ok) setAvailabilities(await avRes.json());
      if (ovRes.ok) setOverrides(await ovRes.json());
      if (bkRes.ok) setBookings(await bkRes.json());
      if (notifRes.ok) setNotifications(await notifRes.json());
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [hostSlug]);

  const handleUpdateHostSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/hosts/${hostSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          time_zone: newTz,
          daily_cap: newDailyCap === "" ? null : Number(newDailyCap),
        }),
      });
      if (res.ok) {
        setMessage({ text: "Host settings updated successfully!", type: "success" });
        loadData();
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to update settings", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleCreateEventType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/hosts/${hostSlug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventForm),
      });
      if (res.ok) {
        setMessage({ text: "Event type created successfully!", type: "success" });
        setEventForm({
          name: "",
          slug: "",
          description: "",
          duration_min: 30,
          capacity: 1,
          buffer_before_min: 10,
          buffer_after_min: 10,
          min_notice_hours: 4,
          booking_horizon_days: 30,
          per_guest_limit: true,
        });
        loadData();
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to create event", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleAddOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/hosts/${hostSlug}/overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrideForm),
      });
      if (res.ok) {
        setMessage({ text: "Date override added successfully!", type: "success" });
        loadData();
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to add override", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleDeleteOverride = async (id: string) => {
    try {
      const res = await fetch(`/api/hosts/${hostSlug}/overrides?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMessage({ text: "Override deleted", type: "success" });
        loadData();
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const handleCancelBooking = async () => {
    if (!cancelModalBookingId) return;
    try {
      const res = await fetch(`/api/hosts/${hostSlug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: cancelModalBookingId,
          reason: cancelReason || "Host cancelled appointment",
        }),
      });
      if (res.ok) {
        setMessage({ text: "Booking cancelled successfully!", type: "success" });
        setCancelModalBookingId(null);
        setCancelReason("");
        loadData();
      } else {
        const err = await res.json();
        setMessage({ text: err.error || "Failed to cancel booking", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Top Banner / Seeded Auth Switcher */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Host Dashboard</h1>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
              Authenticated
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Logged in as <strong className="text-slate-800">{host?.name || "Host"}</strong> ({host?.email}) &bull; Timezone: <strong className="text-slate-800">{host?.time_zone}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500">Demo Host:</label>
          <select
            value={hostSlug}
            onChange={(e) => setHostSlug(e.target.value)}
            className="text-sm bg-slate-50 border border-slate-300 rounded-md px-3 py-1.5 font-medium"
          >
            <option value="rachit">rachit (Default Seed Host)</option>
          </select>
          <button
            onClick={loadData}
            className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300"
          >
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg mb-6 flex justify-between items-center text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-500 hover:text-slate-800 font-bold">
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-8 space-x-1 sm:space-x-4 overflow-x-auto">
        {[
          { key: "bookings", label: `Upcoming Bookings (${bookings.filter(b => b.status === "confirmed").length})` },
          { key: "events", label: `Event Types (${eventTypes.length})` },
          { key: "availability", label: "Weekly Schedule" },
          { key: "overrides", label: `Date Overrides (${overrides.length})` },
          { key: "notifications", label: `Notification Sink (${notifications.length})` },
          { key: "settings", label: "Host Settings" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`py-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400">Loading dashboard...</div>
      ) : (
        <>
          {/* TAB 1: BOOKINGS */}
          {activeTab === "bookings" && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">All Bookings</h2>
                  <p className="text-xs text-slate-500">Upcoming, active holds, and past cancellations</p>
                </div>
              </div>

              {bookings.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No bookings yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3">Event</th>
                        <th className="px-6 py-3">Guest Details</th>
                        <th className="px-6 py-3">Slot Time (UTC / Host TZ)</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {bookings.map((b: any) => (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 font-medium text-slate-900">
                            {b.event_name}
                            <div className="text-xs text-slate-400 font-normal">{b.duration_min} min</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-800">{b.guest_name || "— (held)"}</div>
                            <div className="text-xs text-slate-500">{b.guest_email || "Pending confirmation"}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-mono text-xs text-slate-800">
                              {new Date(b.slot_start).toLocaleString()}
                            </div>
                            <div className="text-xs text-slate-400">to {new Date(b.slot_end).toLocaleTimeString()}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                b.status === "confirmed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : b.status === "held"
                                  ? "bg-amber-100 text-amber-800"
                                  : b.status === "cancelled"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {b.status}
                            </span>
                            {b.cancellation_reason && (
                              <div className="text-xs text-rose-600 mt-1 italic">
                                &quot;{b.cancellation_reason}&quot;
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {b.status === "confirmed" && (
                              <button
                                onClick={() => {
                                  setCancelModalBookingId(b.id);
                                  setCancelReason("");
                                }}
                                className="text-xs text-rose-600 hover:text-rose-800 font-medium border border-rose-200 hover:bg-rose-50 px-2 py-1 rounded"
                              >
                                Cancel with Reason
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EVENT TYPES */}
          {activeTab === "events" && (
            <div className="space-y-8">
              <div className="grid md:grid-cols-2 gap-6">
                {eventTypes.map((et) => (
                  <div key={et.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-slate-900">{et.name}</h3>
                      <span className="text-xs font-semibold px-2 py-1 bg-sky-50 text-sky-700 rounded border border-sky-100">
                        {et.duration_min} mins
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">{et.description || "No description provided."}</p>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div>Capacity: <strong className="text-slate-800">{et.capacity} {et.capacity === 1 ? "(1-on-1)" : "(Group)"}</strong></div>
                      <div>Min Notice: <strong className="text-slate-800">{et.min_notice_hours} hrs</strong></div>
                      <div>Buffer Before: <strong className="text-slate-800">{et.buffer_before_min} min</strong></div>
                      <div>Buffer After: <strong className="text-slate-800">{et.buffer_after_min} min</strong></div>
                      <div>Booking Horizon: <strong className="text-slate-800">{et.booking_horizon_days} days</strong></div>
                      <div>Per-Guest Limit: <strong className="text-slate-800">{et.per_guest_limit ? "Yes" : "No"}</strong></div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="font-mono text-slate-400">/{host?.slug}/{et.slug}</span>
                      <a
                        href={`/${host?.slug}/${et.slug}`}
                        target="_blank"
                        className="text-sky-600 hover:text-sky-800 font-semibold flex items-center gap-1"
                      >
                        Open Booking Page &rarr;
                      </a>
                    </div>
                  </div>
                ))}
              </div>

              {/* Create New Event Type Form */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Create New Event Type</h3>
                <form onSubmit={handleCreateEventType} className="grid md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 45-Min Strategy Session"
                      value={eventForm.name}
                      onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">URL Slug</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 45-min-strategy"
                      value={eventForm.slug}
                      onChange={(e) => setEventForm({ ...eventForm, slug: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (15–120 min)</label>
                    <input
                      type="number"
                      min={15}
                      max={120}
                      required
                      value={eventForm.duration_min}
                      onChange={(e) => setEventForm({ ...eventForm, duration_min: Number(e.target.value) })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity (1=1-on-1, &gt;1=Group)</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={eventForm.capacity}
                      onChange={(e) => setEventForm({ ...eventForm, capacity: Number(e.target.value) })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Buffer Before (0–30 min)</label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={eventForm.buffer_before_min}
                      onChange={(e) => setEventForm({ ...eventForm, buffer_before_min: Number(e.target.value) })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Buffer After (0–30 min)</label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={eventForm.buffer_after_min}
                      onChange={(e) => setEventForm({ ...eventForm, buffer_after_min: Number(e.target.value) })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Minimum Notice (hours)</label>
                    <input
                      type="number"
                      min={0}
                      value={eventForm.min_notice_hours}
                      onChange={(e) => setEventForm({ ...eventForm, min_notice_hours: Number(e.target.value) })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Booking Horizon (days)</label>
                    <input
                      type="number"
                      min={1}
                      value={eventForm.booking_horizon_days}
                      onChange={(e) => setEventForm({ ...eventForm, booking_horizon_days: Number(e.target.value) })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                    <textarea
                      rows={2}
                      placeholder="Brief event description..."
                      value={eventForm.description}
                      onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-sm shadow-sm"
                    >
                      Create Event Type
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: AVAILABILITY */}
          {activeTab === "availability" && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Weekly Availability Schedule</h3>
                  <p className="text-xs text-slate-500">
                    Defined in host&apos;s home timezone ({host?.time_zone}). Several windows per day allowed!
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => {
                  const dayWindows = availabilities.filter((a) => a.day_of_week === dayIdx);
                  return (
                    <div
                      key={dayIdx}
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="w-32 font-semibold text-sm text-slate-800">
                        {dayNames[dayIdx]}
                      </div>
                      <div className="flex-1 flex flex-wrap gap-2">
                        {dayWindows.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">Unavailable / Day Off</span>
                        ) : (
                          dayWindows.map((w) => (
                            <span
                              key={w.id}
                              className="px-3 py-1 bg-white border border-slate-300 rounded-md text-xs font-mono font-medium text-slate-800 shadow-2xs"
                            >
                              {w.start_time} &ndash; {w.end_time}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: DATE OVERRIDES */}
          {activeTab === "overrides" && (
            <div className="space-y-8">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Active Date Overrides</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Override default weekly hours on specific dates (e.g. vacation day off, or specific custom windows).
                </p>

                {overrides.length === 0 ? (
                  <p className="text-sm text-slate-400">No overrides configured.</p>
                ) : (
                  <div className="space-y-2">
                    {overrides.map((ov) => (
                      <div
                        key={ov.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <strong className="font-mono text-slate-800">{ov.override_date.slice(0, 10)}</strong>
                          {ov.is_unavailable ? (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">
                              Day Off (Blocked)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 font-mono">
                              Custom Hours: {ov.start_time} - {ov.end_time}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteOverride(ov.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add Override Form */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Add Date Override</h3>
                <form onSubmit={handleAddOverride} className="grid md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Date (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      required
                      value={overrideForm.override_date}
                      onChange={(e) => setOverrideForm({ ...overrideForm, override_date: e.target.value })}
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                    <select
                      value={overrideForm.is_unavailable ? "unavailable" : "custom"}
                      onChange={(e) =>
                        setOverrideForm({
                          ...overrideForm,
                          is_unavailable: e.target.value === "unavailable",
                        })
                      }
                      className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                    >
                      <option value="unavailable">Full Day Off</option>
                      <option value="custom">Custom Working Hours</option>
                    </select>
                  </div>

                  {!overrideForm.is_unavailable && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                        <input
                          type="time"
                          value={overrideForm.start_time}
                          onChange={(e) => setOverrideForm({ ...overrideForm, start_time: e.target.value })}
                          className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                        <input
                          type="time"
                          value={overrideForm.end_time}
                          onChange={(e) => setOverrideForm({ ...overrideForm, end_time: e.target.value })}
                          className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                        />
                      </div>
                    </>
                  )}

                  <div>
                    <button
                      type="submit"
                      className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded text-sm shadow-sm"
                    >
                      Save Override
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: NOTIFICATIONS AUDIT */}
          {activeTab === "notifications" && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Notifications Sink Event Log</h3>
                  <p className="text-xs text-slate-500">
                    Dispatched on confirm, reschedule, and cancel events (Brief requirement)
                  </p>
                </div>
              </div>

              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No events emitted yet.</div>
              ) : (
                <div className="overflow-x-auto font-mono text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3">Event Type</th>
                        <th className="px-6 py-3">Recipient</th>
                        <th className="px-6 py-3">Payload Summary</th>
                        <th className="px-6 py-3">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {notifications.map((n) => (
                        <tr key={n.id} className="hover:bg-slate-50">
                          <td className="px-6 py-3">
                            <span className="px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-800">
                              {n.event_type}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-slate-700">
                            {n.recipient_name} &lt;{n.recipient_email}&gt;
                          </td>
                          <td className="px-6 py-3 text-slate-500 truncate max-w-xs">
                            {JSON.stringify(n.payload)}
                          </td>
                          <td className="px-6 py-3 text-slate-400">
                            {new Date(n.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: HOST SETTINGS */}
          {activeTab === "settings" && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Host Profile & Timezone</h3>
              <form onSubmit={handleUpdateHostSettings} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Home Time Zone (IANA Standard)
                  </label>
                  <select
                    value={newTz}
                    onChange={(e) => setNewTz(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded px-3 py-2 bg-white"
                  >
                    <option value="America/New_York">America/New_York (Eastern Time)</option>
                    <option value="America/Chicago">America/Chicago (Central Time)</option>
                    <option value="America/Denver">America/Denver (Mountain Time)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Europe/Paris">Europe/Paris (CET)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                    <option value="UTC">UTC (Universal Coordinated Time)</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    Weekly availabilities and date overrides are interpreted in this timezone.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Daily Booking Cap (Optional Extension)
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 10 (Leave blank for unlimited)"
                    value={newDailyCap}
                    onChange={(e) => setNewDailyCap(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded px-3 py-2"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Host will take at most N bookings per local day.
                  </p>
                </div>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg text-sm shadow-sm"
                >
                  Save Settings
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {/* Host Cancel Modal */}
      {cancelModalBookingId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Cancel Booking</h3>
            <p className="text-sm text-slate-500 mb-4">
              Please provide a cancellation reason. An event will be emitted to the notification sink.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Conflict with urgent customer call"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full border border-slate-300 rounded p-2 text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCancelModalBookingId(null)}
                className="px-4 py-2 border border-slate-300 rounded text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Dismiss
              </button>
              <button
                onClick={handleCancelBooking}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-sm font-semibold"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
