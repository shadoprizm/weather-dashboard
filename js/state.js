/**
 * Persistent client state: unit preferences and saved locations.
 *
 * Everything lives in localStorage. There is no account system and no server
 * -side profile, which is the point -- this is your dashboard on your device.
 */

// Deliberately unchanged through the rename: this key holds real visitors'
// saved locations and unit preferences, and a new one would quietly discard
// them on the first load after deploy.
const STORAGE_KEY = 'skywatch.v2';

const DEFAULT_UNITS = {
  temp: 'c',        // c | f
  wind: 'kmh',      // kmh | mph | ms | kn
  precip: 'mm',     // mm | in
  pressure: 'hpa',  // hpa | inhg
  distance: 'km',   // km | mi
  clock: '12',      // 12 | 24
};

const IMPERIAL_UNITS = {
  temp: 'f', wind: 'mph', precip: 'in', pressure: 'inhg', distance: 'mi', clock: '12',
};

export const STARTER_LOCATIONS = [
  { id: 'ottawa', name: 'Ottawa', admin1: 'Ontario', country: 'Canada', countryCode: 'CA', latitude: 45.42, longitude: -75.7 },
  { id: 'toronto', name: 'Toronto', admin1: 'Ontario', country: 'Canada', countryCode: 'CA', latitude: 43.65, longitude: -79.38 },
  { id: 'vancouver', name: 'Vancouver', admin1: 'British Columbia', country: 'Canada', countryCode: 'CA', latitude: 49.28, longitude: -123.12 },
];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    // Private-mode browsers and corrupt payloads both land here; start fresh.
    return null;
  }
}

function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    /* Storage full or blocked -- the session still works, it just won't stick. */
  }
}

/** A stable id for a place, so the same city added twice does not duplicate. */
export function locationId(place) {
  return `${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`;
}

export function normalizePlace(place) {
  return {
    id: place.id ? String(place.id) : locationId(place),
    name: place.name,
    admin1: place.admin1 || null,
    country: place.country || null,
    countryCode: place.countryCode || null,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    timezone: place.timezone || null,
  };
}

/** Human-readable place label: "Ottawa, Ontario". */
export function placeLabel(place, { withCountry = false } = {}) {
  if (!place) return 'Unknown location';
  const parts = [place.name];
  if (place.admin1 && place.admin1 !== place.name) parts.push(place.admin1);
  if (withCountry && place.country) parts.push(place.country);
  return parts.join(', ');
}

const listeners = new Set();

const state = (() => {
  const saved = load();
  const locations = (saved && Array.isArray(saved.locations) && saved.locations.length)
    ? saved.locations.map(normalizePlace)
    : STARTER_LOCATIONS.map(normalizePlace);

  return {
    units: { ...DEFAULT_UNITS, ...(saved && saved.units) },
    // Whether the visitor has ever picked a unit system themselves. Until they
    // have, a page that arrives knowing where it is (a US city page, say) may
    // set a sensible default without overriding anyone's choice.
    unitsChosen: Boolean(saved && saved.unitsChosen),
    locations,
    activeId: (saved && saved.activeId) || locations[0].id,
    theme: (saved && saved.theme) || 'auto', // auto | dark | light
  };
})();

function emit() {
  persist(state);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState() {
  return state;
}

export function getUnits() {
  return state.units;
}

export function getActiveLocation() {
  return state.locations.find((l) => l.id === state.activeId) || state.locations[0] || null;
}

/**
 * Take the units a server-rendered page chose, unless the visitor has chosen.
 *
 * Landing on /weather/chicago in Celsius, then watching it flip, is a worse
 * first impression than simply arriving in Fahrenheit. Returns true if the
 * preference actually changed.
 */
export function adoptUnits(units) {
  if (!units || state.unitsChosen) return false;
  const next = { ...state.units, ...units };
  const changed = Object.keys(next).some((key) => next[key] !== state.units[key]);
  if (!changed) return false;
  state.units = next;
  emit();
  return true;
}

export function setUnit(key, value) {
  if (!(key in DEFAULT_UNITS)) return;
  state.units[key] = value;
  state.unitsChosen = true;
  emit();
}

/** One-tap switch between the two systems most people actually want. */
export function setUnitSystem(system) {
  state.units = { ...(system === 'imperial' ? IMPERIAL_UNITS : DEFAULT_UNITS), clock: state.units.clock };
  state.unitsChosen = true;
  emit();
}

export function isMetric() {
  return state.units.temp === 'c';
}

export function setTheme(theme) {
  state.theme = theme;
  emit();
}

export function setActive(id) {
  if (!state.locations.some((l) => l.id === id)) return;
  state.activeId = id;
  emit();
}

/** Add a place (or focus it if already saved) and make it active. */
export function addLocation(place) {
  const normalized = normalizePlace(place);
  const existing = state.locations.find(
    (l) => locationId(l) === locationId(normalized)
  );

  if (existing) {
    state.activeId = existing.id;
  } else {
    state.locations.push(normalized);
    state.activeId = normalized.id;
  }
  emit();
  return getActiveLocation();
}

export function removeLocation(id) {
  if (state.locations.length <= 1) return; // never leave the dashboard empty
  state.locations = state.locations.filter((l) => l.id !== id);
  if (state.activeId === id) state.activeId = state.locations[0].id;
  emit();
}

export function moveLocation(id, offset) {
  const index = state.locations.findIndex((l) => l.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= state.locations.length) return;
  const [item] = state.locations.splice(index, 1);
  state.locations.splice(target, 0, item);
  emit();
}
