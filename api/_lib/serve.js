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

module.exports = { toVercel, queryOf };
