/** Convert a forecast wall clock with its location's zone, including DST. */
export function wallTimeToUtc(time, timezone, fallbackOffset = 0) {
  const target = Date.parse(`${time.slice(0, 16)}:00Z`);
  if (!Number.isFinite(target)) throw new Error('Invalid event time');
  if (!timezone) return new Date(target - fallbackOffset * 1000);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let instant = target;
  for (let i = 0; i < 4; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const observed = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    if (observed === target) return new Date(instant);
    instant += target - observed;
  }
  throw new Error('This local time falls in a daylight-saving clock change. Choose another window.');
}

function escape(value) { return String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
function stamp(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }

function fold(line) {
  const parts = []; let current = ''; let bytes = 0;
  for (const character of line) {
    const length = new TextEncoder().encode(character).length;
    if (bytes + length > 74) { parts.push(current); current = ' '; bytes = 1; }
    current += character; bytes += length;
  }
  parts.push(current); return parts.join('\r\n');
}

export function calendarEvent({ window, activity, place, timezone, utcOffsetSeconds, description = '', now = new Date(), uid }) {
  const start = wallTimeToUtc(window.start, timezone, utcOffsetSeconds);
  const end = wallTimeToUtc(window.end, timezone, utcOffsetSeconds);
  if (end <= start || (window.duration && end - start !== window.duration * 60000)) throw new Error('This window crosses a clock change. Choose another window.');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WeatherView//Outdoor Plan//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${escape(uid || `${start.getTime()}-${activity.id}@weatherview.cloud`)}`,
    `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(`${activity.label} — ${place.name}`)}`, `LOCATION:${escape(place.name)}`,
    `DESCRIPTION:${escape(`${description}\nBased on an hourly forecast. Check the latest forecast and official warnings before going out.`)}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].map(fold).join('\r\n');
}
