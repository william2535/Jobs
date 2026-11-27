import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickJob } from '../src/model.js';
import { createJobPackage } from '../src/packages.js';
import { createDayPack } from '../src/day-pack.js';
import { startOfficeDay, finishOfficeDay } from '../src/day-session.js';
import { saveTimesheet } from '../src/timesheets.js';
import { prepareOfficeImport } from '../src/office-import.js';

const empty = () => ({ jobs: [], sites: [], officeDays: [], officeReceipts: [], unassignedTimesheets: [] });
const file = (value, name = 'synthetic.jobsday.json') => new File([JSON.stringify(value)], name, { type: 'application/json' });
async function returned(engineer) {
  const job = createQuickJob(null, { title: `Synthetic ${engineer} visit`, engineer });
  let state = { ...empty(), jobs: [job] };
  const assignment = await createDayPack(state, { jobIds: [job.id], engineer, date: '2026-11-27', officeId: 'synthetic-office' });
  const started = startOfficeDay(state, { packId: assignment.packId, jobIds: [job.id], engineer, officeId: assignment.officeId, date: assignment.date, at: '2026-11-27T08:00:00Z', localStart: '2026-11-27T08:00' });
  state = saveTimesheet(started.state, { id: `time-${engineer}`, engineer, date: assignment.date, start: '08:00', end: '16:00', endDate: assignment.date, sessionType: 'Work', customType: '', hours: null, note: 'Synthetic work' }, { jobId: job.id });
  const finished = finishOfficeDay(state, started.day.id, { at: '2026-11-27T16:00:00Z', localFinish: '2026-11-27T16:00' });
  return createDayPack(finished.state, { kind: 'return', day: finished.day });
}

test('one upload retains each engineer tag and ordinary legacy job without starting a PC timer', async () => {
  const original = empty(), before = structuredClone(original);
  const first = await returned('Alex'), second = await returned('Casey');
  const legacy = await createJobPackage(null, createQuickJob(null, { title: 'Synthetic unassigned job' }));
  const result = await prepareOfficeImport(original, [file(first), file(second), file(legacy, 'legacy.jobs.json')]);
  assert.deepEqual(original, before);
  assert.equal(result.state.jobs.length, 3);
  assert.deepEqual(result.state.officeDays, []);
  assert.deepEqual(result.state.officeReceipts.map(record => record.receipt.engineer), ['Alex', 'Casey']);
  assert.deepEqual(result.state.jobs.map(job => job.engineer).sort(), ['', 'Alex', 'Casey']);
  const repeated = await prepareOfficeImport(result.state, [file(first), file(second)]);
  assert.equal(repeated.duplicates, 2);
  assert.equal(repeated.state.jobs.length, 3);
  assert.equal(repeated.state.officeReceipts.length, 2);
});

test('a rejected later file never mutates the original workspace or exposes a partial batch', async () => {
  const original = empty(), before = structuredClone(original);
  await assert.rejects(prepareOfficeImport(original, [file(await returned('Alex')), file({ format: 'JobsDayPack', version: 99 }, 'broken.json')]), /broken.json:.*No files.*saved/);
  assert.deepEqual(original, before);
  await assert.rejects(prepareOfficeImport(original, [file({ format: 'JobsDayReceipt' })]), /return receipt/);
});

test('batch limits reject before reading oversized files', async () => {
  let reads = 0;
  const huge = { name: 'large.json', size: 101 * 1024 * 1024, text: () => { reads++; return '{}'; } };
  await assert.rejects(prepareOfficeImport(empty(), [huge]), /100 MiB/);
  await assert.rejects(prepareOfficeImport(empty(), Array(21).fill({ ...huge, size: 1 })), /1 and 20/);
  await assert.rejects(prepareOfficeImport(empty(), Array(3).fill({ ...huge, size: 80 * 1024 * 1024 })), /200 MiB/);
  assert.equal(reads, 0);
});
