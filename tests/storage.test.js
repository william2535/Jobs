import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { loadState, saveState, openDB } from '../src/storage.js';
import { quickDefectFromRemark } from '../src/quick-defects.js';
import { newDeviceRemark } from '../src/device-remarks.js';
const withDefaults = state => ({ ...state, quickDefects: state.quickDefects || [] });

test('IndexedDB persists complete structured records across loads', async () => {
  const state = { sites: [{ id: 'site-1', name: 'Synthetic site', drawings: [{ id: 'drawing-1', source: { geometry: [[0, 0], [1, 1]] } }] }], jobs: [{ id: 'job-1', siteId: 'site-1', results: [{ id: 'r-1', photos: [{ id: 'p-1', image: 'data:image/png;base64,AAAA' }] }] }] };
  await saveState(state);
  const loaded = await loadState();
  assert.deepEqual(loaded, withDefaults(state));
  loaded.jobs[0].results[0].notes = 'Unsaved change';
  assert.deepEqual(await loadState(), withDefaults(state), 'loaded data is independent of stored data');
});

test('failed transaction preserves the previous local state', async () => {
  const state = { sites: [{ id: 'site-safe' }], jobs: [{ id: 'job-safe' }] };
  await saveState(state);
  await assert.rejects(saveState({ sites: [{ id: 'replacement' }], jobs: [{ id: 'bad-job', unsupported: () => {} }] }));
  assert.deepEqual(await loadState(), withDefaults(state));
  await assert.rejects(saveState({ sites: [{ id: 'same' }, { id: 'same' }], jobs: [] }), /Duplicate/);
  assert.deepEqual(await loadState(), withDefaults(state));
});

test('stale tabs cannot silently overwrite a newer local snapshot', async () => {
  const otherTab = await import('../src/storage.js?another-tab');
  await saveState({ sites: [{ id: 'site-initial' }], jobs: [] });
  await otherTab.loadState();
  const newest = { sites: [{ id: 'site-newer' }], jobs: [{ id: 'job-newer' }] };
  await saveState(newest);
  await assert.rejects(otherTab.saveState({ sites: [], jobs: [] }), /Another Jobs tab/);
  assert.deepEqual(await loadState(), withDefaults(newest));
  await otherTab.loadState();
  await otherTab.saveState({ sites: [], jobs: [] });
  assert.deepEqual(await loadState(), { sites: [], jobs: [], quickDefects: [] });
});

test('old metadata loads an empty library, and older snapshot writes retain a later saved library', async () => {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readwrite');
    tx.objectStore('metadata').delete('quick-defects');
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
  });
  assert.deepEqual((await loadState()).quickDefects, []);
  const template = quickDefectFromRemark(newDeviceRemark('Battery backup'));
  await saveState({ sites: [], jobs: [], quickDefects: [template] });
  await saveState({ sites: [{ id: 'legacy-site-write' }], jobs: [{ id: 'legacy-job-write' }] });
  const loaded = await loadState();
  assert.deepEqual(loaded.quickDefects, [template]);
  loaded.quickDefects[0].title = 'Unsaved wording';
  assert.deepEqual((await loadState()).quickDefects, [template]);
  await saveState({ sites: loaded.sites, jobs: loaded.jobs, quickDefects: [] });
  assert.deepEqual((await loadState()).quickDefects, [], 'explicit empty array clears the library');
});

test('library write failures and invalid templates leave jobs, sites, library and revision intact', async () => {
  const template = quickDefectFromRemark(newDeviceRemark());
  const state = { sites: [{ id: 'safe-site' }], jobs: [{ id: 'safe-job' }], quickDefects: [template] };
  await saveState(state);
  const db = await openDB();
  const metadata = () => new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readonly'), request = tx.objectStore('metadata').getAll();
    tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error);
  });
  const beforeMetadata = await metadata();
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function(value, ...args) {
    if (this.name === 'metadata' && value.key === 'quick-defects') throw new DOMException('Synthetic storage failure', 'QuotaExceededError');
    return originalPut.call(this, value, ...args);
  };
  try {
    await assert.rejects(saveState({ sites: [], jobs: [], quickDefects: [] }), /storage failure/);
  } finally { IDBObjectStore.prototype.put = originalPut; }
  assert.deepEqual(await loadState(), state);
  assert.deepEqual(await metadata(), beforeMetadata);
  await assert.rejects(saveState({ sites: [], jobs: [], quickDefects: [{ ...template, internalNote: 'Not reusable' }] }), /invalid structure/);
  assert.deepEqual(await loadState(), state);
  assert.deepEqual(await metadata(), beforeMetadata);
});

test('library saves participate in stale-tab protection with the complete workspace', async () => {
  const otherTab = await import('../src/storage.js?quick-defect-tab');
  await saveState({ sites: [], jobs: [], quickDefects: [] });
  await otherTab.loadState();
  const template = quickDefectFromRemark(newDeviceRemark('Customer advice given'));
  const latest = { sites: [], jobs: [{ id: 'latest-job' }], quickDefects: [template] };
  await saveState(latest);
  await assert.rejects(otherTab.saveState({ sites: [], jobs: [], quickDefects: [] }), /Another Jobs tab/);
  assert.deepEqual(await loadState(), latest);
});
