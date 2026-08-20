/**
 * WeatherView — application shell.
 *
 * Owns data loading, state wiring and render orchestration. The views stay
 * pure; everything that touches the network, the DOM or the URL lives here.
 */

import * as api from './api.js';
import * as state from './state.js';
import * as fmt from './format.js';
import { esc, $, delegate, setHTML } from './dom.js';
import { skyTheme } from './wmo.js';
import { weatherIcon } from './icons.js';
import { buildViewModel as toViewModel } from './viewmodel.js';
import { createRadarMap } from './radar.js';
import {
  renderHero, renderHourly, renderDetails, renderDaily, errorPanel,
} from './views/forecast.js';
import {
  renderAlerts, renderActivities, renderAstro, renderAir, renderAlmanac, renderCompare,
} from './views/panels.js';

const REFRESH_MS = 10 * 60 * 1000;
const MAX_COMPARISONS = 8;

/**
 * What the server already knows about this page.
 *
 * City pages under `/weather/` arrive fully rendered, with a JSON block saying
 * which place they are showing and which section is open. Reading it means
 * hydration continues the page rather than restarting it: no flash of a
 * different location, no bounce back to the default view, and the clean URL
 * survives because the app stops appending `?lat=&lon=` to it.
 */
function readBootstrap() {
  const node = document.getElementById('wv-bootstrap');
  if (!node) return { page: 'app' };
  try {
    return JSON.parse(node.textContent) || { page: 'app' };
  } catch (error) {
    return { page: 'app' };
  }
}

const page = readBootstrap();

/**
 * Sections behind the tab bar.
 *
 * The hub above them — alerts and the hero, which now carries the briefing —
 * is never tabbed: it answers the question almost every visit is actually
 * asking, and hiding it behind a click would trade one problem for a worse
 * one. Everything here is rendered lazily, so opening the page costs one
 * view's worth of work instead of ten panels', and the radar does not fetch a
 * single map tile until you ask for it.
 */
const VIEWS = {
  today: ['hourly', 'details', 'air'],
  week: ['daily'],
  radar: [],
  plan: ['activities', 'astro'],
  almanac: ['almanac', 'compare'],
};

const VIEW_ORDER = Object.keys(VIEWS);
const DEFAULT_VIEW = 'today';

const RENDERERS = {
  hourly: renderHourly,
  details: renderDetails,
  air: renderAir,
  daily: renderDaily,
  activities: renderActivities,
  astro: renderAstro,
  almanac: renderAlmanac,
  compare: renderCompare,
};

const session = {
  place: null,
  data: null,
  alerts: null,
  almanac: null,
  space: null,
  comparisons: [],
  selectedDay: null,
  radar: null,
  loading: false,
  view: DEFAULT_VIEW,
  // Views already painted for the current data; cleared whenever it changes.
  painted: new Set(),
};

/* ---------------------------------------------------------------- render */

function buildViewModel() {
  const vm = toViewModel({
    data: session.data,
    place: session.place,
    units: state.getUnits(),
    alerts: session.alerts,
    almanac: session.almanac,
    space: session.space,
    comparisons: session.comparisons,
    selectedDay: session.selectedDay,
  });
  // Keep the server's H1 ("Toronto Weather", not "Toronto"): it is what the
  // page was indexed as, and swapping it after load would be a bait-and-switch.
  if (page.heading) vm.heading = page.heading;
  return vm;
}

function render() {
  if (!session.data) return;

  // New data or new units invalidate every painted view.
  session.painted.clear();

  const vm = buildViewModel();
  setHTML('#hero', renderHero(vm));
  setHTML('#alerts', renderAlerts(vm));

  paintView();
  applySky(vm);
  renderPlaces();
}

/** Render the active view's panels, once per data revision. */
function paintView() {
  if (!session.data) return;
  const view = session.view;

  if (view === 'radar') {
    mountRadar(session.place);
    return;
  }

  if (session.painted.has(view)) return;
  const vm = buildViewModel();
  for (const id of VIEWS[view]) {
    setHTML(`#${id}`, RENDERERS[id](vm));
  }
  session.painted.add(view);
}

/** Repaint one panel in place if its view is currently painted. */
function refreshPanel(id) {
  if (!session.data) return;
  const owner = VIEW_ORDER.find((view) => VIEWS[view].includes(id));
  if (!owner || !session.painted.has(owner)) return;
  setHTML(`#${id}`, RENDERERS[id](buildViewModel()));
}

function setView(view, { focusPanel = false } = {}) {
  if (!VIEWS[view] || view === session.view) {
    if (view === session.view && focusPanel) $(`#view-${view}`).focus();
    return;
  }

  session.view = view;

  for (const name of VIEW_ORDER) {
    const tab = $(`#tab-${name}`);
    const panel = $(`#view-${name}`);
    const active = name === view;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
  }

  paintView();
  syncUrl(session.place);
  if (focusPanel) $(`#view-${view}`).focus();
}

/** Drive the page gradient and the auto light/dark decision from the sky. */
function applySky(vm) {
  const current = vm.current;
  if (!current) return;

  const sky = skyTheme(current.weather_code, current.is_day);
  const skyElement = $('.sky');
  if (skyElement) skyElement.dataset.sky = sky;

  const preference = state.getState().theme;
  const resolved = preference === 'auto' ? (current.is_day ? 'light' : 'dark') : preference;
  document.documentElement.dataset.theme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#eef3fb' : '#0b1220');

  if (session.radar) session.radar.setTheme(resolved);
}

function renderPlaces() {
  const { locations, activeId } = state.getState();

  setHTML('#places', locations.map((place, i) => {
    const entry = session.comparisons.find((c) => c.place.id === place.id);
    const current = entry && entry.data && entry.data.current;
    const isActive = place.id === activeId;

    return `
      <div class="place-chip ${isActive ? 'is-active' : ''}">
        <button type="button" class="place-select" data-action="select-place" data-id="${esc(place.id)}"
                aria-current="${isActive}" title="${esc(state.placeLabel(place, { withCountry: true }))}">
          <span class="place-index" aria-hidden="true">${i < 9 ? i + 1 : ''}</span>
          <span class="place-name">${esc(place.name)}</span>
          ${current ? `<span class="place-temp">${esc(fmt.temp(current.temperature_2m, state.getUnits()))}</span>` : ''}
        </button>
        ${locations.length > 1 ? `
          <button type="button" class="place-remove" data-action="remove-place" data-id="${esc(place.id)}"
                  aria-label="${esc(`Remove ${place.name}`)}">×</button>` : ''}
      </div>`;
  }).join(''));
}

/* ----------------------------------------------------------- data loading */

async function loadPlace(place, { silent = false } = {}) {
  if (session.loading) return;
  session.loading = true;
  session.place = place;
  session.selectedDay = null;

  if (!silent) {
    setHTML('#hero', '<div class="skeleton skeleton-hero" aria-hidden="true"></div>');
  }
  document.body.classList.add('is-loading');

  try {
    session.data = await api.fetchForecast(place.latitude, place.longitude);
    // These panels were rendered from the previous location; clear them so a
    // slow secondary request never shows stale data next to fresh data.
    session.alerts = null;
    session.almanac = null;
    render();
    syncSaveButton();
    syncUrl(place);
    // The radar map is mounted by paintView() when its tab is opened; if it is
    // already on screen, just recentre it.
    if (session.radar) session.radar.setCenter(place.latitude, place.longitude);
    loadSecondary(place);
  } catch (error) {
    setHTML('#hero', errorPanel(`Could not load the forecast: ${error.message}`));
    toast('Forecast request failed. Check your connection and try refresh.');
  } finally {
    session.loading = false;
    document.body.classList.remove('is-loading');
  }
}

/** Optional panels, each independently failure-tolerant. */
function loadSecondary(place) {
  const localDate = session.data.current
    ? session.data.current.time.slice(0, 10)
    : undefined;

  api.soft(api.fetchAlerts(place.latitude, place.longitude)).then((alerts) => {
    if (session.place !== place || !alerts) return;
    session.alerts = alerts;
    setHTML('#alerts', renderAlerts(buildViewModel()));
  });

  api.soft(api.fetchAlmanac(place.latitude, place.longitude, localDate)).then((almanac) => {
    if (session.place !== place || !almanac) return;
    session.almanac = almanac;
    setHTML('#hero', renderHero(buildViewModel()));
    refreshPanel('almanac');
  });

  if (!session.space) {
    api.soft(api.fetchSpaceWeather()).then((space) => {
      if (!space) return;
      session.space = space;
      refreshPanel('astro');
    });
  }

  loadComparisons();
}

/** Current conditions for every saved location, for the ranking panel. */
async function loadComparisons() {
  const locations = state.getState().locations.slice(0, MAX_COMPARISONS);

  const results = await Promise.all(
    locations.map(async (place) => ({
      place,
      data: await api.soft(api.fetchForecast(place.latitude, place.longitude)),
    }))
  );

  session.comparisons = results.filter((entry) => entry.data);
  if (session.data) {
    refreshPanel('compare');
    renderPlaces();
  }
}

function mountRadar(place) {
  const mount = $('#radar-mount');
  if (!mount) return;

  const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  if (session.radar) {
    session.radar.setCenter(place.latitude, place.longitude);
    session.radar.setUnits(state.getUnits());
    return;
  }
  session.radar = createRadarMap(mount, {
    lat: place.latitude,
    lon: place.longitude,
    zoom: 7,
    theme,
    units: state.getUnits(),
  });
}

/* ------------------------------------------------------------------ URL */

function syncUrl(place) {
  // On a city page the URL is the canonical one the page was indexed under.
  // Switching sections moves along its own clean paths; nothing appends query
  // parameters to it, and following the search box away from the city drops
  // back to the dashboard rather than pretending the city page is showing
  // somewhere else.
  if (page.page === 'city') {
    const path = page.sectionPaths[session.view] || page.basePath;
    if (path && window.location.pathname !== path) {
      window.history.replaceState(null, '', path + window.location.search);
    }
    return;
  }

  const url = new URL(window.location.href);

  // setView() can run before the first forecast has loaded, so the place is
  // optional here; the location params are filled in once it arrives.
  if (place) {
    url.searchParams.set('lat', place.latitude.toFixed(4));
    url.searchParams.set('lon', place.longitude.toFixed(4));
    url.searchParams.set('name', place.name);
  }
  if (session.view && session.view !== DEFAULT_VIEW) url.searchParams.set('view', session.view);
  else url.searchParams.delete('view');
  window.history.replaceState(null, '', url);
}

/**
 * Switch to another place.
 *
 * On the dashboard that is a fetch. On a city page the URL *is* the place, so
 * changing place means navigating — otherwise `/weather/toronto` would sit
 * there showing Calgary, which is exactly the mismatch between URL and content
 * that a canonical tag is supposed to prevent.
 */
function goToPlace(place) {
  if (page.page !== 'app') {
    window.location.assign(appUrl(place, session.view));
    return;
  }
  loadPlace(place);
}

/** The dashboard URL for a place, used when leaving a city page. */
function appUrl(place, view) {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('lat', place.latitude.toFixed(4));
  url.searchParams.set('lon', place.longitude.toFixed(4));
  url.searchParams.set('name', place.name);
  if (view && view !== DEFAULT_VIEW) url.searchParams.set('view', view);
  return url.toString();
}

function placeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lat = Number.parseFloat(params.get('lat'));
  const lon = Number.parseFloat(params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return state.normalizePlace({
    name: params.get('name') || `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    latitude: lat,
    longitude: lon,
  });
}

/* --------------------------------------------------------------- search */

const searchInput = $('#search-input');
const searchResults = $('#search-results');
let searchTimer = null;
let searchHighlight = -1;
let searchItems = [];

function closeSearch() {
  searchResults.hidden = true;
  searchResults.innerHTML = '';
  searchInput.setAttribute('aria-expanded', 'false');
  searchHighlight = -1;
  searchItems = [];
}

function renderSearchResults(places, message = '') {
  searchItems = places;
  if (message) {
    searchResults.innerHTML = `<li class="search-empty" role="status">${esc(message)}</li>`;
  } else if (!places.length) {
    searchResults.innerHTML = '<li class="search-empty" role="status">No matching places</li>';
  } else {
    searchResults.innerHTML = places.map((place, i) => `
      <li role="option" id="search-option-${i}" aria-selected="false">
        <button type="button" class="search-result" data-action="pick-place" data-index="${i}">
          <span class="result-name">${esc(place.name)}</span>
          <span class="result-detail">${esc([place.admin1, place.country].filter(Boolean).join(', '))}</span>
        </button>
      </li>`).join('');
  }
  searchResults.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
  searchHighlight = -1;
}

function moveHighlight(offset) {
  if (!searchItems.length) return;
  searchHighlight = (searchHighlight + offset + searchItems.length) % searchItems.length;
  Array.from(searchResults.children).forEach((item, i) => {
    const selected = i === searchHighlight;
    item.setAttribute('aria-selected', String(selected));
    item.classList.toggle('is-highlighted', selected);
  });
}

function pickPlace(place) {
  const added = state.addLocation(place);
  closeSearch();
  searchInput.value = '';
  searchInput.blur();
  goToPlace(added);
}

searchInput.addEventListener('input', () => {
  const term = searchInput.value.trim();
  clearTimeout(searchTimer);
  if (term.length < 2) { closeSearch(); return; }

  searchTimer = setTimeout(async () => {
    try {
      const response = await api.searchPlaces(term);
      // A slower earlier request must not overwrite a newer one.
      if (searchInput.value.trim() !== term) return;
      renderSearchResults(response.results || []);
    } catch (error) {
      if (searchInput.value.trim() !== term) return;
      renderSearchResults([], 'Location search is temporarily unavailable. Please try again.');
    }
  }, 250);
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') { event.preventDefault(); moveHighlight(1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); moveHighlight(-1); }
  else if (event.key === 'Enter') {
    event.preventDefault();
    const chosen = searchItems[searchHighlight >= 0 ? searchHighlight : 0];
    if (chosen) pickPlace(chosen);
  } else if (event.key === 'Escape') {
    closeSearch();
    searchInput.blur();
  }
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.search')) closeSearch();
});

delegate(searchResults, 'click', '[data-action="pick-place"]', (event, button) => {
  const place = searchItems[Number(button.dataset.index)];
  if (place) pickPlace(place);
});

/* -------------------------------------------------------------- actions */

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;

  const { action } = trigger.dataset;

  if (action === 'select-place') {
    const place = state.getState().locations.find((l) => l.id === trigger.dataset.id);
    if (place) { state.setActive(place.id); goToPlace(place); }
  }

  if (action === 'remove-place') {
    state.removeLocation(trigger.dataset.id);
    session.comparisons = session.comparisons.filter((c) => c.place.id !== trigger.dataset.id);
    renderPlaces();
    const active = state.getActiveLocation();
    if (active && (!session.place || session.place.id !== active.id)) loadPlace(active);
    else render();
  }

  if (action === 'select-day') {
    const day = trigger.dataset.day;
    session.selectedDay = session.selectedDay === day ? null : day;
    // The hourly strip lives in Today, so picking a day in Week hops there.
    session.painted.delete('today');
    session.painted.delete('week');
    setView('today');
    paintView();
  }

  if (action === 'clear-day') {
    session.selectedDay = null;
    session.painted.delete('today');
    session.painted.delete('week');
    paintView();
  }
});

const tablist = $('.tabs');

tablist.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-view]');
  if (tab) setView(tab.dataset.view);
});

// Standard tablist keyboard model: arrows move between tabs, Home/End jump.
tablist.addEventListener('keydown', (event) => {
  const index = VIEW_ORDER.indexOf(session.view);
  let next = null;

  if (event.key === 'ArrowRight') next = VIEW_ORDER[(index + 1) % VIEW_ORDER.length];
  else if (event.key === 'ArrowLeft') next = VIEW_ORDER[(index - 1 + VIEW_ORDER.length) % VIEW_ORDER.length];
  else if (event.key === 'Home') next = VIEW_ORDER[0];
  else if (event.key === 'End') next = VIEW_ORDER[VIEW_ORDER.length - 1];

  if (!next) return;
  event.preventDefault();
  setView(next);
  $(`#tab-${next}`).focus();
});

$('#refresh').addEventListener('click', () => {
  if (session.place) loadPlace(session.place, { silent: true });
});

document.querySelectorAll('[data-units]').forEach((button) => {
  button.addEventListener('click', () => {
    state.setUnitSystem(button.dataset.units);
    syncUnitButtons();
    if (session.radar) session.radar.setUnits(state.getUnits());
    render();
  });
});

function syncUnitButtons() {
  const metric = state.isMetric();
  document.querySelectorAll('[data-units]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.units === (metric ? 'metric' : 'imperial'));
  });
}

$('#theme-toggle').addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(state.getState().theme) + 1) % order.length];
  state.setTheme(next);
  toast(`Theme: ${next}`);
  if (session.data) applySky(buildViewModel());
});

/* ------------------------------------------------------- saved locations */

/**
 * The single highest-leverage thing a visitor can do: keep the place.
 *
 * Someone who arrives from a search result and saves their city has stopped
 * needing a search engine tomorrow. City pages deliberately do *not* save
 * themselves on arrival -- a saved-locations bar that fills up with every city
 * you ever glanced at is noise, and noise is the thing this site is against.
 */
/**
 * Saved locations are identified by coordinates, not by id.
 *
 * `addLocation` dedupes that way, and the same city can arrive with different
 * ids depending on whether it came from the geocoder, a deep link or a city
 * page — so anything else would show an unsaved star over a saved city.
 */
function savedMatch(place) {
  if (!place) return null;
  const id = state.locationId(place);
  return state.getState().locations.find((l) => state.locationId(l) === id) || null;
}

function isSaved(place) {
  return Boolean(savedMatch(place));
}

function syncSaveButton() {
  const button = $('#save-place');
  if (!button) return;
  const saved = isSaved(session.place);
  button.setAttribute('aria-pressed', String(saved));
  button.classList.toggle('is-active', saved);
  button.title = saved ? 'Saved — click to remove (s)' : 'Save this location (s)';
  button.setAttribute('aria-label', button.title);
}

function toggleSaved() {
  if (!session.place) return;
  const saved = savedMatch(session.place);

  if (saved) {
    if (state.getState().locations.length === 1) {
      toast('Keep at least one saved location.');
      return;
    }
    state.removeLocation(saved.id);
    session.comparisons = session.comparisons.filter((c) => c.place.id !== saved.id);
    toast(`Removed ${session.place.name}`);
  } else {
    const added = state.addLocation(session.place);
    state.setActive(added.id);
    toast(`Saved ${session.place.name} — it will be here next time`);
    loadComparisons();
  }

  syncSaveButton();
  renderPlaces();
}

const saveButton = $('#save-place');
if (saveButton) saveButton.addEventListener('click', toggleSaved);

const shareButton = $('#share');
if (shareButton) {
  shareButton.addEventListener('click', async () => {
    if (!session.data) return;
    // Loaded on demand: the canvas renderer is dead weight for the majority of
    // visits that never press it.
    const { shareForecast } = await import('./share.js');
    shareForecast(buildViewModel(), { toast });
  });
}

$('#geolocate').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Geolocation is not available in this browser.'); return; }
  toast('Finding your location…');

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const info = await api.soft(api.reverseGeocode(latitude, longitude), {});
      pickPlace({
        name: info.name || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
        admin1: info.admin1,
        country: info.country,
        countryCode: info.countryCode,
        latitude,
        longitude,
      });
    },
    () => toast('Location permission denied.'),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
});

/* ---------------------------------------------------------- keyboard */

document.addEventListener('keydown', (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
  // The tab bar runs the standard roving-focus model itself; without this the
  // global shortcut fires too and each press skips two sections.
  if (event.target.closest('.tabs')) return;

  if (event.key === '/') { event.preventDefault(); searchInput.focus(); }
  if (event.key === 'r') { event.preventDefault(); if (session.place) loadPlace(session.place, { silent: true }); }
  if (event.key === 'u') {
    event.preventDefault();
    state.setUnitSystem(state.isMetric() ? 'imperial' : 'metric');
    syncUnitButtons();
    render();
  }
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    const index = VIEW_ORDER.indexOf(session.view);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    setView(VIEW_ORDER[(index + step + VIEW_ORDER.length) % VIEW_ORDER.length]);
    return;
  }
  if (/^[1-9]$/.test(event.key)) {
    const place = state.getState().locations[Number(event.key) - 1];
    if (place) { state.setActive(place.id); goToPlace(place); }
  }
  if (event.key === 's') { event.preventDefault(); toggleSaved(); }
});

/* ------------------------------------------------------- sticky offsets */

/**
 * Publish the topbar's height so the tab bar can stick directly beneath it.
 * It changes with the saved-location row and wraps on narrow screens, so a
 * hardcoded offset would leave the tabs sliding under the header.
 */
function syncTopbarOffset() {
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  const height = Math.round(topbar.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--topbar-h', `${height}px`);
}

let offsetFrame = null;
function scheduleOffsetSync() {
  cancelAnimationFrame(offsetFrame);
  offsetFrame = requestAnimationFrame(syncTopbarOffset);
}

window.addEventListener('resize', scheduleOffsetSync);
if ('ResizeObserver' in window) {
  new ResizeObserver(scheduleOffsetSync).observe(document.querySelector('.topbar'));
}

/* ------------------------------------------------------------- toast */

let toastTimer = null;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 3200);
}

/* ------------------------------------------------------------- startup */

function viewFromUrl() {
  const requested = new URLSearchParams(window.location.search).get('view');
  return VIEWS[requested] ? requested : DEFAULT_VIEW;
}

/**
 * Offline support and installability.
 *
 * Registered after first paint so it never competes with the forecast for
 * bandwidth, and skipped entirely on a city page render that has no JS budget
 * to spare -- it will register on the next navigation.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* An unavailable service worker costs nothing; the app works without it. */
    });
  });
}

function start() {
  syncUnitButtons();
  renderPlaces();
  syncTopbarOffset();

  // Restore the section from the URL before the first paint, so a shared
  // link opens on the section it was shared from.
  const initialView = viewFromUrl();
  if (initialView !== DEFAULT_VIEW) {
    session.view = DEFAULT_VIEW;
    setView(initialView);
  }

  if (page.page === 'city') {
    // The page already shows this city, rendered on the server. Adopt its unit
    // system for first-time visitors, then refresh quietly in the background
    // so nothing on screen is replaced by a skeleton.
    if (state.adoptUnits(page.units)) syncUnitButtons();
    session.place = state.normalizePlace(page.place);
    syncSaveButton();
    loadPlace(session.place, { silent: true });
  } else if (page.page === 'app') {
    const deepLink = placeFromUrl();
    const place = deepLink ? state.addLocation(deepLink) : state.getActiveLocation();
    if (place) loadPlace(place);
  } else {
    // The directory, the widget builder, a 404: server-rendered content that
    // is not a forecast. The header still works -- search, units, theme -- but
    // nothing here may paint over the page.
    for (const id of ['#save-place', '#share', '#refresh']) {
      const button = $(id);
      if (button) button.hidden = true;
    }

    if (page.page === 'widgets') {
      import('./widgets.js')
        .then((m) => m.setupWidgetBuilder({ origin: page.origin, toast }))
        .catch(() => {});
    }
  }

  // Keep the dashboard live without hammering the API.
  setInterval(() => {
    if (session.place && document.visibilityState === 'visible') {
      loadPlace(session.place, { silent: true });
    }
  }, REFRESH_MS);

  // The hero shows a live local clock; nudge it every minute so it stays honest.
  setInterval(() => {
    if (session.data) setHTML('#hero', renderHero(buildViewModel()));
  }, 60000);

  registerServiceWorker();
  import('./install.js').then((m) => m.setupInstallPrompt({ toast })).catch(() => {});
}

start();
