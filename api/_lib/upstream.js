'use strict';

/**
 * Upstream HTTP helpers.
 *
 * Every outbound call goes through here so timeouts, the User-Agent (required
 * by api.weather.gov) and error shapes stay consistent across handlers.
 */

const USER_AGENT =
  'skywatch-dashboard/2.0 (self-hosted personal weather dashboard)';

class UpstreamError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status || 502;
  }
}

async function fetchJson(url, { timeoutMs = 10000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
    });

    if (!response.ok) {
      throw new UpstreamError(
        `Upstream responded ${response.status}`,
        // Pass client errors through; collapse upstream 5xx into 502.
        response.status >= 400 && response.status < 500 ? response.status : 502
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error.name === 'AbortError') {
      throw new UpstreamError('Upstream timed out', 504);
    }
    throw new UpstreamError(`Upstream request failed: ${error.message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Like fetchJson but resolves to `fallback` instead of throwing. Used for the
 * optional panels (air quality, aurora, alerts) so one flaky provider never
 * takes down the whole dashboard.
 */
async function fetchJsonSoft(url, fallback = null, options) {
  try {
    return await fetchJson(url, options);
  } catch (error) {
    return fallback;
  }
}

/**
 * Same contract as fetchJson, but for text payloads (XML, CSV). Environment
 * Canada publishes both, and neither has a JSON equivalent.
 */
async function fetchText(url, { timeoutMs = 10000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain, application/xml, text/xml, */*', ...headers },
    });

    if (!response.ok) {
      throw new UpstreamError(
        `Upstream responded ${response.status}`,
        response.status >= 400 && response.status < 500 ? response.status : 502
      );
    }

    return await response.text();
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error.name === 'AbortError') throw new UpstreamError('Upstream timed out', 504);
    throw new UpstreamError(`Upstream request failed: ${error.message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextSoft(url, fallback = null, options) {
  try {
    return await fetchText(url, options);
  } catch (error) {
    return fallback;
  }
}

/**
 * Diagnostic fetch: never throws, and reports WHY it failed.
 *
 * The soft-fetch helpers deliberately swallow errors so one flaky provider
 * cannot break a page. That is right for serving traffic and useless for
 * debugging, so the health probe uses this instead.
 */
async function probeUrl(url, { timeoutMs = 12000, headers = {} } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...headers },
    });
    const body = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      bytes: body.length,
      contentType: response.headers.get('content-type'),
      // A rejection page is usually short and explains itself.
      snippet: response.ok ? undefined : body.slice(0, 300),
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error: `${error.name}: ${error.message}`,
      cause: error.cause ? String(error.cause.code || error.cause.message || error.cause) : undefined,
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return url.toString();
}

module.exports = {
  fetchJson, fetchJsonSoft, fetchText, fetchTextSoft, probeUrl,
  buildUrl, UpstreamError, USER_AGENT,
};
