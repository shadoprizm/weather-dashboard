#!/usr/bin/env node

/**
 * Generate one reviewable weather-story draft.
 *
 * This is intentionally a manual command in the first release. Once its
 * quality and provider terms have been validated, the same command can run on
 * a schedule and open a pull request without changing the publishing model.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cities = require('../api/_lib/cities');
const stories = require('../api/_lib/stories');
const generation = require('../api/_lib/story-generation');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CITY_SLUGS = [
  'toronto', 'montreal', 'vancouver', 'calgary', 'edmonton', 'ottawa', 'winnipeg', 'halifax',
  'new-york', 'los-angeles', 'chicago', 'houston', 'phoenix', 'miami', 'seattle', 'denver',
  'boston', 'atlanta', 'minneapolis', 'anchorage', 'london', 'paris', 'berlin', 'madrid',
  'rome', 'sydney', 'tokyo', 'mumbai', 'delhi', 'mexico-city',
];

function argumentsOf(argv) {
  const options = { dryRun: false, citySlugs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--city') options.citySlugs.push(argv[++index]);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function usage() {
  return [
    'Usage: node scripts/generate-story.mjs [--dry-run] [--city slug]',
    '',
    '  --dry-run    Select and print an event without calling Luna or writing a file.',
    '  --city slug  Limit the scan to a city. Repeat to include more than one.',
    '',
    'Environment: OPENAI_API_KEY, or VERCEL_OIDC_TOKEN/AI_GATEWAY_API_KEY; STORY_MODEL; STORY_CITIES.',
  ].join('\n');
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function selectedCities(options) {
  const fromEnvironment = String(process.env.STORY_CITIES || '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
  const slugs = options.citySlugs.length
    ? options.citySlugs
    : (fromEnvironment.length ? fromEnvironment : DEFAULT_CITY_SLUGS);
  const unique = [...new Set(slugs)];
  const unknown = unique.filter((slug) => !cities.bySlug(slug));
  if (unknown.length) throw new Error(`Unknown city slug${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
  return unique.map((slug) => cities.bySlug(slug));
}

function printableCandidate(candidate) {
  return {
    slug: generation.slugForCandidate(candidate),
    score: candidate.score,
    event: candidate.eventLabel,
    eventDate: candidate.eventDate,
    location: candidate.city.label,
    selectedMetric: `${candidate.value} ${candidate.unit}`,
    threshold: `${candidate.threshold} ${candidate.unit}`,
    forecastFetchedAt: candidate.fetchedAt,
  };
}

async function main() {
  const options = argumentsOf(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const places = selectedCities(options);
  const failed = [];
  const forecasts = (await mapLimit(places, 4, async (city) => {
    try {
      return await generation.fetchStoryForecast(city);
    } catch (error) {
      failed.push(`${city.slug}: ${error.message}`);
      return null;
    }
  })).filter(Boolean);

  if (!forecasts.length) throw new Error(`Every forecast request failed. ${failed.join('; ')}`);
  if (failed.length) console.warn(`[stories] ${failed.length} forecast request(s) failed: ${failed.join('; ')}`);

  const candidates = generation.rankStoryCandidates(forecasts);
  const candidate = candidates.find((item) =>
    !fs.existsSync(path.join(stories.STORIES_DIR, `${generation.slugForCandidate(item)}.json`))
  );
  if (!candidate) {
    console.log('No new material event met the editorial thresholds. No draft created.');
    return;
  }

  if (options.dryRun) {
    console.log(JSON.stringify(printableCandidate(candidate), null, 2));
    console.log('Dry run: Luna was not called and no file was written.');
    return;
  }

  const generated = await generation.generateCopy(candidate);
  const draft = generation.composeDraft(candidate, generated);
  fs.mkdirSync(stories.STORIES_DIR, { recursive: true });
  const destination = path.join(stories.STORIES_DIR, `${draft.slug}.json`);
  if (fs.existsSync(destination)) throw new Error(`Draft already exists: ${destination}`);
  fs.writeFileSync(destination, `${JSON.stringify(draft, null, 2)}\n`, { flag: 'wx' });

  console.log(`Draft created: ${path.relative(ROOT, destination)}`);
  const usage = draft.generation.usage;
  if (usage) {
    console.log(`Tokens: ${usage.input_tokens || 0} input, ${usage.output_tokens || 0} output`);
  }
  if (draft.generation.estimatedCostUsd !== null) {
    console.log(`Estimated Luna cost: $${draft.generation.estimatedCostUsd.toFixed(6)} USD`);
  }
  console.log('Review the copy against evidence.days, then set status and publishedAt before merging.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
