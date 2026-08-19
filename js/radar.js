/**
 * Animated precipitation radar.
 *
 * A minimal slippy map built from plain <img> tiles -- no Leaflet, no
 * MapLibre, no bundler. Base tiles come from CARTO (OpenStreetMap data),
 * precipitation frames from RainViewer. Tiles are never read back into a
 * canvas, so cross-origin tainting is a non-issue.
 */

import { fetchRadarIndex } from './api.js';
import { timeLabel } from './format.js';
import { clamp } from './dom.js';

const TILE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 10;
const MAX_FRAMES = 10;
const COLOR_SCHEME = 4;   // RainViewer "Titan" palette -- readable in both themes
const TILE_OPTIONS = '1_1'; // smoothed, snow rendered separately

/* --------------------------------------------------- web mercator maths */

function lonToWorldX(lon, zoom) {
  return ((lon + 180) / 360) * Math.pow(2, zoom) * TILE;
}

function latToWorldY(lat, zoom) {
  const clamped = clamp(lat, -85.05112878, 85.05112878);
  const rad = (clamped * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
  return y * Math.pow(2, zoom) * TILE;
}

function worldXToLon(x, zoom) {
  return (x / (Math.pow(2, zoom) * TILE)) * 360 - 180;
}

function worldYToLat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / (Math.pow(2, zoom) * TILE);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/* ------------------------------------------------------------- the map */

export function createRadarMap(container, options = {}) {
  const state = {
    lat: options.lat ?? 45.42,
    lon: options.lon ?? -75.7,
    zoom: clamp(options.zoom ?? 7, MIN_ZOOM, MAX_ZOOM),
    frames: [],
    host: null,
    frameIndex: 0,
    playing: true,
    theme: options.theme === 'light' ? 'light' : 'dark',
    units: options.units || { clock: '12' },
  };

  let timer = null;
  let destroyed = false;

  container.classList.add('radar');
  // Published before the first paint so the viewport never flashes the wrong
  // backdrop while the first row of tiles is still in flight.
  container.dataset.basemap = state.theme;
  container.innerHTML = `
    <div class="radar-viewport" role="application" aria-label="Precipitation radar map">
      <div class="radar-world">
        <div class="radar-layer radar-base"></div>
        <div class="radar-frames"></div>
      </div>
      <div class="radar-crosshair" aria-hidden="true"></div>
      <div class="radar-zoom">
        <button type="button" class="radar-btn" data-radar="zoom-in" aria-label="Zoom in">+</button>
        <button type="button" class="radar-btn" data-radar="zoom-out" aria-label="Zoom out">−</button>
      </div>
      <p class="radar-attribution">
        Radar <a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a> ·
        Map <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> ·
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
      </p>
      <div class="radar-status" hidden></div>
    </div>
    <div class="radar-controls">
      <button type="button" class="radar-play" data-radar="toggle" aria-label="Pause animation">
        <span class="radar-play-icon" aria-hidden="true"></span>
      </button>
      <input class="radar-scrub" type="range" min="0" max="0" value="0"
             aria-label="Radar frame" data-radar="scrub">
      <output class="radar-time" data-radar="time">--</output>
    </div>
    <div class="radar-legend" aria-hidden="true">
      <span>Light</span>
      <div class="radar-legend-bar"></div>
      <span>Heavy</span>
    </div>
  `;

  const viewport = container.querySelector('.radar-viewport');
  const world = container.querySelector('.radar-world');
  const baseLayer = container.querySelector('.radar-base');
  const framesLayer = container.querySelector('.radar-frames');
  const scrub = container.querySelector('[data-radar="scrub"]');
  const timeOut = container.querySelector('[data-radar="time"]');
  const statusBox = container.querySelector('.radar-status');
  const playButton = container.querySelector('[data-radar="toggle"]');

  function setStatus(message) {
    statusBox.hidden = !message;
    statusBox.textContent = message || '';
  }

  function baseTileUrl(z, x, y) {
    const style = state.theme === 'light' ? 'light_all' : 'dark_all';
    return `https://basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png`;
  }

  function radarTileUrl(frame, z, x, y) {
    return `${state.host}${frame.path}/${TILE}/${z}/${x}/${y}/${COLOR_SCHEME}/${TILE_OPTIONS}.png`;
  }

  /** Build one layer's worth of <img> tiles for the current viewport. */
  function paintLayer(layer, urlFor) {
    const { width, height } = viewport.getBoundingClientRect();
    const originX = lonToWorldX(state.lon, state.zoom) - width / 2;
    const originY = latToWorldY(state.lat, state.zoom) - height / 2;

    const span = Math.pow(2, state.zoom);
    const firstX = Math.floor(originX / TILE) - 1;
    const firstY = Math.floor(originY / TILE) - 1;
    const lastX = Math.floor((originX + width) / TILE) + 1;
    const lastY = Math.floor((originY + height) / TILE) + 1;

    const parts = [];
    for (let x = firstX; x <= lastX; x += 1) {
      for (let y = firstY; y <= lastY; y += 1) {
        if (y < 0 || y >= span) continue;         // no tiles past the poles
        const wrappedX = ((x % span) + span) % span; // but the map wraps east-west
        parts.push(
          `<img class="radar-tile" src="${urlFor(state.zoom, wrappedX, y)}" alt=""
                loading="eager" decoding="async" draggable="false"
                style="left:${x * TILE - originX}px; top:${y * TILE - originY}px">`
        );
      }
    }
    layer.innerHTML = parts.join('');

    // Missing tiles are routine at the edges of radar coverage. Hide them
    // here rather than with an inline handler, which the CSP forbids.
    for (const tile of layer.querySelectorAll('.radar-tile')) {
      tile.addEventListener('error', () => { tile.style.visibility = 'hidden'; }, { once: true });
    }
  }

  function paintBase() {
    // CARTO's two basemaps sit at opposite ends of the luminance range, and
    // the dark one is built to disappear under bright data. Radar is not
    // bright data -- light rain is pale blue -- so the stylesheet lifts the
    // dark map back to a readable mid-grey. Publishing which one is on screen
    // keeps that correction in CSS instead of hardcoding a filter here.
    container.dataset.basemap = state.theme;
    paintLayer(baseLayer, baseTileUrl);
  }

  function paintFrames() {
    if (!state.frames.length || !state.host) return;
    framesLayer.innerHTML = state.frames
      .map((_, i) => `<div class="radar-layer radar-frame" data-frame="${i}"></div>`)
      .join('');

    state.frames.forEach((frame, i) => {
      const layer = framesLayer.querySelector(`[data-frame="${i}"]`);
      paintLayer(layer, (z, x, y) => radarTileUrl(frame, z, x, y));
    });
    showFrame(state.frameIndex);
  }

  function repaint() {
    world.style.transform = 'translate3d(0,0,0)';
    paintBase();
    paintFrames();
  }

  function showFrame(index) {
    if (!state.frames.length) return;
    state.frameIndex = ((index % state.frames.length) + state.frames.length) % state.frames.length;

    for (const layer of framesLayer.children) {
      const isCurrent = Number(layer.dataset.frame) === state.frameIndex;
      layer.classList.toggle('is-current', isCurrent);
    }

    const frame = state.frames[state.frameIndex];
    scrub.value = String(state.frameIndex);
    // RainViewer stamps are unix seconds; show them in the viewer's own time.
    const stamp = new Date(frame.time * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}T${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`;
    timeOut.textContent =
      `${timeLabel(local, state.units)}${frame.kind === 'forecast' ? ' · nowcast' : ''}`;
    timeOut.classList.toggle('is-forecast', frame.kind === 'forecast');
  }

  function play() {
    stop();
    state.playing = true;
    playButton.classList.add('is-playing');
    playButton.setAttribute('aria-label', 'Pause animation');
    timer = setInterval(() => {
      // Hold a beat on the newest frame so the loop reads clearly.
      const next = state.frameIndex + 1;
      showFrame(next >= state.frames.length ? 0 : next);
    }, 550);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    state.playing = false;
    playButton.classList.remove('is-playing');
    playButton.setAttribute('aria-label', 'Play animation');
  }

  /* ------------------------------------------------------ interaction */

  let drag = null;

  viewport.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.radar-btn, a')) return;
    drag = { x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-dragging');
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!drag) return;
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    // Cheap during the gesture; tiles are re-fetched only once on release.
    world.style.transform = `translate3d(${drag.dx}px, ${drag.dy}px, 0)`;
  });

  function endDrag(event) {
    if (!drag) return;
    viewport.classList.remove('is-dragging');
    if (event && event.pointerId !== undefined && viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    if (Math.abs(drag.dx) > 2 || Math.abs(drag.dy) > 2) {
      const centerX = lonToWorldX(state.lon, state.zoom) - drag.dx;
      const centerY = latToWorldY(state.lat, state.zoom) - drag.dy;
      state.lon = worldXToLon(centerX, state.zoom);
      state.lat = clamp(worldYToLat(centerY, state.zoom), -85, 85);
      repaint();
    } else {
      world.style.transform = 'translate3d(0,0,0)';
    }
    drag = null;
  }

  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    setZoom(state.zoom + (event.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  function setZoom(next) {
    const target = clamp(Math.round(next), MIN_ZOOM, MAX_ZOOM);
    if (target === state.zoom) return;
    state.zoom = target;
    repaint();
  }

  container.addEventListener('click', (event) => {
    const action = event.target.closest('[data-radar]');
    if (!action) return;
    const kind = action.dataset.radar;
    if (kind === 'zoom-in') setZoom(state.zoom + 1);
    if (kind === 'zoom-out') setZoom(state.zoom - 1);
    if (kind === 'toggle') (state.playing ? stop() : play());
  });

  scrub.addEventListener('input', () => {
    stop();
    showFrame(Number(scrub.value));
  });

  const onResize = debounce(() => { if (!destroyed) repaint(); }, 200);
  window.addEventListener('resize', onResize);

  /* ----------------------------------------------------------- startup */

  async function load() {
    setStatus('Loading radar…');
    paintBase();

    try {
      const index = await fetchRadarIndex();
      if (destroyed) return;

      if (!index.available || !index.frames.length) {
        setStatus('Radar imagery is unavailable right now.');
        return;
      }

      state.host = index.host;
      // Keep the tail of the past frames plus the whole nowcast.
      const past = index.frames.filter((f) => f.kind === 'past').slice(-MAX_FRAMES);
      const forecast = index.frames.filter((f) => f.kind === 'forecast');
      state.frames = [...past, ...forecast];

      scrub.max = String(state.frames.length - 1);
      state.frameIndex = Math.max(0, past.length - 1); // start on "now"
      paintFrames();
      setStatus('');
      play();
    } catch (error) {
      setStatus('Radar imagery is unavailable right now.');
    }
  }

  load();

  return {
    setCenter(lat, lon, zoom) {
      state.lat = lat;
      state.lon = lon;
      if (zoom) state.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
      repaint();
    },
    setTheme(theme) {
      const next = theme === 'light' ? 'light' : 'dark';
      if (next === state.theme) return;
      state.theme = next;
      paintBase();
    },
    setUnits(units) {
      state.units = units;
      if (state.frames.length) showFrame(state.frameIndex);
    },
    destroy() {
      destroyed = true;
      stop();
      window.removeEventListener('resize', onResize);
      container.innerHTML = '';
    },
  };
}

function debounce(fn, wait) {
  let handle = null;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), wait);
  };
}
