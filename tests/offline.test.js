import test from 'node:test';
import assert from 'node:assert/strict';
import { startOffline } from '../src/offline.js';

function channel() {
  const port1 = { onmessage: null, start() {}, close() { this.onmessage = null; } };
  const port2 = { postMessage(data) { queueMicrotask(() => port1.onmessage?.({ data })); }, close() {} };
  return { port1, port2 };
}
class Target extends EventTarget {
  listeners = new Set();
  addEventListener(type, callback, options) { super.addEventListener(type, callback, options); this.listeners.add(callback); }
  removeEventListener(type, callback, options) { super.removeEventListener(type, callback, options); this.listeners.delete(callback); }
}
function fixture({ controlled = true } = {}) {
  const statuses = [], updates = [], requests = [];
  const container = new Target(), registration = new Target(), worker = new Target();
  worker.state = 'activated';
  worker.ready = true; worker.buildId = 'test-build'; worker.reply = true; worker.repair = true;
  worker.postMessage = (message, ports) => {
    requests.push(message.type);
    if (message.type === 'JOBS_CLAIM_CLIENT') { container.controller = worker; container.dispatchEvent(new Event('controllerchange')); return; }
    if (!worker.reply) return;
    if (message.type === 'JOBS_PREPARE_OFFLINE' && worker.repair) worker.ready = true;
    ports?.[0]?.postMessage({ type: 'JOBS_CACHE_STATUS', ready: worker.ready, buildId: worker.buildId, error: worker.ready ? undefined : 'Device cache is full.' });
  };
  registration.active = worker; registration.installing = null; registration.waiting = null;
  registration.update = async () => {};
  container.controller = controlled ? worker : null;
  container.register = async () => registration;
  container.ready = Promise.resolve(registration);
  const options = { serviceWorker: container, createChannel: channel, timeoutMs: 80, messageTimeoutMs: 30, expectedBuildId: 'test-build', onStatus: value => statuses.push(value), onUpdate: value => updates.push(value) };
  return { container, registration, worker, statuses, updates, requests, options };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await delay(2);
  }
  assert.fail('Offline recovery did not complete.');
}

test('first installation requests a missed claim and verifies the cached current build before readiness', async t => {
  const f = fixture({ controlled: false });
  const api = startOffline(f.options); t.after(() => api.dispose());
  assert.equal(await api.retry(), true);
  assert.deepEqual(f.requests, ['JOBS_CLAIM_CLIENT', 'JOBS_CACHE_STATUS']);
  assert.equal(f.statuses.at(-1), 'Ready offline');
  assert.equal(f.updates.at(-1).available, false);
});

test('missing offline files are repaired, while a failed repair remains visible and can be retried', async t => {
  const f = fixture(); f.worker.ready = false; f.worker.repair = false;
  const api = startOffline(f.options); t.after(() => api.dispose());
  assert.equal(await api.retry(), false);
  assert.equal(f.statuses.at(-1), 'Device cache is full.');
  assert.equal(f.statuses.includes('Ready offline'), false);
  f.worker.repair = true;
  assert.equal(await api.retry(), true);
  assert.equal(f.statuses.at(-1), 'Ready offline');
  assert.equal(f.requests.filter(type => type === 'JOBS_PREPARE_OFFLINE').length, 2);
});

test('a redundant first-install worker fails promptly and a later retry can prepare successfully', async t => {
  const f = fixture({ controlled: false });
  const installing = new Target(); installing.state = 'installing';
  f.registration.active = null; f.registration.installing = installing;
  f.container.ready = new Promise(() => {});
  const api = startOffline(f.options); t.after(() => api.dispose());
  const pending = api.retry();
  await delay(2); installing.state = 'redundant'; f.registration.installing = null; installing.dispatchEvent(new Event('statechange'));
  assert.equal(await pending, false);
  assert.match(f.statuses.at(-1), /failed while saving/);
  f.registration.active = f.worker; f.registration.installing = null;
  assert.equal(await api.retry(), true);
  assert.equal(f.statuses.at(-1), 'Ready offline');
});

test('registration and unresponsive legacy workers time out rather than showing a false ready state', async t => {
  const stalled = fixture({ controlled: false }); stalled.container.register = () => new Promise(() => {});
  const api = startOffline({ ...stalled.options, timeoutMs: 15 }); t.after(() => api.dispose());
  assert.equal(await api.retry(), false);
  assert.match(stalled.statuses.at(-1), /registration timed out/);
  const old = fixture(); old.worker.reply = false;
  const legacy = startOffline({ ...old.options, messageTimeoutMs: 15 }); t.after(() => legacy.dispose());
  assert.equal(await legacy.retry(), false);
  assert.match(old.statuses.at(-1), /Close other Jobs windows/);
  assert.equal(old.statuses.includes('Ready offline'), false);
});

test('an installed current cache is verified without waiting for a hung or failed network registration', async t => {
  for (const register of [() => new Promise(() => {}), () => Promise.reject(Error('Network is offline.'))]) {
    const f = fixture(); f.container.register = register;
    const api = startOffline({ ...f.options, timeoutMs: 15 }); t.after(() => api.dispose());
    assert.equal(await api.retry(), true);
    assert.deepEqual(f.requests, ['JOBS_CACHE_STATUS']);
    await delay(20);
    assert.equal(f.statuses.at(-1), 'Ready offline');
    assert.equal(f.statuses.some(value => /registration timed out|Network is offline/.test(value)), false);
  }
});

test('a retained active registration can claim and verify offline while registration is stalled', async t => {
  const f = fixture({ controlled: false });
  f.container.register = () => new Promise(() => {});
  f.container.getRegistration = async () => f.registration;
  const api = startOffline({ ...f.options, timeoutMs: 15 }); t.after(() => api.dispose());
  assert.equal(await api.retry(), true);
  assert.equal(f.container.controller, f.worker);
  assert.deepEqual(f.requests, ['JOBS_CLAIM_CLIENT', 'JOBS_CACHE_STATUS']);
});

test('late first registration recovers a timed-out startup only after cache and build verification', async t => {
  const f = fixture({ controlled: false }); let resolveRegistration;
  f.container.register = () => new Promise(resolve => { resolveRegistration = resolve; });
  const api = startOffline({ ...f.options, timeoutMs: 15 }); t.after(() => api.dispose());
  assert.equal(await api.retry(), false);
  assert.match(f.statuses.at(-1), /registration timed out/);
  assert.equal(f.statuses.includes('Ready offline'), false);
  resolveRegistration(f.registration);
  await until(() => f.statuses.at(-1) === 'Ready offline');
  assert.equal(f.container.controller, f.worker);
  assert.ok(f.requests.includes('JOBS_CACHE_STATUS'));
});

test('an active worker which finishes activating after the preparation timeout is reverified', async t => {
  const f = fixture({ controlled: false });
  f.worker.state = 'activating'; f.container.ready = new Promise(() => {});
  const api = startOffline({ ...f.options, timeoutMs: 15 }); t.after(() => api.dispose());
  assert.equal(await api.retry(), false);
  assert.match(f.statuses.at(-1), /preparation timed out/);
  f.worker.state = 'activated'; f.worker.dispatchEvent(new Event('statechange'));
  await until(() => f.statuses.at(-1) === 'Ready offline');
  assert.equal(f.container.controller, f.worker);
});

test('an existing controller never substitutes for missing, unresponsive or mismatched cache evidence', async t => {
  for (const kind of ['missing', 'unresponsive', 'mismatched']) {
    const f = fixture(); f.container.register = () => new Promise(() => {});
    if (kind === 'missing') { f.worker.ready = false; f.worker.repair = false; }
    if (kind === 'unresponsive') f.worker.reply = false;
    if (kind === 'mismatched') f.worker.buildId = 'previous-build';
    const api = startOffline({ ...f.options, timeoutMs: 15, messageTimeoutMs: 10 }); t.after(() => api.dispose());
    assert.equal(await api.retry(), false);
    assert.equal(f.statuses.includes('Ready offline'), false);
    assert.doesNotMatch(f.statuses.at(-1), /registration timed out/);
    if (kind === 'mismatched') assert.equal(f.requests.includes('JOBS_PREPARE_OFFLINE'), false);
  }
});

test('late registration completion exposes an update without erasing readiness or automatically activating it', async t => {
  const f = fixture(); let resolveRegistration;
  f.container.register = () => new Promise(resolve => { resolveRegistration = resolve; });
  const waiting = new Target(); waiting.state = 'installed'; let activations = 0;
  waiting.postMessage = () => { activations++; };
  const api = startOffline(f.options); t.after(() => api.dispose());
  assert.equal(await api.retry(), true);
  f.registration.waiting = waiting; resolveRegistration(f.registration);
  await until(() => f.updates.at(-1)?.available === true);
  assert.equal(f.statuses.at(-1), 'Ready offline');
  assert.equal(activations, 0);
});

test('a deliberate update check can find the existing registration after a cached offline startup', async t => {
  const f = fixture(); let checks = 0;
  f.container.register = () => new Promise(() => {});
  f.container.getRegistration = async () => f.registration;
  f.registration.update = async () => { checks++; throw Error('Network is offline.'); };
  const api = startOffline(f.options); t.after(() => api.dispose());
  assert.equal(await api.retry(), true);
  assert.equal(await api.checkForUpdates(), false);
  assert.equal(checks, 1);
  assert.match(f.statuses.at(-1), /^Ready offline · update check unavailable/);
});

test('a late first install with incomplete cache does not turn its timeout into a false success', async t => {
  const f = fixture({ controlled: false }); let resolveRegistration;
  f.worker.ready = false; f.worker.repair = false;
  f.container.register = () => new Promise(resolve => { resolveRegistration = resolve; });
  const api = startOffline({ ...f.options, timeoutMs: 15 }); t.after(() => api.dispose());
  assert.equal(await api.retry(), false);
  resolveRegistration(f.registration);
  await until(() => f.statuses.at(-1) === 'Device cache is full.');
  assert.equal(f.statuses.includes('Ready offline'), false);
});

test('disposing before late registration completion prevents recovery and listener installation', async () => {
  const f = fixture({ controlled: false }); let resolveRegistration;
  f.container.register = () => new Promise(resolve => { resolveRegistration = resolve; });
  const api = startOffline({ ...f.options, timeoutMs: 15 });
  assert.equal(await api.retry(), false);
  api.dispose(); const count = f.statuses.length;
  resolveRegistration(f.registration); await delay(5);
  assert.equal(f.statuses.length, count);
  assert.equal(f.registration.listeners.size, 0);
  assert.equal(f.container.listeners.size, 0);
  assert.equal(f.requests.length, 0);
});

test('a previous worker reply cannot announce readiness after the page controller changes', async t => {
  const f = fixture(); let oldReply;
  f.worker.postMessage = (message, ports) => { oldReply = ports[0]; };
  const replacement = new Target(); replacement.state = 'activated';
  replacement.postMessage = (message, ports) => ports[0].postMessage({ ready: false, buildId: 'different-build' });
  const api = startOffline(f.options); t.after(() => api.dispose());
  const initial = api.retry(); await until(() => !!oldReply);
  f.registration.active = replacement; f.container.controller = replacement;
  f.container.dispatchEvent(new Event('controllerchange'));
  oldReply.postMessage({ ready: true, buildId: 'test-build' });
  assert.equal(await initial, false);
  await until(() => /This app version is not prepared offline/.test(f.statuses.at(-1)));
  assert.equal(f.statuses.includes('Ready offline'), false);
});

test('a controller change invalidates earlier verified readiness and checks the replacement cache', async t => {
  const f = fixture(); const api = startOffline(f.options); t.after(() => api.dispose());
  assert.equal(await api.retry(), true);
  const requests = [], replacement = new Target(); replacement.state = 'activated';
  replacement.postMessage = (message, ports) => {
    requests.push(message.type);
    ports[0].postMessage({ ready: false, buildId: 'test-build', error: 'Replacement cache is incomplete.' });
  };
  f.registration.active = replacement; f.container.controller = replacement;
  f.container.dispatchEvent(new Event('controllerchange'));
  await until(() => f.statuses.at(-1) === 'Replacement cache is incomplete.');
  assert.deepEqual(requests, ['JOBS_CACHE_STATUS', 'JOBS_PREPARE_OFFLINE']);
});

test('retiring an old active worker is not labelled as a failed update download', async t => {
  const f = fixture(); const api = startOffline(f.options); t.after(() => api.dispose());
  assert.equal(await api.retry(), true);
  f.worker.state = 'redundant'; f.worker.dispatchEvent(new Event('statechange'));
  assert.equal(f.statuses.at(-1), 'Ready offline');
  const installing = new Target(); installing.state = 'installing';
  f.registration.installing = installing; f.registration.dispatchEvent(new Event('updatefound'));
  installing.state = 'redundant'; installing.dispatchEvent(new Event('statechange'));
  assert.match(f.statuses.at(-1), /Ready offline · update download failed/);
});

test('explicit retry supersedes hung registration and ignores obsolete registration and discovery results', async t => {
  const f = fixture({ controlled: false });
  let registrations = 0, discoveries = 0, oldRegister, oldDiscovery, currentChecks = 0, obsoleteChecks = 0;
  f.container.register = () => ++registrations === 1 ? new Promise(resolve => { oldRegister = resolve; }) : Promise.resolve(f.registration);
  f.container.getRegistration = () => ++discoveries === 1 ? new Promise(resolve => { oldDiscovery = resolve; }) : Promise.resolve(f.registration);
  f.registration.update = async () => { currentChecks++; };
  const api = startOffline({ ...f.options, timeoutMs: 15 }); t.after(() => api.dispose());
  assert.equal(await api.retry(), false);
  assert.match(f.statuses.at(-1), /registration timed out/);
  assert.equal(await api.retry(), true);
  assert.equal(registrations, 2);
  const obsolete = new Target(); obsolete.active = f.worker; obsolete.waiting = new Target();
  obsolete.update = async () => { obsoleteChecks++; };
  oldRegister(obsolete); oldDiscovery(obsolete); await delay(5);
  assert.equal(f.statuses.at(-1), 'Ready offline');
  assert.equal(f.updates.at(-1).available, false);
  assert.equal(await api.checkForUpdates(), false);
  assert.equal(currentChecks, 1); assert.equal(obsoleteChecks, 0);
  assert.equal(obsolete.listeners.size, 0);
});

test('an active cache for a different build is not reported ready for the current app', async t => {
  const f = fixture(); f.worker.buildId = 'previous-build';
  const api = startOffline(f.options); t.after(() => api.dispose());
  assert.equal(await api.retry(), false);
  assert.match(f.statuses.at(-1), /This app version is not prepared offline/);
});

test('updates require an explicit request, honor blocked other windows and resolve only after controller change', async t => {
  const f = fixture(), waiting = new Target(); waiting.state = 'installed'; let blocked = true, activations = 0;
  waiting.postMessage = (message, ports) => {
    assert.equal(message.type, 'JOBS_ACTIVATE_UPDATE'); activations++;
    ports[0].postMessage({ activated: !blocked, blocked, message: blocked ? 'Close other Jobs windows and try again.' : '' });
    if (!blocked) queueMicrotask(() => { f.container.controller = waiting; f.registration.active = waiting; f.registration.waiting = null; f.container.dispatchEvent(new Event('controllerchange')); });
  };
  f.registration.waiting = waiting;
  const api = startOffline(f.options); t.after(() => api.dispose());
  assert.equal(await api.retry(), true);
  assert.equal(f.updates.at(-1).available, true); assert.equal(activations, 0);
  assert.equal(await api.applyUpdate(), false);
  assert.equal(f.updates.at(-1).blocked, true);
  assert.equal(f.container.controller, f.worker);
  blocked = false;
  assert.equal(await api.applyUpdate(), true);
  assert.equal(f.container.controller, waiting);
  assert.equal(f.updates.at(-1).available, false);
});

test('disposal cancels bounded waits and removes update/controller listeners without later callbacks', async () => {
  const f = fixture(); f.worker.reply = false;
  const api = startOffline(f.options), pending = api.retry();
  await delay(2); api.dispose();
  assert.equal(await pending, false);
  const count = f.statuses.length;
  await delay(3);
  assert.equal(f.statuses.length, count);
  assert.equal(f.registration.listeners.size, 0);
  assert.equal(f.container.listeners.size, 0);
  assert.equal(await api.retry(), false);
});
