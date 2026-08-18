'use strict';

/**
 * US National Weather Service alerts.
 *
 * The easy case: a public, key-free, point-queryable GeoJSON API.
 */

const { fetchJsonSoft, buildUrl, probeUrl } = require('../upstream');

const ENDPOINT = 'https://api.weather.gov/alerts/active';

// Generous box covering CONUS, Alaska, Hawaii and the territories. Being
// loose costs one wasted request at the margins; being tight loses alerts.
const BOUNDS = { minLat: 13, maxLat: 72, minLon: -180, maxLon: -64 };

function covers(lat, lon) {
  return lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat
    && lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon;
}

async function fetchAlerts(lat, lon) {
  const data = await fetchJsonSoft(
    buildUrl(ENDPOINT, { point: `${lat},${lon}`, status: 'actual' }),
    null,
    { headers: { Accept: 'application/geo+json' } }
  );

  if (!data || !Array.isArray(data.features)) return [];

  return data.features
    .map((feature) => feature.properties || {})
    .filter((p) => p.event)
    .map((p) => ({
      id: p.id || `nws:${p.event}:${p.areaDesc}`,
      event: p.event,
      headline: p.headline || null,
      description: p.description || null,
      instruction: p.instruction || null,
      severity: p.severity || 'Unknown',
      urgency: p.urgency || null,
      certainty: p.certainty || null,
      area: p.areaDesc || null,
      sender: p.senderName || 'National Weather Service',
      onset: p.onset || p.effective || null,
      expires: p.ends || p.expires || null,
      url: null,
      source: 'NWS',
    }));
}

/** Counterpart to the ECCC probe: prove the feed is reachable, not just quiet. */
async function diagnose(lat, lon) {
  const started = Date.now();
  const inBounds = covers(lat, lon);

  const data = inBounds
    ? await fetchJsonSoft(
        buildUrl(ENDPOINT, { point: `${lat},${lon}`, status: 'actual' }),
        null,
        { headers: { Accept: 'application/geo+json' } }
      )
    : null;

  const url = buildUrl(ENDPOINT, { point: `${lat},${lon}`, status: 'actual' });
  const failureProbe = (inBounds && !data)
    ? await probeUrl(url, { headers: { Accept: 'application/geo+json' } })
    : null;

  return {
    provider: 'NWS',
    inBounds,
    endpoint: inBounds
      ? {
          ok: Boolean(data),
          features: data && Array.isArray(data.features) ? data.features.length : 0,
          url,
          probe: failureProbe || undefined,
        }
      : null,
    activeAlerts: data && Array.isArray(data.features) ? data.features.length : 0,
    ms: Date.now() - started,
  };
}

module.exports = { id: 'NWS', label: 'US National Weather Service', covers, fetchAlerts, diagnose };
