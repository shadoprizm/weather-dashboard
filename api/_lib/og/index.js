'use strict';

/**
 * `/api/og` — the share card for a place, as a PNG.
 *
 * This is what Facebook, X, Threads, Reddit, iMessage, WhatsApp and Slack
 * fetch when someone pastes a link. Every city page points at it, so a shared
 * URL previews as the actual forecast rather than as a favicon and a domain.
 *
 * Cached hard at the edge: the picture only needs to be as fresh as the
 * forecast behind it, and social crawlers can hit one URL in bursts.
 */

const handlers = require('../handlers');
const cities = require('../cities');
const { load } = require('../render/views');
const { renderCard } = require('./card');
const { UpstreamError } = require('../upstream');

const METRIC = { temp: 'c', wind: 'kmh', precip: 'mm', pressure: 'hpa', distance: 'km', clock: '12' };
const IMPERIAL = { temp: 'f', wind: 'mph', precip: 'in', pressure: 'inhg', distance: 'mi', clock: '12' };

/** Resolve the query into a place: a catalogue slug, or a raw coordinate. */
function resolvePlace(query) {
  if (query.city) {
    const city = cities.bySlug(query.city);
    if (!city) throw new UpstreamError('Unknown city', 404);
    return {
      name: city.name,
      region: city.region || city.country,
      latitude: city.latitude,
      longitude: city.longitude,
      units: city.countryCode === 'US' ? IMPERIAL : METRIC,
    };
  }

  const lat = Number.parseFloat(query.lat);
  const lon = Number.parseFloat(query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new UpstreamError('city, or lat and lon, are required', 400);
  }

  const near = cities.nearest(lat, lon, { withinKm: 25 });
  return {
    name: String(query.name || (near && near.city.name) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`).slice(0, 40),
    region: near ? near.city.region || near.city.country : null,
    latitude: lat,
    longitude: lon,
    units: query.units === 'imperial' ? IMPERIAL : METRIC,
  };
}

async function ogCard(query = {}) {
  const place = resolvePlace(query);
  const mods = await load();
  const { viewmodel, insights, format: fmt, wmo, tables } = mods;

  const { body: data } = await handlers.forecast({
    lat: String(place.latitude),
    lon: String(place.longitude),
  });

  const vm = viewmodel.buildViewModel({
    data,
    place: { name: place.name, admin1: place.region, latitude: place.latitude, longitude: place.longitude },
    units: place.units,
  });

  const today = vm.days[vm.todayIndex];
  const condition = vm.current
    ? wmo.describe(vm.current.weather_code, vm.current.is_day)
    : { label: 'Unavailable', icon: 'clear-day' };

  const png = renderCard({
    place: place.name,
    region: place.region,
    temperature: vm.current ? fmt.temp(vm.current.temperature_2m, vm.units) : '--',
    condition: condition.label,
    range: today
      ? `${fmt.temp(today.high, vm.units)} / ${fmt.temp(today.low, vm.units)} · ${fmt.percent(today.popMax)} chance`
      : '',
    theme: vm.current ? wmo.skyTheme(vm.current.weather_code, vm.current.is_day) : 'clear-day',
    headline: headline(vm, { insights, fmt, tables }),
    hours: vm.next48.slice(0, 12).map((hour) => ({
      pop: hour.pop,
      label: fmt.hourLabel(hour.time, vm.units).replace(':00', ''),
    })),
  });

  return {
    status: 200,
    body: png,
    contentType: 'image/png',
    maxAge: 600,
  };
}

/** The same sentence the in-app share button uses, derived server-side. */
function headline(vm, { insights, fmt }) {
  if (!vm.current) return `${vm.place.name} forecast`;
  const timing = insights.precipTiming(vm.series, vm.nowIndex, 24);
  const place = vm.place.name;

  if (timing && timing.state === 'active') {
    return timing.openEnded
      ? `Rain in ${place}, and it is not letting up today`
      : `Rain in ${place} until about ${fmt.hourLabel(timing.endsAt, vm.units)}`;
  }
  if (timing && timing.state === 'incoming') {
    const kind = timing.type === 'snow' ? 'Snow' : 'Rain';
    return `${kind} arriving in ${place} around ${fmt.hourLabel(timing.startsAt, vm.units)}`;
  }

  const today = vm.days[vm.todayIndex];
  return today
    ? `Dry in ${place} today — ${fmt.temp(today.high, vm.units)} and down to ${fmt.temp(today.low, vm.units)}`
    : `${place} forecast`;
}

module.exports = { ogCard, resolvePlace };
