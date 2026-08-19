'use strict';

/**
 * Local development server.
 *
 * Serves the static dashboard and mounts the same handlers that back the
 * Vercel functions in `api/`, so what you test locally is what ships.
 */

const express = require('express');
const path = require('path');

const handlers = require('./api/_lib/handlers');
const pages = require('./api/_lib/pages');
const { UpstreamError } = require('./api/_lib/upstream');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

/**
 * Document routes come first: they mirror the rewrites in `vercel.json`, and
 * a couple of them (`/weather`, `/widget`) would otherwise be shadowed by a
 * static file of the same name.
 */
const DOCUMENTS = [
  ['/api/og', (req) => require('./api/_lib/og').ogCard(req.query)],
  ['/sitemap.xml', () => pages.sitemap()],
  ['/robots.txt', () => pages.robots()],
  ['/widget', (req) => require('./api/_lib/render/widget').renderWidget(req.query)],
  ['/widgets', () => pages.widgetsPage()],
  ['/weather', () => pages.cityIndex()],
  ['/weather/:slug', (req) => pages.cityPage({ slug: req.params.slug })],
  ['/weather/:slug/:section', (req) => pages.cityPage({ slug: req.params.slug, section: req.params.section })],
];

for (const [route, handler] of DOCUMENTS) {
  app.get(route, async (req, res) => {
    try {
      const { status, body, maxAge, contentType } = await handler(req);
      res.set('Content-Type', contentType || 'text/html; charset=utf-8');
      res.set('Cache-Control', maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store');
      res.status(status).send(body);
    } catch (error) {
      console.error(`[${route}]`, error.stack || error.message);
      res.status(500).send('<!doctype html><meta charset="utf-8"><p>Page render failed.</p>');
    }
  });
}

app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

const ROUTES = {
  '/api/weather': handlers.forecast,
  '/api/geocode': handlers.geocode,
  '/api/reverse': handlers.reverse,
  '/api/alerts': handlers.alerts,
  '/api/radar': handlers.radar,
  '/api/almanac': handlers.almanac,
  '/api/space': handlers.space,
  '/api/health': handlers.health,
};

for (const [route, handler] of Object.entries(ROUTES)) {
  app.get(route, async (req, res) => {
    try {
      const { status, body, maxAge } = await handler(req.query);
      res.set('Cache-Control', maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store');
      res.status(status).json(body);
    } catch (error) {
      const status = error instanceof UpstreamError ? error.status : 500;
      if (status >= 500) console.error(`[${route}]`, error.message);
      res.status(status).json({ error: error.message || 'Request failed' });
    }
  });
}

app.listen(PORT, () => {
  console.log(`WeatherView running on http://localhost:${PORT}`);
});
