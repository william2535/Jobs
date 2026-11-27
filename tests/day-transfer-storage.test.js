import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IDBObjectStore } from 'fake-indexeddb';
import { loadState, saveState, openDB } from '../src/storage.js';
import { createQuickJob } from '../src/model.js';
import { startOfficeDay, finishOfficeDay, markOfficeDayPrepared, createDayReceipt, acknowledgeOfficeDay } from '../src/day-session.js';
import { createWorkspaceBackup, inspectWorkspaceBackup, restoreWorkspaceBackup } from '../src/workspace-backup.js';

const empty = () => ({ sites: [], jobs: [], quickDefects: [], unassignedTimesheets: [], assetTemplates: [], officeDays: [], officeReceipts: [] });
const assignmentId = `day-pack-${'a'.repeat(64)}`, returnId = `day-pack-${'b'.repeat(64)}`;

async function fixture() {
  const job = createQuickJob(null, { title: 'Synthetic office day job' });
  let state = { ...empty(), jobs: [job] };
  const started = startOfficeDay(state, { packId: assignmentId, engineer: 'Synthetic engineer', date: '2026-11-27', jobIds: [job.id], officeId: 'synthetic-office', at: '2026-11-27T08:00:00.000Z', localStart: '2026-11-27T08:00' });
  state = finishOfficeDay(started.state, started.day.id, { at: '2026-11-27T17:00:00.000Z', localFinish: '2026-11-27T17:00' }).state;
  state = markOfficeDayPrepared(state, started.day.id, returnId).state;
  const receipt = await createDayReceipt({ packId: returnId, dayId: started.day.id, officeId: 'synthetic-office', engineer: 'Synthetic engineer', receivedAt: '2026-11-27T17:05:00.000Z' });
  state = (await acknowledgeOfficeDay(state, started.day.id, receipt)).state;
  state.officeReceipts = [{ receipt, summary: { kind: 'return', date: '2026-11-27', engineer: 'Synthetic engineer', label: 'Synthetic returned day', officeId: 'synthetic-office', parentPackId: assignmentId, jobCount: 1, conflictCount: 0, attendanceMinutes: 540, unallocatedMinutes: 540 }, mappings: [{ sourceJobId: job.id, jobId: job.id, duplicate: false, conflict: false }] }];
  state.officeReceipts[0].day = { ...structuredClone(state.officeDays[0]), status: 'finished', preparedPackId: null, receipt: null, receiptHistory: [] };
  return state;
}

const metadata = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readonly'), request = tx.objectStore('metadata').getAll();
    tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error);
  });
};

test('office days, timesheets and actual return receipts reload and survive older callers omitting new keys', async () => {
  const state = await fixture();
  await saveState(state);
  assert.deepEqual(await loadState(), state);
  await saveState({ sites: [], jobs: state.jobs });
  const reloaded = await loadState();
  assert.deepEqual(reloaded, state);
  assert.equal(reloaded.officeDays[0].status, 'returned');
  assert.equal(reloaded.unassignedTimesheets.reduce((sum, item) => sum + item.hours, 0), 9);
  reloaded.officeDays[0].engineer = 'Unsaved edit';
  assert.deepEqual(await loadState(), state, 'loaded metadata does not mutate the stored copy');
});

test('either office metadata write failing rolls back jobs, time, receipt and revision together', async () => {
  const state = await fixture();
  await saveState(state);
  const before = await metadata();
  for (const key of ['office-days', 'office-receipts']) {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (this.name === 'metadata' && value.key === key) throw new DOMException('Synthetic office storage failure', 'QuotaExceededError');
      return originalPut.call(this, value, ...args);
    };
    try { await assert.rejects(saveState(empty()), /office storage failure/); }
    finally { IDBObjectStore.prototype.put = originalPut; }
    assert.deepEqual(await loadState(), state);
    assert.deepEqual(await metadata(), before);
  }
  const invalid = structuredClone(state);
  invalid.officeDays[0].status = 'automatically-delivered';
  await assert.rejects(saveState(invalid), /status/);
  assert.deepEqual(await loadState(), state);
});

test('stale tabs cannot overwrite a newer office day or return receipt', async () => {
  const other = await import('../src/storage.js?office-day-stale-tab');
  await saveState(empty());
  await other.loadState();
  const latest = await fixture();
  await saveState(latest);
  await assert.rejects(other.saveState(empty()), /Another Jobs tab/);
  assert.deepEqual(await loadState(), latest);
});

test('workspace backup carries office day and receipt history and protects nonempty receiving metadata', async () => {
  const state = await fixture(), before = structuredClone(state);
  const wire = await createWorkspaceBackup(state);
  const inspected = await inspectWorkspaceBackup(JSON.stringify(wire));
  assert.deepEqual(inspected.workspace, state);
  assert.equal(inspected.summary.officeDays, 1);
  assert.equal(inspected.summary.officeReceipts, 1);
  assert.deepEqual((await restoreWorkspaceBackup(empty(), wire)).state, state);
  for (const current of [{ ...empty(), officeDays: state.officeDays }, { ...empty(), officeReceipts: state.officeReceipts }])
    await assert.rejects(restoreWorkspaceBackup(current, wire), /empty job workspace/);
  assert.deepEqual(state, before);
});
