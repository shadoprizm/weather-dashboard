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

// Slippy-map coordinates use 256 CSS-pixel tiles. Both providers can return
// 512-pixel images for those same coordinates, which keeps coastlines and
// radar edges crisp on Retina/high-density displays without changing the map
// maths or geographic scale.
const TILE = 256;
const SOURCE_TILE = 512;
const MIN_ZOOM = 3;
const MAX_ZOOM = 7;       // RainViewer's public tile pyramid stops at zoom 7
const MAX_FRAMES = 8;
const RADAR_TILE_BUDGET = 42; // leave room for an immediate zoom or short pan
const COLOR_SCHEME = 2;   // RainViewer's supported Universal Blue palette
const TILE_OPTIONS = '1_1'; // smoothed, snow rendered separately
const FRAME_INTERVAL = 850;

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
    zoom: clamp(options.zoom ?? 6, MIN_ZOOM, MAX_ZOOM),
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
        <div class="radar-layer radar-labels"></div>
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
  const labelsLayer = container.querySelector('.radar-labels');
  const scrub = container.querySelector('[data-radar="scrub"]');
  const timeOut = container.querySelector('[data-radar="time"]');
  const statusBox = container.querySelector('.radar-status');
  const playButton = container.querySelector('[data-radar="toggle"]');
  const zoomInButton = container.querySelector('[data-radar="zoom-in"]');
  const zoomOutButton = container.querySelector('[data-radar="zoom-out"]');

  let paintGeneration = 0;

  function setStatus(message) {
    statusBox.hidden = !message;
    statusBox.textContent = message || '';
  }

  function cartoTileUrl(style, z, x, y) {
    return `https://basemaps.cartocdn.com/${style}/${z}/${x}/${y}@2x.png`;
  }

  function baseTileUrl(z, x, y) {
    // The light no-labels map has much stronger land/water separation than
    // CARTO Dark Matter. CSS tones it down in dark mode without throwing away
    // that geography.
    return cartoTileUrl('light_nolabels', z, x, y);
  }

  function labelsTileUrl(z, x, y) {
    return cartoTileUrl('light_only_labels', z, x, y);
  }

  function radarTileUrl(frame, z, x, y) {
    return `${state.host}${frame.path}/${SOURCE_TILE}/${z}/${x}/${y}/${COLOR_SCHEME}/${TILE_OPTIONS}.png`;
  }

  /** Build one layer's worth of <img> tiles for the current viewport. */
  function paintLayer(layer, urlFor, overscan = 0) {
    const { width, height } = viewport.getBoundingClientRect();
    const originX = lonToWorldX(state.lon, state.zoom) - width / 2;
    const originY = latToWorldY(state.lat, state.zoom) - height / 2;

    const span = Math.pow(2, state.zoom);
    const firstX = Math.floor(originX / TILE) - overscan;
    const firstY = Math.floor(originY / TILE) - overscan;
    const lastX = Math.floor((originX + Math.max(0, width - 1)) / TILE) + overscan;
    const lastY = Math.floor((originY + Math.max(0, height - 1)) / TILE) + overscan;

    const parts = [];
    for (let x = firstX; x <= lastX; x += 1) {
      for (let y = firstY; y <= lastY; y += 1) {
        if (y < 0 || y >= span) continue;         // no tiles past the poles
        const wrappedX = ((x % span) + span) % span; // but the map wraps east-west
        parts.push(
          `<img class="radar-tile" src="${urlFor(state.zoom, wrappedX, y)}" alt=""
                width="${SOURCE_TILE}" height="${SOURCE_TILE}"
                loading="eager" decoding="async" draggable="false"
                style="left:${x * TILE - originX}px; top:${y * TILE - originY}px">`
        );
      }
    }
    layer.innerHTML = parts.join('');

    // A frame is not allowed into the animation until every visible image has
    // loaded and decoded. That prevents late tiles from appearing as moving
    // rectangular blocks while the timeline advances.
    const tiles = [...layer.querySelectorAll('.radar-tile')];
    const readiness = tiles.map((tile) => new Promise((resolve) => {
      let settled = false;

      const finish = async (loaded) => {
        if (settled) return;
        settled = true;
        if (!loaded) tile.style.visibility = 'hidden';
        if (loaded && typeof tile.decode === 'function') {
          try { await tile.decode(); } catch (error) { /* load still succeeded */ }
        }
        resolve(loaded);
      };

      tile.addEventListener('load', () => { finish(true); }, { once: true });
      tile.addEventListener('error', () => { finish(false); }, { once: true });
      if (tile.complete) finish(tile.naturalWidth > 0);
    }));

    return Promise.all(readiness).then((loaded) => ({
      loaded: loaded.filter(Boolean).length,
      total: loaded.length,
    }));
  }

  function visibleRadarTileCount() {
    const { width, height } = viewport.getBoundingClientRect();
    const originX = lonToWorldX(state.lon, state.zoom) - width / 2;
    const originY = latToWorldY(state.lat, state.zoom) - height / 2;
    const columns = Math.floor((originX + Math.max(0, width - 1)) / TILE)
      - Math.floor(originX / TILE) + 1;
    const rows = Math.floor((originY + Math.max(0, height - 1)) / TILE)
      - Math.floor(originY / TILE) + 1;
    return Math.max(1, columns * rows);
  }

  function frameLimit() {
    return clamp(Math.floor(RADAR_TILE_BUDGET / visibleRadarTileCount()), 3, MAX_FRAMES);
  }

  function paintBase() {
    container.dataset.basemap = state.theme;
    // Geography can overdraw beyond the viewport during a drag. Radar frames
    // intentionally do not: limiting them to visible tiles keeps playback
    // comfortably inside the public API's request budget.
    void paintLayer(baseLayer, baseTileUrl, 1);
    void paintLayer(labelsLayer, labelsTileUrl, 1);
  }

  async function paintFrames(preferredFrame = state.frames[state.frameIndex]) {
    if (!state.frames.length || !state.host) return false;

    const generation = ++paintGeneration;
    const shouldResume = state.playing;
    clearPlaybackTimer();
    playButton.disabled = true;
    scrub.disabled = true;
    setStatus('Preparing smooth radar…');

    // Zooming in exposes more tiles. Trim the oldest frames again at the new
    // scale so a zoom cannot undo the request budget established at startup.
    const candidates = state.frames.slice(-frameLimit());
    framesLayer.innerHTML = candidates
      .map((_, i) => `<div class="radar-layer radar-frame" data-frame="${i}"></div>`)
      .join('');

    // Fetch newest first so the most useful image is ready earliest. Frames
    // load one at a time, keeping network pressure predictable.
    const ready = [];
    const order = candidates.map((_, i) => i).reverse();
    for (const i of order) {
      const frame = candidates[i];
      const layer = framesLayer.querySelector(`[data-frame="${i}"]`);
      const result = await paintLayer(layer, (z, x, y) => radarTileUrl(frame, z, x, y));
      if (destroyed || generation !== paintGeneration) return false;

      // A partial frame is worse than skipping one: the missing square moves
      // with the animation and reads as corrupt radar data.
      if (result.total > 0 && result.loaded === result.total) {
        ready.push({ frame, layer, originalIndex: i });
      } else {
        layer.remove();
      }
    }

    ready.sort((a, b) => a.originalIndex - b.originalIndex);
    if (!ready.length) {
      state.frames = [];
      framesLayer.innerHTML = '';
      setStatus('Radar imagery is unavailable right now.');
      return false;
    }

    framesLayer.replaceChildren(...ready.map((entry) => entry.layer));
    ready.forEach((entry, i) => { entry.layer.dataset.frame = String(i); });
    state.frames = ready.map((entry) => entry.frame);
    const preferredIndex = state.frames.findIndex((frame) =>
      frame.path === preferredFrame?.path && frame.time === preferredFrame?.time);
    state.frameIndex = preferredIndex >= 0 ? preferredIndex : state.frames.length - 1;

    scrub.max = String(state.frames.length - 1);
    scrub.disabled = state.frames.length < 2;
    playButton.disabled = state.frames.length < 2;
    showFrame(state.frameIndex);
    setStatus('');
    if (shouldResume && state.frames.length > 1) play();
    else if (state.frames.length < 2) stop();
    return true;
  }

  function repaint() {
    world.style.transform = 'translate3d(0,0,0)';
    paintBase();
    void paintFrames();
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
    if (state.frames.length < 2) return;
    clearPlaybackTimer();
    state.playing = true;
    playButton.classList.add('is-playing');
    playButton.setAttribute('aria-label', 'Pause animation');
    let holdingNewest = false;
    timer = setInterval(() => {
      // Hold a beat on the newest frame so the loop reads clearly, then use a
      // slower crossfade so individual 10-minute observations do not strobe.
      const next = state.frameIndex + 1;
      if (next >= state.frames.length && !holdingNewest) {
        holdingNewest = true;
        return;
      }
      holdingNewest = false;
      showFrame(next >= state.frames.length ? 0 : next);
    }, FRAME_INTERVAL);
  }

  function clearPlaybackTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function stop() {
    clearPlaybackTimer();
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
    updateZoomButtons();
    repaint();
  }

  function updateZoomButtons() {
    zoomInButton.disabled = state.zoom >= MAX_ZOOM;
    zoomOutButton.disabled = state.zoom <= MIN_ZOOM;
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
      // Keep enough history to show useful movement without bursting through
      // RainViewer's public tile-request limit on a wide desktop viewport.
      const limit = frameLimit();
      const forecast = index.frames.filter((f) => f.kind === 'forecast');
      const forecastCount = Math.min(forecast.length, Math.floor(limit / 3));
      const past = index.frames.filter((f) => f.kind === 'past')
        .slice(-(limit - forecastCount));
      state.frames = [...past, ...forecast.slice(0, forecastCount)];

      state.frameIndex = Math.max(0, past.length - 1); // start on "now"
      await paintFrames(state.frames[state.frameIndex]);
    } catch (error) {
      setStatus('Radar imagery is unavailable right now.');
    }
  }

  updateZoomButtons();
  load();

  return {
    setCenter(lat, lon, zoom) {
      state.lat = lat;
      state.lon = lon;
      if (zoom) state.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
      updateZoomButtons();
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
