/**
 * PostHog website analytics: what loads, where, and exactly what is sent.
 *
 * The privacy page describes this module, so these checks also tie the copy
 * to the code: every click it names has a hook, the hooks are the only clicks,
 * and every page the copy says is measured really loads the script.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const ph = await import(new URL('js/posthog-analytics.js', root).href);
const { buildFixture } = await import(new URL('./fixture.mjs', import.meta.url).href);

const ORIGIN = 'https://www.weatherview.cloud';
const SCRIPT_TAG = '<script type="module" src="/js/posthog-analytics.js?v=1"></script>';
const pageview = (url, extra = {}) => ph.beforeSend({ event: '$pageview', properties: { $current_url: url, ...extra } });

/* --- 1. loads nothing unless configured -------------------------------- */

assert.equal(ph.analyticsEnabled('__POSTHOG_PROJECT_TOKEN__', '__POSTHOG_API_HOST__'), false, 'placeholders load nothing');
assert.equal(ph.analyticsEnabled('', 'https://us.i.posthog.com'), false, 'missing key loads nothing');
assert.equal(ph.analyticsEnabled('test-key', undefined), false, 'missing host loads nothing');
for (const host of ['https://evil.example', 'http://us.i.posthog.com', 'https://us.i.posthog.com/', 'https://us.i.posthog.com.evil.example'])
  assert.equal(ph.analyticsEnabled('test-key', host), false, `non-PostHog host ${host} loads nothing`);
assert.equal(ph.analyticsEnabled('test-key', 'https://us.i.posthog.com'), true);

const source = read('js/posthog-analytics.js');
assert.match(source, /const POSTHOG_KEY = 'phc_[A-Za-z0-9]+';/, 'the release has a public project token');
assert.ok(source.includes("const POSTHOG_HOST = 'https://us.i.posthog.com';"), 'the release uses US ingestion');

/* A tiny DOM: enough for shouldLoad() and start() without a browser. */
function fakeDocument(html) {
  const appended = [];
  const listeners = {};
  const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] ?? null;
  return {
    appended, listeners,
    head: { appendChild: (node) => appended.push(node) },
    createElement: (name) => ({ tagName: name.toUpperCase() }),
    addEventListener: (type, fn, capture) => { listeners[type] = fn; listeners[`${type}:capture`] = capture === true; },
    querySelector(selector) {
      const [, tagName, key, value] = selector.match(/^(\w+)\[(\w+)="([^"]+)"\]$/);
      const tag = (html.match(new RegExp(`<${tagName}\\b[^>]*\\b${key}="${value}"[^>]*>`)) || [])[0];
      return tag ? { getAttribute: (name) => attr(tag, name) } : null;
    },
  };
}
const fakeLocation = (path) => { const url = new URL(path, ORIGIN); return { href: url.href, pathname: url.pathname }; };
function fakeWindow(html, path, posthog) {
  return { document: fakeDocument(html), location: fakeLocation(path), ...(posthog ? { posthog } : {}) };
}

const indexHtml = read('index.html');
{
  const win = fakeWindow(indexHtml, '/');
  assert.equal(ph.start(win), true, 'the configured release starts on a public page');
  assert.equal(win.document.appended.length, 1, 'the configured release injects the local SDK');
  const calls = [];
  win.posthog = { init: (...args) => calls.push(args) };
  win.document.appended[0].onload();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], source.match(/const POSTHOG_KEY = '([^']+)';/)[1]);
  assert.equal(calls[0][1].api_host, 'https://us.i.posthog.com');
  const unset = fakeWindow(indexHtml, '/');
  assert.equal(ph.start(unset, '__POSTHOG_PROJECT_TOKEN__', '__POSTHOG_API_HOST__'), false);
  assert.equal(unset.document.appended.length, 0, 'placeholder configuration still injects nothing');
  const evil = fakeWindow(indexHtml, '/');
  assert.equal(ph.start(evil, 'test-key', 'https://evil.example'), false);
  assert.equal(evil.document.appended.length, 0);
}

/* --- 2. the SDK config is the team standard ---------------------------- */

{
  const { before_send: hook, ...config } = ph.posthogConfig('https://us.i.posthog.com');
  assert.equal(hook, ph.beforeSend);
  assert.deepEqual(config, {
    api_host: 'https://us.i.posthog.com',
    persistence: 'memory',
    person_profiles: 'identified_only',
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_exceptions: false,
    capture_performance: false,
  });
}

/* --- 3. the self-hosted SDK is injected (no pre-mock) and initialised -- */

{
  const win = fakeWindow(indexHtml, '/?lat=43.6532&lon=-79.3832&name=Home');
  assert.equal(ph.start(win, 'test-key', 'https://us.i.posthog.com'), true);
  assert.equal(win.document.appended.length, 1, 'the loader injects the SDK when window.posthog is absent');
  const script = win.document.appended[0];
  assert.equal(script.src, '/assets/vendor/posthog-js-1.445.6/array.js');
  assert.equal(script.async, true);
  const calls = [];
  win.posthog = { init: (...args) => calls.push(['init', ...args]), capture: (...args) => calls.push(['capture', ...args]) };
  script.onload();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'test-key');
  assert.equal(calls[0][2].api_host, 'https://us.i.posthog.com');
  assert.equal(calls[0][2].autocapture, false);

  // Clicks: only allowlisted [data-event] names, with no properties (no text, href or form values).
  const element = (attrs, parent = null) => ({
    getAttribute: (name) => attrs[name] ?? null,
    closest(selector) { return selector === '[data-event]' && 'data-event' in attrs ? this : parent && parent.closest(selector); },
  });
  assert.equal(win.document.listeners['click:capture'], true, 'the click listener runs in the capture phase, before navigation');
  const click = (target) => win.document.listeners.click({ target });
  click(element({ 'data-event': 'share_click' }));
  click(element({}, element({ 'data-event': 'widget_link_click', href: '/widgets' })));
  click(element({ 'data-event': 'planner_link_click', href: '/?view=plan' }));
  click(element({ 'data-event': 'search_submit' }));
  click(element({ id: 'search-input', value: 'My Street, Toronto' }));
  click(element({ 'data-action': 'open-plan' }));
  click(null);
  assert.deepEqual(calls.slice(1), [
    ['capture', 'share_click', {}, { send_instantly: true }],
    ['capture', 'widget_link_click', {}, { send_instantly: true }],
    ['capture', 'planner_link_click', {}, { send_instantly: true }],
  ]);
}

assert.ok(!/\b(posthog|win\.posthog)\.identify\s*\(|\.identify\(/.test(source), 'identify() is never called');
assert.ok(!/autocapture:\s*true/.test(source));

/* --- 4. event-name allowlist ------------------------------------------- */

for (const name of ['$pageview', 'share_click', 'widget_link_click', 'planner_link_click'])
  assert.notEqual(ph.beforeSend({ event: name, properties: { $current_url: `${ORIGIN}/` } }), null, name);
for (const name of ['$identify', '$autocapture', '$pageleave', '$rageclick', '$dead_click', '$web_vitals', '$exception',
  '$feature_flag_called', 'survey shown', '$scroll', 'search_submit', 'unknown'])
  assert.equal(ph.beforeSend({ event: name, properties: { $current_url: `${ORIGIN}/` } }), null, name);
assert.equal(ph.beforeSend(null), null);
assert.equal(pageview('not a url'), null, 'an unparsable $current_url is dropped');
assert.equal(ph.beforeSend({ event: '$pageview', properties: {} }), null, 'a missing $current_url is dropped');

/* --- 5. explicit public-route allowlist -------------------------------- */

const PUBLIC = ['/', '/weather', '/weather/', '/weather/toronto', '/weather/new-york', '/weather/portland-or',
  '/weather/toronto/hourly', '/weather/toronto/10-day', '/weather/toronto/radar',
  '/outdoor-planning', '/launch', '/widgets', '/weather-guide', '/privacy'];
for (const path of PUBLIC) assert.notEqual(pageview(`${ORIGIN}${path}`), null, `${path} is public`);

const PRIVATE = ['/account', '/login', '/sign-in', '/app', '/billing', '/payment', '/checkout', '/admin', '/reset-password',
  // Not pages, or not published pages, on this site:
  '/api/weather', '/api/geocode', '/api/plan', '/widget', '/embed.js', '/weather-stories', '/weather-stories/draft',
  '/index.html', '/privacy.html', '/sw.js', '/unknown',
  // City paths that are not catalogue-shaped or not a fixed section:
  '/weather/Toronto', '/weather/toronto/today', '/weather/toronto/hourly/extra', '/weather/123-main-street',
  '/weather/my%20street', '/weather/toronto%2Fhourly', '/weather/-x', '/weather/x-'];
for (const path of PRIVATE) assert.equal(pageview(`${ORIGIN}${path}`), null, `${path} is rejected`);

/* --- 6. URL properties: utm-only, short plain labels ------------------- */

{
  const out = pageview(`${ORIGIN}/?utm_source=a%40b.c&utm_medium=email&utm_content=sk_live_abcdefghijklmnop&utm_term=two%20words` +
    `&utm_campaign=launch-2026&utm_x=1&utm_id=7&email=a%40b.c&key=SECRET#frag`, {
    $referrer: 'https://news.ycombinator.com/item?id=123&token=abc#c',
    $session_entry_url: `${ORIGIN}/?email=a%40b.c&utm_source=${'a'.repeat(65)}`,
    $initial_referrer: 'https://www.google.com/search?q=weather+at+my+house',
    $set: { email: 'a@b.c' }, $set_once: { $initial_current_url: `${ORIGIN}/?email=a%40b.c` },
    $pathname: '/', $host: 'www.weatherview.cloud', $referring_domain: 'news.ycombinator.com',
  }).properties;
  assert.equal(out.$current_url, `${ORIGIN}/?utm_medium=email&utm_campaign=launch-2026`,
    'utm_source=a@b.c, a key-like value, a value with a space, utm_x and other params are dropped; launch-2026 is kept');
  assert.equal(out.$referrer, 'https://news.ycombinator.com/item');
  assert.equal(out.$session_entry_url, `${ORIGIN}/`, 'a 65-character campaign value is dropped');
  assert.equal(out.$initial_referrer, 'https://www.google.com/search');
  assert.equal('$set' in out, false);
  assert.equal('$set_once' in out, false);
  assert.equal(out.$pathname, '/');
  assert.equal(out.$referring_domain, 'news.ycombinator.com');
}
assert.equal(ph.sanitizeUrl(`${ORIGIN}/?utm_source=${'a'.repeat(64)}`), `${ORIGIN}/?utm_source=${'a'.repeat(64)}`, '64 characters is the limit');
for (const value of ['a%40b.c', 'sk_live_123456', 'phc_abc', 'my_token_x', 'two%20words', 'a'.repeat(65), '', 'x%2Fy'])
  assert.equal(ph.sanitizeUrl(`${ORIGIN}/?utm_source=${value}`), `${ORIGIN}/`, `utm_source=${value} is dropped`);
assert.equal(ph.sanitizeUrl(`${ORIGIN}/?utm_x=test`), `${ORIGIN}/`, 'non-standard utm_x is dropped');
assert.equal(ph.sanitizeUrl(`${ORIGIN}/?utm_campaign=launch-2026`), `${ORIGIN}/?utm_campaign=launch-2026`);
assert.equal(ph.sanitizeUrl('$direct'), '$direct', 'non-URL values are left alone');

/* --- 6b. v3.2: SDK-copied campaign, click-ID and previous-page properties */

{
  const out = pageview(`${ORIGIN}/weather/toronto?utm_source=newsletter&gclid=abc`, {
    utm_source: 'newsletter', utm_medium: 'a@b.c', utm_campaign: 'launch-2026', utm_term: 'two words', utm_content: 'sk_live_abcdef',
    $session_entry_utm_source: 'newsletter', $session_entry_utm_medium: 'a@b.c', $initial_utm_term: 'x'.repeat(65),
    gclid: 'Cj0KCQ', fbclid: 'IwAR0', msclkid: 'm', li_fat_id: 'l', gad_source: '1', mc_cid: 'c', _kx: 'k', ph_keyword: 'weather at 12 my street',
    $session_entry_gclid: 'Cj0KCQ', $initial_fbclid: 'IwAR0', $session_entry_ph_keyword: 'my street', $initial_ph_keyword: 'my street',
    $prev_pageview_pathname: '/weather/ma-rue-saint-jean', $prev_pageview_duration: 12, $prev_pageview_max_scroll: 900,
    $prev_pageview_last_content_percentage: 1, $prev_pageview_id: 'p1',
    $session_entry_url: `${ORIGIN}/?name=Home&utm_source=newsletter`, $session_entry_referrer: 'https://www.google.com/search?q=my+street',
    $search_engine: 'google', $pageview_id: 'p2',
  }).properties;
  assert.equal(out.$current_url, `${ORIGIN}/weather/toronto?utm_source=newsletter`);
  assert.equal(out.utm_source, 'newsletter');
  assert.equal(out.utm_campaign, 'launch-2026');
  assert.equal(out.$session_entry_utm_source, 'newsletter');
  for (const key of ['utm_medium', 'utm_term', 'utm_content', '$session_entry_utm_medium', '$initial_utm_term'])
    assert.equal(key in out, false, `${key} with an unsafe value is deleted`);
  for (const key of Object.keys(out)) {
    assert.doesNotMatch(key, /gclid|fbclid|msclkid|li_fat_id|gad_source|mc_cid|_kx|ph_keyword/, `${key} (SDK click-ID or keyword property) is deleted`);
    assert.doesNotMatch(key, /^\$prev_pageview_/, `${key} (previous-page property) is deleted`);
  }
  assert.equal(out.$session_entry_url, `${ORIGIN}/?utm_source=newsletter`);
  assert.equal(out.$session_entry_referrer, 'https://www.google.com/search');
  assert.equal(out.$search_engine, 'google');
  assert.equal(out.$pageview_id, 'p2');
}

// Guard: every campaign parameter the vendored SDK copies into properties is filtered.
{
  const sdk = read('assets/vendor/posthog-js-1.445.6/array.js');
  const strings = (body) => [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const personal = sdk.match(/\w+=(\["gclid"[^\]]*\])/);
  const campaign = sdk.match(/\w+=\[("utm_source","utm_medium","utm_campaign","utm_content","utm_term"[^\]]*)\]/);
  assert.ok(personal && campaign, 'SDK campaign-parameter lists parsed');
  const sdkParams = [...strings(personal[1]), ...strings(campaign[1])];
  assert.ok(sdkParams.includes('gclid') && sdkParams.includes('utm_source') && sdkParams.includes('mc_cid'), 'SDK lists parsed');
  for (const name of sdkParams) assert.ok(ph.UTM_KEYS.has(name) || ph.SDK_QUERY_PROPERTIES.has(name), `${name} is filtered`);
  assert.match(sdk, /\.ph_keyword=/, 'the SDK still derives ph_keyword, which is filtered');
  assert.ok(ph.SDK_QUERY_PROPERTIES.has('ph_keyword'));
  assert.match(sdk, /session_entry_/);
  assert.match(sdk, /\$initial_/);
}

/* --- 7. a user-entered place in the URL is never sent ------------------ */

// The dashboard writes the chosen place and plan settings into the query
// (js/main.js syncUrl/appUrl, js/plan-share.js). None of it may reach PostHog.
{
  const place = 'name=Ma%20Rue%2C%20Saint-Jean%20QC&lat=46.8123&lon=-71.2145';
  const plan = 'view=plan&activity=walk&duration=60&timeOfDay=daylight';
  const leaked = /46\.81|71\.21|Rue|Saint-Jean|walk|daylight|duration|activity|lat=|lon=|name=|view=/i;
  for (const url of [
    `${ORIGIN}/?${place}&${plan}&utm_source=test#today`,
    `${ORIGIN}/?${place}`,
    `${ORIGIN}/weather/toronto?view=plan&${place}`,
  ]) {
    for (const event of ['$pageview', 'share_click']) {
      const out = ph.beforeSend({ event, properties: {
        $current_url: url, $referrer: url, $session_entry_url: url, $prev_pageview_url: url,
      } });
      assert.notEqual(out, null);
      const body = JSON.stringify(out);
      assert.doesNotMatch(body, leaked, `${event} from ${url} carries no place, coordinates or plan settings`);
    }
  }
  assert.equal(pageview(`${ORIGIN}/?${place}&${plan}&utm_source=test#today`).properties.$current_url, `${ORIGIN}/?utm_source=test`);
  // A place typed into the path is a 404 (noindex), so the script does not even start there.
  const pages = require('../api/_lib/pages');
  const missing = await pages.cityPage({ slug: 'ma-rue-saint-jean' });
  assert.equal(missing.status, 404);
  assert.equal(ph.shouldLoad(fakeDocument(missing.body), fakeLocation('/weather/ma-rue-saint-jean')), false);
}

/* --- 8. every page claimed as covered loads the script ----------------- */

// Stub the upstream exactly as test/pages.mjs does, so city pages render offline.
const handlers = require('../api/_lib/handlers');
handlers.forecast = async () => ({ status: 200, body: buildFixture(), maxAge: 300 });
handlers.alerts = async () => ({ status: 200, maxAge: 180, body: { alerts: [], sources: [], coverage: 'official' } });
handlers.almanac = async () => ({ status: 200, maxAge: 86400, body: { available: false } });
const pages = require('../api/_lib/pages');

const covered = [
  ['/', indexHtml],
  ['/privacy', read('privacy.html')],
  ['/weather', (await pages.cityIndex()).body],
  ['/weather/toronto', (await pages.cityPage({ slug: 'toronto' })).body],
  ['/weather/toronto/hourly', (await pages.cityPage({ slug: 'toronto', section: 'hourly' })).body],
  ['/weather/toronto/10-day', (await pages.cityPage({ slug: 'toronto', section: '10-day' })).body],
  ['/weather/toronto/radar', (await pages.cityPage({ slug: 'toronto', section: 'radar' })).body],
  ['/outdoor-planning', (await pages.planningPage()).body],
  ['/launch', (await pages.launchPage()).body],
  ['/widgets', (await pages.widgetsPage()).body],
  ['/weather-guide', (await pages.guidePage()).body],
];
const clickHooks = new Set();
for (const [path, html] of covered) {
  assert.ok(html.includes(SCRIPT_TAG), `${path} loads the PostHog module`);
  assert.equal(ph.isPublicPath(path), true, `${path} is on the public allowlist`);
  assert.equal(ph.shouldLoad(fakeDocument(html), fakeLocation(path)), true, `${path} is indexable and its own canonical URL`);
  assert.equal(ph.shouldLoad(fakeDocument(html), fakeLocation(`${path === '/' ? '' : path}/../nope`)), false);
  for (const [, name] of html.matchAll(/data-event="([^"]+)"/g)) clickHooks.add(name);
}
assert.ok(ph.shouldLoad(fakeDocument(indexHtml), fakeLocation('/?lat=1&lon=2&name=x')), 'the dashboard with a place still loads (its query is stripped)');
assert.deepEqual([...clickHooks].sort(), [...ph.CLICK_EVENTS].sort(), 'every allowlisted click has a data-event hook, and the reverse');

// Pages that must not load it.
const notFound = await pages.cityPage({ slug: 'nowhere-at-all' });
assert.equal(ph.shouldLoad(fakeDocument(notFound.body), fakeLocation('/weather/nowhere-at-all')), false, 'a 404 does not load PostHog');
const selfCanonical = (path, robots) => `<meta name="robots" content="${robots}"><link rel="canonical" href="${ORIGIN}${path}">`;
assert.equal(ph.shouldLoad(fakeDocument(selfCanonical('/weather/toronto', 'noindex, follow')), fakeLocation('/weather/toronto')), false, 'a noindex page does not load PostHog');
assert.equal(ph.shouldLoad(fakeDocument(selfCanonical('/weather/toronto', 'index, follow')), fakeLocation('/weather/toronto')), true);
assert.equal(ph.shouldLoad(fakeDocument('<title>x</title>'), fakeLocation('/')), false, 'a page without a canonical URL does not load PostHog');
const widget = require('../api/_lib/render/widget');
for (const query of [{ city: 'toronto' }, { city: 'toronto', embed: '1' }, {}]) {
  const { body } = await widget.renderWidget(query);
  assert.doesNotMatch(body, /posthog|analytics\.js/i, 'the embedded widget loads no analytics');
}
assert.doesNotMatch(read('embed.js'), /posthog/i);

/* --- 9. CSP allows the US ingestion host and nothing else new ---------- */

{
  const vercel = JSON.parse(read('vercel.json'));
  const csp = (source) => vercel.headers.find((h) => h.source === source).headers.find((h) => h.key === 'Content-Security-Policy').value;
  const global = csp('/(.*)');
  assert.match(global, /connect-src 'self' https:\/\/api\.bigdatacloud\.net https:\/\/us\.i\.posthog\.com;/);
  assert.match(global, /script-src 'self';/, 'the SDK is self-hosted, so script-src is unchanged');
  assert.doesNotMatch(global, /assets\.i\.posthog\.com|eu\.i\.posthog\.com/);
  assert.match(csp('/widget'), /connect-src 'none'/, 'the widget still connects nowhere');
}

/* --- 10. vendored SDK matches upstream --------------------------------- */

{
  assert.equal(ph.SDK_SRC, '/assets/vendor/posthog-js-1.445.6/array.js');
  const readme = read('assets/vendor/posthog-js-1.445.6/README.txt');
  const upstream = readme.match(/sha256 of dist\/array\.js: ([0-9a-f]{64})/)[1];
  assert.equal(upstream, 'f48b70431235c59081884784a932c4a67d56bf132d65c0d1d0b0fa84b6c27959');
  const vendored = readFileSync(new URL('assets/vendor/posthog-js-1.445.6/array.js', root));
  // Upstream minus its trailing sourceMappingURL comment.
  const restored = Buffer.concat([vendored, Buffer.from('//# sourceMappingURL=array.js.map')]);
  assert.equal(createHash('sha256').update(restored).digest('hex'), upstream);
  assert.ok(read('assets/vendor/posthog-js-1.445.6/LICENSE').length > 1000);
  assert.doesNotMatch(source + indexHtml + read('privacy.html'), /assets\.i\.posthog\.com|\/static\/array|array\.full/, 'no remote SDK');
}

/* --- 11. public project key only in release configuration ----------------------------- */

{
  const skip = new Set(['node_modules', '.git', 'apple']);
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(new URL(dir, root))) {
      if (skip.has(name)) continue;
      const path = `${dir}${name}`;
      if (statSync(new URL(path, root)).isDirectory()) walk(`${path}/`);
      else if (/\.(m?js|cjs|html|json|md|txt|css|webmanifest)$/.test(name)) files.push(path);
    }
  };
  walk('');
  assert.ok(files.length > 50);
  for (const file of files) {
    const text = read(file);
    if (file === 'js/posthog-analytics.js') {
      assert.equal((text.match(/phc_[A-Za-z0-9]{20,}/g) || []).length, 1, 'one public project token in release configuration');
    } else {
      assert.doesNotMatch(text, /phc_[A-Za-z0-9]{20,}/, `${file} contains no duplicated PostHog project key`);
    }
    if (!file.startsWith('assets/vendor/')) assert.doesNotMatch(text, /posthog\.identify|\.identify\(/, `${file} calls no identify()`);
  }
}

/* --- 12. privacy copy matches the code --------------------------------- */

{
  const html = read('privacy.html');
  const text = (fragment) => fragment.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const start = html.indexOf('<h2 id="website-analytics">');
  const section = text(html.slice(start, html.indexOf('<h2>', start + 10)));
  assert.ok(start > 0, 'the privacy page has a Website analytics section');
  for (const sentence of [
    'We also use PostHog , a product analytics service, to understand how the site is used: it measures page views and clicks on the “Share this forecast” button, the “Free website widget” link and the “Find a time in the planner” link.',
    'Analytics data is processed in the US.',
    'IP addresses may be processed by PostHog.',
    'page and referrer addresses keep only standard campaign tags (such as utm_source ) that are short plain labels; other query values and fragments are removed.',
    'The embedded weather widget does not load Vercel Web Analytics or PostHog.',
  ]) assert.ok(section.includes(sentence), `privacy copy: ${sentence}`);

  // Each named click is the visible label of its hook.
  for (const [label, name] of [['Share this forecast', 'share_click'], ['Free website widget', 'widget_link_click'],
    ['Find a time in the planner', 'planner_link_click']]) {
    const hook = covered.map(([, page]) => page).find((page) => page.includes(`data-event="${name}"`));
    const tag = hook.match(new RegExp(`<(a|button)\\b[^>]*data-event="${name}"[^>]*>[\\s\\S]*?</\\1>`))[0];
    assert.ok(tag.includes(label), `${name} is on the “${label}” control`);
  }

  // No absolute or unverified claims.
  assert.doesNotMatch(section, /IP address(es)? (is|are) not (stored|kept|collected)|anonymi[sz]e|no cookies|without cookies|cookie-?less|no (local )?storage|kept for \d|retain(ed)? for|never (include|contain|send|collect)|no personal data/i);
  assert.doesNotMatch(section, /Query parameters and fragments are removed from page URLs before measurement\./, 'the old site-wide claim is rescoped');
  assert.match(html, /Updated November 4, 2026\./);
  assert.doesNotMatch(html, /aggregate website analytics/);
}

console.log('PostHog loader, config, event and route allowlists, utm-only URLs, place-privacy, page coverage, CSP, vendored SDK and privacy-copy checks passed.');
