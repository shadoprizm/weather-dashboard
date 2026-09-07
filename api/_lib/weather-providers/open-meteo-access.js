'use strict';

const { buildUrl } = require('../upstream');

const SERVICES = Object.freeze({
  forecast: 'https://api.open-meteo.com/v1/forecast',
  air: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  archive: 'https://archive-api.open-meteo.com/v1/archive',
  geocode: 'https://geocoding-api.open-meteo.com/v1/search',
});

function commercialMode(env = process.env) {
  return /^(1|true|yes)$/i.test(String(env.COMMERCIAL_MODE || ''));
}

function apiKey(env = process.env) {
  return String(env.OPEN_METEO_API_KEY || '').trim();
}

function canUse(env = process.env) {
  return !commercialMode(env) || Boolean(apiKey(env));
}

function endpoint(service, env = process.env) {
  if (!SERVICES[service]) throw new Error(`Unknown Open-Meteo service: ${service}`);
  const url = new URL(SERVICES[service]);
  if (apiKey(env)) url.hostname = `customer-${url.hostname}`;
  return url.toString();
}

function serviceUrl(service, params, env = process.env) {
  if (!canUse(env)) {
    throw new Error(
      `OPEN_METEO_API_KEY is required for the ${service} service when COMMERCIAL_MODE is enabled`
    );
  }
  return buildUrl(endpoint(service, env), { ...params, apikey: apiKey(env) || null });
}

function redactedUrl(value) {
  const url = new URL(value);
  if (url.searchParams.has('apikey')) url.searchParams.set('apikey', '[redacted]');
  return url.toString();
}

function status(env = process.env) {
  return {
    commercialMode: commercialMode(env),
    licensedCustomerEndpoint: Boolean(apiKey(env)),
    usable: canUse(env),
  };
}

module.exports = { SERVICES, commercialMode, apiKey, canUse, endpoint, serviceUrl, redactedUrl, status };
