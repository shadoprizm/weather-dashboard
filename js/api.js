/** Thin client for the dashboard's own `/api/*` proxy. */

async function get(path, params = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body && body.error) detail = body.error;
    } catch (error) { /* non-JSON error body */ }
    throw new Error(detail);
  }
  return response.json();
}

export function fetchForecast(lat, lon) {
  return get('/api/weather', { lat, lon });
}

export function searchPlaces(query) {
  return get('/api/geocode', { q: query });
}

export function reverseGeocode(lat, lon) {
  return get('/api/reverse', { lat, lon });
}

export function fetchAlerts(lat, lon) {
  return get('/api/alerts', { lat, lon });
}

export function fetchRadarIndex() {
  return get('/api/radar');
}

export function fetchAlmanac(lat, lon, date) {
  return get('/api/almanac', { lat, lon, date });
}

export function fetchSpaceWeather() {
  return get('/api/space');
}

/** Resolve to `fallback` instead of rejecting, for optional panels. */
export async function soft(promise, fallback = null) {
  try {
    return await promise;
  } catch (error) {
    return fallback;
  }
}
