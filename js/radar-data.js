/** Shared map calculations and bounded radar timeline selection. */
export function radarRegion(lat, lon) {
  return lat >= 16.93 && lat <= 67.19 && lon >= -170.32 && lon <= -50 ? 'north-america' : 'global';
}

export function sampleFrames(frames, limit) {
  if (frames.length <= limit) return frames;
  if (limit < 2) return frames.slice(-1);
  return Array.from({ length: limit }, (_, i) => frames[Math.round(i * (frames.length - 1) / (limit - 1))]);
}

export function radarTileUrl(feed, frame, z, x, y) {
  if (feed.provider === 'eccc') {
    if (feed.host !== 'https://geo.weather.gc.ca/geomet'
      || !['RADAR_1KM_RRAI', 'Radar_1km_RainPrecipRate-Extrapolation'].includes(frame.layer)) return '';
    const edge = 20037508.342789244, span = 2 * edge / 2 ** z;
    const left = -edge + x * span, top = edge - y * span;
    const params = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap',
      LAYERS: frame.layer, STYLES: 'Radar-Rain_14colors', FORMAT: 'image/png', TRANSPARENT: 'TRUE',
      CRS: 'EPSG:3857', BBOX: [left, top - span, left + span, top].join(','),
      WIDTH: '512', HEIGHT: '512', TIME: new Date(frame.time * 1000).toISOString().replace('.000Z', 'Z'),
    });
    if (frame.kind === 'forecast') {
      if (!Number.isFinite(Date.parse(frame.referenceTime))) return '';
      params.set('DIM_REFERENCE_TIME', frame.referenceTime);
    }
    return `${feed.host}?${params}`;
  }
  try {
    const host = new URL(feed.host);
    if (host.protocol !== 'https:' || !(host.hostname === 'rainviewer.com' || host.hostname.endsWith('.rainviewer.com'))
      || host.username || host.password || host.port || host.pathname !== '/' || host.search || host.hash
      || !/^\/v2\/radar\/\d+$/.test(frame.path)) return '';
    return `${host.origin}${frame.path}/512/${z}/${x}/${y}/2/1_1.png`;
  } catch { return ''; }
}
