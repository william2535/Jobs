/** Build a self-contained worker; no app or customer records enter this cache. */
export function serviceWorkerSource({ cacheName, files, hashes, buildId }) {
  return `const CACHE=${JSON.stringify(cacheName)}; const FILES=${JSON.stringify(files)};\n(${workerRuntime.toString()})({cacheName:CACHE,files:FILES,hashes:${JSON.stringify(hashes)},buildId:${JSON.stringify(buildId)}});\n`;
}

function workerRuntime({ cacheName, files, hashes, buildId }) {
  const scope = self.registration.scope;
  const stateURL = new URL('__jobs_cache_state__', scope).href;
  const absolute = value => new URL(value, scope).href;
  const ownCache = name => name.startsWith('jobs-v');
  const hashedAsset = url => url.pathname.startsWith(new URL('assets/', scope).pathname) && /-[\w-]{6,}\.[a-z0-9]+$/i.test(url.pathname);
  let statePromise;
  const readState = async name => {
    const cache = await caches.open(name);
    const response = await cache.match(stateURL);
    return response ? response.json().catch(() => ({})) : {};
  };
  const saveState = async state => {
    const cache = await caches.open(cacheName);
    await cache.put(stateURL, new Response(JSON.stringify(state), { headers: { 'Content-Type': 'application/json' } }));
    statePromise = Promise.resolve(state);
  };
  async function prepare() {
    const responses = await Promise.all(files.map(async path => {
      const response = await fetch(new Request(absolute(path), { cache: 'reload', credentials: 'same-origin' }));
      if (!response.ok) throw Error('A required offline file could not be downloaded.');
      const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
      const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== hashes[path]) throw Error('The downloaded files do not match this app version.');
      return [absolute(path), response];
    }));
    const cache = await caches.open(cacheName);
    // Validate the complete download before replacing any existing cached file.
    for (const [url, response] of responses) await cache.put(url, response);
  }
  async function cacheStatus() {
    const cache = await caches.open(cacheName);
    const checks = await Promise.all(files.map(async path => (await cache.match(absolute(path), { ignoreVary: true })) ? null : path));
    const missing = checks.filter(Boolean);
    return { type: 'JOBS_CACHE_STATUS', ready: !missing.length, missing, cacheName, buildId };
  }
  self.addEventListener('install', event => event.waitUntil((async () => {
    try {
      await prepare();
      await saveState({ createdAt: Date.now(), firstInstall: !self.registration.active, active: false });
      // Existing installations wait. First installation activates naturally.
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })()));
  self.addEventListener('activate', event => event.waitUntil((async () => {
    const current = await readState(cacheName);
    const names = (await caches.keys()).filter(name => ownCache(name) && name !== cacheName);
    const candidates = await Promise.all(names.map(async name => ({ name, state: await readState(name) })));
    // Prefer the last active cache, not a superseded waiting worker's cache.
    const active = candidates.filter(item => item.state.active).sort((a, b) => (b.state.activatedAt || 0) - (a.state.activatedAt || 0));
    const legacy = candidates.filter(item => item.name.startsWith('jobs-v2-'));
    const previous = active[0]?.name || legacy.at(-1)?.name || null;
    await saveState({ ...current, active: true, activatedAt: Date.now(), previous });
    await Promise.all(candidates.filter(item => item.name !== previous && !(item.state.createdAt > current.createdAt)).map(item => caches.delete(item.name)));
    if (current.firstInstall || current.requestedActivation) {
      /* JOBS_INITIAL_CLAIM */ await self.clients.claim();
    }
  })()));
  const trustedClient = source => {
    if (!source || source.type !== 'window' || !source.id) return false;
    try { const url = new URL(source.url); return url.origin === self.location.origin && url.href.startsWith(scope); }
    catch { return false; }
  };
  self.addEventListener('message', event => {
    if (!trustedClient(event.source)) return;
    const reply = value => event.ports?.[0]?.postMessage(value);
    const type = event.data?.type;
    if (type === 'JOBS_CLAIM_CLIENT') { event.waitUntil(self.clients.claim()); return; }
    if (type === 'JOBS_CACHE_STATUS') {
      event.waitUntil(cacheStatus().then(reply).catch(() => reply({ type, ready: false, error: 'Offline cache could not be read.' })));
    } else if (type === 'JOBS_PREPARE_OFFLINE') {
      event.waitUntil(prepare().then(cacheStatus).then(reply).catch(error => reply({ type: 'JOBS_CACHE_STATUS', ready: false, error: error.message })));
    } else if (type === 'JOBS_ACTIVATE_UPDATE') {
      event.waitUntil((async () => {
        const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(trustedClient);
        if (windows.length !== 1 || windows[0].id !== event.source.id) { reply({ type, activated: false, blocked: true, message: 'Close other Jobs windows and installed copies, then try again.' }); return; }
        const current = await readState(cacheName);
        await saveState({ ...current, requestedActivation: true });
        reply({ type, activated: true, blocked: false });
        await self.skipWaiting();
      })().catch(() => reply({ type, activated: false, message: 'The update could not be activated. Try again.' })));
    }
  });
  self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      const hit = await cache.match(request, { ignoreVary: true });
      if (hit) return hit;
      if (hashedAsset(url)) {
        const state = await (statePromise ||= readState(cacheName));
        if (state.previous) {
          const older = await caches.open(state.previous);
          const oldHit = await older.match(request, { ignoreVary: true });
          if (oldHit) return oldHit;
        }
      }
      try { return await fetch(request); }
      catch { return request.mode === 'navigate' ? (await cache.match(absolute('./index.html'), { ignoreVary: true })) || Response.error() : Response.error(); }
    })());
  });
}
