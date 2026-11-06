import Link from "next/link";

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold mb-4">
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          Slotbook Booking Engine
        </h1>
        <p className="mt-4 text-lg text-slate-600 leading-relaxed">
          Hosts publish when they are free, guests book a slot, and nobody is ever double-booked — even under extreme network concurrency, misbehaving clocks, or concurrent browser tabs.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link
            href="/dashboard"
            className="px-6 py-3 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-700 shadow-md transition-all text-sm"
          >
            Open Host Dashboard →
          </Link>
          <Link
            href="/rachit/30-min-intro"
            className="px-6 py-3 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 shadow-sm transition-all text-sm"
          >
            Guest Booking (30-min 1-on-1) →
          </Link>
          <Link
            href="/rachit/60-min-deep-dive"
            className="px-6 py-3 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 shadow-sm transition-all text-sm"
          >
            Guest Booking (60-min Group x3) →
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold mb-4">
            🔒
          </div>
          <h3 className="font-semibold text-slate-900 text-lg mb-2">Zero Double-Booking</h3>
          <p className="text-sm text-slate-600">
            Postgres transaction-scoped advisory locks & row locking guarantee strict serialization. Tested under 20x simultaneous concurrent hold attempts.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold mb-4">
            🌐
          </div>
          <h3 className="font-semibold text-slate-900 text-lg mb-2">Bulletproof Timezones</h3>
          <p className="text-sm text-slate-600">
            Host defines availability in home IANA zone (e.g. America/New_York). Guest views and books in their browser zone with seamless DST shifts.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="h-10 w-10 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold mb-4">
            ⏱️
          </div>
          <h3 className="font-semibold text-slate-900 text-lg mb-2">5-Min Holds & Idempotency</h3>
          <p className="text-sm text-slate-600">
            Selected slots are temporarily held for 5 minutes. Idempotency-Key support protects against duplicate charges or network retries.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-12">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h2 className="text-xl font-bold text-slate-900">Minimum JSON API Reference</h2>
          <p className="text-sm text-slate-600">Standardized REST endpoints conforming to the assignment brief:</p>
        </div>
        <div className="divide-y divide-slate-100 font-mono text-sm">
          <div className="p-4 flex items-center justify-between hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800">GET</span>
              <span className="text-slate-800">/api/hosts/&#123;host&#125;/events/&#123;slug&#125;/slots?from&amp;to&amp;tz</span>
            </div>
            <span className="text-xs text-slate-500 font-sans">Available slots calculated in guest TZ</span>
          </div>
          <div className="p-4 flex items-center justify-between hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">POST</span>
              <span className="text-slate-800">/api/holds</span>
            </div>
            <span className="text-xs text-slate-500 font-sans">Hold a slot (accepts Idempotency-Key header)</span>
          </div>
          <div className="p-4 flex items-center justify-between hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">POST</span>
              <span className="text-slate-800">/api/holds/&#123;id&#125;/confirm</span>
            </div>
            <span className="text-xs text-slate-500 font-sans">Confirm booking with guest name and email</span>
          </div>
          <div className="p-4 flex items-center justify-between hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">POST</span>
              <span className="text-slate-800">/api/bookings/&#123;token&#125;/reschedule</span>
            </div>
            <span className="text-xs text-slate-500 font-sans">Move confirmed booking to a new slot</span>
          </div>
          <div className="p-4 flex items-center justify-between hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">POST</span>
              <span className="text-slate-800">/api/bookings/&#123;token&#125;/cancel</span>
            </div>
            <span className="text-xs text-slate-500 font-sans">Cancel booking with optional reason</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 text-white rounded-xl p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">One-Command Concurrency & Engine Tests</h3>
            <p className="text-slate-400 text-sm mt-1">Run 20x race condition tests against local Postgres:</p>
          </div>
          <div className="font-mono bg-slate-800 px-4 py-2 rounded-lg border border-slate-700 text-emerald-400 text-sm">
            pnpm test
          </div>
        </div>
      </div>
    </div>
  );
}
