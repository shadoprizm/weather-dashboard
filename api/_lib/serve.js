'use strict';

/** Adapts a shared handler to the Vercel Node function signature. */

const { UpstreamError } = require('./upstream');

function queryOf(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  // Local/edge cases where `query` was not pre-parsed for us.
  const url = new URL(req.url, 'http://localhost');
  return Object.fromEntries(url.searchParams.entries());
}

function toVercel(handler) {
  return async function vercelHandler(req, res) {
    try {
      const { status, body, maxAge } = await handler(queryOf(req));
      res.setHeader(
        'Cache-Control',
        maxAge > 0
          ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`
          : 'no-store'
      );
      res.status(status).json(body);
    } catch (error) {
      const status = error instanceof UpstreamError ? error.status : 500;
      if (status >= 500) console.error('[api]', error.message);
      res.setHeader('Cache-Control', 'no-store');
      res.status(status).json({ error: error.message || 'Request failed' });
    }
  };
}

/**
 * The same adapter for handlers that return a document rather than JSON.
 *
 * Kept separate rather than branching inside `toVercel` because the failure
 * mode differs: a broken JSON endpoint should answer with JSON, and a broken
 * page should answer with something a browser can render.
 */
function toVercelDocument(handler) {
  return async function vercelDocumentHandler(req, res) {
    try {
      const { status, body, maxAge, contentType } = await handler(queryOf(req));
      res.setHeader('Content-Type', contentType || 'text/html; charset=utf-8');
      res.setHeader(
        'Cache-Control',
        maxAge > 0
          ? `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`
          : 'no-store'
      );
      res.status(status).send(body);
    } catch (error) {
      const status = error instanceof UpstreamError ? error.status : 500;
      if (status >= 500) console.error('[page]', error.message);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.status(status).send(
        `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">` +
        `<title>Temporarily unavailable</title>` +
        `<p>The forecast service did not answer in time. <a href="/">Try the dashboard</a>.</p>`
      );
    }
  };
}

module.exports = { toVercel, toVercelDocument, queryOf };
