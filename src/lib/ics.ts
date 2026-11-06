export interface IcsEventOptions {
  uid: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  organizerName: string;
  organizerEmail: string;
  attendeeName?: string;
  attendeeEmail?: string;
  sequence?: number;
  status?: "CONFIRMED" | "CANCELLED";
  url?: string;
}

function formatDateToICS(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function generateICS(opts: IcsEventOptions): string {
  const now = formatDateToICS(new Date());
  const dtStart = formatDateToICS(opts.start);
  const dtEnd = formatDateToICS(opts.end);
  const sequence = opts.sequence || 0;
  const status = opts.status || "CONFIRMED";
  const method = status === "CANCELLED" ? "CANCEL" : "REQUEST";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Slotbook//Slotbook Calendar Engine//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}@slotbook.app`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${opts.summary}`,
    `DESCRIPTION:${opts.description.replace(/\n/g, "\\n")}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${status}`,
    `ORGANIZER;CN=${opts.organizerName}:mailto:${opts.organizerEmail}`,
  ];

  if (opts.attendeeEmail && opts.attendeeName) {
    lines.push(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${opts.attendeeName}:mailto:${opts.attendeeEmail}`);
  }

  if (opts.url) {
    lines.push(`URL:${opts.url}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}
