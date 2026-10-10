'use strict';

const { fetchTextSoft, buildUrl } = require('./upstream');
const { findTags } = require('./xml');
const cache = require('./cache');

const HOST = 'https://geo.weather.gc.ca/geomet';
const OBSERVED = 'RADAR_1KM_RRAI';
const PROJECTED = 'Radar_1km_RainPrecipRate-Extrapolation';
const SOURCE_URL = 'https://eccc-msc.github.io/open-data/msc-data/obs_radar/readme_radar_geomet_en/';
let pending;

// Read only the named leaf layer. A capabilities document contains parent
// layers and styles with their own Name elements and time dimensions.
function dimensions(xml, name) {
  if (typeof xml !== 'string' || xml.length > 1000000) return [];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marker = new RegExp(`<(?:[\\w.-]+:)?Name\\s*>\\s*${escaped}\\s*</(?:[\\w.-]+:)?Name\\s*>`);
  const match = marker.exec(xml);
  if (!match) return [];
  const tail = xml.slice(match.index + match[0].length);
  const end = tail.search(/<\/(?:[\w.-]+:)?Layer\s*>/);
  if (end < 0) return [];
  return findTags(tail.slice(0, end), 'Dimension');
}

function timestamp(value) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value || '')) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().replace('.000Z', 'Z') === value ? ms / 1000 : null;
}

function interval(dimension) {
  const [start, end, period] = (dimension?.text || '').split('/');
  const from = timestamp(start), to = timestamp(end);
  // The published radar sequence is six-minute data. Fail closed if its
  // contract changes instead of fabricating unsupported GetMap times.
  if (from === null || to === null || period !== 'PT6M' || to < from || to - from > 4 * 3600) return [];
  const values = [];
  for (let time = from; time <= to; time += 360) values.push(time);
  return values;
}

function parseFrames(xml, layer) {
  const dims = dimensions(xml, layer);
  const times = interval(dims.find(d => d.attributes.name === 'time'));
  if (layer === OBSERVED) return times.map(time => ({ time, kind: 'past', layer }));
  const ref = dims.find(d => d.attributes.name === 'reference_time');
  const reference = timestamp(ref?.attributes.default);
  if (reference === null || !interval(ref).includes(reference)) return [];
  return times.filter(time => time > reference && time <= reference + 72 * 60)
    .map(time => ({ time, kind: 'forecast', layer, referenceTime: ref.attributes.default }));
}

function freshFeed(raw, now = Date.now() / 1000) {
  const past = raw.filter(frame => frame.kind === 'past' && frame.time <= now);
  const latest = past.at(-1);
  // Retain useful motion history only while its newest observation is fresh.
  const observed = latest && now - latest.time <= 30 * 60 ? past : [];
  const future = raw.filter(frame => frame.kind === 'forecast' && frame.time > now
    && now - timestamp(frame.referenceTime) <= 30 * 60
    && timestamp(frame.referenceTime) <= now);
  return {
    available: observed.length + future.length > 0,
    provider: 'eccc', host: HOST, sourceName: 'Environment Canada', sourceUrl: SOURCE_URL,
    frames: [...observed, ...future],
    futureAvailable: future.length > 0,
    futureThrough: future.at(-1)?.time || null,
    referenceTime: future[0]?.referenceTime || null,
    futureUnavailableReason: future.length ? null : 'Future radar is temporarily unavailable. Recent radar is still shown where available.',
    generated: Math.floor(now),
  };
}

async function radarFeed() {
  let raw = cache.get('radar:eccc:frames');
  if (!raw) {
    // Share one refresh across concurrent requests, independent of city.
    if (!pending) pending = (async () => {
      const get = layer => fetchTextSoft(buildUrl(HOST, {
        SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetCapabilities',
        layer, LAYERS_REFRESH_RATE: 'PT1M',
      }), null, { timeoutMs: 8000 });
      const [pastXml, futureXml] = await Promise.all([get(OBSERVED), get(PROJECTED)]);
      const past = parseFrames(pastXml, OBSERVED), future = parseFrames(futureXml, PROJECTED);
      const previous = cache.get('radar:eccc:last-good') || [];
      const frames = [
        ...(past.length ? past : previous.filter(f => f.kind === 'past')),
        ...(future.length ? future : previous.filter(f => f.kind === 'forecast')),
      ];
      cache.set('radar:eccc:frames', frames, past.length && future.length ? 60 : 15);
      if (past.length || future.length) cache.set('radar:eccc:last-good', frames, 30 * 60);
      return frames;
    })().finally(() => { pending = null; });
    raw = await pending;
  }
  return freshFeed(raw);
}

module.exports = { radarFeed, _internals: { dimensions, timestamp, interval, parseFrames, freshFeed, OBSERVED, PROJECTED } };
