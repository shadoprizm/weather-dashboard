/**
 * Unit conversion and display formatting.
 *
 * The API always hands us metric, so every conversion lives here and the unit
 * toggle is a pure re-render with no refetch.
 */

export const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/* ---------------------------------------------------------- conversions */

export function toF(celsius) {
  return celsius * 9 / 5 + 32;
}

export const WIND_FACTORS = { kmh: 1, mph: 0.621371, ms: 0.277778, kn: 0.539957 };
export const WIND_LABELS = { kmh: 'km/h', mph: 'mph', ms: 'm/s', kn: 'kn' };

/* ------------------------------------------------------------ formatting */

const NBSP = ' ';

/** Temperature with a degree sign; `withUnit` appends C or F. */
export function temp(celsius, units, { withUnit = false, decimals = 0 } = {}) {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) return '--';
  const value = units.temp === 'f' ? toF(celsius) : celsius;
  const rounded = decimals > 0 ? value.toFixed(decimals) : Math.round(value);
  return `${rounded}°${withUnit ? (units.temp === 'f' ? 'F' : 'C') : ''}`;
}

/** Bare temperature number, for tight spots like chart labels. */
export function tempValue(celsius, units) {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) return null;
  return Math.round(units.temp === 'f' ? toF(celsius) : celsius);
}

export function wind(kmh, units, { withUnit = true } = {}) {
  if (kmh === null || kmh === undefined || Number.isNaN(kmh)) return '--';
  const value = Math.round(kmh * WIND_FACTORS[units.wind]);
  return withUnit ? `${value}${NBSP}${WIND_LABELS[units.wind]}` : String(value);
}

export function windUnitLabel(units) {
  return WIND_LABELS[units.wind];
}

/** Millimetres in, mm or inches out. Sub-unit amounts keep a decimal. */
export function precip(mm, units) {
  if (mm === null || mm === undefined || Number.isNaN(mm)) return '--';
  if (units.precip === 'in') {
    const inches = mm / 25.4;
    return `${inches < 1 ? inches.toFixed(2) : inches.toFixed(1)}"`;
  }
  return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)}${NBSP}mm`;
}

/** Centimetres of snow in, cm or inches out. */
export function snow(cm, units) {
  if (cm === null || cm === undefined || Number.isNaN(cm)) return '--';
  if (units.precip === 'in') return `${(cm / 2.54).toFixed(1)}"`;
  return `${cm < 10 ? cm.toFixed(1) : Math.round(cm)}${NBSP}cm`;
}

export function pressure(hpa, units) {
  if (hpa === null || hpa === undefined || Number.isNaN(hpa)) return '--';
  if (units.pressure === 'inhg') return `${(hpa * 0.02953).toFixed(2)}${NBSP}inHg`;
  return `${Math.round(hpa)}${NBSP}hPa`;
}

/** Visibility arrives in metres. */
export function distance(metres, units) {
  if (metres === null || metres === undefined || Number.isNaN(metres)) return '--';
  if (units.distance === 'mi') {
    const miles = metres / 1609.34;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)}${NBSP}mi`;
  }
  const km = metres / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)}${NBSP}km`;
}

export function percent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return `${Math.round(value)}%`;
}

export function compass(degrees) {
  if (degrees === null || degrees === undefined || Number.isNaN(degrees)) return '--';
  return COMPASS[Math.round(degrees / 22.5) % 16];
}

/** "18 km/h NW" */
export function windFull(kmh, degrees, units) {
  return `${wind(kmh, units)} ${compass(degrees)}`;
}

/* ----------------------------------------------------------------- time */

/**
 * Open-Meteo timestamps are wall-clock strings in the location's own
 * timezone with no offset ("2026-08-17T14:00"). Parsing them as local time is
 * exactly what we want: the dashboard should read in the location's time, not
 * the viewer's.
 */
export function parseLocal(isoLike) {
  if (!isoLike) return null;
  const date = new Date(isoLike);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function hourLabel(isoLike, units) {
  const date = parseLocal(isoLike);
  if (!date) return '--';
  if (units.clock === '24') {
    return `${String(date.getHours()).padStart(2, '0')}:00`;
  }
  const hour = date.getHours();
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${hour < 12 ? 'am' : 'pm'}`;
}

export function timeLabel(isoLike, units) {
  const date = parseLocal(isoLike);
  if (!date) return '--';
  if (units.clock === '24') {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  const hour = date.getHours();
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(date.getMinutes()).padStart(2, '0')}${NBSP}${hour < 12 ? 'am' : 'pm'}`;
}

/**
 * A live wall clock for a location, derived from its UTC offset rather than
 * from the observation timestamp (which only moves when we refetch).
 */
export function localClock(utcOffsetSeconds, units) {
  if (!Number.isFinite(utcOffsetSeconds)) return '--';
  const shifted = new Date(Date.now() + utcOffsetSeconds * 1000);
  const hours = shifted.getUTCHours();
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');

  if (units.clock === '24') return `${String(hours).padStart(2, '0')}:${minutes}`;
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes}${NBSP}${hours < 12 ? 'am' : 'pm'}`;
}

export function dayName(isoLike, { long = false } = {}) {
  const date = parseLocal(isoLike);
  if (!date) return '--';
  return date.toLocaleDateString(undefined, { weekday: long ? 'long' : 'short' });
}

export function dayNumber(isoLike) {
  const date = parseLocal(isoLike);
  if (!date) return '--';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "in 3h", "2h ago", "just now" */
export function relative(fromIso, nowIso) {
  const from = parseLocal(fromIso);
  const now = nowIso ? parseLocal(nowIso) : new Date();
  if (!from || !now) return '';

  const minutes = Math.round((from - now) / 60000);
  const absolute = Math.abs(minutes);
  if (absolute < 5) return 'now';

  const value = absolute < 60
    ? `${absolute} min`
    : absolute < 1440
      ? `${Math.round(absolute / 60)}h`
      : `${Math.round(absolute / 1440)}d`;

  return minutes > 0 ? `in ${value}` : `${value} ago`;
}

/** Seconds to "14h 32m", for daylight duration. */
export function duration(seconds) {
  if (!Number.isFinite(seconds)) return '--';
  const total = Math.round(seconds / 60);
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

/** Signed minute/second delta, for the day-length change readout. */
export function signedDuration(seconds) {
  if (!Number.isFinite(seconds)) return '--';
  const sign = seconds >= 0 ? '+' : '−';
  const abs = Math.abs(Math.round(seconds));
  const minutes = Math.floor(abs / 60);
  return `${sign}${minutes}m ${String(abs % 60).padStart(2, '0')}s`;
}

/** Signed temperature difference, e.g. "+4.2° vs normal". */
export function tempDelta(celsiusDelta, units) {
  if (!Number.isFinite(celsiusDelta)) return '--';
  const value = units.temp === 'f' ? celsiusDelta * 9 / 5 : celsiusDelta;
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${Math.abs(value).toFixed(1)}°`;
}
