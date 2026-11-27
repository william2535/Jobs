import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuickJob } from '../src/model.js';
import { createDayPack, importDayPack } from '../src/day-pack.js';
import { startOfficeDay, finishOfficeDay } from '../src/day-session.js';
import { saveTimesheet } from '../src/timesheets.js';
import { buildOfficeOverview, exportOfficeCsv, UNTAGGED_ENGINEER_KEY } from '../src/office-analytics.js';

const blank = () => ({ sites: [], jobs: [], unassignedTimesheets: [], officeDays: [], officeReceipts: [] });
const job = title => createQuickJob(null, { title });
async function returnedDay({ engineer = 'Alex Morgan', date = '2026-11-27', workMinutes = 360, extra = true, localStart = `${date}T08:00`, localFinish = `${date}T16:00`, selectedJob = job('Synthetic visit') } = {}) {
  const state = { ...blank(), jobs: [selectedJob] };
  const assignment = await createDayPack(state, { engineer, date, officeId: 'office', jobIds: [selectedJob.id] });
  let current = startOfficeDay(state, { engineer, date, officeId: 'office', packId: assignment.packId, jobIds: [selectedJob.id], at: `${localStart}:00Z`, localStart });
  const end = new Date(Date.parse(`${localStart}:00Z`) + workMinutes * 60000).toISOString().slice(0, 16);
  const add = (id, type, start, finish, jobId = selectedJob.id) => {
    current.state = saveTimesheet(current.state, { id, engineer, date: start.slice(0, 10), start: start.slice(11), endDate: finish.slice(0, 10), end: finish.slice(11), sessionType: type, customType: '', hours: null, note: '' }, { jobId });
  };
  add(`${selectedJob.id}:work`, 'Work', localStart, end);
  if (extra) { add(`${selectedJob.id}:travel`, 'Travel', `${date}T14:00`, `${date}T15:00`, null); add(`${selectedJob.id}:break`, 'Break', `${date}T15:00`, `${date}T15:30`, null); }
  current = finishOfficeDay(current.state, current.day.id, { at: `${localFinish}:00Z`, localFinish });
  current.state.jobs[0].engineer = engineer; current.state.jobs[0].status = 'Complete';
  const pack = await createDayPack(current.state, { kind: 'return', day: current.day });
  return { ...current, pack };
}
async function receive(state, pack, at = '2026-11-27T17:00:00Z') { return (await importDayPack(state, pack, { receivedAt: at })).state; }

test('latest notes-only return counts one day and uses its mapped time instead of retained older copies', async () => {
  const alex = await returnedDay(); let office = await receive(blank(), alex.pack);
  alex.state.jobs[0].scope = 'Updated engineer notes'; alex.state.jobs[0].revision++;
  const amended = await createDayPack(alex.state, { kind: 'return', day: alex.day });
  office = await receive(office, amended, '2026-11-27T18:00:00Z');
  const before = structuredClone(office), model = buildOfficeOverview(office);
  assert.deepEqual(office, before);
  assert.equal(model.days.length, 1); assert.equal(model.days[0].priorReturns.length, 1);
  assert.equal(model.days[0].jobIds[0], office.officeReceipts.at(-1).mappings[0].jobId);
  assert.equal(model.totals.attendanceMinutes, 480); assert.equal(model.totals.jobWorkMinutes, 360);
  assert.equal(model.totals.travelMinutes, 60); assert.equal(model.totals.breakMinutes, 30); assert.equal(model.totals.unallocatedMinutes, 30);
  assert.equal(model.totals.recordedMinutes, 480); assert.equal(model.totals.utilisationPercent, 75);
  assert.equal(model.totals.completedJobs, 1); assert.equal(model.engineers[0].packCount, 2);
});

test('name tags normalize case and spaces, while different engineers and dates remain distinct', async () => {
  const first = await returnedDay(), second = await returnedDay({ engineer: ' alex   MORGAN ', date: '2026-11-28', workMinutes: 120, extra: false });
  const casey = await returnedDay({ engineer: 'Casey Reed', workMinutes: 240, extra: false });
  let office = await receive(blank(), first.pack); office = await receive(office, second.pack, '2026-11-28T17:00:00Z'); office = await receive(office, casey.pack);
  const model = buildOfficeOverview(office);
  assert.equal(model.engineers.length, 2); assert.equal(model.days.length, 3);
  const alex = model.engineers.find(group => group.key === 'engineer:alex morgan');
  assert.equal(alex.name, 'Alex Morgan'); assert.equal(alex.days.length, 2); assert.equal(alex.totals.attendanceMinutes, 960); assert.equal(alex.totals.jobWorkMinutes, 480); assert.equal(alex.totals.utilisationPercent, 50);
  assert.equal(model.totals.attendanceMinutes, 1440); assert.equal(model.totals.jobWorkMinutes, 720); assert.equal(model.totals.utilisationPercent, 50, 'simultaneous attendance of different engineers is valid');
  const filtered = buildOfficeOverview(office, { from: '2026-11-28', to: '2026-11-28', engineerKey: alex.key });
  assert.equal(filtered.days.length, 1); assert.equal(filtered.totals.attendanceMinutes, 480); assert.equal(filtered.totals.utilisationPercent, 25);
  assert.equal(filtered.engineers[0].name, 'Alex Morgan');
  assert.ok(buildOfficeOverview(office, { from: '2030-01-01' }).engineerOptions.some(option => option.name === 'Alex Morgan'));
});

test('overlapping sessions and actual returned time conflicts suppress utilisation without hiding evidence', async () => {
  const item = await returnedDay({ workMinutes: 420 }); let office = await receive(blank(), item.pack);
  let model = buildOfficeOverview(office);
  assert.equal(model.days[0].totals.utilisationPercent, null); assert.match(model.days[0].issues.join(' '), /Overlapping/);
  const clean = await returnedDay({ selectedJob: job('Other synthetic visit') }); office = await receive(blank(), clean.pack);
  const gap = clean.state.unassignedTimesheets.find(entry => entry.id.includes(':unallocated:'));
  clean.state = saveTimesheet(clean.state, { ...gap, note: 'Engineer correction', end: '15:45' }, { jobId: null, previousJobId: null });
  office = await receive(office, await createDayPack(clean.state, { kind: 'return', day: clean.day }), '2026-11-27T18:00:00Z');
  model = buildOfficeOverview(office);
  assert.equal(model.days[0].totals.utilisationPercent, null); assert.equal(model.days.length, 1);
  assert.ok(model.days[0].entries.some(entry => entry.conflict)); assert.match(model.days[0].issues.join(' '), /Conflicting time/);
});

test('manual hours and untagged legacy jobs remain reviewable without invented attendance or efficiency', () => {
  const standalone = job('Standalone hours'); standalone.engineer = 'Sam';
  standalone.workflow.timesheets = [{ id: 'legacy-hours', date: '2026-11-27', start: '', end: '', hours: 2, engineer: 'Sam', note: 'Earlier entry' }];
  const untagged = job('No engineer supplied');
  const model = buildOfficeOverview({ ...blank(), jobs: [standalone, untagged] });
  const sam = model.engineers.find(group => group.name === 'Sam');
  assert.equal(sam.totals.jobWorkMinutes, 120); assert.equal(sam.totals.attendanceMinutes, null); assert.equal(sam.totals.utilisationPercent, null);
  assert.equal(model.untaggedJobs[0].id, untagged.id); assert.ok(model.engineerOptions.some(option => option.key === UNTAGGED_ENGINEER_KEY));
  assert.equal(model.days[0].source, 'timesheets');
});

test('overnight date filtering clips actual recorded time and attendance consistently', async () => {
  const item = await returnedDay({ localStart: '2026-11-27T22:00', localFinish: '2026-11-28T06:00', workMinutes: 240, extra: false });
  const model = buildOfficeOverview(await receive(blank(), item.pack), { from: '2026-11-28', to: '2026-11-28' });
  assert.equal(model.days.length, 1); assert.equal(model.days[0].partial, true);
  assert.equal(model.totals.attendanceMinutes, 360); assert.equal(model.totals.jobWorkMinutes, 120); assert.equal(model.totals.unallocatedMinutes, 240);
  assert.equal(model.totals.utilisationPercent, 33.33);
});

test('a running day remains unfinished and never supplies an efficiency percentage', async () => {
  const selected = job('Running visit'), state = { ...blank(), jobs: [selected] };
  const assignment = await createDayPack(state, { engineer: 'Engineer', date: '2026-11-27', officeId: 'office', jobIds: [selected.id] });
  const started = startOfficeDay(state, { engineer: 'Engineer', date: '2026-11-27', officeId: 'office', packId: assignment.packId, jobIds: [selected.id], at: '2026-11-27T08:00:00Z', localStart: '2026-11-27T08:00' });
  const model = buildOfficeOverview(started.state);
  assert.equal(model.days[0].status, 'running'); assert.equal(model.days[0].localFinish, null); assert.equal(model.totals.attendanceMinutes, null); assert.equal(model.totals.utilisationPercent, null);
});

test('missing current mapped jobs or tracked time cannot yield a misleading utilisation percentage', async () => {
  const item = await returnedDay(); const office = await receive(blank(), item.pack);
  office.jobs = [];
  let model = buildOfficeOverview(office); assert.match(model.days[0].issues.join(' '), /job.*missing/); assert.equal(model.totals.utilisationPercent, null);
  const complete = await receive(blank(), item.pack); complete.unassignedTimesheets = [];
  model = buildOfficeOverview(complete); assert.match(model.days[0].issues.join(' '), /time entry is missing/); assert.equal(model.totals.utilisationPercent, null);
});

test('CSV exports the filtered latest day once and quotes text safely for spreadsheets', async () => {
  const item = await returnedDay({ engineer: '=SUM(1,2)' });
  const model = buildOfficeOverview(await receive(blank(), item.pack));
  const csv = exportOfficeCsv(model);
  assert.equal(csv.split('\r\n').filter(Boolean).length, 2); assert.match(csv, /"Job time utilisation %"/); assert.match(csv, /"'=SUM\(1,2\)"/); assert.match(csv, /"480","360","60","30","0","30","480","75"/);
  assert.throws(() => buildOfficeOverview(blank(), { from: '2026-02-31' }), /valid office date range/);
  assert.throws(() => buildOfficeOverview(blank(), { from: '2026-11-28', to: '2026-11-27' }), /valid office date range/);
});

test('overlapping office days retain both records but do not double attendance or identical sessions', async () => {
  const item = await returnedDay();
  item.state.officeDays.push({ ...structuredClone(item.day), id: 'second-overlapping-day' });
  const model = buildOfficeOverview(item.state);
  assert.equal(model.days.length, 2); assert.equal(model.totals.attendanceMinutes, 480);
  assert.equal(model.totals.recordedMinutes, 480); assert.equal(model.totals.jobWorkMinutes, 360);
  assert.equal(model.totals.utilisationPercent, null); assert.ok(model.days.every(day => day.issues.includes('Overlapping office days need review.')));
});

test('hidden-control legacy names are kept untagged and never crash office summaries', () => {
  const selected = job('Legacy hidden name'); selected.engineer = 'Alex\u200b';
  selected.workflow.timesheets = [{ id: 'legacy-hidden', date: '2026-11-27', start: '', end: '', hours: 1, engineer: 'Alex\u200b', note: '' }];
  const model = buildOfficeOverview({ ...blank(), jobs: [selected] });
  assert.equal(model.engineers[0].key, UNTAGGED_ENGINEER_KEY); assert.equal(model.engineers[0].name, 'Untagged');
  assert.equal(model.untaggedJobs[0].engineerNeedsReview, true); assert.match(model.days[0].issues.join(' '), /engineer name needs review/);
});

test('ordinary tagged job imports group under the engineer without inventing a day or attendance', () => {
  const first = job('First tagged job'), second = job('Second tagged job'); first.engineer = 'Casey Reed'; second.engineer = ' casey  REED ';
  const model = buildOfficeOverview({ ...blank(), jobs: [first, second] });
  assert.equal(model.engineers.length, 1); assert.equal(model.engineers[0].jobIds.length, 2); assert.equal(model.days.length, 0);
  assert.equal(model.totals.attendanceMinutes, null); assert.equal(model.totals.utilisationPercent, null);
});

test('one time entry ID cannot be credited to two engineers even in separate completed days', async () => {
  const alex = await returnedDay({ extra: false, workMinutes: 480 }), casey = await returnedDay({ engineer: 'Casey Reed', extra: false, workMinutes: 480 });
  alex.state.jobs[0].workflow.timesheets[0].id = 'shared-time-id'; casey.state.jobs[0].workflow.timesheets[0].id = 'shared-time-id';
  const state = { ...blank(), jobs: [...alex.state.jobs, ...casey.state.jobs], officeDays: [...alex.state.officeDays, ...casey.state.officeDays], unassignedTimesheets: [...alex.state.unassignedTimesheets, ...casey.state.unassignedTimesheets] };
  const model = buildOfficeOverview(state);
  assert.equal(model.days.length, 2); assert.equal(model.totals.attendanceMinutes, 960); assert.equal(model.totals.jobWorkMinutes, 0);
  assert.equal(model.totals.utilisationPercent, null); assert.ok(model.days.every(day => day.totals.utilisationPercent === null));
  assert.ok(model.days.every(day => day.issues.some(issue => /Conflicting time|conflicting ownership/.test(issue))));
  const filtered = buildOfficeOverview(state, { engineerKey: 'engineer:alex morgan' });
  assert.equal(filtered.totals.jobWorkMinutes, 0); assert.equal(filtered.totals.utilisationPercent, null);
});
