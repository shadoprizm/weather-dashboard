'use strict';

/**
 * Tiny in-process TTL cache.
 *
 * On Vercel this is per-instance and disappears when the lambda is recycled,
 * which is fine -- it only exists to absorb bursts. The real caching lever is
 * the `Cache-Control: s-maxage` header each handler returns, which the CDN
 * honours across instances.
 */

const store = new Map();
const MAX_ENTRIES = 500;

function get(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return undefined;
  }
  // Refresh insertion order so hot keys survive eviction.
  store.delete(key);
  store.set(key, hit);
  return hit.value;
}

function set(key, value, ttlSeconds) {
  if (store.size >= MAX_ENTRIES) {
    // Map iterates in insertion order, so the first key is the coldest.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

/** Run `producer` at most once per key per TTL window. */
async function memo(key, ttlSeconds, producer) {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = await producer();
  set(key, value, ttlSeconds);
  return value;
}

function stats() {
  return { entries: store.size, limit: MAX_ENTRIES };
}

module.exports = { get, set, memo, stats };
