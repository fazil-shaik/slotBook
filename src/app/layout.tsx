import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slotbook — Reliable Booking Engine",
  description: "Postgres-backed scheduling engine you would trust with money.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <a href="/" className="flex items-center space-x-2">
                <span className="h-8 w-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                  S
                </span>
                <span className="font-bold text-xl tracking-tight text-slate-900">
                  Slotbook
                </span>
              </a>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Postgres Engine Active
              </span>
            </div>

            <nav className="flex items-center space-x-4 text-sm font-medium">
              <a
                href="/dashboard"
                className="text-slate-600 hover:text-sky-600 transition-colors"
              >
                Host Dashboard
              </a>
              <a
                href="/rachit/30-min-intro"
                className="text-slate-600 hover:text-sky-600 transition-colors"
              >
                Public Booking (30m)
              </a>
              <a
                href="/rachit/60-min-deep-dive"
                className="text-slate-600 hover:text-sky-600 transition-colors"
              >
                Public Booking (60m)
              </a>
              <a
                href="/health"
                target="_blank"
                className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 font-mono"
              >
                /health
              </a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
