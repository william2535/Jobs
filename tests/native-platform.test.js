import test from 'node:test';
import assert from 'node:assert/strict';
import { ANDROID_APP_ORIGIN, EXPORT_CHUNK_BYTES, createNativePlatform, isNativePlatform, getNativePlatform } from '../src/native-platform.js';
import { startOffline } from '../src/offline.js';
import { installToolboxDOM, until } from './helpers/toolbox-dom.js';

const installed = { versionName: '1.0.0', versionCode: 1, applicationId: 'com.example.jobs', buildId: 'synthetic-native-build' };
function fixture(handler) {
  const requests = [], opened = [];
  const host = {
    location: { origin: ANDROID_APP_ORIGIN, pathname: '/assets/index.html' },
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    open: (...args) => opened.push(args),
    JobsNative: {
      onmessage: null,
      postMessage(value) {
        const request = JSON.parse(value);
        requests.push(request);
        queueMicrotask(() => handler?.(request, respond));
      },
    },
  };
  function respond(request, result, error) {
    host.JobsNative.onmessage?.({ data: JSON.stringify(error
      ? { id: request.id, ok: false, error }
      : { id: request.id, ok: true, result }) });
  }
  return { host, requests, opened, respond };
}

test('native capability requires the injected bridge at the fixed app origin and asset path', () => {
  const f = fixture();
  assert.equal(isNativePlatform(f.host), true);
  assert.equal(createNativePlatform({ host: { ...f.host, location: { origin: 'https://jobs.example.test', pathname: '/assets/index.html' } } }), null);
  assert.equal(createNativePlatform({ host: { ...f.host, location: { origin: ANDROID_APP_ORIGIN, pathname: '/outside/index.html' } } }), null);
  assert.equal(createNativePlatform({ host: { ...f.host, JobsNative: undefined } }), null);
});

test('large Unicode JSON survives byte-counted chunks and is not saved until the document picker confirms', async t => {
  const chunks = [], data = { title: 'Synthetic export only', notes: '🔥éµ𠮷'.repeat(80000) };
  let total = 0, finish;
  const f = fixture((request, respond) => {
    if (request.type === 'exportStart') respond(request, { token: 'synthetic-export' });
    else if (request.type === 'exportChunk') {
      const bytes = Buffer.from(request.data, 'base64');
      chunks.push(bytes); total += bytes.length;
      respond(request, { bytesWritten: total });
    } else if (request.type === 'exportFinish') finish = request;
  });
  const client = createNativePlatform({ host: f.host }); t.after(() => client.dispose());
  let settled = false;
  const operation = client.exportJson(data, 'synthetic.jobs.json').then(value => { settled = true; return value; });
  await until(() => finish);
  assert.equal(settled, false);
  assert.equal(client.isBusy, true);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every(bytes => bytes.length <= EXPORT_CHUNK_BYTES));
  assert.equal(f.requests[0].bytes, Buffer.byteLength(JSON.stringify(data)));
  assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString('utf8')), data);
  f.respond(finish, { status: 'saved', bytes: total });
  assert.equal((await operation).status, 'saved');
  assert.equal(client.isBusy, false);
});

test('truncated acknowledgements abandon temporary export and never call finish', async t => {
  let wrong = true, total = 0;
  const f = fixture((request, respond) => {
    if (request.type === 'exportStart') { total = 0; respond(request, { token: 'temporary-file' }); }
    else if (request.type === 'exportChunk') {
      total += Buffer.from(request.data, 'base64').length;
      respond(request, { bytesWritten: wrong ? total - 1 : total });
    } else if (request.type === 'exportCancel') respond(request, { status: 'cancelled' });
    else if (request.type === 'exportFinish') respond(request, { status: 'saved' });
  });
  const client = createNativePlatform({ host: f.host }); t.after(() => client.dispose());
  await assert.rejects(client.exportJson({ evidence: 'synthetic' }, 'evidence.json'), /not transferred completely/);
  assert.equal(f.requests.some(request => request.type === 'exportFinish'), false);
  assert.equal(f.requests.at(-1).type, 'exportCancel');
  assert.equal(client.isBusy, false);
  wrong = false;
  assert.equal((await client.exportJson({ evidence: 'retry' }, 'evidence.json')).status, 'saved');
});

test('native write failures clean up without converting failure into success', async t => {
  const f = fixture((request, respond) => {
    if (request.type === 'exportStart') respond(request, { token: 'failed-write' });
    else if (request.type === 'exportChunk') respond(request, null, 'Not enough device storage.');
    else if (request.type === 'exportCancel') respond(request, { status: 'cancelled' });
  });
  const client = createNativePlatform({ host: f.host }); t.after(() => client.dispose());
  await assert.rejects(client.exportJson({ notes: 'Keep the original saved job' }, 'job.json'), /Not enough device storage/);
  assert.deepEqual(f.requests.map(request => request.type), ['exportStart', 'exportChunk', 'exportCancel']);
});

test('picker cancellation is distinct from success and interactive actions do not use request timeouts', async t => {
  const f = fixture((request, respond) => {
    if (request.type === 'exportStart') respond(request, { token: 'cancelled-save' });
    else if (request.type === 'exportChunk') respond(request, { bytesWritten: Buffer.from(request.data, 'base64').length });
    else if (request.type === 'exportFinish') setTimeout(() => respond(request, { status: 'cancelled' }), 40);
  });
  const client = createNativePlatform({ host: f.host, requestTimeoutMs: 10 }); t.after(() => client.dispose());
  const first = client.exportJson({ retained: true }, 'retained.json');
  await assert.rejects(client.exportJson({ duplicate: true }, 'duplicate.json'), /already being exported/);
  assert.equal((await first).status, 'cancelled');
  assert.equal(client.isBusy, false);
});

test('native offline readiness verifies the packaged build without touching a service worker', async t => {
  const statuses = [], updates = [];
  const f = fixture((request, respond) => { if (request.type === 'info') respond(request, installed); });
  const nativePlatform = createNativePlatform({ host: f.host }); t.after(() => nativePlatform.dispose());
  const api = startOffline({
    nativePlatform, expectedBuildId: installed.buildId,
    serviceWorker: { register() { assert.fail('Bundled Android must not register a web service worker'); } },
    onStatus: value => statuses.push(value), onUpdate: value => updates.push(value),
  }); t.after(() => api.dispose());
  assert.equal(await api.retry(), true);
  assert.equal(statuses.at(-1), 'Ready offline · included in this app');
  assert.equal(updates.at(-1).available, false);
  await api.checkForUpdates();
  assert.equal(f.opened[0][0], 'https://play.google.com/store/apps/details?id=com.example.jobs');
  assert.equal(f.requests.filter(request => request.type === 'info').length, 1);
});

test('an installed build mismatch never reports offline readiness or suggests an update was applied', async t => {
  const statuses = [];
  let opened = 0;
  const api = startOffline({
    nativePlatform: { info: async () => installed, openUpdates: async () => { opened++; } },
    expectedBuildId: 'different-build', onStatus: value => statuses.push(value),
  }); t.after(() => api.dispose());
  assert.equal(await api.retry(), false);
  assert.equal(await api.applyUpdate(), false);
  assert.equal(opened, 0);
  assert.equal(statuses.some(value => value.startsWith('Ready offline')), false);
  assert.match(statuses.at(-1), /do not match/);
});

test('native print retains the prepared report until the actual print adapter finishes', async t => {
  installToolboxDOM(t);
  let printRequest;
  const f = fixture((request, respond) => { if (request.type === 'print') printRequest = request; });
  const oldBridge = Object.getOwnPropertyDescriptor(globalThis, 'JobsNative');
  Object.defineProperty(globalThis, 'JobsNative', { configurable: true, value: f.host.JobsNative });
  Object.defineProperty(globalThis, 'location', { configurable: true, writable: true, value: f.host.location });
  t.after(() => {
    getNativePlatform()?.dispose();
    if (oldBridge) Object.defineProperty(globalThis, 'JobsNative', oldBridge);
    else delete globalThis.JobsNative;
  });
  const { printServiceReport, clearPrintReport } = await import('../src/print-report.js');
  const report = document.createElement('article'); report.textContent = 'Synthetic saved report';
  window.print = () => assert.fail('The Android path must use the native print adapter');
  let finished = false;
  const printing = printServiceReport(() => report).then(value => { finished = true; return value; });
  await until(() => printRequest);
  assert.equal(finished, false);
  assert.equal(document.getElementById('print-report').textContent, report.textContent);
  assert.equal(clearPrintReport(), false, 'Cleanup must defer while Android still reads the DOM');
  assert.ok(document.getElementById('print-report'));
  f.respond(printRequest, { status: 'finished' });
  assert.equal(await printing, true);
  assert.equal(document.getElementById('print-report'), null);
});
