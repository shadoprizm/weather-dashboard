'use strict';
const handlers = require('./handlers');
const views = require('./render/views');

async function plan(query = {}) {
  const { planning, viewmodel } = await views.load();
  const preferences = planning.normalizePlanPreferences(query);
  for (const key of ['activity', 'duration', 'timeOfDay']) {
    if (query[key] !== undefined && String(query[key]) !== String(preferences[key])) {
      return { status: 400, body: { error: `Invalid ${key}` }, maxAge: 0 };
    }
  }
  const response = await handlers.forecast(query);
  if (response.status !== 200) return response;
  const data = response.body;
  const vm = viewmodel.buildViewModel({ data, place: data.location, units: {} });
  return { status: 200, body: planning.planActivity(vm, preferences), maxAge: 0 };
}

module.exports = { plan };
