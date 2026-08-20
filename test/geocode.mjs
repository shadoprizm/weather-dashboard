/** Offline tests for tolerant location-search query planning and ranking. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { geocodePlan, rankGeocodeResults } = require('../api/_lib/handlers.js')._internals;

const summerside = geocodePlan('Summerside PEI');
assert.deepEqual(summerside.queries, [
  'Summerside, Prince Edward Island',
  'Summerside PEI',
  'Summerside',
]);
assert.equal(summerside.city, 'Summerside');
assert.equal(summerside.region.name, 'Prince Edward Island');

assert.equal(geocodePlan('St. John\'s, NL').queries[0], "St. John's, Newfoundland and Labrador");
assert.equal(geocodePlan('Québec City QC').city, 'Québec City');
assert.deepEqual(geocodePlan('Toronto').queries, ['Toronto']);
assert.deepEqual(geocodePlan('Portland ME').queries, ['Portland ME', 'Portland']);

const ranked = rankGeocodeResults([
  { name: 'Summerside', countryCode: 'US', admin1: 'Ohio' },
  { name: 'Summerside', countryCode: 'CA', admin1: 'Nova Scotia' },
  { name: 'Summerside', countryCode: 'CA', admin1: 'Prince Edward Island' },
], summerside);
assert.equal(ranked[0].admin1, 'Prince Edward Island');
assert.equal(ranked[1].admin1, 'Nova Scotia');

console.log('All geocode tests passed.');
