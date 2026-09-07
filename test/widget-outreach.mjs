import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const outreach = require('../api/_lib/widget-outreach');

const ledger = {
  version: 1,
  campaign: 'test',
  targets: [
    { id: 'a', organization: 'A Campground', website: 'https://a.example', citySlug: 'ottawa', status: 'qualified' },
    { id: 'b', organization: 'B Marina', website: 'https://b.example', embedPageUrl: 'https://b.example/weather', citySlug: 'toronto', status: 'installed', contactedAt: '2026-09-01', contactBasis: 'Public role address; relevant to marina operations.' },
    { id: 'c', organization: 'C Club', website: 'https://c.example', citySlug: 'halifax', status: 'declined', contactedAt: '2026-09-01', contactBasis: 'Express invitation.' },
  ],
};

assert.deepEqual(outreach.summarizeLedger(ledger), {
  campaign: 'test', targets: 3, qualified: 3, contacted: 2, responded: 2,
  installed: 1, declined: 1, doNotContact: 0, responseRatePct: 100, installRatePct: 50,
});
assert.equal(outreach.containsWeatherViewEmbed('<iframe src="https://www.weatherview.cloud/widget?city=toronto">'), true);
assert.equal(outreach.containsWeatherViewEmbed('<script src="https://weatherview.cloud/embed.js">'), true);
assert.equal(outreach.containsWeatherViewEmbed('<p>WeatherView is nice</p>'), false);
assert.throws(() => outreach.assertLedger({ ...ledger, targets: [{ ...ledger.targets[1], contactBasis: '' }] }), /contactBasis/);

const checks = await outreach.verifyInstallPages(ledger, {
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    text: async () => '<iframe src="https://www.weatherview.cloud/widget?city=toronto"></iframe>',
  }),
});
assert.equal(checks.length, 1);
assert.equal(checks[0].embedFound, true);

console.log('All privacy-safe widget outreach checks passed.');
