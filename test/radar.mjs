import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { radarRegion, sampleFrames, radarTileUrl } from '../js/radar-data.js';
const require = createRequire(import.meta.url);
const { parseFrames, freshFeed, OBSERVED, PROJECTED } = require('../api/_lib/radar-eccc')._internals;
const capabilities = (layer, extra = '') => `<WMS_Capabilities><Capability><Layer>
  <Dimension name="time">2026-10-10T00:00:00Z/2026-10-10T03:00:00Z/PT6M</Dimension>
  <Layer><Name>${layer}</Name>
  <Dimension name="time" default="2026-10-10T10:00:00Z">2026-10-10T10:00:00Z/2026-10-10T11:12:00Z/PT6M</Dimension>
  ${extra}</Layer></Layer></Capability></WMS_Capabilities>`;
const ref = '<Dimension name="reference_time" default="2026-10-10T10:00:00Z">2026-10-10T07:00:00Z/2026-10-10T10:00:00Z/PT6M</Dimension>';
const xml = capabilities(PROJECTED, ref);
const projected = parseFrames(xml, PROJECTED);
assert.equal(projected.length, 12);
assert.equal(projected[0].time, Date.parse('2026-10-10T10:06:00Z') / 1000, 'never use the parent layer time');
assert.equal(projected.at(-1).time, Date.parse('2026-10-10T11:12:00Z') / 1000);
assert.equal(projected[0].referenceTime, '2026-10-10T10:00:00Z', 'pin every frame to the same radar run');
assert.deepEqual(parseFrames(xml.replace('PT6M', 'PT1S').replaceAll('PT6M', 'PT1S'), PROJECTED), []);
assert.deepEqual(parseFrames(xml.replaceAll('2026-10-10T10:00:00Z', 'not-a-date'), PROJECTED), []);
assert.deepEqual(parseFrames(capabilities(OBSERVED), PROJECTED), []);
assert.deepEqual(parseFrames('<ServiceException>bad time</ServiceException>', PROJECTED), []);
const observed = { time: Date.parse('2026-10-10T10:00:00Z') / 1000, kind: 'past', layer: OBSERVED };
const now = Date.parse('2026-10-10T10:10:00Z') / 1000;
const feed = freshFeed([observed, ...projected], now);
assert.equal(feed.futureThrough - now, 62 * 60, '72 minutes from the run is only 62 minutes from this visitor time');
assert.equal(feed.frames.filter(f => f.kind === 'forecast').length, 11);
assert.ok(feed.frames.filter(f => f.kind === 'forecast').every(f => f.time > now));
assert.equal(freshFeed([observed, ...projected], now + 31 * 60).available, false, 'do not show a stale run as usable future radar');
assert.equal(freshFeed([observed], now).futureAvailable, false, 'an extrapolation outage leaves observed radar available');
assert.equal(freshFeed(projected, now).available, true, 'a separate observation outage need not hide fresh projections');
const sampled = sampleFrames([observed, ...projected], 5);
assert.equal(sampled.length, 5);
assert.equal(sampled[0], observed);
assert.equal(sampled.at(-1), projected.at(-1), 'request budget must keep the farthest projection');
assert.equal(radarRegion(45.42, -75.7), 'north-america');
assert.equal(radarRegion(40.71, -74.0), 'north-america');
assert.equal(radarRegion(51.5, -0.12), 'global');
const url = new URL(radarTileUrl(feed, projected[0], 1, 1, 0));
assert.equal(url.origin, 'https://geo.weather.gc.ca');
assert.equal(url.searchParams.get('DIM_REFERENCE_TIME'), '2026-10-10T10:00:00Z');
assert.equal(url.searchParams.get('BBOX'), '0,0,20037508.342789244,20037508.342789244', 'Web Mercator north-east tile has east/north axes');
assert.equal(url.searchParams.get('WIDTH'), '512');
assert.equal(url.searchParams.get('TIME'), '2026-10-10T10:06:00Z', 'GeoMet rejects fractional seconds even with HTTP 200');
assert.equal(radarTileUrl({ ...feed, host: 'https://evil.example' }, projected[0], 6, 18, 23), '');
assert.equal(radarTileUrl(feed, { ...projected[0], layer: 'arbitrary' }, 6, 18, 23), '');
assert.equal(radarTileUrl(feed, { ...projected[0], referenceTime: null }, 6, 18, 23), '');
assert.equal(radarTileUrl({host:'https://tilecache.rainviewer.com'}, {path:'/v2/radar/123'}, 6, 18, 23), 'https://tilecache.rainviewer.com/v2/radar/123/512/6/18/23/2/1_1.png');
for (const host of ['https://rainviewer.com.attacker.example', 'https://tilecache.rainviewer.com?x=y', 'http://rainviewer.com']) {
  assert.equal(radarTileUrl({host}, {path:'/v2/radar/123'}, 6, 18, 23), '');
}
const government = require('../api/_lib/radar-eccc');
const originalFetch = globalThis.fetch, originalNow = Date.now;
try {
  Date.now = () => now * 1000;
  let requests = 0;
  globalThis.fetch = async url => {
    requests++;
    if (new URL(url).searchParams.get('layer') === PROJECTED) throw new Error('projection outage');
    return { ok: true, text: async () => capabilities(OBSERVED).replace('2026-10-10T11:12:00Z', '2026-10-10T10:00:00Z') };
  };
  const [a, b] = await Promise.all([government.radarFeed(), government.radarFeed()]);
  assert.equal(requests, 2, 'simultaneous cities share one pair of metadata requests');
  assert.equal(a.available, true); assert.equal(b.futureAvailable, false);
  assert.ok(a.frames.every(f => f.kind === 'past'), 'projection failure must leave usable observations');
  const c = require('../api/_lib/cache');
  c.set('radar:eccc:frames', undefined, 1);
  globalThis.fetch = async () => { throw new Error('complete outage'); };
  assert.equal((await government.radarFeed()).available, true, 'fresh last-good observations survive a temporary upstream outage');
  Date.now = () => (now + 40 * 60) * 1000;
  assert.equal((await government.radarFeed()).available, false, 'last-good radar expires instead of looking current indefinitely');
} finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
console.log('Radar source parsing, freshness, full-horizon sampling and geographic tile checks passed.');
