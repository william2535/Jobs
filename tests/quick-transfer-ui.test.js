import test from 'node:test';
import assert from 'node:assert/strict';
import { renderQuickTransfer } from '../src/quick-transfer.js';
import { installToolboxDOM, mountToolbox, field, click, submit, until } from './helpers/toolbox-dom.js';

const job = { id: 'job-one', workflow: { details: { title: 'First synthetic job' } } };
const another = { id: 'job-two', workflow: { details: { title: 'Second synthetic job' } } };
const date = '2026-11-27';
const running = { id: 'day-one', engineer: 'Engineer One', date, status: 'running', jobIds: [job.id], startedAt: '2026-11-27T08:00:00.000Z', finishedAt: null, receipt: null };
const mount = (t, options) => {
  const root = mountToolbox(t, renderQuickTransfer({ job, jobs: [job, another], date, ...options }));
  root.openChest();
  return root;
};

test('receiving stays available during read-only file preparation and stale preparation cannot reopen the chest', async t => {
  installToolboxDOM(t);
  let finishPreparation, received = 0, receiverSawOpen;
  const root = mount(t, {
    prepareJobShare: () => new Promise(resolve => { finishPreparation = resolve; }),
    onReceive: () => { received++; receiverSawOpen = root.open; },
  });
  assert.equal(root.querySelector('[data-transfer="share"]').disabled, true);
  assert.equal(root.querySelector('[data-transfer="receive"]').disabled, false);
  click(root, '[data-transfer="receive"]');
  assert.equal(received, 1);
  assert.equal(receiverSawOpen, true, 'file picker is invoked in the original tap before dismissal');
  assert.equal(root.isConnected, false);
  finishPreparation(async () => ({ status: 'shared' }));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(root.isConnected, false);
});

test('cancelled sharing retains the prepared file and allows a second user gesture without claiming delivery', async t => {
  installToolboxDOM(t);
  let prepared = 0, attempts = 0;
  const root = mount(t, { prepareJobShare: async () => {
    prepared++;
    return async () => { attempts++; return { status: attempts === 1 ? 'cancelled' : 'shared' }; };
  } });
  await until(() => !root.querySelector('[data-transfer="share"]').disabled);
  click(root, '[data-transfer="share"]');
  await until(() => root.querySelector('.transfer-status').textContent.includes('cancelled'));
  assert.equal(root.open, true);
  assert.equal(root.querySelector('[data-transfer="share"]').disabled, false);
  click(root, '[data-transfer="share"]');
  await until(() => attempts === 2 && root.querySelector('.transfer-status').textContent.includes('Shared through'));
  assert.equal(prepared, 1);
  assert.match(root.querySelector('.transfer-status').textContent, /receipt confirms/);
  assert.equal(root.querySelector('.transfer-day-card'), null);
});

test('preparation failures stay visible, allow retry and do not block receiving', async t => {
  installToolboxDOM(t);
  let attempts = 0;
  const root = mount(t, { onReceive: () => {}, prepareJobShare: async () => {
    if (++attempts === 1) throw Error('Synthetic storage read failed');
    return async () => ({ status: 'downloaded' });
  } });
  await until(() => !root.querySelector('[data-transfer="retry-share"]').hidden);
  assert.equal(root.querySelector('.transfer-status').getAttribute('role'), 'alert');
  assert.equal(root.querySelector('[data-transfer="receive"]').disabled, false);
  click(root, '[data-transfer="retry-share"]');
  await until(() => !root.querySelector('[data-transfer="share"]').disabled);
  click(root, '[data-transfer="share"]');
  await until(() => root.querySelector('.transfer-status').textContent.includes('Pack downloaded'));
  assert.equal(attempts, 2);
});

test('day packs keep explicit job choices and require a fresh share tap after preparation', async t => {
  installToolboxDOM(t);
  const values = [], starts = []; let shares = 0;
  const root = mount(t, {
    officeId: 'office-one',
    onPrepareDay: async value => { values.push(value); return { share: async () => { shares++; return { status: 'shared' }; } }; },
    onStartDay: async value => { starts.push(value); return { day: running, message: 'Day started.' }; },
  });
  root.querySelector('.transfer-day-options').open = true;
  click(root, '[data-transfer="start-day"]');
  assert.equal(starts.length, 0);
  assert.match(root.querySelector('.transfer-day-error').textContent, /name/);
  field(root, '[name="engineer"]', 'Engineer One');
  field(root, '[name="label"]', 'Team training');
  root.querySelector('[value="job-two"]').checked = true;
  submit(root, '.transfer-day-form');
  await until(() => !root.querySelector('[data-transfer="share-prepared-day"]').hidden);
  assert.equal(shares, 0, 'preparing never consumes a share-sheet user gesture');
  assert.deepEqual(values[0], { engineer: 'Engineer One', date, label: 'Team training', officeId: 'office-one', jobIds: ['job-one', 'job-two'] });
  click(root, '[data-transfer="share-prepared-day"]');
  await until(() => shares === 1 && root.getAttribute('aria-busy') === 'false');
  field(root, '[name="label"]', 'Amended selection');
  assert.equal(root.querySelector('[data-transfer="share-prepared-day"]').hidden, true, 'editing invalidates an earlier prepared selection');
  click(root, '[data-transfer="start-day"]');
  await until(() => root.querySelector('.transfer-day-card'));
  assert.equal(starts.length, 1);
  assert.equal(root.querySelector('[data-transfer="start-day"]').disabled, true);
  assert.match(root.querySelector('.transfer-day-card').textContent, /Day in progress/);
});

test('finishing requires review and a durable callback before a finished pack becomes shareable', async t => {
  installToolboxDOM(t);
  let finishes = 0, shares = 0;
  const finished = { ...running, status: 'finished', finishedAt: '2026-11-27T17:00:00.000Z' };
  const root = mount(t, {
    day: running,
    onFinishDay: async value => { finishes++; assert.equal(value.id, running.id); return { day: finished, message: 'Saved locally.' }; },
    prepareDayShare: async value => { assert.equal(value.status, 'finished'); return async () => { shares++; return { status: 'shared' }; }; },
  });
  assert.equal(finishes, 0);
  click(root, '[data-transfer="review-finish"]');
  assert.equal(finishes, 0);
  click(root, '[data-transfer="keep-working"]');
  assert.equal(finishes, 0);
  click(root, '[data-transfer="review-finish"]'); click(root, '[data-transfer="finish-day"]');
  await until(() => root.querySelector('[data-transfer="share-day"]')?.disabled === false);
  assert.equal(finishes, 1);
  assert.match(root.querySelector('.transfer-delivery').textContent, /Awaiting a receipt/);
  click(root, '[data-transfer="share-day"]');
  await until(() => shares === 1 && root.getAttribute('aria-busy') === 'false');
  assert.doesNotMatch(root.querySelector('.transfer-day-card').textContent, /Receipt received/);
  root.setDay({ ...finished, status: 'returned', receipt: { receiptId: 'matching-receipt' } });
  assert.match(root.querySelector('.transfer-day-card').textContent, /Receipt received/);
  root.setReceiptCurrent(false);
  assert.match(root.querySelector('.transfer-day-card').textContent, /changes to return/);
  assert.match(root.querySelector('.transfer-delivery').textContent, /changed since its receipt/);
  root.setReceiptCurrent(true);
  assert.match(root.querySelector('.transfer-day-card').textContent, /Receipt received/);
});

test('a failed start freezes the prepared choices until the same day is saved by retrying', async t => {
  installToolboxDOM(t);
  let preparations = 0, shares = 0;
  const starts = [];
  const root = mount(t, {
    engineer: 'Engineer One',
    onPrepareDay: async () => { preparations++; return { share: () => { shares++; } }; },
    onStartDay: async values => {
      starts.push(values);
      if (starts.length === 1) {
        root.setStartRetry(true);
        throw Error('Storage failed. Retry saving the same day.');
      }
      root.setStartRetry(false);
      return { day: running };
    },
  });
  field(root, '[name="label"]', 'Morning jobs');
  submit(root, '.transfer-day-form');
  await until(() => !root.querySelector('[data-transfer="share-prepared-day"]').hidden);
  click(root, '[data-transfer="start-day"]');
  await until(() => root.getAttribute('aria-busy') === 'false' && starts.length === 1);
  assert.match(root.querySelector('.transfer-status').textContent, /Storage failed/);
  assert.ok([...root.querySelectorAll('.transfer-day-form input')].every(input => input.disabled));
  assert.equal(root.querySelector('.transfer-day-form button[type="submit"]').disabled, true);
  assert.equal(root.querySelector('[data-transfer="share-prepared-day"]').disabled, true);
  assert.equal(root.querySelector('[data-transfer="start-day"]').disabled, false);
  assert.equal(root.querySelector('[data-transfer="start-day"]').textContent, 'Retry starting day');
  submit(root, '.transfer-day-form');
  root.querySelector('[data-transfer="share-prepared-day"]').click();
  assert.equal(preparations, 1);
  assert.equal(shares, 0);
  click(root, '[data-transfer="start-day"]');
  await until(() => root.getAttribute('aria-busy') === 'false' && starts.length === 2);
  assert.deepEqual(starts[1], starts[0]);
  assert.ok([...root.querySelectorAll('.transfer-day-form input')].every(input => !input.disabled));
  assert.equal(root.querySelector('[data-transfer="start-day"]').textContent, 'Start my day');
  assert.equal(root.querySelector('[data-transfer="start-day"]').disabled, true);
});

test('office return rows use mapped local jobs and render untrusted names as text', async t => {
  installToolboxDOM(t);
  const opened = [], shared = [];
  const returned = { engineer: '<img src=x onerror=alert(1)>', date, jobCount: 1, conflictCount: 1, jobIds: [another.id], receipt: { receiptId: 'receipt-one' }, timeConflicts: [{ sourceId: 'time-one', entry: { date, start: '09:00', end: '12:00', engineer: 'Engineer One', sessionType: 'Work', hours: 3, note: 'Returned time', deletedAt: '2026-11-27T17:00:00Z' } }] };
  returned.day = { localStart: '2026-11-27T09:00', localFinish: '2026-11-27T17:45', startedAt: '2026-11-27T08:00:00Z', finishedAt: '2026-11-27T16:45:00Z' };
  returned.summary = { attendanceMinutes: 525, unallocatedMinutes: 35 };
  const root = mount(t, {
    receipts: [returned], onOpenJob: value => opened.push(value), onShareReceipt: async value => { shared.push(value); return { status: 'shared' }; },
  });
  root.querySelector('.transfer-office-returns').open = true;
  assert.equal(root.querySelector('img'), null);
  assert.match(root.querySelector('.transfer-return strong').textContent, /<img/);
  assert.match(root.querySelector('.transfer-time-review').textContent, /3 hours recorded/);
  assert.match(root.querySelector('.transfer-time-review').textContent, /Deleted by engineer/);
  assert.match(root.querySelector('.transfer-time-review').textContent, /Both versions are kept/);
  const attendance = root.querySelector('.transfer-return-attendance');
  assert.match(attendance.textContent, /Started27 Nov 2026, 09:00/);
  assert.match(attendance.textContent, /Finished27 Nov 2026, 17:45/);
  assert.match(attendance.textContent, /Attendance8h 45m/);
  assert.match(attendance.textContent, /Unallocated time0h 35m/);
  click(root, '[data-transfer="share-receipt"]');
  await until(() => shared.length === 1 && root.getAttribute('aria-busy') === 'false');
  assert.equal(shared[0], returned);
  click(root, '[data-transfer="open-job"]');
  assert.deepEqual(opened, [another.id]);
  assert.equal(root.isConnected, false);
});

test('office returns show zero unallocated time and omit attendance for assignment-only packs', t => {
  installToolboxDOM(t);
  const root = mount(t, { receipts: [
    { engineer: 'Engineer One', day: { localStart: '2026-11-27T23:30', localFinish: '2026-11-28T00:30' }, attendanceMinutes: 60, unallocatedMinutes: 0 },
    { engineer: 'Assignment only', summary: { attendanceMinutes: 0, unallocatedMinutes: 0 } },
  ] });
  const cards = root.querySelectorAll('.transfer-return');
  assert.match(cards[0].querySelector('.transfer-return-attendance').textContent, /Finished28 Nov 2026, 00:30/);
  assert.match(cards[0].querySelector('.transfer-return-attendance').textContent, /Unallocated time0h 0m/);
  assert.equal(cards[1].querySelector('.transfer-return-attendance'), null);
});
