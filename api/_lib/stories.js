'use strict';

/**
 * Version-controlled weather stories.
 *
 * The generator writes JSON drafts into `content/stories`. A story does not
 * become public until a person reviews it, sets `status` to `published`, and
 * supplies `publishedAt`. Expired forecast stories remain addressable as an
 * archive, but drop out of indexes and the sitemap so stale pages do not keep
 * presenting themselves as current weather.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const STORIES_DIR = path.join(ROOT, 'content', 'stories');
const STATUSES = new Set(['draft', 'published', 'archived']);

function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNumberOrNull(value) {
  return value === null || Number.isFinite(value);
}

function assertStory(story, { filename = '' } = {}) {
  const where = filename ? ` in ${filename}` : '';
  if (!story || typeof story !== 'object' || Array.isArray(story)) {
    throw new Error(`Story${where} must be an object`);
  }
  if (story.schemaVersion !== 1) throw new Error(`Story${where} has an unsupported schemaVersion`);
  if (!STATUSES.has(story.status)) throw new Error(`Story${where} has an invalid status`);
  if (!/^[a-z0-9-]+$/.test(story.slug || '')) throw new Error(`Story${where} has an invalid slug`);
  if (filename && path.basename(filename, '.json') !== story.slug) {
    throw new Error(`Story slug does not match filename ${filename}`);
  }

  for (const field of ['headline', 'dek', 'summary', 'seoTitle', 'seoDescription', 'generatedAt', 'expiresAt']) {
    if (!isText(story[field])) throw new Error(`Story${where} is missing ${field}`);
  }
  if (!isTimestamp(story.generatedAt) || !isTimestamp(story.expiresAt)) {
    throw new Error(`Story${where} has an invalid lifecycle timestamp`);
  }
  if (story.publishedAt !== null && !isTimestamp(story.publishedAt)) {
    throw new Error(`Story${where} has an invalid publishedAt`);
  }
  if (story.status === 'published' && !isTimestamp(story.publishedAt)) {
    throw new Error(`Published story${where} needs publishedAt`);
  }

  if (!Array.isArray(story.sections) || story.sections.length !== 2) {
    throw new Error(`Story${where} needs exactly two sections`);
  }
  for (const section of story.sections) {
    if (!isText(section.heading) || !Array.isArray(section.paragraphs) || !section.paragraphs.length) {
      throw new Error(`Story${where} has an invalid section`);
    }
    if (!section.paragraphs.every(isText)) throw new Error(`Story${where} has an empty paragraph`);
  }

  const evidence = story.evidence;
  if (!evidence || !evidence.location || !isText(evidence.eventType) || !isText(evidence.eventDate)) {
    throw new Error(`Story${where} is missing evidence metadata`);
  }
  const selectedMetric = evidence.selectedMetric;
  if (!selectedMetric || !isText(selectedMetric.label) || !isText(selectedMetric.unit) ||
      !Number.isFinite(selectedMetric.value) || !Number.isFinite(selectedMetric.threshold)) {
    throw new Error(`Story${where} has an invalid selected metric`);
  }
  if (!isText(evidence.location.name) || !isText(evidence.location.label) ||
      !/^[a-z0-9-]+$/.test(evidence.location.slug || '')) {
    throw new Error(`Story${where} has an invalid evidence location`);
  }
  if (!Array.isArray(evidence.days) || !evidence.days.length) {
    throw new Error(`Story${where} needs forecast evidence`);
  }
  for (const day of evidence.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date || '')) throw new Error(`Story${where} has an invalid evidence date`);
    for (const field of ['weatherCode', 'highC', 'lowC', 'precipMm', 'rainMm', 'snowCm', 'precipChancePct', 'maxWindKmh', 'maxGustKmh']) {
      if (!isNumberOrNull(day[field])) throw new Error(`Story${where} has invalid evidence field ${field}`);
    }
  }

  if (!story.source || !isText(story.source.provider) || !isText(story.source.url) ||
      !isTimestamp(story.source.fetchedAt)) {
    throw new Error(`Story${where} has invalid source metadata`);
  }
  return story;
}

function readStories({ directory = STORIES_DIR, warn = console.warn } = {}) {
  if (!fs.existsSync(directory)) return [];

  const stories = [];
  for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
    try {
      const story = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
      stories.push(assertStory(story, { filename }));
    } catch (error) {
      warn(`[stories] Skipping ${filename}: ${error.message}`);
    }
  }

  return stories.sort((a, b) => {
    const aTime = Date.parse(a.publishedAt || a.generatedAt);
    const bTime = Date.parse(b.publishedAt || b.generatedAt);
    return bTime - aTime || a.slug.localeCompare(b.slug);
  });
}

function isActive(story, now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return story.status === 'published' && Date.parse(story.expiresAt) >= timestamp;
}

function publishedStories({ activeOnly = true, now = new Date(), directory = STORIES_DIR } = {}) {
  return readStories({ directory }).filter((story) =>
    story.status === 'published' && (!activeOnly || isActive(story, now))
  );
}

function bySlug(slug, { directory = STORIES_DIR } = {}) {
  const normalized = String(slug || '').toLowerCase();
  if (!/^[a-z0-9-]+$/.test(normalized)) return null;
  return publishedStories({ activeOnly: false, directory }).find((story) => story.slug === normalized) || null;
}

function storyPath(storyOrSlug) {
  const slug = typeof storyOrSlug === 'string' ? storyOrSlug : storyOrSlug.slug;
  return `/weather-stories/${slug}`;
}

module.exports = {
  STORIES_DIR,
  assertStory,
  readStories,
  publishedStories,
  bySlug,
  isActive,
  storyPath,
};
