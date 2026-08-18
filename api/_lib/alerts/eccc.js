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

const { fetchTextSoft, probeUrl } = require('../upstream');
const { findTags, findTag, textOf } = require('../xml');
const cache = require('../cache');

/**
 * Datamart roots, most current first.
 *
 * MSC moved citypage_weather under a `/today/` prefix, which 404'd the
 * previously correct URL in production. Rather than hardcode the new path and
 * wait to be broken again, we try each root until one yields a parseable site
 * list, then remember it for both the list and the per-site documents.
 */
const ROOTS = [
  'https://dd.weather.gc.ca/today/citypage_weather',
  'https://dd.weather.gc.ca/citypage_weather',
];

const siteListUrl = (root) => `${root}/docs/site_list_en.csv`;
const hourDirUrl = (root, province, hour) => `${root}/${province}/${hour}/`;

/**
 * Per-site documents are NOT addressable by site code. They live under
 * {root}/{PROV}/{HH}/ with timestamped names like
 *   20260818T010026.748Z_MSC_CitypageWeather_s0000430_en.xml
 * so the filename has to be discovered from the hour's directory listing
 * rather than constructed.
 */
const SITE_DOC_PATTERN = (code) =>
  new RegExp(`href="([^"]*_MSC_CitypageWeather_${code}_(?:en|e)\\.xml)"`, 'gi');

// Kept for diagnostics and tests, which report a representative URL.
const SITE_LIST = siteListUrl(ROOTS[0]);

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

const SITES_TTL_OK = 7 * 86400;   // the list is near-static
const SITES_TTL_FAIL = 60;        // do not let one bad fetch blind us for a week

/**
 * The site list plus the Datamart root it came from, cached.
 *
 * Success is cached for a week. Failure is cached for a minute: caching an
 * empty list for the success TTL would mean a single transient outage
 * silently disabled Canadian alerts long after the upstream recovered, while
 * still absorbing a burst of retries.
 */
async function loadSiteIndex() {
  const cached = cache.get('eccc:sites');
  if (cached) return cached;

  for (const root of ROOTS) {
    const csv = await fetchTextSoft(siteListUrl(root), null, { timeoutMs: 15000 });
    const sites = parseSiteList(csv);
    if (sites.length) {
      const index = { root, sites };
      cache.set('eccc:sites', index, SITES_TTL_OK);
      return index;
    }
  }

  const empty = { root: null, sites: [] };
  cache.set('eccc:sites', empty, SITES_TTL_FAIL);
  return empty;
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


const LISTING_TTL = 300;   // hour directories gain files continuously
const HOURS_BACK = 4;      // a given site is not republished every hour

function loadListing(root, province, hour) {
  return cache.memo(`eccc:listing:${province}:${hour}`, LISTING_TTL, () =>
    fetchTextSoft(hourDirUrl(root, province, hour), null, { timeoutMs: 10000 })
  );
}

/**
 * Walk back from the current UTC hour until the site's document turns up.
 * Returns its absolute URL, or null if it is not published in the window.
 */
async function findSiteDocument(root, site, now = new Date()) {
  for (let back = 0; back < HOURS_BACK; back += 1) {
    const hour = String(new Date(now.getTime() - back * 3600000).getUTCHours()).padStart(2, '0');
    const listing = await loadListing(root, site.province, hour);
    if (!listing) continue;

    // Several revisions can share an hour; the last entry is the newest.
    const matches = [...listing.matchAll(SITE_DOC_PATTERN(site.code))];
    if (matches.length) {
      return `${hourDirUrl(root, site.province, hour)}${matches[matches.length - 1][1]}`;
    }
  }
  return null;
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

const MINOR_WORDS = new Set(['a', 'an', 'and', 'de', 'des', 'for', 'in', 'of', 'or', 'the', 'to']);

/**
 * ECCC writes some event descriptions in caps ("YELLOW WARNING - AIR
 * QUALITY") and others in sentence case ("Rainfall warning"). Shouting looks
 * wrong on a card, so all-caps titles get title-cased; anything already mixed
 * case is left exactly as the agency wrote it.
 */
function titleCase(value) {
  const text = String(value || '').trim();
  if (!text || text !== text.toUpperCase()) return text;

  return text
    .toLowerCase()
    .replace(/[\p{L}\p{N}']+/gu, (word, offset) =>
      offset > 0 && MINOR_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
    );
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
    const title = titleCase(description || type);
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

/**
 * MSC has reorganised this tree before, so when the expected per-site
 * document is missing we probe the plausible layouts and report what each
 * one returns. Directory listings come back with a body snippet so the real
 * filename convention is visible rather than guessed at.
 */
async function probeLayouts(root, site) {
  if (!root || !site) return undefined;
  const hour = String(new Date().getUTCHours()).padStart(2, '0');
  const prev = String((new Date().getUTCHours() + 23) % 24).padStart(2, '0');

  const candidates = [
    `${root}/${site.province}/${site.code}_e.xml`,
    `${root}/${site.province}/${hour}/`,
    `${root}/${site.province}/${prev}/`,
    `${root}/xml/${site.province}/${hour}/`,
    `${root}/`,
  ];

  return Promise.all(candidates.map(async (url) => ({
    url,
    ...(await probeUrl(url, { keepBody: 700, timeoutMs: 8000 })),
  })));
}

/**
 * Report what this provider can actually see right now.
 *
 * "No alerts" and "the feed broke" look identical from the outside, which is
 * exactly the failure a silent provider produces. This distinguishes them.
 * It reuses the cached site list rather than refetching, so it reports the
 * state the app is really operating on and cannot be used to amplify traffic
 * at the upstream.
 */
async function diagnose(lat, lon) {
  const started = Date.now();
  const inBounds = covers(lat, lon);
  const { root, sites } = await loadSiteIndex();
  const site = sites.length ? nearestSite(sites, lat, lon) : null;

  // When nothing resolved, probe every candidate root so the reason is visible.
  const siteListProbe = sites.length
    ? null
    : await Promise.all(ROOTS.map(async (candidate) => ({
        url: siteListUrl(candidate),
        ...(await probeUrl(siteListUrl(candidate))),
      })));

  let citypage = null;
  let parsed = null;

  if (site) {
    const url = await findSiteDocument(root, site);
    const xml = url ? await fetchTextSoft(url, null, { timeoutMs: 12000 }) : null;
    citypage = xml
      ? {
          ok: true,
          url,
          bytes: xml.length,
          hasWarningsElement: /<warnings/i.test(xml),
          eventElements: (xml.match(/<event\b/gi) || []).length,
        }
      : { ok: false, url, discovered: Boolean(url), layouts: await probeLayouts(root, site) };
    if (xml) parsed = parseWarnings(xml, site);
  }

  return {
    provider: 'ECCC',
    inBounds,
    siteList: {
      ok: sites.length > 0,
      parsedSites: sites.length,
      resolvedRoot: root,
      candidates: siteListProbe || undefined,
    },
    nearestSite: site
      ? { name: site.name, province: site.province, code: site.code, distanceKm: Number(site.distanceKm.toFixed(1)) }
      : null,
    citypage,
    activeAlerts: parsed ? parsed.length : 0,
    ms: Date.now() - started,
  };
}

/* ---------------------------------------------------------------- public */

async function fetchAlerts(lat, lon) {
  const { root, sites } = await loadSiteIndex();
  if (!root || !sites.length) return [];

  const site = nearestSite(sites, lat, lon);
  if (!site) return [];

  const documentUrl = await findSiteDocument(root, site);
  if (!documentUrl) return [];

  const xml = await fetchTextSoft(documentUrl, null, { timeoutMs: 12000 });
  if (!xml) return [];

  return parseWarnings(xml, site);
}

module.exports = {
  id: 'ECCC',
  label: 'Environment and Climate Change Canada',
  covers,
  fetchAlerts,
  diagnose,
  // Exported for the test suite and the live verification script.
  _internals: { parseSiteList, parseWarnings, nearestSite, severityOf, timeStampToIso, distanceKm, SITE_LIST, ROOTS, siteListUrl, hourDirUrl, SITE_DOC_PATTERN, findSiteDocument, titleCase },
};
