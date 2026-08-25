'use strict';

const site = require('../site');
const seo = require('../seo');
const cities = require('../cities');
const stories = require('../stories');
const { renderDocument, escapeHtml } = require('./shell');

const DATE = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const DATE_TIME = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

function dateLabel(value) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00Z` : value;
  return DATE.format(new Date(normalized));
}

function timeLabel(value) {
  return DATE_TIME.format(new Date(value));
}

function valueLabel(value, unit, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  return `${Number(value).toFixed(digits).replace(/\.0$/, '')}${unit}`;
}

function pageMounts({ hero = '', detail = '', context = '' } = {}) {
  return {
    alerts: '', hero,
    hourly: '', details: '', air: '', daily: '', activities: '', astro: '', almanac: '', compare: '',
    'page-detail': detail,
    'page-context': context,
  };
}

function renderStoriesIndex(list) {
  const path = '/weather-stories';
  const hasStories = list.length > 0;
  const hero = `
    <section class="panel panel-hero panel-intro story-intro">
      <p class="eyebrow">Weather stories</p>
      <h1>The weather changes worth knowing about</h1>
      <p class="lede">
        Short, practical briefings on notable forecast changes. Each story is
        selected from measurable thresholds, reviewed before publication, and
        shows the forecast evidence it was based on.
      </p>
      <p>
        We do not publish a page simply because a new day began. When nothing
        material crosses the editorial thresholds, the better story is no story.
        For live conditions, <a href="/weather">choose a city forecast</a>.
      </p>
    </section>`;

  const detail = hasStories
    ? `<section class="story-grid" aria-label="Current weather stories">
        ${list.map((story) => `
          <article class="panel story-card">
            <p class="story-meta">${escapeHtml(story.evidence.location.label)} · <time datetime="${escapeHtml(story.publishedAt)}">${escapeHtml(dateLabel(story.publishedAt))}</time></p>
            <h2><a href="${escapeHtml(stories.storyPath(story))}">${escapeHtml(story.headline)}</a></h2>
            <p>${escapeHtml(story.dek)}</p>
            <a class="story-read" href="${escapeHtml(stories.storyPath(story))}">Read the evidence-backed briefing</a>
          </article>`).join('')}
      </section>`
    : `<section class="panel story-empty">
        <h2>No material story right now</h2>
        <p>The current scan has not produced a reviewed story that is still timely. Live city forecasts remain available around the clock.</p>
        <p><a href="/weather">Browse weather by city</a></p>
      </section>`;

  const description = 'Evidence-backed briefings on notable forecast changes, with the underlying weather data and source shown on every story.';
  const head = seo.headTags({
    title: `Weather Stories — Forecast Changes Worth Knowing | ${site.name}`,
    description,
    canonical: site.url(path),
    robots: hasStories ? null : 'noindex, follow',
    jsonLd: hasStories ? [
      seo.webPageJsonLd({ name: 'Weather stories', description, path }),
      seo.breadcrumbJsonLd([
        { name: site.name, path: '/' },
        { name: 'Weather stories', path },
      ]),
    ] : [],
  });

  return renderDocument({
    head,
    mounts: pageMounts({ hero, detail }),
    tabs: false,
    heroPanel: false,
    bootstrap: { page: 'stories' },
  });
}

function evidenceTable(story) {
  return `
    <section class="panel story-evidence" aria-labelledby="story-evidence-title">
      <header class="panel-head">
        <h2 id="story-evidence-title">Forecast evidence</h2>
        <p class="panel-sub">Metric values; source time zone: ${escapeHtml(story.evidence.timezone || 'local')}</p>
      </header>
      <p class="story-signal">
        Selected signal: ${escapeHtml(story.evidence.selectedMetric.label)}
        ${escapeHtml(valueLabel(story.evidence.selectedMetric.value, ` ${story.evidence.selectedMetric.unit}`, 1))}
        (editorial threshold ${escapeHtml(valueLabel(story.evidence.selectedMetric.threshold, ` ${story.evidence.selectedMetric.unit}`, 1))}).
      </p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            <th scope="col">Date</th><th scope="col">High</th><th scope="col">Low</th>
            <th scope="col">Precip.</th><th scope="col">Snow</th><th scope="col">Chance</th><th scope="col">Max gust</th>
          </tr></thead>
          <tbody>
            ${story.evidence.days.map((day) => `<tr${day.date === story.evidence.eventDate ? ' class="story-event-day"' : ''}>
              <th scope="row">${escapeHtml(dateLabel(day.date))}</th>
              <td>${escapeHtml(valueLabel(day.highC, '°C', 1))}</td>
              <td>${escapeHtml(valueLabel(day.lowC, '°C', 1))}</td>
              <td>${escapeHtml(valueLabel(day.precipMm, ' mm', 1))}</td>
              <td>${escapeHtml(valueLabel(day.snowCm, ' cm', 1))}</td>
              <td>${escapeHtml(valueLabel(day.precipChancePct, '%'))}</td>
              <td>${escapeHtml(valueLabel(day.maxGustKmh, ' km/h'))}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="story-source">
        Source: <a href="${escapeHtml(story.source.url)}" rel="noopener">${escapeHtml(story.source.provider)}</a>.
        Forecast fetched <time datetime="${escapeHtml(story.source.fetchedAt)}">${escapeHtml(timeLabel(story.source.fetchedAt))}</time>.
        Values are a forecast snapshot and may have changed since publication.
      </p>
    </section>`;
}

function renderStoryPage(story, { now = new Date() } = {}) {
  const path = stories.storyPath(story);
  const active = stories.isActive(story, now);
  const city = cities.bySlug(story.evidence.location.slug);
  const published = dateLabel(story.publishedAt);
  const hero = `
    <article class="panel panel-hero panel-intro story-hero">
      <p class="eyebrow">${escapeHtml(story.evidence.eventLabel || 'Weather story')} · ${escapeHtml(story.evidence.location.label)}</p>
      <h1>${escapeHtml(story.headline)}</h1>
      <p class="lede">${escapeHtml(story.dek)}</p>
      <p class="story-byline">Published <time datetime="${escapeHtml(story.publishedAt)}">${escapeHtml(published)}</time> · Forecast event: <time datetime="${escapeHtml(story.evidence.eventDate)}">${escapeHtml(dateLabel(story.evidence.eventDate))}</time></p>
      ${active ? '' : '<p class="story-stale"><strong>Archived forecast:</strong> this story is no longer current. Use the live forecast for today’s conditions.</p>'}
    </article>`;

  const article = `
    <article class="panel story-article">
      <p class="story-summary">${escapeHtml(story.summary)}</p>
      ${story.sections.map((section) => `
        <section>
          <h2>${escapeHtml(section.heading)}</h2>
          ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
        </section>`).join('')}
      <p class="story-disclosure">${escapeHtml(story.disclosure)}</p>
    </article>`;

  const context = `
    ${evidenceTable(story)}
    <nav class="panel story-next" aria-label="Related weather pages">
      <h2>Keep checking the forecast</h2>
      <p>
        ${city ? `<a href="${escapeHtml(seo.cityPath(city))}">See the live ${escapeHtml(city.name)} forecast</a> · ` : ''}
        <a href="/weather-stories">More weather stories</a> ·
        <a href="/weather-guide">Weather questions answered</a>
      </p>
    </nav>`;

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: story.headline,
    description: story.seoDescription,
    url: site.url(path),
    mainEntityOfPage: site.url(path),
    datePublished: story.publishedAt,
    dateModified: story.publishedAt,
    author: seo.organizationJsonLd({ context: false }),
    publisher: seo.organizationJsonLd({ context: false }),
    about: { '@type': 'Place', name: story.evidence.location.label },
    citation: story.source.url,
  };
  const head = seo.headTags({
    title: `${story.seoTitle} | ${site.name}`,
    description: story.seoDescription,
    canonical: site.url(path),
    type: 'article',
    robots: active ? null : 'noindex, follow',
    jsonLd: [
      seo.breadcrumbJsonLd([
        { name: site.name, path: '/' },
        { name: 'Weather stories', path: '/weather-stories' },
        { name: story.headline, path },
      ]),
      articleJsonLd,
    ],
  });

  return renderDocument({
    head,
    mounts: pageMounts({ hero, detail: article, context }),
    tabs: false,
    heroPanel: false,
    bootstrap: { page: 'story', slug: story.slug },
  });
}

module.exports = { renderStoriesIndex, renderStoryPage, evidenceTable, dateLabel, valueLabel };
