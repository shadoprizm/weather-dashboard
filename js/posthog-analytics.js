/**
 * PostHog website analytics for the public weatherview.cloud pages
 * (PostHog project "weatherview.cloud", 711195, US region).
 *
 * Separate from the Vercel Web Analytics module (analytics.js), which is
 * unchanged. The privacy page describes exactly what this file sends; change
 * both together.
 *
 * - Loads nothing while either placeholder below is unset, or when the host is
 *   not a PostHog ingestion host. A release commit replaces them with the
 *   project's public client key and https://us.i.posthog.com.
 * - Loads the self-hosted SDK from this site (no remote scripts), only on an
 *   indexable public page whose canonical path is the current path. 404s and
 *   unpublished pages are noindex, so they never load it.
 * - Sends `$pageview` and three named clicks, nothing else. No autocapture,
 *   session recording, surveys, feature flags, heatmaps or pageleave, and
 *   identify() is never called.
 * - The dashboard URL carries the visitor's chosen place (`?lat=&lon=&name=`)
 *   and plan settings. Every URL-valued property keeps only the five standard
 *   utm_* keys with short plain-label values; everything else in the query,
 *   and the fragment, is removed before anything is sent. The campaign and
 *   click-ID properties the SDK copies out of the URL get the same filter,
 *   and the previous-page ($prev_pageview_*) properties are deleted.
 */

const POSTHOG_KEY = '__POSTHOG_PROJECT_TOKEN__';
const POSTHOG_HOST = '__POSTHOG_API_HOST__';
export const SDK_SRC = '/assets/vendor/posthog-js-1.445.6/array.js';

/** Both values must be configured and the host must be PostHog US or EU ingestion. */
export function analyticsEnabled(key, host) {
  return typeof key === 'string' && typeof host === 'string'
    && key.length > 0 && !key.startsWith('__')
    && /^https:\/\/(us|eu)\.i\.posthog\.com$/.test(host);
}

/** Explicit allowlist of the fixed public pages (vercel.json rewrites + static pages). */
export const PUBLIC_PATHS = new Set([
  '/',                 // dashboard (its place/plan query parameters are stripped below)
  '/weather',          // city directory
  '/outdoor-planning',
  '/launch',           // what's new
  '/widgets',          // widget builder page (the embedded /widget itself never loads this file)
  '/weather-guide',
  '/privacy',
]);

/** Published city pages: a catalogue slug and an optional fixed section. */
const CITY_PATH = /^\/weather\/[a-z]+(?:-[a-z]+)*(?:\/(?:hourly|10-day|radar))?$/;

export function normalizePath(pathname) {
  const path = String(pathname || '');
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
}

export function isPublicPath(pathname) {
  const path = normalizePath(pathname);
  return PUBLIC_PATHS.has(path) || CITY_PATH.test(path);
}

/** Explicit click events from `[data-event]` elements. Anything else is ignored. */
export const CLICK_EVENTS = new Set(['share_click', 'widget_link_click', 'planner_link_click']);
/** v2: page views plus the named clicks only. */
const ALLOWED_EVENTS = new Set(['$pageview', ...CLICK_EVENTS]);

/** The five standard campaign parameters; any other query parameter is dropped. */
export const UTM_KEYS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);

/** A campaign value is kept only if it is a short plain label and not key- or token-like. */
export function isSafeCampaignValue(value) {
  return /^[A-Za-z0-9._~+-]{1,64}$/.test(value)
    && !/(^|[_-])(sk|pk|rk|phc|ghp|gho|key|token|secret)[_-]/i.test(value);
}

/** Keep the origin, path and safe utm_* parameters of an http(s) URL; drop all else and the hash. */
export function sanitizeUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    const kept = new URLSearchParams();
    url.searchParams.forEach((v, k) => { if (UTM_KEYS.has(k) && isSafeCampaignValue(v)) kept.append(k, v); });
    url.search = kept.toString();
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Query values posthog-js 1.445.6 also copies out of the page URL or referrer into separate
 * properties (its campaign-parameter list minus utm_*, plus the search keyword `ph_keyword`),
 * each also as `$session_entry_<name>` / `$initial_<name>`. Cleaning URLs alone would not remove
 * them. A test checks this list against the vendored SDK, so an upgrade that adds one fails.
 */
export const SDK_QUERY_PROPERTIES = new Set([
  'gad_source', 'mc_cid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'twclid', 'li_fat_id',
  'igshid', 'ttclid', 'rdt_cid', 'epik', 'qclid', 'sccid', 'oppref', 'bfcid', 'irclid', '_kx', 'ph_keyword',
]);

const propertyBase = (key) => key.replace(/^\$(session_entry_|initial_)/, '').replace(/^\$/, '');

/** utm_* properties keep only safe values; other URL-derived query properties are removed; every URL value is cleaned. */
export function sanitizeProperties(props) {
  for (const [key, value] of Object.entries(props)) {
    const base = propertyBase(key);
    if (key.startsWith('$prev_pageview_')) {
      // The previous page's path (possibly not public), duration and scroll depth.
      delete props[key];
    } else if (UTM_KEYS.has(base)) {
      if (!(typeof value === 'string' && isSafeCampaignValue(value))) delete props[key];
    } else if (SDK_QUERY_PROPERTIES.has(base)) {
      delete props[key];
    } else if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
      // Every URL-valued property ($current_url, $referrer, $session_entry_url, ...), not a fixed list.
      props[key] = sanitizeUrl(value);
    }
  }
}

/** PostHog before_send: drop non-public pages and unknown events; filter every property. */
export function beforeSend(event) {
  if (!event || !ALLOWED_EVENTS.has(event.event)) return null;
  const props = event.properties || {};
  let pathname;
  try { pathname = new URL(props.$current_url).pathname; } catch { return null; }
  if (!isPublicPath(pathname)) return null;
  sanitizeProperties(props);
  delete props.$set;
  delete props.$set_once;
  event.properties = props;
  return event;
}

export function posthogConfig(host) {
  return {
    api_host: host,
    persistence: 'memory',              // no cookies, no localStorage persistence
    person_profiles: 'identified_only', // identify() is never called
    autocapture: false,                 // only the explicit [data-event] clicks below
    capture_pageview: true,             // multi-page site: one page view per page load
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true, // no recorder, toolbar or other remote scripts
    advanced_disable_flags: true,              // no feature-flag requests
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_exceptions: false,
    capture_performance: false,
    before_send: beforeSend,
  };
}

/** The allowed event name for a click target, or null. Never sends text, href or form values. */
export function clickEventName(target) {
  const el = target && typeof target.closest === 'function' ? target.closest('[data-event]') : null;
  const name = el ? el.getAttribute('data-event') : null;
  return name && CLICK_EVENTS.has(name) ? name : null;
}

/** Load only on an indexable public page that is its own canonical URL (never on a 404). */
export function shouldLoad(doc, loc) {
  if (!doc || !loc || !isPublicPath(loc.pathname)) return false;
  const robots = doc.querySelector('meta[name="robots"]');
  if (robots && /noindex/i.test(robots.getAttribute('content') || '')) return false;
  const canonical = doc.querySelector('link[rel="canonical"]');
  if (!canonical) return false;
  try {
    return normalizePath(new URL(canonical.getAttribute('href'), loc.href).pathname) === normalizePath(loc.pathname);
  } catch {
    return false;
  }
}

export function start(win = globalThis.window, key = POSTHOG_KEY, host = POSTHOG_HOST) {
  if (!win || !win.document || !analyticsEnabled(key, host) || !shouldLoad(win.document, win.location)) return false;
  let ready = false;

  const init = () => {
    if (ready || !win.posthog || typeof win.posthog.init !== 'function') return;
    win.posthog.init(key, posthogConfig(host));
    ready = true;
  };

  // Capture phase: runs before the link navigates, so the click is recorded on its own page.
  // send_instantly: two of the three clicks are links that leave the page, and a batched
  // event would be lost with it (verified in the local headless check).
  win.document.addEventListener('click', (event) => {
    const name = ready ? clickEventName(event.target) : null;
    if (!name) return;
    try { win.posthog.capture(name, {}, { send_instantly: true }); } catch { /* Measurement never blocks the page. */ }
  }, true);

  if (win.posthog && typeof win.posthog.init === 'function') { init(); return true; }
  const script = win.document.createElement('script');
  script.src = SDK_SRC;
  script.async = true;
  script.onload = init;
  win.document.head.appendChild(script);
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try { start(); } catch { /* Measurement never blocks the forecast. */ }
}
