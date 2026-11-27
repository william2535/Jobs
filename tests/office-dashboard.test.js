import test from 'node:test';
import assert from 'node:assert/strict';
import { renderOfficeDashboard } from '../src/office-dashboard.js';
import { createQuickJob, newSite } from '../src/model.js';
import { addJobAsset } from '../src/asset-library.js';
import { createDayPack, importDayPack } from '../src/day-pack.js';
import { startOfficeDay, finishOfficeDay } from '../src/day-session.js';
import { saveTimesheet } from '../src/timesheets.js';
import { installToolboxDOM, mountToolbox, field, click, until } from './helpers/toolbox-dom.js';

const empty = () => ({ sites: [], jobs: [], unassignedTimesheets: [], officeDays: [], officeReceipts: [] });
function manualState() {
  const state = empty();
  for (const [engineer, date, title, start, end] of [
    ['Alice', '2026-11-27', 'Alarm maintenance', '09:00', '11:00'],
    ['Bob', '2026-11-26', 'Camera repair', '10:00', '11:00'],
  ]) {
    const job = createQuickJob(null, { title }); job.engineer = engineer;
    job.workflow.timesheets = [{ id: `time-${engineer}`, engineer, date, start, end, endDate: date, sessionType: 'Work', customType: '', hours: null, note: `${engineer} notes` }];
    state.jobs.push(job);
  }
  state.jobs.push(createQuickJob(null, { title: 'Earlier untagged job' }));
  return state;
}
async function receivedState(engineer = 'Alice') {
  let field = { ...empty(), jobs: [createQuickJob(null, { title: 'Synthetic returned job' })] };
  field.jobs[0].engineer = engineer;
  const assignment = await createDayPack(field, { jobIds: [field.jobs[0].id], engineer, date: '2026-11-27', officeId: 'office-test' });
  const start = startOfficeDay(field, { packId: assignment.packId, officeId: assignment.officeId, engineer, date: assignment.date, jobIds: assignment.jobIds, at: '2026-11-27T08:00:00Z', localStart: '2026-11-27T08:00' });
  field = saveTimesheet(start.state, { id: 'recorded-work', date: assignment.date, endDate: assignment.date, start: '09:00', end: '12:00', sessionType: 'Work', customType: '', hours: null, engineer, note: 'Recorded work' }, { jobId: field.jobs[0].id });
  const finish = finishOfficeDay(field, start.day.id, { at: '2026-11-27T16:00:00Z', localFinish: '2026-11-27T16:00' });
  const pack = await createDayPack(finish.state, { kind: 'return', day: finish.day });
  const received = await importDayPack(empty(), pack, { receivedAt: '2026-11-27T16:10:00Z' });
  return { state: received.state, receipt: received.receipt, field: finish.state, day: finish.day };
}
function mount(t, options = {}) { return mountToolbox(t, renderOfficeDashboard(options)); }
async function openFirstDay(root) {
  const details = root.querySelector('.office-day');
  assert.ok(details); details.open = true;
  details.dispatchEvent(new Event('toggle'));
  await until(() => details.querySelector('.office-day-detail'));
  return details;
}

test('engineer and date filters scope saved days without fabricating attendance and preserve view state', t => {
  installToolboxDOM(t);
  const views = [], root = mount(t, { state: manualState(), onStateChange: value => views.push(value) });
  assert.equal(root.querySelectorAll('.office-day').length, 2);
  assert.equal(root.querySelectorAll('.office-metrics article')[0].querySelector('strong').textContent, '2');
  assert.equal(root.querySelectorAll('.office-metrics article')[1].querySelector('strong').textContent, '—');
  click(root, '[aria-label="View engineer Alice"]');
  assert.equal(root.querySelectorAll('.office-day').length, 1);
  assert.equal(root.querySelector('[data-office-filter="engineerKey"]').value, 'engineer:alice');
  assert.match(root.querySelector('.office-days').textContent, /Alice/);
  field(root, '[data-office-filter="from"]', '2026-11-28', 'change');
  assert.equal(root.querySelectorAll('.office-day').length, 0);
  assert.match(root.querySelector('.office-empty').textContent, /No days match/);
  click(root, '[data-office-action="all-dates"]');
  assert.equal(root.querySelectorAll('.office-day').length, 1);
  assert.equal(views.at(-1).engineerKey, 'engineer:alice');
  assert.equal(root.getViewState().from, '');
});

test('a returned day exposes actual attendance, unallocated time, mapped jobs and receipt actions', async t => {
  installToolboxDOM(t);
  const received = await receivedState(), timesheets = [], opened = [], receipts = [];
  const root = mount(t, { state: received.state, onOpenTimesheets: value => timesheets.push(value), onOpenJob: value => opened.push(value), onShareReceipt: value => receipts.push(value) });
  assert.equal(root.querySelector('.office-day-detail'), null, 'collapsed days defer their full record lists');
  const detail = await openFirstDay(root);
  assert.match(detail.querySelector('.office-day-clock').textContent, /8h 0m/);
  assert.match(detail.querySelector('.office-day-clock').textContent, /38%/);
  assert.match(detail.querySelector('.office-time-legend').textContent, /Unallocated5h 0m/);
  assert.equal(detail.querySelectorAll('tbody tr').length, 3);
  click(root, '[data-office-action="timesheets"]');
  await until(() => root.getAttribute('aria-busy') === 'false');
  assert.deepEqual(timesheets, [{ engineer: 'Alice', date: '2026-11-27' }]);
  click(root, '[data-office-action="receipt"]');
  await until(() => root.getAttribute('aria-busy') === 'false');
  assert.deepEqual(receipts, [received.receipt]);
  click(root, '.office-day [data-office-action="job"]');
  await until(() => root.getAttribute('aria-busy') === 'false');
  assert.deepEqual(opened, [received.state.jobs[0].id]);
  assert.ok(root.getViewState().expandedDay);
});

test('receiving multiple files keeps saved filters and permits retry after a failed import', async t => {
  const window = installToolboxDOM(t);
  let fail, attempts = 0; const received = [];
  const root = mount(t, { state: manualState(), viewState: { engineerKey: 'engineer:alice' }, onImport: files => {
    attempts++; received.push(files.map(file => file.name));
    if (attempts === 1) return new Promise((resolve, reject) => { fail = reject; });
    return { message: 'Two packs saved and grouped by engineer.' };
  } });
  const picker = root.querySelector('.office-file-picker');
  const files = [new window.File(['{}'], 'alice.jobsday.json'), new window.File(['{}'], 'bob.jobsday.json')];
  Object.defineProperty(picker, 'files', { configurable: true, value: files });
  picker.dispatchEvent(new Event('change'));
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(root.querySelector('[data-office-action="import"]').disabled, true);
  fail(Error('Synthetic storage failure'));
  await until(() => root.getAttribute('aria-busy') === 'false');
  assert.equal(root.querySelector('.office-status').getAttribute('role'), 'alert');
  assert.match(root.querySelector('.office-status').textContent, /storage failure/);
  assert.equal(root.getViewState().engineerKey, 'engineer:alice');
  picker.dispatchEvent(new Event('change'));
  await until(() => root.getAttribute('aria-busy') === 'false' && attempts === 2);
  assert.deepEqual(received, [files.map(file => file.name), files.map(file => file.name)]);
  assert.match(root.querySelector('.office-status').textContent, /Two packs saved/);
});

test('CSV export receives the filtered model and engineer names remain plain text', async t => {
  installToolboxDOM(t);
  const state = manualState(), name = '<img src=x onerror=alert(1)>';
  state.jobs[0].engineer = name; state.jobs[0].workflow.timesheets[0].engineer = name;
  const exported = [], transfers = [];
  const root = mount(t, { state, onExport: value => exported.push(value), onQuickTransfer: value => transfers.push(value) });
  assert.equal(root.querySelector('img'), null);
  const option = [...root.querySelector('select').options].find(option => option.textContent === name);
  assert.ok(option);
  field(root, '[data-office-filter="engineerKey"]', option.value, 'change');
  click(root, '[data-office-action="export"]');
  await until(() => root.getAttribute('aria-busy') === 'false');
  assert.equal(exported.length, 1); assert.equal(exported[0].days.length, 1); assert.equal(exported[0].days[0].engineer, name);
  click(root, '[data-office-action="transfer"]');
  assert.equal(transfers.length, 1, 'the trigger is forwarded during the click for chest focus restoration');
});

test('earlier amended returns are accessible without adding their attendance again', async t => {
  installToolboxDOM(t);
  const received = await receivedState();
  received.field.jobs[0].scope = 'Later recorded evidence'; received.field.jobs[0].revision++;
  const amendment = await createDayPack(received.field, { kind: 'return', day: received.day });
  const latest = await importDayPack(received.state, amendment, { receivedAt: '2026-11-27T17:00:00Z' });
  const root = mount(t, { state: latest.state, onOpenJob: () => {} });
  assert.equal(root.querySelectorAll('.office-day').length, 1);
  assert.equal(root.querySelectorAll('.office-metrics article')[1].querySelector('strong').textContent, '8h 0m');
  const day = await openFirstDay(root);
  const history = day.querySelector('.office-return-history'); assert.ok(history);
  assert.match(history.textContent, /Only the latest return counts/);
  assert.equal(history.querySelectorAll('[data-office-action="job"]').length, 1);
});

test('long saved history paginates without eagerly rendering hidden time records', t => {
  installToolboxDOM(t);
  const state = empty(), job = createQuickJob(null, { title: 'Long history' }); job.engineer = 'Alice';
  job.workflow.timesheets = Array.from({ length: 32 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, index + 1)).toISOString().slice(0, 10);
    return { id: `time-${index}`, engineer: 'Alice', date, endDate: date, start: '09:00', end: '10:00', sessionType: 'Work', customType: '', hours: null, note: '' };
  });
  state.jobs.push(job);
  const root = mount(t, { state });
  assert.equal(root.querySelectorAll('.office-day').length, 30);
  assert.equal(root.querySelectorAll('.office-time-table').length, 0);
  assert.equal(root.querySelector('[data-office-action="previous-days"]').disabled, true);
  click(root, '[data-office-action="next-days"]');
  assert.equal(root.querySelectorAll('.office-day').length, 2);
  assert.equal(root.querySelector('[data-office-action="next-days"]').disabled, true);
  assert.equal(root.getViewState().dayPage, 1);
  root.setState(structuredClone(state));
  assert.equal(root.querySelectorAll('.office-day').length, 2);
});

test('tagged ordinary jobs stay visible beside an engineer’s received or recorded days', t => {
  installToolboxDOM(t);
  const state = manualState(), extra = createQuickJob(null, { title: 'Alice next visit' });
  extra.engineer = 'Alice'; state.jobs.push(extra);
  const root = mount(t, { state, onOpenJob: () => {} });
  click(root, '[aria-label="View engineer Alice"]');
  assert.equal(root.querySelectorAll('.office-day').length, 1);
  assert.match(root.querySelector('.office-other-jobs').textContent, /Alice next visit/);
  assert.equal(root.querySelectorAll('.office-other-jobs [data-office-action="job"]').length, 1);
});

test('site and asset totals stay all-time, deduplicate revisions and open their real site or standalone job', async t => {
  installToolboxDOM(t);
  const site = newSite('Workshop awaiting plan', '1 Synthetic Lane'), blank = newSite('New site folder');
  const job = createQuickJob(site, { title: 'Workshop visit' }), standalone = createQuickJob(null, { title: 'Standalone register' });
  job.engineer = 'Alice'; standalone.engineer = 'Bob';
  let state = { ...empty(), sites: [site, blank], jobs: [job, standalone] };
  const asset = { type: 'pir', typeName: 'PIR detector', manufacturer: '', model: '', description: '' };
  state = addJobAsset(state, job.id, { ...asset, reference: 'PIR 01' }).state;
  state = addJobAsset(state, job.id, { ...asset, reference: 'PIR 02' }).state;
  state = addJobAsset(state, standalone.id, { ...asset, reference: 'PIR 03' }).state;
  const duplicate = structuredClone(state.jobs.find(item => item.id === standalone.id));
  duplicate.id = 'retained-job-copy'; duplicate.sourceJobId = standalone.id; state.jobs.push(duplicate);
  const openedSites = [], openedJobs = [];
  const root = mount(t, { state, onOpenSite: id => openedSites.push(id), onOpenJob: id => openedJobs.push(id) });
  const counts = () => [...root.querySelectorAll('.office-site-metrics > details > summary > b')].map(value => value.textContent);
  assert.deepEqual(counts(), ['3', '2']);
  assert.match(root.querySelector('.office-inventory-heading').textContent, /All saved site and job records/);
  field(root, '[data-office-filter="engineerKey"]', 'engineer:alice', 'change');
  field(root, '[data-office-filter="from"]', '2030-01-01', 'change');
  assert.deepEqual(counts(), ['3', '2'], 'inventory does not pretend historical assets were added in the date range');
  const waiting = root.querySelector('.office-waiting-sites'); waiting.open = true; waiting.dispatchEvent(new Event('toggle'));
  assert.equal(waiting.querySelectorAll('.office-inventory-record').length, 2);
  click(root, `.office-waiting-sites [data-site-id="${site.id}"]`);
  await until(() => root.getAttribute('aria-busy') === 'false');
  assert.deepEqual(openedSites, [site.id]);
  const assets = root.querySelector('.office-assets-count'); assets.open = true; assets.dispatchEvent(new Event('toggle'));
  assert.match(assets.querySelector('.office-asset-sources').textContent, /Added in Jobs3/);
  click(root, `.office-assets-count [data-job-id="${standalone.id}"]`);
  await until(() => root.getAttribute('aria-busy') === 'false');
  assert.deepEqual(openedJobs, [standalone.id]);
  assert.equal(root.getViewState().assetsOpen, true);
  assert.equal(root.getViewState().waitingOpen, true);
});

test('large waiting-site lists page real folders while the total remains visible', t => {
  installToolboxDOM(t);
  const state = { ...empty(), sites: Array.from({ length: 32 }, (_, index) => newSite(`Synthetic site ${String(index + 1).padStart(2, '0')}`)) };
  const root = mount(t, { state, onOpenSite: () => {} });
  const waiting = root.querySelector('.office-waiting-sites'); waiting.open = true; waiting.dispatchEvent(new Event('toggle'));
  assert.equal(waiting.querySelector('summary > b').textContent, '32');
  assert.equal(waiting.querySelectorAll('.office-inventory-record').length, 30);
  assert.equal(root.querySelector('[data-office-action="waiting-previous"]').disabled, true);
  click(root, '[data-office-action="waiting-next"]');
  assert.equal(root.querySelector('.office-waiting-sites').open, true);
  assert.equal(root.querySelectorAll('.office-waiting-sites .office-inventory-record').length, 2);
  assert.equal(root.querySelector('[data-office-action="waiting-next"]').disabled, true);
  assert.equal(root.getViewState().waitingPage, 1);
});
