/**
 * The view model: raw API payloads in, the shape every view reads out.
 *
 * This lives on its own — rather than inside the app shell — because the
 * server renders the same views for the city pages. Keeping it pure (no DOM,
 * no globals, no clock beyond `Date.now()`) is what lets the identical code
 * run in Node and in the browser and produce byte-identical markup.
 */

import { hourlySeries, dailySeries, upcoming } from './insights.js';

/** Locate "now" in the hourly array, falling back to the nearest hour. */
export function resolveNowIndex(data, series) {
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

export function buildViewModel({
  data,
  place,
  units,
  alerts = null,
  almanac = null,
  space = null,
  comparisons = [],
  selectedDay = null,
}) {
  const series = hourlySeries(data);
  const days = dailySeries(data);
  const nowIndex = resolveNowIndex(data, series);
  const currentDay = data.current ? data.current.time.slice(0, 10) : null;
  const todayIndex = data.index && data.index.daily >= 0
    ? data.index.daily
    : Math.max(0, days.findIndex((d) => d.time === currentDay));

  return {
    place,
    units,
    utcOffsetSeconds: data.location ? data.location.utcOffsetSeconds : 0,
    current: data.current,
    air: data.air,
    series,
    days,
    nowIndex,
    todayIndex: todayIndex >= 0 ? todayIndex : 0,
    next48: upcoming(series, nowIndex, 48),
    selectedDay,
    dayHours: selectedDay ? series.filter((h) => h.time.startsWith(selectedDay)) : [],
    alerts,
    almanac,
    space,
    comparisons,
    updatedAt: data.fetchedAt,
  };
}
