'use strict';

/**
 * `/widgets` — the page that gives the widget away.
 *
 * A builder rather than a code sample: pick a place, see it live, copy the
 * snippet. Every step that a site owner would otherwise have to guess at is
 * one they abandon at, and an embed that nobody installs is worth nothing.
 */

const site = require('../site');
const seo = require('../seo');
const cities = require('../cities');
const { renderDocument, escapeHtml } = require('./shell');

const AUDIENCE = [
  'Hotels and inns', 'Campgrounds', 'Marinas and yacht clubs', 'Ski hills',
  'Golf courses', 'Municipal and township sites', 'Community associations',
  'Tourism and visitor boards', 'Cottage and cabin rentals', 'Fishing and paddling clubs',
  'Farm stands and markets', 'Event and festival pages',
];

function renderWidgetsPage() {
  const options = cities.CITIES
    .map((city) => `<option value="${escapeHtml(city.slug)}">${escapeHtml(city.label)}</option>`)
    .join('');

  const hero = `
    <section class="panel panel-hero panel-intro">
      <h1>Put the weather on your website. Free.</h1>
      <p class="lede">
        A small, fast forecast panel you can drop into any page. No account, no API key,
        no tracking scripts, no charge — and it stays free. Ask for it, style it, paste it.
      </p>
      <p>
        The only thing we ask is that you keep the “Weather powered by ${escapeHtml(site.name)}”
        credit that ships with it.
      </p>
    </section>`;

  const builder = `
    <section class="panel panel-builder">
      <header class="panel-head">
        <h2>Build your widget</h2>
        <p class="panel-sub">Change anything and the preview updates. Then copy the snippet.</p>
      </header>

      <div class="builder">
        <form class="builder-controls" id="widget-builder">
          <label class="field">
            <span>Location</span>
            <select name="city">${options}</select>
          </label>

          <label class="field">
            <span>Forecast days</span>
            <select name="days">
              <option value="0">None — current conditions only</option>
              <option value="3" selected>3 days</option>
              <option value="5">5 days</option>
              <option value="7">7 days</option>
            </select>
          </label>

          <label class="field">
            <span>Theme</span>
            <select name="theme">
              <option value="auto" selected>Match the visitor's device</option>
              <option value="light">Always light</option>
              <option value="dark">Always dark</option>
            </select>
          </label>

          <label class="field">
            <span>Units</span>
            <select name="units">
              <option value="">Match the location</option>
              <option value="metric">Metric (°C)</option>
              <option value="imperial">Imperial (°F)</option>
            </select>
          </label>

          <label class="field">
            <span>Accent colour</span>
            <input type="color" name="accent" value="#3b82f6">
          </label>

          <label class="field">
            <span>Width</span>
            <input type="text" name="width" value="360px" spellcheck="false">
          </label>
        </form>

        <div class="builder-preview">
          <iframe id="widget-preview" title="Widget preview" loading="lazy"
                  src="/widget?city=toronto&amp;days=3&amp;theme=auto&amp;embed=1"></iframe>
        </div>
      </div>

      <div class="snippet">
        <div class="snippet-head">
          <h3>Paste this into your page</h3>
          <button type="button" class="snippet-copy" data-copy="snippet-iframe">Copy</button>
        </div>
        <pre id="snippet-iframe" class="snippet-code"><code></code></pre>
        <p class="snippet-note">
          A plain iframe: no JavaScript runs on your page at all, and the height is fixed.
        </p>

        <div class="snippet-head">
          <h3>Or, if you want it to size itself</h3>
          <button type="button" class="snippet-copy" data-copy="snippet-script">Copy</button>
        </div>
        <pre id="snippet-script" class="snippet-code"><code></code></pre>
        <p class="snippet-note">
          Loads <code>embed.js</code>, which inserts the same iframe and adjusts its height
          to fit. It reads nothing from your page and sets no cookies.
        </p>
      </div>
    </section>`;

  const docs = `
    <section class="panel">
      <header class="panel-head"><h2>Options</h2></header>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr><th scope="col">Parameter</th><th scope="col">Values</th><th scope="col">What it does</th></tr>
          </thead>
          <tbody>
            <tr><th scope="row"><code>city</code></th><td>a published city slug</td><td>The place to show. <a href="/weather">See the list</a>.</td></tr>
            <tr><th scope="row"><code>lat</code> / <code>lon</code></th><td>coordinates</td><td>Anywhere on Earth, if your place is not in the list.</td></tr>
            <tr><th scope="row"><code>name</code></th><td>text</td><td>What to call a coordinate pair.</td></tr>
            <tr><th scope="row"><code>days</code></th><td><code>0</code>–<code>7</code></td><td>How many days of outlook to show under the current conditions.</td></tr>
            <tr><th scope="row"><code>theme</code></th><td><code>auto</code>, <code>light</code>, <code>dark</code></td><td><code>auto</code> follows the visitor's device setting.</td></tr>
            <tr><th scope="row"><code>units</code></th><td><code>metric</code>, <code>imperial</code></td><td>Defaults to what the location's country uses.</td></tr>
            <tr><th scope="row"><code>accent</code></th><td>a hex colour</td><td>Tints the icons to match your site.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <header class="panel-head"><h2>The small print, in full</h2></header>
      <ul class="plain-list">
        <li><strong>It is free, with no tier above it.</strong> There is no paid version of this widget to upsell you to.</li>
        <li><strong>No tracking.</strong> The widget sets no cookies, uses no storage, and runs no analytics. We never see who visits your site.</li>
        <li><strong>It refreshes itself</strong> every 15 minutes, and is cached at the edge, so it costs your page one small request.</li>
        <li><strong>Keep the credit.</strong> The “Weather powered by ${escapeHtml(site.name)}” line links back to the forecast — that link is the whole business model.</li>
        <li><strong>Forecast data</strong> comes from Open-Meteo's multi-model blend, licensed CC BY 4.0. Official alerts come from Environment Canada and the US National Weather Service where they publish them.</li>
      </ul>
    </section>

    <section class="panel">
      <header class="panel-head">
        <h2>Built for sites like yours</h2>
        <p class="panel-sub">If your visitors check the weather before they visit you, this belongs on your page.</p>
      </header>
      <ul class="chip-list">
        ${AUDIENCE.map((who) => `<li>${escapeHtml(who)}</li>`).join('')}
      </ul>
    </section>`;

  const head = seo.headTags({
    title: `Free Weather Widget for Your Website | ${site.name}`,
    description:
      'A free, fast, ad-free weather widget for any website. Current conditions and a ' +
      '3–7 day forecast, no account, no API key and no tracking. Copy one line and paste it.',
    canonical: site.url('/widgets'),
    image: site.url('/api/og?city=toronto'),
    imageAlt: `${site.name} website widget`,
    jsonLd: [
      seo.breadcrumbJsonLd([
        { name: site.name, path: '/' },
        { name: 'Widgets', path: '/widgets' },
      ]),
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: `${site.name} Weather Widget`,
        applicationCategory: 'WebApplication',
        operatingSystem: 'Any',
        url: site.url('/widgets'),
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    ],
  });

  return renderDocument({
    head,
    mounts: {
      alerts: '',
      hero,
      hourly: '', details: '', air: '', daily: '', activities: '', astro: '',
      almanac: '', compare: '',
      'page-detail': builder,
      'page-context': docs,
    },
    tabs: false,
    heroPanel: false,
    bootstrap: { page: 'widgets', origin: site.origin },
  });
}

module.exports = { renderWidgetsPage };
