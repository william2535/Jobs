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
  const stalled = fixture(); stalled.container.register = () => new Promise(() => {});
  const api = startOffline({ ...stalled.options, timeoutMs: 15 }); t.after(() => api.dispose());
  assert.equal(await api.retry(), false);
  assert.match(stalled.statuses.at(-1), /registration timed out/);
  const old = fixture(); old.worker.reply = false;
  const legacy = startOffline({ ...old.options, messageTimeoutMs: 15 }); t.after(() => legacy.dispose());
  assert.equal(await legacy.retry(), false);
  assert.match(old.statuses.at(-1), /Close other Jobs windows/);
  assert.equal(old.statuses.includes('Ready offline'), false);
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
