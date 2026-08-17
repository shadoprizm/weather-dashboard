/**
 * SkyWatch — application shell.
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
import { hourlySeries, dailySeries, upcoming } from './insights.js';
import { createRadarMap } from './radar.js';
import {
  renderHero, renderBriefing, renderHourly, renderDetails, renderDaily, errorPanel,
} from './views/forecast.js';
import {
  renderAlerts, renderActivities, renderAstro, renderAir, renderAlmanac, renderCompare,
} from './views/panels.js';

const REFRESH_MS = 10 * 60 * 1000;
const MAX_COMPARISONS = 8;

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
};

/* ------------------------------------------------------------ view model */

/** Locate "now" in the hourly array, falling back to the nearest hour. */
function resolveNowIndex(data, series) {
  if (data.index && data.index.hourly >= 0) return data.index.hourly;
  const now = Date.now();
  let best = 0;
  let bestDelta = Infinity;
  series.forEach((hour, i) => {
    if (!hour.date) return;
    const delta = Math.abs(hour.date.getTime() - now);
    if (delta < bestDelta) { bestDelta = delta; best = i; }
  });
  return best;
}

function buildViewModel() {
  const { data, place } = session;
  const series = hourlySeries(data);
  const days = dailySeries(data);
  const nowIndex = resolveNowIndex(data, series);
  const currentDay = data.current ? data.current.time.slice(0, 10) : null;
  const todayIndex = data.index && data.index.daily >= 0
    ? data.index.daily
    : Math.max(0, days.findIndex((d) => d.time === currentDay));

  return {
    place,
    units: state.getUnits(),
    utcOffsetSeconds: data.location ? data.location.utcOffsetSeconds : 0,
    current: data.current,
    air: data.air,
    series,
    days,
    nowIndex,
    todayIndex: todayIndex >= 0 ? todayIndex : 0,
    next48: upcoming(series, nowIndex, 48),
    selectedDay: session.selectedDay,
    dayHours: session.selectedDay
      ? series.filter((h) => h.time.startsWith(session.selectedDay))
      : [],
    alerts: session.alerts,
    almanac: session.almanac,
    space: session.space,
    comparisons: session.comparisons,
    updatedAt: data.fetchedAt,
  };
}

/* ---------------------------------------------------------------- render */

function render() {
  if (!session.data) return;
  const vm = buildViewModel();

  setHTML('#hero', renderHero(vm));
  setHTML('#briefing', renderBriefing(vm));
  setHTML('#hourly', renderHourly(vm));
  setHTML('#details', renderDetails(vm));
  setHTML('#daily', renderDaily(vm));
  setHTML('#alerts', renderAlerts(vm));
  setHTML('#activities', renderActivities(vm));
  setHTML('#astro', renderAstro(vm));
  setHTML('#air', renderAir(vm));
  setHTML('#almanac', renderAlmanac(vm));
  setHTML('#compare', renderCompare(vm));

  applySky(vm);
  renderPlaces();
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
    syncUrl(place);
    mountRadar(place);
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
    const vm = buildViewModel();
    setHTML('#almanac', renderAlmanac(vm));
    setHTML('#hero', renderHero(vm));
  });

  if (!session.space) {
    api.soft(api.fetchSpaceWeather()).then((space) => {
      if (!space) return;
      session.space = space;
      if (session.data) setHTML('#astro', renderAstro(buildViewModel()));
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
    setHTML('#compare', renderCompare(buildViewModel()));
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
  const url = new URL(window.location.href);
  url.searchParams.set('lat', place.latitude.toFixed(4));
  url.searchParams.set('lon', place.longitude.toFixed(4));
  url.searchParams.set('name', place.name);
  window.history.replaceState(null, '', url);
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

function renderSearchResults(places) {
  searchItems = places;
  if (!places.length) {
    searchResults.innerHTML = '<li class="search-empty">No matching places</li>';
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
  loadPlace(added);
}

searchInput.addEventListener('input', () => {
  const term = searchInput.value.trim();
  clearTimeout(searchTimer);
  if (term.length < 2) { closeSearch(); return; }

  searchTimer = setTimeout(async () => {
    const response = await api.soft(api.searchPlaces(term), { results: [] });
    // A slower earlier request must not overwrite a newer one.
    if (searchInput.value.trim() !== term) return;
    renderSearchResults(response.results || []);
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
    if (place) { state.setActive(place.id); loadPlace(place); }
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
    const vm = buildViewModel();
    setHTML('#hourly', renderHourly(vm));
    setHTML('#daily', renderDaily(vm));
    $('#hourly').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (action === 'clear-day') {
    session.selectedDay = null;
    const vm = buildViewModel();
    setHTML('#hourly', renderHourly(vm));
    setHTML('#daily', renderDaily(vm));
  }
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

  if (event.key === '/') { event.preventDefault(); searchInput.focus(); }
  if (event.key === 'r') { event.preventDefault(); if (session.place) loadPlace(session.place, { silent: true }); }
  if (event.key === 'u') {
    event.preventDefault();
    state.setUnitSystem(state.isMetric() ? 'imperial' : 'metric');
    syncUnitButtons();
    render();
  }
  if (/^[1-9]$/.test(event.key)) {
    const place = state.getState().locations[Number(event.key) - 1];
    if (place) { state.setActive(place.id); loadPlace(place); }
  }
});

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

function start() {
  syncUnitButtons();
  renderPlaces();

  const deepLink = placeFromUrl();
  const place = deepLink ? state.addLocation(deepLink) : state.getActiveLocation();
  if (place) loadPlace(place);

  // Keep the dashboard live without hammering the API.
  setInterval(() => {
    if (session.place && document.visibilityState === 'visible') {
      loadPlace(session.place, { silent: true });
    }
  }, REFRESH_MS);

  // The hero shows a local clock; nudge it every minute so it stays honest.
  setInterval(() => {
    if (session.data) setHTML('#hero', renderHero(buildViewModel()));
  }, 60000);
}

start();
