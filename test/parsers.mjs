/**
 * Unit tests for the server-side parsers.
 *
 * These cover the code that reads third-party XML and CSV, which is exactly
 * where a format drift or a hostile payload would bite. Run with `npm test`.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const xml = require('../api/_lib/xml.js');
const eccc = require('../api/_lib/alerts/eccc.js');
const nws = require('../api/_lib/alerts/nws.js');
const registry = require('../api/_lib/alerts/index.js');
const { safeUrl } = await import(new URL('../js/dom.js', import.meta.url).href);

const {
  parseSiteList, parseWarnings, nearestSite, severityOf, timeStampToIso, distanceKm,
} = eccc._internals;

/* ------------------------------------------------------------------- xml */

assert.deepEqual(
  xml.findTags('<a x="1">one</a><a x="2">two</a>', 'a').map((n) => [n.attributes.x, n.text]),
  [['1', 'one'], ['2', 'two']]
);

// Self-closing elements still yield a node, with attributes.
const selfClosing = xml.findTags('<warnings url="https://x.test/a"/>', 'warnings');
assert.equal(selfClosing.length, 1);
assert.equal(selfClosing[0].attributes.url, 'https://x.test/a');
assert.equal(selfClosing[0].inner, '');

// Namespace prefixes on both elements and attributes are tolerated.
const ns = xml.findTags('<cap:info cap:lang="en-CA">hi</cap:info>', 'info');
assert.equal(ns.length, 1);
assert.equal(ns[0].attributes.lang, 'en-CA');

// Single-quoted attributes, entities, CDATA.
assert.equal(xml.findTag("<e d='a &amp; b'/>", 'e').attributes.d, 'a & b');
assert.equal(xml.textOf('<t><![CDATA[raw <b>text</b>]]></t>', 't'), 'raw text');
assert.equal(xml.textOf('<t>caf&#233; &lt;ok&gt;</t>', 't'), 'café <ok>');

// Differently-named nesting works; missing tags are empty, not thrown.
assert.equal(xml.textOf('<outer><inner>x</inner></outer>', 'inner'), 'x');
assert.deepEqual(xml.findTags('<a/>', 'nope'), []);
assert.equal(xml.textOf('', 'a'), '');
assert.deepEqual(xml.findTags(null, 'a'), []);

// Tag names are regex-escaped, so a hostile name cannot alter the pattern.
assert.deepEqual(xml.findTags('<a>x</a>', 'a|b'), []);

/* -------------------------------------------------------- ECCC site list */

const SITE_CSV = `﻿Site Codes,English Names,French Names,Latitude,Longitude,Province Codes
s0000430,Ottawa (Kanata - Orléans),Ottawa,45.42N,75.70W,ON
s0000458,Toronto,Toronto,43.65N,79.38W,ON
s0000141,Vancouver,Vancouver,49.28N,123.12W,BC
s0000616,Iqaluit,Iqaluit,63.75N,68.52W,NU

garbage line that should be ignored
,,,,,`;

const sites = parseSiteList(SITE_CSV);
assert.equal(sites.length, 4, 'header, blank, junk and empty rows must all be dropped');

const ottawa = sites[0];
assert.equal(ottawa.code, 's0000430');
assert.equal(ottawa.province, 'ON');
assert.equal(ottawa.name, 'Ottawa (Kanata - Orléans)');
assert.ok(Math.abs(ottawa.latitude - 45.42) < 0.001);
// West longitudes must come back negative, or every lookup lands in Asia.
assert.ok(Math.abs(ottawa.longitude - -75.70) < 0.001, `got ${ottawa.longitude}`);

// Shape-based parsing: a reordered header must still work.
const reordered = parseSiteList('ON,s0000430,Ottawa,Ottawa,45.42N,75.70W');
assert.equal(reordered.length, 1);
assert.equal(reordered[0].code, 's0000430');
assert.equal(reordered[0].province, 'ON');

// Quoted fields containing commas.
const quoted = parseSiteList('s0000430,"Ottawa, Central",Ottawa,45.42N,75.70W,ON');
assert.equal(quoted[0].name, 'Ottawa, Central');

assert.deepEqual(parseSiteList(''), []);
assert.deepEqual(parseSiteList(null), []);

/* ----------------------------------------------------------- site lookup */

// Ottawa city hall should resolve to the Ottawa site, not Toronto.
const near = nearestSite(sites, 45.4215, -75.6972);
assert.equal(near.code, 's0000430');
assert.ok(near.distanceKm < 10);

// Mid-Atlantic is inside the Canada bounding box but nowhere near a site.
assert.equal(nearestSite(sites, 55.0, -55.0), null, 'must refuse distant points');
assert.equal(nearestSite([], 45, -75), null);

// Haversine sanity: Ottawa to Toronto is ~350 km.
const ottawaToronto = distanceKm(45.42, -75.70, 43.65, -79.38);
assert.ok(ottawaToronto > 320 && ottawaToronto < 380, `got ${ottawaToronto} km`);

/* ------------------------------------------------------- ECCC severities */

assert.equal(severityOf('warning', 'high', 'Rainfall warning'), 'Severe');
assert.equal(severityOf('watch', 'medium', 'Severe thunderstorm watch'), 'Moderate');
assert.equal(severityOf('advisory', 'low', 'Special weather statement'), 'Moderate');
assert.equal(severityOf('statement', 'low', 'Special weather statement'), 'Minor');
assert.equal(severityOf('warning', 'urgent', 'Tornado warning'), 'Extreme');
// Ended events are history, not alerts.
assert.equal(severityOf('ended', 'low', 'Rainfall warning ended'), null);
assert.equal(severityOf('warning', 'high', 'Rainfall warning ENDED'), null);
// Unknown types still land somewhere sensible via priority.
assert.equal(severityOf('somethingNew', 'high', ''), 'Severe');
assert.equal(severityOf('', '', ''), 'Unknown');

assert.equal(timeStampToIso('20260817123400'), '2026-08-17T12:34:00Z');
assert.equal(timeStampToIso('202608171234'), '2026-08-17T12:34:00Z');
assert.equal(timeStampToIso('nonsense'), null);
assert.equal(timeStampToIso(null), null);

/* --------------------------------------------------------- ECCC warnings */

const CITYPAGE = `<?xml version="1.0" encoding="ISO-8859-1"?>
<siteData>
  <license>...</license>
  <warnings url="https://weather.gc.ca/warnings/report_e.html?on31">
    <event type="warning" priority="high" description="Rainfall warning">
      <dateTime name="eventIssue" zone="UTC" UTCOffset="0">
        <year>2026</year><month name="August">08</month><day name="Monday">17</day>
        <hour>12</hour><minute>34</minute><timeStamp>20260817123400</timeStamp>
        <textSummary>12:34 PM EDT Monday 17 August 2026</textSummary>
      </dateTime>
    </event>
    <event type="watch" priority="medium" description="Severe thunderstorm watch">
      <dateTime name="eventIssue" zone="UTC" UTCOffset="0">
        <timeStamp>20260817140000</timeStamp>
      </dateTime>
    </event>
    <event type="ended" priority="low" description="Wind warning ended">
      <dateTime name="eventIssue" zone="UTC"><timeStamp>20260817090000</timeStamp></dateTime>
    </event>
  </warnings>
  <currentConditions><temperature unitType="metric">18.4</temperature></currentConditions>
</siteData>`;

const site = { code: 's0000430', name: 'Ottawa', province: 'ON', latitude: 45.42, longitude: -75.7 };
const parsed = parseWarnings(CITYPAGE, site);

assert.equal(parsed.length, 2, 'the ended event must be dropped');
assert.equal(parsed[0].event, 'Rainfall warning');
assert.equal(parsed[0].severity, 'Severe');
assert.equal(parsed[0].onset, '2026-08-17T12:34:00Z');
assert.equal(parsed[0].area, 'Ottawa, ON');
assert.equal(parsed[0].source, 'ECCC');
assert.equal(parsed[0].url, 'https://weather.gc.ca/warnings/report_e.html?on31');
assert.equal(parsed[1].severity, 'Moderate');

// Every provider must emit the same normalised keys.
const REQUIRED_KEYS = [
  'id', 'event', 'headline', 'description', 'instruction', 'severity',
  'area', 'sender', 'onset', 'expires', 'url', 'source',
];
for (const key of REQUIRED_KEYS) {
  assert.ok(key in parsed[0], `ECCC alert missing key: ${key}`);
}

// The quiet case: no warnings in effect is a self-closing element.
assert.deepEqual(parseWarnings('<siteData><warnings url="https://x.test/a"/></siteData>', site), []);
// And some documents omit the block entirely.
assert.deepEqual(parseWarnings('<siteData></siteData>', site), []);
assert.deepEqual(parseWarnings('', site), []);
// Garbage in must not throw.
assert.doesNotThrow(() => parseWarnings('<warnings><event/></warnings>', site));
assert.doesNotThrow(() => parseWarnings(CITYPAGE, null));

/* ---------------------------------------------------------- provider set */

assert.ok(eccc.covers(45.42, -75.70), 'Ottawa is in Canada');
assert.ok(!eccc.covers(51.5, -0.13), 'London is not');
assert.ok(!eccc.covers(35.68, 139.69), 'Tokyo is not');
assert.ok(nws.covers(42.36, -71.06), 'Boston is in the US box');
assert.ok(nws.covers(21.3, -157.8), 'Honolulu is in the US box');
assert.ok(!nws.covers(48.85, 2.35), 'Paris is not');

for (const provider of registry.PROVIDERS) {
  assert.equal(typeof provider.id, 'string');
  assert.equal(typeof provider.covers, 'function');
  assert.equal(typeof provider.fetchAlerts, 'function');
}
// Severity ordering must be strictly descending in seriousness.
const { SEVERITY_RANK } = registry;
assert.ok(SEVERITY_RANK.Extreme > SEVERITY_RANK.Severe);
assert.ok(SEVERITY_RANK.Severe > SEVERITY_RANK.Moderate);
assert.ok(SEVERITY_RANK.Moderate > SEVERITY_RANK.Minor);
assert.ok(SEVERITY_RANK.Minor > SEVERITY_RANK.Unknown);

/* ------------------------------------------------------------- safeUrl */

assert.equal(safeUrl('https://weather.gc.ca/x?y=1'), 'https://weather.gc.ca/x?y=1');
assert.equal(safeUrl('http://example.test/a'), 'http://example.test/a');
assert.equal(safeUrl('javascript:alert(1)'), null);
assert.equal(safeUrl('JaVaScRiPt:alert(1)'), null);
assert.equal(safeUrl('data:text/html,<script>x</script>'), null);
assert.equal(safeUrl('//evil.test/a'), null);
assert.equal(safeUrl('https://x.test/a" onmouseover="alert(1)'), null);
assert.equal(safeUrl(''), null);
assert.equal(safeUrl(null), null);

console.log('All parser tests passed.');

/* ------------------------------------------- ECCC Datamart root fallback */
// MSC moved citypage_weather under /today/ once already; the resolver must
// keep trying candidates rather than trusting a single hardcoded path.
const { ROOTS, siteListUrl, hourDirUrl, SITE_DOC_PATTERN } = eccc._internals;
assert.ok(Array.isArray(ROOTS) && ROOTS.length >= 2, 'need more than one candidate root');
assert.ok(ROOTS[0].includes('/today/'), 'current Datamart root must be tried first');
assert.equal(siteListUrl(ROOTS[0]), 'https://dd.weather.gc.ca/today/citypage_weather/docs/site_list_en.csv');
assert.equal(
  hourDirUrl(ROOTS[0], 'ON', '01'),
  'https://dd.weather.gc.ca/today/citypage_weather/ON/01/'
);

// Site documents are timestamped, so the filename must be discovered from
// the hour directory listing rather than constructed. This is a real excerpt.
const LISTING = `<a href="/today/citypage_weather/ON/">Parent Directory</a>
<a href="20260818T010026.748Z_MSC_CitypageWeather_s0000455_en.xml">2026...</a>
<a href="20260818T010031.220Z_MSC_CitypageWeather_s0000430_en.xml">2026...</a>
<a href="20260818T013045.101Z_MSC_CitypageWeather_s0000430_en.xml">2026...</a>
<a href="20260818T010044.900Z_MSC_CitypageWeather_s0000430_fr.xml">2026...</a>`;

const found = [...LISTING.matchAll(SITE_DOC_PATTERN('s0000430'))].map((m) => m[1]);
assert.equal(found.length, 2, 'must match both English revisions and skip the French one');
// The newest revision in the hour is the last entry.
assert.equal(found[found.length - 1], '20260818T013045.101Z_MSC_CitypageWeather_s0000430_en.xml');
// A different site's document must not be picked up.
assert.equal([...LISTING.matchAll(SITE_DOC_PATTERN('s0000455'))].length, 1);
assert.equal([...LISTING.matchAll(SITE_DOC_PATTERN('s9999999'))].length, 0);
// The legacy root stays as a fallback in case the move is reverted.
assert.ok(ROOTS.some((r) => !r.includes('/today/')), 'legacy root must remain a fallback');

/* --------------------------------------------------- ECCC title casing */
// A real production alert: ECCC shouts some descriptions and not others.
const { titleCase } = eccc._internals;
assert.equal(titleCase('YELLOW WARNING - AIR QUALITY'), 'Yellow Warning - Air Quality');
assert.equal(titleCase('SEVERE THUNDERSTORM WATCH'), 'Severe Thunderstorm Watch');
// Minor words stay lowercase, except when they lead.
assert.equal(titleCase('RISK OF FROST'), 'Risk of Frost');
assert.equal(titleCase('THE RIDGE'), 'The Ridge');
// Already-cased text is the agency's wording; leave it alone.
assert.equal(titleCase('Rainfall warning'), 'Rainfall warning');
assert.equal(titleCase('Snow squall watch'), 'Snow squall watch');
assert.equal(titleCase(''), '');
assert.equal(titleCase(null), '');
// Accented characters survive, and French minor words stay lowercase.
assert.equal(titleCase('AVERTISSEMENT DE CHALEUR À MONTRÉAL'), 'Avertissement de Chaleur À Montréal');

// The parser must apply it end to end.
const shouty = parseWarnings(
  '<warnings url="https://x.test/a"><event type="warning" priority="high" description="YELLOW WARNING - AIR QUALITY"/></warnings>',
  site
);
assert.equal(shouty[0].event, 'Yellow Warning - Air Quality');

console.log('Datamart root fallback and title-casing checks passed.');
