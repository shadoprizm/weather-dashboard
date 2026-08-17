'use strict';

/**
 * Alert provider registry.
 *
 * Adding a country means writing one module with `{ id, label, covers,
 * fetchAlerts }` and listing it here. Providers are queried concurrently and
 * only when their bounds contain the point, so an outage or a slow region
 * never delays the others.
 */

const nws = require('./nws');
const eccc = require('./eccc');

const PROVIDERS = [nws, eccc];

const SEVERITY_RANK = { Extreme: 5, Severe: 4, Moderate: 3, Minor: 2, Unknown: 1 };

async function collect(lat, lon) {
  const applicable = PROVIDERS.filter((provider) => provider.covers(lat, lon));

  const results = await Promise.all(
    applicable.map(async (provider) => {
      try {
        return await provider.fetchAlerts(lat, lon);
      } catch (error) {
        // One bad provider must never take down the alerts panel.
        console.error(`[alerts:${provider.id}]`, error.message);
        return [];
      }
    })
  );

  // Border regions can legitimately match two providers; collapse anything
  // that names the same event for the same area from the same source.
  const seen = new Set();
  const alerts = [];
  for (const alert of results.flat()) {
    const key = `${alert.source}|${alert.event}|${alert.area || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    alerts.push(alert);
  }

  alerts.sort(
    (a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
  );

  return {
    alerts,
    sources: applicable.map((provider) => provider.id),
    coverage: applicable.length ? 'official' : 'computed-only',
  };
}

module.exports = { collect, PROVIDERS, SEVERITY_RANK };
