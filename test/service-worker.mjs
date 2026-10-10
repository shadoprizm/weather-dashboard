import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
function worker(initialKeys = [], { holdNavigation = false } = {}) {
  const stores = new Map(initialKeys.map(key => [key, new Map()]));
  const listeners = {};
  const navigated = [];
  let claimed = 0;
  let online = true;
  const requestKey = request => typeof request === 'string'
    ? new URL(request, 'https://www.weatherview.cloud').href : request.url;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async key => stores.delete(key),
    open: async key => {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return { match: async request => store.get(requestKey(request)), put: async (request, response) => store.set(requestKey(request), response) };
    },
  };
  runInNewContext(source, {
    URL, caches,
    fetch: async () => { if (!online) throw new Error('offline'); return { ok: true, body: 'network', clone() { return this; } }; },
    self: {
      location: { origin: 'https://www.weatherview.cloud' },
      addEventListener: (name, handler) => { listeners[name] = handler; },
      clients: {
        claim: async () => { claimed++; },
        matchAll: async () => [{ url: 'https://www.weatherview.cloud/?lat=45&lon=-75&view=radar', navigate: async url => {
          navigated.push(url);
          if (holdNavigation) await new Promise(() => {});
        } }],
      },
    },
  });
  return { stores, navigated, claimed: () => claimed, offline: () => { online = false; },
    activate: () => new Promise((resolve, reject) => listeners.activate({ waitUntil: p => p.then(resolve, reject) })),
    request: (path, mode = 'cors') => new Promise((resolve, reject) => listeners.fetch({ request: { method: 'GET', mode, url: `https://www.weatherview.cloud${path}` }, respondWith: p => p.then(resolve, reject) })),
  };
}

const updated = worker(['weatherview-v16-shell', 'weatherview-v21-shell', 'unrelated-cache']);
await updated.activate();
assert.equal(updated.stores.has('weatherview-v16-shell'), false);
assert.equal(updated.stores.has('unrelated-cache'), true);
assert.equal(updated.claimed(), 1);
assert.deepEqual(updated.navigated, ['https://www.weatherview.cloud/?lat=45&lon=-75&view=radar'], 'legacy tabs must execute the new modules without losing location or view');
const first = worker(['weatherview-v21-shell']);
await first.activate();
assert.deepEqual(first.navigated, [], 'first installation must not cause a redundant page reload');
const pendingNavigation = worker(['weatherview-v16-shell'], { holdNavigation: true });
await Promise.race([
  pendingNavigation.activate(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('activation waited on navigation')), 100)),
]);
assert.equal(pendingNavigation.navigated.length, 1, 'activation completes even while navigation awaits the new worker');

const mixed = worker(['weatherview-v16-shell', 'weatherview-v21-shell']);
mixed.stores.get('weatherview-v16-shell').set('https://www.weatherview.cloud/js/radar.js?v=21', { body: 'old map provider' });
mixed.stores.get('weatherview-v21-shell').set('https://www.weatherview.cloud/js/radar.js?v=21', { body: 'current map provider' });
assert.equal((await mixed.request('/js/radar.js?v=21')).body, 'current map provider', 'cache lookup must stay within the active generation');
mixed.offline();
mixed.stores.set('weatherview-v16-data', new Map([['https://www.weatherview.cloud/api/radar', { body: 'expired frames' }]]));
await assert.rejects(mixed.request('/api/radar'), /offline/, 'old radar indexes must not leak across cache generations');
mixed.stores.get('weatherview-v16-shell').set('https://www.weatherview.cloud/', { body: 'old page' });
mixed.stores.get('weatherview-v21-shell').set('https://www.weatherview.cloud/', { body: 'current offline page' });
const offlinePage = await mixed.request('/weather/ottawa', 'navigate');
assert.equal(offlinePage.body, 'current offline page', 'offline navigation uses the current shell');
console.log('Service-worker upgrade, preserved URL, first install and scoped cache checks passed.');
