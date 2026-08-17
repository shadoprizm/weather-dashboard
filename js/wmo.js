/**
 * WMO 4677 weather code interpretation.
 *
 * Each code maps to a label, an icon key (day/night aware), a sky theme that
 * drives the page gradient, and an intensity used by the activity scorer.
 */

const CODES = {
  0:  { label: 'Clear sky',            short: 'Clear',        icon: 'clear',    sky: 'clear',  intensity: 0 },
  1:  { label: 'Mainly clear',         short: 'Mainly clear', icon: 'partly',   sky: 'clear',  intensity: 0 },
  2:  { label: 'Partly cloudy',        short: 'Partly cloudy',icon: 'partly',   sky: 'cloud',  intensity: 0 },
  3:  { label: 'Overcast',             short: 'Overcast',     icon: 'overcast', sky: 'cloud',  intensity: 0 },
  45: { label: 'Fog',                  short: 'Fog',          icon: 'fog',      sky: 'fog',    intensity: 1 },
  48: { label: 'Freezing fog',         short: 'Rime fog',     icon: 'fog',      sky: 'fog',    intensity: 2 },
  51: { label: 'Light drizzle',        short: 'Drizzle',      icon: 'drizzle',  sky: 'rain',   intensity: 1 },
  53: { label: 'Drizzle',              short: 'Drizzle',      icon: 'drizzle',  sky: 'rain',   intensity: 1 },
  55: { label: 'Heavy drizzle',        short: 'Drizzle',      icon: 'rain',     sky: 'rain',   intensity: 2 },
  56: { label: 'Freezing drizzle',     short: 'Ice drizzle',  icon: 'sleet',    sky: 'snow',   intensity: 3 },
  57: { label: 'Heavy freezing drizzle', short: 'Ice drizzle',icon: 'sleet',    sky: 'snow',   intensity: 3 },
  61: { label: 'Light rain',           short: 'Light rain',   icon: 'rain',     sky: 'rain',   intensity: 1 },
  63: { label: 'Rain',                 short: 'Rain',         icon: 'rain',     sky: 'rain',   intensity: 2 },
  65: { label: 'Heavy rain',           short: 'Heavy rain',   icon: 'heavy-rain', sky: 'rain', intensity: 3 },
  66: { label: 'Freezing rain',        short: 'Ice',          icon: 'sleet',    sky: 'snow',   intensity: 4 },
  67: { label: 'Heavy freezing rain',  short: 'Ice storm',    icon: 'sleet',    sky: 'snow',   intensity: 4 },
  71: { label: 'Light snow',           short: 'Light snow',   icon: 'snow',     sky: 'snow',   intensity: 1 },
  73: { label: 'Snow',                 short: 'Snow',         icon: 'snow',     sky: 'snow',   intensity: 2 },
  75: { label: 'Heavy snow',           short: 'Heavy snow',   icon: 'heavy-snow', sky: 'snow', intensity: 4 },
  77: { label: 'Snow grains',          short: 'Snow grains',  icon: 'snow',     sky: 'snow',   intensity: 1 },
  80: { label: 'Light rain showers',   short: 'Showers',      icon: 'drizzle',  sky: 'rain',   intensity: 1 },
  81: { label: 'Rain showers',         short: 'Showers',      icon: 'rain',     sky: 'rain',   intensity: 2 },
  82: { label: 'Violent rain showers', short: 'Downpours',    icon: 'heavy-rain', sky: 'rain', intensity: 4 },
  85: { label: 'Snow showers',         short: 'Snow showers', icon: 'snow',     sky: 'snow',   intensity: 2 },
  86: { label: 'Heavy snow showers',   short: 'Snow squalls', icon: 'heavy-snow', sky: 'snow', intensity: 4 },
  95: { label: 'Thunderstorm',         short: 'Storms',       icon: 'thunder',  sky: 'storm',  intensity: 4 },
  96: { label: 'Thunderstorm with hail', short: 'Storms',     icon: 'thunder-hail', sky: 'storm', intensity: 5 },
  99: { label: 'Severe thunderstorm with hail', short: 'Severe storms', icon: 'thunder-hail', sky: 'storm', intensity: 5 },
};

const UNKNOWN = {
  label: 'Unknown', short: 'Unknown', icon: 'unknown', sky: 'cloud', intensity: 0,
};

/**
 * Look up a code. `isDay` picks the night variant of the clear/partly icons,
 * which is the difference between a sun and a moon on the card.
 */
export function describe(code, isDay = 1) {
  const entry = CODES[code] || UNKNOWN;
  const night = isDay === 0 || isDay === false;
  const icon =
    night && (entry.icon === 'clear' || entry.icon === 'partly')
      ? `${entry.icon}-night`
      : entry.icon === 'clear' || entry.icon === 'partly'
        ? `${entry.icon}-day`
        : entry.icon;

  return { ...entry, code, icon, isNight: night };
}

/** Sky theme name used for the page background gradient. */
export function skyTheme(code, isDay = 1) {
  const entry = CODES[code] || UNKNOWN;
  const night = isDay === 0 || isDay === false;
  return `${entry.sky}-${night ? 'night' : 'day'}`;
}

/** True when the code means something is falling out of the sky. */
export function isPrecipitating(code) {
  return code >= 51 && code !== 45 && code !== 48;
}

export function isFrozen(code) {
  return [56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(code);
}

export function isThunder(code) {
  return code >= 95;
}

export { CODES };
