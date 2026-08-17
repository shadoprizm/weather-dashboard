'use strict';

/**
 * Environment and Climate Change Canada alerts.
 *
 * ECCC has no point-queryable alert API. Warnings are distributed two ways:
 * as CAP XML on the MSC Datamart (a date/office/hour directory tree that
 * would need crawling and per-file polygon tests), and inside the citypage
 * weather XML for each of ~880 named sites.
 *
 * We use the citypage route. It costs two cacheable requests instead of a
 * directory crawl:
 *
 *   1. `site_list_en.csv` -> every site with coordinates (cached for a week;
 *      the list changes a few times a year)
 *   2. `citypage_weather/xml/<PROV>/<code>_e.xml` for the nearest site,
 *      whose <warnings> block carries the active events
 *
 * Trade-off worth knowing: this reports the warnings for the nearest named
 * site rather than for your exact coordinates. In practice ECCC issues
 * warnings by forecast region and the named site is the region's anchor, so
 * they agree — but a point far from any site can be misleading, which is why
 * `nearestSite` refuses beyond MAX_SITE_DISTANCE_KM.
 */

const { fetchTextSoft } = require('../upstream');
const { findTags, findTag, textOf } = require('../xml');
const cache = require('../cache');

const SITE_LIST = 'https://dd.weather.gc.ca/citypage_weather/docs/site_list_en.csv';
const CITYPAGE = (province, code) =>
  `https://dd.weather.gc.ca/citypage_weather/xml/${province}/${code}_e.xml`;

const BOUNDS = { minLat: 41, maxLat: 84, minLon: -142, maxLon: -52 };
const MAX_SITE_DISTANCE_KM = 150;

function covers(lat, lon) {
  return lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat
    && lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon;
}

/* ------------------------------------------------------------- site list */

/** Split one CSV row, honouring quoted fields. */
function splitRow(row) {
  const fields = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (char === '"') {
      if (quoted && row[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      fields.push(current); current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

const CODE_PATTERN = /^s\d{7}$/i;
const LAT_PATTERN = /^(\d+(?:\.\d+)?)\s*([NS])$/i;
const LON_PATTERN = /^(\d+(?:\.\d+)?)\s*([EW])$/i;
const PROVINCE_PATTERN = /^(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/i;

/**
 * Parse the site list by matching each field's SHAPE rather than by column
 * index, so a reordered or extra column does not silently break the lookup.
 */
function parseSiteList(csv) {
  if (!csv) return [];
  const sites = [];

  for (const line of csv.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = splitRow(line);
    if (fields.length < 4) continue;

    const code = fields.find((f) => CODE_PATTERN.test(f));
    if (!code) continue;                        // header and junk rows

    const latField = fields.find((f) => LAT_PATTERN.test(f));
    const lonField = fields.find((f) => LON_PATTERN.test(f));
    const province = fields.find((f) => PROVINCE_PATTERN.test(f));
    if (!latField || !lonField || !province) continue;

    const [, latValue, latHemi] = latField.match(LAT_PATTERN);
    const [, lonValue, lonHemi] = lonField.match(LON_PATTERN);

    // The name is the first field that is none of the structured ones.
    const name = fields.find((f) =>
      f && f !== code && f !== latField && f !== lonField && f !== province);

    sites.push({
      code: code.toLowerCase(),
      name: name || code,
      province: province.toUpperCase(),
      latitude: Number(latValue) * (latHemi.toUpperCase() === 'S' ? -1 : 1),
      longitude: Number(lonValue) * (lonHemi.toUpperCase() === 'W' ? -1 : 1),
    });
  }

  return sites;
}

function loadSites() {
  // A week: the list is near-static, and a stale entry only costs one 404.
  return cache.memo('eccc:sites', 7 * 86400, async () => {
    const csv = await fetchTextSoft(SITE_LIST, null, { timeoutMs: 15000 });
    return parseSiteList(csv);
  });
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

function distanceKm(aLat, aLon, bLat, bLon) {
  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function nearestSite(sites, lat, lon) {
  let best = null;
  let bestDistance = Infinity;

  for (const site of sites) {
    const distance = distanceKm(lat, lon, site.latitude, site.longitude);
    if (distance < bestDistance) { bestDistance = distance; best = site; }
  }

  if (!best || bestDistance > MAX_SITE_DISTANCE_KM) return null;
  return { ...best, distanceKm: bestDistance };
}

/* ---------------------------------------------------------------- events */

/**
 * ECCC event types, loosely. Matching on substrings rather than an exact set
 * means a new type ("special air quality statement") still lands somewhere
 * sensible instead of being dropped.
 */
function severityOf(type, priority, description) {
  const haystack = `${type || ''} ${description || ''}`.toLowerCase();

  if (/\bended\b|\bende[dr]\b|no longer in effect/.test(haystack)) return null; // not an alert
  if (String(priority).toLowerCase() === 'urgent') return 'Extreme';
  if (haystack.includes('warning')) return 'Severe';
  if (haystack.includes('watch')) return 'Moderate';
  if (haystack.includes('advisory')) return 'Moderate';
  if (haystack.includes('statement')) return 'Minor';

  const byPriority = { high: 'Severe', medium: 'Moderate', low: 'Minor' };
  return byPriority[String(priority).toLowerCase()] || 'Unknown';
}

/** ECCC stamps times as YYYYMMDDHHMMSS; the eventIssue block is UTC. */
function timeStampToIso(stamp) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/.exec(String(stamp || '').trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s || '00'}Z`;
}

/** Pull the normalised alert list out of a citypage document. */
function parseWarnings(xml, site) {
  const warnings = findTag(xml, 'warnings');
  if (!warnings) return [];

  const bulletinUrl = warnings.attributes.url || null;
  const area = site ? `${site.name}, ${site.province}` : null;
  const alerts = [];

  for (const event of findTags(warnings.inner, 'event')) {
    const { type, priority, description } = event.attributes;
    const title = description || type;
    if (!title) continue;

    const severity = severityOf(type, priority, description);
    if (!severity) continue;                    // "ended" entries are history

    // Several dateTime blocks appear per event; eventIssue is the one we want.
    const issued = findTags(event.inner, 'dateTime')
      .find((node) => node.attributes.name === 'eventIssue');
    const onset = issued ? timeStampToIso(textOf(issued.inner, 'timeStamp')) : null;

    alerts.push({
      id: `eccc:${site ? site.code : 'unknown'}:${title}`,
      event: title,
      // Citypage carries the headline only; the full bulletin lives behind
      // `url`, which the UI links to instead of showing empty body text.
      headline: null,
      description: null,
      instruction: null,
      severity,
      urgency: null,
      certainty: null,
      area,
      sender: 'Environment and Climate Change Canada',
      onset,
      expires: null,
      url: bulletinUrl,
      source: 'ECCC',
    });
  }

  return alerts;
}

/* ---------------------------------------------------------------- public */

async function fetchAlerts(lat, lon) {
  const sites = await loadSites();
  if (!sites || !sites.length) return [];

  const site = nearestSite(sites, lat, lon);
  if (!site) return [];

  const xml = await fetchTextSoft(CITYPAGE(site.province, site.code), null, { timeoutMs: 12000 });
  if (!xml) return [];

  return parseWarnings(xml, site);
}

module.exports = {
  id: 'ECCC',
  label: 'Environment and Climate Change Canada',
  covers,
  fetchAlerts,
  // Exported for the test suite and the live verification script.
  _internals: { parseSiteList, parseWarnings, nearestSite, severityOf, timeStampToIso, distanceKm, SITE_LIST, CITYPAGE },
};
