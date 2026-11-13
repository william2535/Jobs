import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { loadState, saveState } from '../src/storage.js';

test('IndexedDB persists complete structured records across loads', async () => {
  const state = { sites: [{ id: 'site-1', name: 'Synthetic site', drawings: [{ id: 'drawing-1', source: { geometry: [[0, 0], [1, 1]] } }] }], jobs: [{ id: 'job-1', siteId: 'site-1', results: [{ id: 'r-1', photos: [{ id: 'p-1', image: 'data:image/png;base64,AAAA' }] }] }] };
  await saveState(state);
  const loaded = await loadState();
  assert.deepEqual(loaded, state);
  loaded.jobs[0].results[0].notes = 'Unsaved change';
  assert.deepEqual(await loadState(), state, 'loaded data is independent of stored data');
});

test('failed transaction preserves the previous local state', async () => {
  const state = { sites: [{ id: 'site-safe' }], jobs: [{ id: 'job-safe' }] };
  await saveState(state);
  await assert.rejects(saveState({ sites: [{ id: 'replacement' }], jobs: [{ id: 'bad-job', unsupported: () => {} }] }));
  assert.deepEqual(await loadState(), state);
  await assert.rejects(saveState({ sites: [{ id: 'same' }, { id: 'same' }], jobs: [] }), /Duplicate/);
  assert.deepEqual(await loadState(), state);
});

test('stale tabs cannot silently overwrite a newer local snapshot', async () => {
  const otherTab = await import('../src/storage.js?another-tab');
  await saveState({ sites: [{ id: 'site-initial' }], jobs: [] });
  await otherTab.loadState();
  const newest = { sites: [{ id: 'site-newer' }], jobs: [{ id: 'job-newer' }] };
  await saveState(newest);
  await assert.rejects(otherTab.saveState({ sites: [], jobs: [] }), /Another Jobs tab/);
  assert.deepEqual(await loadState(), newest);
  await otherTab.loadState();
  await otherTab.saveState({ sites: [], jobs: [] });
  assert.deepEqual(await loadState(), { sites: [], jobs: [] });
});
