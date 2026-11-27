import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickJob } from '../src/model.js';
import { saveTimesheet, timesheetEntries, minutesForTimesheet } from '../src/timesheets.js';
import { startOfficeDay, finishOfficeDay, activeOfficeDay, validateOfficeDays, markOfficeDayPrepared, createDayReceipt, acknowledgeOfficeDay, inspectDayReceipt } from '../src/day-session.js';

const packId = `day-pack-${'a'.repeat(64)}`, returnedId = `day-pack-${'b'.repeat(64)}`;
const base = () => ({ sites: [], jobs: [createQuickJob(), createQuickJob()], unassignedTimesheets: [], officeDays: [] });
const begin = state => startOfficeDay(state, { packId, officeId: 'office-1', engineer: 'Alice', date: '2026-11-27', jobIds: [state.jobs[0].id], at: '2026-11-27T08:00:00.000Z', localStart: '2026-11-27T08:00' });
const entry = extra => ({ id: crypto.randomUUID(), date: '2026-11-27', start: '09:00', end: '10:00', endDate: '2026-11-27', sessionType: 'Work', customType: '', hours: null, note: '', engineer: 'Alice', ...extra });

test('collecting starts one saved day candidate and repeated taps never finish it or create another timer', () => {
  const state = base(), before = structuredClone(state), started = begin(state);
  assert.deepEqual(state, before);
  assert.equal(activeOfficeDay(started.state).id, started.day.id);
  const repeated = begin(started.state);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.day.id, started.day.id);
  assert.deepEqual(repeated.state, started.state);
  assert.equal(repeated.day.status, 'running');
  assert.deepEqual(repeated.state.unassignedTimesheets, []);
  assert.throws(() => startOfficeDay(state, { packId, officeId: 'office-1', engineer: 'Alice', jobIds: ['not-saved'], at: '2026-11-27T08:00:00.000Z', localStart: '2026-11-27T08:00' }), /Save every job/);
  assert.throws(() => startOfficeDay(started.state, { packId: returnedId, officeId: 'office-1', engineer: 'Alice', jobIds: [state.jobs[0].id] }), /Finish the current/);
});

test('finishing fills only uncovered shift time and carries existing travel, breaks and additional worked jobs', () => {
  let state = base(); const first = state.jobs[0].id, extra = state.jobs[1].id;
  state = saveTimesheet(state, entry({ id: 'work-one', start: '09:00', end: '11:00' }), { jobId: first });
  state = saveTimesheet(state, entry({ id: 'work-extra', start: '13:00', end: '15:00' }), { jobId: extra });
  state = saveTimesheet(state, entry({ id: 'travel', start: '08:00', end: '09:00', sessionType: 'Travel' }));
  state = saveTimesheet(state, entry({ id: 'break', start: '12:00', end: '13:00', sessionType: 'Break' }));
  const started = begin(state), before = structuredClone(started.state);
  const result = finishOfficeDay(started.state, started.day.id, { at: '2026-11-27T16:00:00.000Z', localFinish: '2026-11-27T16:00' });
  assert.deepEqual(started.state, before);
  assert.equal(result.day.status, 'finished');
  assert.equal(activeOfficeDay(result.state), null);
  assert.deepEqual(result.day.jobIds, [first, extra]);
  assert.deepEqual(result.state.jobs, state.jobs, 'entered job work is unchanged');
  const gaps = result.state.unassignedTimesheets.filter(value => value.id.startsWith(`${result.day.id}:unallocated:`));
  assert.deepEqual(gaps.map(value => [value.start, value.end]), [['11:00', '12:00'], ['15:00', '16:00']]);
  assert.equal(timesheetEntries(result.state).reduce((sum, row) => sum + minutesForTimesheet(row.entry), 0), 8 * 60);
  assert.deepEqual(result.day.timesheetEntryIds, ['travel', 'break', ...gaps.map(value => value.id)]);
  const repeat = finishOfficeDay(result.state, result.day.id, { at: '2026-11-27T17:00:00.000Z', localFinish: '2026-11-27T17:00' });
  assert.equal(repeat.duplicate, true); assert.deepEqual(repeat.state, result.state);
});

test('overnight attendance is one continuous interval and invalid clocks or unknown hours cannot invent time', () => {
  const state = base();
  const started = startOfficeDay(state, { packId, officeId: 'office-1', engineer: 'Alice', date: '2026-11-27', jobIds: [state.jobs[0].id], at: '2026-11-27T23:30:00.000Z', localStart: '2026-11-27T23:30' });
  const result = finishOfficeDay(started.state, started.day.id, { at: '2026-11-28T01:15:00.000Z', localFinish: '2026-11-28T01:15' });
  const saved = result.state.unassignedTimesheets[0];
  assert.equal(saved.date, '2026-11-27'); assert.equal(saved.endDate, '2026-11-28'); assert.equal(saved.hours, 1.75);
  assert.throws(() => finishOfficeDay(started.state, started.day.id, { at: '2026-11-27T22:00:00.000Z', localFinish: '2026-11-27T22:00' }), /Finish the day/);
  let ambiguous = saveTimesheet(state, entry({ start: '', end: '', hours: 2 }));
  ambiguous = begin(ambiguous);
  assert.throws(() => finishOfficeDay(ambiguous.state, ambiguous.day.id, { at: '2026-11-27T16:00:00.000Z', localFinish: '2026-11-27T16:00' }), /hours-only/);
});

test('preparing or sharing is not office delivery; only a matching intact return receipt changes its status', async () => {
  const started = begin(base()), finished = finishOfficeDay(started.state, started.day.id, { at: '2026-11-27T16:00:00.000Z', localFinish: '2026-11-27T16:00' });
  const pending = markOfficeDayPrepared(finished.state, finished.day.id, returnedId);
  assert.equal(pending.day.status, 'finished'); assert.equal(pending.day.receipt, null);
  const receipt = await createDayReceipt({ packId: returnedId, dayId: pending.day.id, officeId: pending.day.officeId, engineer: pending.day.engineer, receivedAt: '2026-11-27T16:05:00.000Z' });
  await assert.rejects(() => acknowledgeOfficeDay(pending.state, pending.day.id, { ...receipt, officeId: 'another-office' }), /checksum/);
  const wrongPack = await createDayReceipt({ packId, dayId: pending.day.id, officeId: pending.day.officeId, engineer: pending.day.engineer });
  await assert.rejects(() => acknowledgeOfficeDay(pending.state, pending.day.id, wrongPack), /does not acknowledge/);
  const accepted = await acknowledgeOfficeDay(pending.state, pending.day.id, JSON.stringify(receipt));
  assert.equal(accepted.day.status, 'returned'); assert.deepEqual(accepted.day.receipt, receipt);
  assert.equal((await acknowledgeOfficeDay(accepted.state, accepted.day.id, receipt)).duplicate, true);
  const amended = markOfficeDayPrepared(accepted.state, accepted.day.id, `day-pack-${'c'.repeat(64)}`);
  assert.equal(amended.day.status, 'finished'); assert.equal(amended.day.receipt, null); assert.deepEqual(amended.day.receiptHistory, [receipt]);
  assert.deepEqual(await inspectDayReceipt(JSON.stringify(receipt)), receipt);
});

test('day metadata rejects unsupported claims, duplicate active shifts and mismatched receipt identities', () => {
  const { day } = begin(base());
  for (const mutate of [value => value.status = 'uploaded', value => value.finishedAt = '2026-11-27T08:01:00.000Z', value => value.timesheetEntryIds.push('invented'), value => value.approved = true, value => value.jobIds.push(value.jobIds[0])]) {
    const bad = structuredClone(day); mutate(bad); assert.throws(() => validateOfficeDays([bad]));
  }
  assert.throws(() => validateOfficeDays([day, { ...day, id: 'other-day' }]), /one office day/);
});
