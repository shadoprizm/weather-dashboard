/** Offline checks for story selection, Luna request bounds and publishing. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const stories = require('../api/_lib/stories');
const generation = require('../api/_lib/story-generation');
const { renderStoriesIndex, renderStoryPage } = require('../api/_lib/render/stories-page');
const { renderSitemap } = require('../api/_lib/render/sitemap');

const torontoForecast = {
  city: {
    slug: 'toronto', name: 'Toronto', label: 'Toronto, Ontario', region: 'Ontario',
    country: 'Canada', countryCode: 'CA', latitude: 43.6532, longitude: -79.3832,
  },
  timezone: 'America/Toronto',
  fetchedAt: '2026-08-22T12:00:00.000Z',
  sourceUrl: 'https://api.open-meteo.com/v1/forecast?test=1',
  days: [
    { date: '2026-08-23', weatherCode: 3, highC: 25, lowC: 17, precipMm: 2, rainMm: 2, snowCm: 0, precipChancePct: 30, maxWindKmh: 20, maxGustKmh: 35 },
    { date: '2026-08-24', weatherCode: 95, highC: 23, lowC: 16, precipMm: 40, rainMm: 40, snowCm: 0, precipChancePct: 90, maxWindKmh: 38, maxGustKmh: 62 },
    { date: '2026-08-25', weatherCode: 2, highC: 24, lowC: 15, precipMm: 0, rainMm: 0, snowCm: 0, precipChancePct: 15, maxWindKmh: 18, maxGustKmh: 30 },
  ],
};

const denverForecast = {
  ...torontoForecast,
  city: {
    slug: 'denver', name: 'Denver', label: 'Denver, Colorado', region: 'Colorado',
    country: 'United States', countryCode: 'US', latitude: 39.7392, longitude: -104.9903,
  },
  timezone: 'America/Denver',
  days: torontoForecast.days.map((day, index) => ({
    ...day,
    date: `2026-08-${23 + index}`,
    weatherCode: 2,
    precipMm: 0,
    rainMm: 0,
    precipChancePct: 10,
    maxGustKmh: index === 1 ? 80 : 35,
  })),
};

const ranked = generation.rankStoryCandidates([denverForecast, torontoForecast]);
assert.equal(ranked[0].eventType, 'heavy_rain', 'the strongest measured event wins');
assert.equal(ranked[0].city.slug, 'toronto');
assert.equal(generation.slugForCandidate(ranked[0]), '2026-08-24-toronto-heavy-rain');

let capturedRequest;
const generated = await generation.generateCopy(ranked[0], {
  gatewayKey: 'test-gateway-token-not-real',
  openAIKey: null,
  oidcToken: null,
  fetchImpl: async (url, options) => {
    capturedRequest = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'resp_test',
        status: 'completed',
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              headline: 'Heavy rain enters the Toronto forecast <script>alert(1)</script>',
              dek: 'A concentrated period of rain is the main change in Toronto’s seven-day outlook.',
              summary: 'Toronto’s forecast now shows a notably wet day, with the strongest signal centred on August 24.',
              whyItMatters: ['The forecast total is high enough to affect outdoor plans, especially if much of it falls over a short period.'],
              whatToWatch: ['Check later forecasts for changes in the expected total, timing and maximum precipitation probability.'],
              seoTitle: 'Toronto heavy rain forecast for August 24',
              seoDescription: 'Toronto’s August 24 forecast shows notable rain. See the expected totals, timing context and the source data behind the briefing.',
            }),
          }],
        }],
        usage: { input_tokens: 2500, output_tokens: 900, total_tokens: 3400 },
      }),
    };
  },
});

assert.equal(capturedRequest.url, 'https://ai-gateway.vercel.sh/v1/responses');
assert.equal(capturedRequest.body.model, 'openai/gpt-5.6-luna');
assert.equal(capturedRequest.body.store, false);
assert.equal(capturedRequest.body.reasoning.effort, 'low');
assert.equal(capturedRequest.body.max_output_tokens, 1600);
assert.equal(capturedRequest.body.text.format.type, 'json_schema');
assert.equal(capturedRequest.body.text.format.strict, true);
assert.equal(generated.backend, 'vercel-ai-gateway');
assert.equal(generation.estimateLunaCost(generated.usage), 0.00158);
assert.equal(generation.estimateLunaCost(generated.usage, 'openai/gpt-5.6-luna'), 0.00158);

assert.deepEqual(
  generation.generationTarget({ gatewayKey: null, openAIKey: 'direct-test', oidcToken: 'oidc-test' }),
  {
    backend: 'openai',
    token: 'direct-test',
    url: 'https://api.openai.com/v1/responses',
    model: 'gpt-5.6-luna',
  },
  'a direct key takes precedence over automatic Vercel OIDC'
);

const draft = generation.composeDraft(ranked[0], generated, { generatedAt: '2026-08-22T13:00:00.000Z' });
assert.equal(draft.status, 'draft');
assert.equal(draft.publishedAt, null);
assert.equal(draft.expiresAt, '2026-08-26T23:59:59.999Z');
assert.equal(draft.generation.estimatedCostUsd, 0.00158);

const published = {
  ...draft,
  status: 'published',
  publishedAt: '2026-08-22T14:30:00.000Z',
};
stories.assertStory(published);
assert.equal(stories.isActive(published, new Date('2026-08-25T00:00:00.000Z')), true);
assert.equal(stories.isActive(published, new Date('2026-08-27T00:00:00.000Z')), false);

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'weatherview-stories-'));
try {
  fs.writeFileSync(path.join(directory, `${draft.slug}.json`), JSON.stringify(draft));
  const secondPublished = { ...published, slug: `${published.slug}-reviewed` };
  fs.writeFileSync(path.join(directory, `${secondPublished.slug}.json`), JSON.stringify(secondPublished));

  assert.equal(stories.publishedStories({ directory, activeOnly: false }).length, 1, 'drafts never enter public queries');
  assert.equal(stories.publishedStories({ directory, now: new Date('2026-08-27T00:00:00.000Z') }).length, 0,
    'expired stories leave current indexes');
  assert.equal(stories.bySlug(draft.slug, { directory }), null, 'a draft slug looks unpublished');
  assert.equal(stories.bySlug(secondPublished.slug, { directory }).status, 'published');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

const articleHtml = renderStoryPage(published, { now: new Date('2026-08-25T00:00:00.000Z') });
assert.match(articleHtml, /<link rel="canonical" href="https:\/\/www\.weatherview\.cloud\/weather-stories\/2026-08-24-toronto-heavy-rain">/);
assert.match(articleHtml, /Forecast evidence/);
assert.match(articleHtml, /40 mm/);
assert.match(articleHtml, /AI-assisted draft/);
assert.match(articleHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'generated copy is escaped');
assert.ok(!articleHtml.includes('<script>alert(1)</script>'));
assert.match(articleHtml, /"@type":"Article"/);

const archivedHtml = renderStoryPage(published, { now: new Date('2026-08-27T00:00:00.000Z') });
assert.match(archivedHtml, /<meta name="robots" content="noindex, follow">/);
assert.match(archivedHtml, /Archived forecast/);

const indexHtml = renderStoriesIndex([published]);
assert.match(indexHtml, /The weather changes worth knowing about/);
assert.match(indexHtml, new RegExp(`href="${stories.storyPath(published)}"`));
assert.match(renderStoriesIndex([]), /<meta name="robots" content="noindex, follow">/);

const originalBySlug = stories.bySlug;
const originalPublishedStories = stories.publishedStories;
try {
  stories.bySlug = (slug) => slug === published.slug ? published : null;
  stories.publishedStories = () => [published];
  const pages = require('../api/_lib/pages');
  const storyResponse = await pages.weatherStoryPage({ slug: published.slug });
  assert.equal(storyResponse.status, 200);
  assert.match(storyResponse.body, /Forecast evidence/);
  assert.equal((await pages.weatherStoryPage({ slug: 'unreviewed-draft' })).status, 404,
    'unpublished slugs return an honest 404');
  assert.match((await pages.storiesIndex()).body, /Current weather stories/);
} finally {
  stories.bySlug = originalBySlug;
  stories.publishedStories = originalPublishedStories;
}

const sitemap = renderSitemap({ now: new Date('2026-08-25T00:00:00.000Z'), storyList: [published] });
assert.match(sitemap, /<loc>https:\/\/www\.weatherview\.cloud\/weather-stories<\/loc>/);
assert.match(sitemap, new RegExp(`<loc>https://www\\.weatherview\\.cloud${stories.storyPath(published)}</loc>`));

console.log('All weather-story checks passed.');
