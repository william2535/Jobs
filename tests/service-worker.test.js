import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serviceWorkerSource } from '../src/service-worker.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const scope = 'https://jobs.example/jobs/';
const url = path => new URL(path, scope).href;
const client = { id: 'current', type: 'window', url: scope };
class MemoryCache {
  items = new Map();
  async match(request) { return this.items.get(typeof request === 'string' ? request : request.url)?.clone(); }
  async put(request, response) { this.items.set(typeof request === 'string' ? request : request.url, response.clone()); }
}
function harness({ active = false, cacheName = 'jobs-v3-new', bodies = { './': '<html>new</html>', './index.html': '<html>new</html>', './assets/toolbox-NEW123.js': 'new tools' } } = {}) {
  const cacheStores = new Map(), handlers = new Map(), network = new Map(Object.entries(bodies).map(([path, body]) => [url(path), body]));
  const state = { online: true, claims: 0, skips: 0, clients: [client], networkCalls: 0 };
  const caches = { keys: async () => [...cacheStores.keys()], delete: async key => cacheStores.delete(key), open: async key => { if (!cacheStores.has(key)) cacheStores.set(key, new MemoryCache()); return cacheStores.get(key); } };
  const self = {
    registration: { scope, active: active ? {} : null }, location: { origin: new URL(scope).origin },
    clients: { claim: async () => { state.claims++; }, matchAll: async () => state.clients },
    skipWaiting: async () => { state.skips++; }, addEventListener: (kind, callback) => handlers.set(kind, callback),
  };
  const source = serviceWorkerSource({ cacheName, files: Object.keys(bodies), hashes: Object.fromEntries(Object.entries(bodies).map(([path, body]) => [path, sha(body)])), buildId: 'synthetic-build' });
  vm.runInNewContext(source, { self, caches, URL, Request, Response, Uint8Array, crypto: webcrypto, Date,
    fetch: async request => { state.networkCalls++; if (!state.online) throw Error('Offline'); const body = network.get(typeof request === 'string' ? request : request.url); return new Response(body ?? 'Not found', { status: body === undefined ? 404 : 200 }); },
  });
  async function dispatch(kind, extra = {}) { const work = []; handlers.get(kind)({ waitUntil: promise => work.push(promise), ...extra }); await Promise.all(work); }
  async function message(type, source = client) { let reply; await dispatch('message', { data: { type }, source, ports: [{ postMessage: value => { reply = value; } }] }); return reply; }
  async function fetchAsset(path, mode = 'same-origin') { let response; handlers.get('fetch')({ request: { url: url(path), method: 'GET', mode }, respondWith: promise => { response = promise; } }); return response; }
  return { source, cacheName, caches, state, network, dispatch, message, fetchAsset };
}

test('first install validates and caches the complete shell, activates naturally and verifies readiness', async () => {
  const worker = harness();
  await worker.dispatch('install');
  assert.equal(worker.state.skips, 0, 'Installation must not force replacement of an existing worker');
  await worker.dispatch('activate');
  assert.equal(worker.state.claims, 1);
  assert.equal((await worker.message('JOBS_CACHE_STATUS')).ready, true);
  worker.state.online = false;
  assert.equal(await (await worker.fetchAsset('./index.html')).text(), '<html>new</html>');
  assert.equal(await (await worker.fetchAsset('./assets/toolbox-NEW123.js')).text(), 'new tools');
  assert.equal(await (await worker.fetchAsset('./unseen-route', 'navigate')).text(), '<html>new</html>');
});

test('mismatched deployment bytes reject installation without replacing the previous cache', async () => {
  const worker = harness({ active: true });
  const old = await worker.caches.open('jobs-v2-old'); await old.put(url('./index.html'), new Response('old page'));
  worker.network.set(url('./index.html'), '<html>wrong release</html>');
  await assert.rejects(worker.dispatch('install'), /do not match/);
  assert.deepEqual(await worker.caches.keys(), ['jobs-v2-old']);
  assert.equal(await (await old.match(url('./index.html'))).text(), 'old page');
});

test('updates wait, block other windows, retain one prior active cache and serve its old lazy chunks offline', async () => {
  const worker = harness({ active: true });
  const old = await worker.caches.open('jobs-v3-old');
  await old.put(url('./__jobs_cache_state__'), new Response(JSON.stringify({ active: true, activatedAt: 100, createdAt: 90 })));
  await old.put(url('./assets/toolbox-OLD123.js'), new Response('old tools'));
  const ancient = await worker.caches.open('jobs-v3-ancient');
  await ancient.put(url('./__jobs_cache_state__'), new Response(JSON.stringify({ active: true, activatedAt: 50, createdAt: 40 })));
  const replaced = await worker.caches.open('jobs-v3-replaced-waiting');
  await replaced.put(url('./__jobs_cache_state__'), new Response(JSON.stringify({ active: false, createdAt: 110 })));
  await worker.dispatch('install');
  assert.equal(worker.state.skips, 0); assert.equal(worker.state.claims, 0);
  worker.state.clients = [client, { ...client, id: 'another' }];
  const blocked = await worker.message('JOBS_ACTIVATE_UPDATE');
  assert.equal(blocked.blocked, true); assert.equal(worker.state.skips, 0);
  worker.state.clients = [{ ...client, id: 'another' }];
  assert.equal((await worker.message('JOBS_ACTIVATE_UPDATE')).blocked, true, 'A closed requester cannot activate over a different window');
  worker.state.clients = [client];
  assert.equal((await worker.message('JOBS_ACTIVATE_UPDATE')).activated, true);
  assert.equal(worker.state.skips, 1);
  await worker.dispatch('activate');
  assert.deepEqual(new Set(await worker.caches.keys()), new Set(['jobs-v3-old', 'jobs-v3-new']));
  worker.state.online = false;
  assert.equal(await (await worker.fetchAsset('./assets/toolbox-OLD123.js')).text(), 'old tools');
  assert.equal(await (await worker.fetchAsset('./index.html')).text(), '<html>new</html>');
});

test('worker messages require an in-scope window and missing cache data can be repaired without mixing releases', async () => {
  const worker = harness(); await worker.dispatch('install'); await worker.dispatch('activate');
  const calls = worker.state.networkCalls, claims = worker.state.claims;
  for (const source of [{ ...client, url: 'https://attacker.example/' }, { ...client, url: 'https://jobs.example/unrelated/' }, { ...client, type: 'worker' }, null]) {
    assert.equal(await worker.message('JOBS_PREPARE_OFFLINE', source), undefined);
    assert.equal(await worker.message('JOBS_ACTIVATE_UPDATE', source), undefined);
    assert.equal(await worker.message('JOBS_CLAIM_CLIENT', source), undefined);
  }
  assert.equal(worker.state.networkCalls, calls); assert.equal(worker.state.claims, claims);
  const cache = await worker.caches.open(worker.cacheName); cache.items.delete(url('./assets/toolbox-NEW123.js'));
  assert.equal((await worker.message('JOBS_CACHE_STATUS')).ready, false);
  worker.network.set(url('./index.html'), 'different release');
  assert.equal((await worker.message('JOBS_PREPARE_OFFLINE')).ready, false);
  assert.equal(await (await cache.match(url('./index.html'))).text(), '<html>new</html>');
  worker.network.set(url('./index.html'), '<html>new</html>');
  assert.equal((await worker.message('JOBS_PREPARE_OFFLINE')).ready, true);
  await worker.message('JOBS_CLAIM_CLIENT'); assert.equal(worker.state.claims, claims + 1);
});

test('offline manifests hash final HTML changes and include nested static assets', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jobs-offline-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets')); await mkdir(join(root, 'help'));
  await writeFile(join(root, 'index.html'), '<html>one</html>');
  await writeFile(join(root, 'assets', 'index-ABC123.js'), 'export const version=1;');
  await writeFile(join(root, 'help', 'offline.txt'), 'Included guide');
  const { default: config } = await import('../vite.config.js');
  const plugin = config.plugins.find(item => item.name === 'offline-shell');
  plugin.writeBundle({ dir: root });
  const first = JSON.parse(await readFile(join(root, 'offline-manifest.json'), 'utf8'));
  assert.ok(first.files.some(file => file.path === 'help/offline.txt'));
  assert.equal(first.files.find(file => file.path === 'index.html').sha256, sha('<html>one</html>'));
  await writeFile(join(root, 'index.html'), '<html>two</html>');
  plugin.writeBundle({ dir: root });
  const second = JSON.parse(await readFile(join(root, 'offline-manifest.json'), 'utf8'));
  assert.notEqual(second.cacheId, first.cacheId);
  const code = await readFile(join(root, 'sw.js'), 'utf8');
  assert.ok(code.includes('./offline-manifest.json')); assert.ok(code.includes('./help/offline.txt'));
});
