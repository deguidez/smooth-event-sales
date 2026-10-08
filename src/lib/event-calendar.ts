export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string;
  url: string;
};

function calendarDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("A data do evento é inválida.");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// RFC 5545: fold at 75 UTF-8 octets, without splitting a character.
function foldLine(line: string) {
  const encoder = new TextEncoder();
  let result = "";
  let size = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (size + length > 75) { result += "\r\n "; size = 1; }
    result += char;
    size += length;
  }
  return result;
}

export function createCalendarFile(event: CalendarEvent, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Inscreva//Ingresso//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${escapeText(event.id)}@inscreva`, `DTSTAMP:${calendarDate(now.toISOString())}`,
    `DTSTART:${calendarDate(event.startsAt)}`,
  ];
  if (event.endsAt && new Date(event.endsAt).getTime() > new Date(event.startsAt).getTime()) lines.push(`DTEND:${calendarDate(event.endsAt)}`);
  lines.push(`SUMMARY:${escapeText(event.title)}`, `LOCATION:${escapeText(event.location ?? "")}`,
    `DESCRIPTION:${escapeText(`Ingresso e comprovante da inscrição: ${event.url}`)}`, `URL:${event.url.replace(/[\r\n]/g, "")}`,
    "END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(event: CalendarEvent) {
  const start = calendarDate(event.startsAt);
  const end = event.endsAt && new Date(event.endsAt).getTime() > new Date(event.startsAt).getTime() ? calendarDate(event.endsAt) : start;
  const params = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${start}/${end}`,
    details: `Ingresso e comprovante da inscrição: ${event.url}`, location: event.location ?? "" });
  return `https://calendar.google.com/calendar/render?${params}`;
}