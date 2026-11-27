import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTimesheets } from '../src/timesheets-ui.js';
import { createQuickJob } from '../src/model.js';
import { validateTimesheetEntry, createTimesheetPackage, saveTimesheet, submitTimesheets } from '../src/timesheets.js';
import { installToolboxDOM, mountToolbox, field, click, submit, until } from './helpers/toolbox-dom.js';

const date = '2026-11-14';
const entry = (id, engineer, extra = {}) => validateTimesheetEntry({
  id, engineer, date, endDate: date, start: '09:00', end: '10:00', hours: 1,
  note: '', sessionType: 'Work', ...extra,
});
function fixture() {
  const first = createQuickJob(), second = createQuickJob();
  first.workflow = { version: 1, details: { title: 'Synthetic visit A' }, timesheets: [entry('alice', ' ALICE  Green ')] };
  second.workflow = { version: 1, details: { title: 'Synthetic visit B' }, timesheets: [entry('bob', 'Bob Green')] };
  return {
    sites: [], jobs: [first, second],
    unassignedTimesheets: [
      entry('alice-trash', 'Alice Green', { deletedAt: `${date}T12:00:00Z` }),
      entry('bob-trash', 'Bob Green', { deletedAt: `${date}T12:00:00Z` }),
      { id: 'alice-undated', engineer: 'Alice Green', date: '', start: '', end: '', hours: 0.5, note: '' },
      { id: 'bob-undated', engineer: 'Bob Green', date: '', start: '', end: '', hours: 0.5, note: '' },
    ],
  };
}

test('engineer filter scopes timeline, undated records, trash and export while retaining view state', async t => {
  installToolboxDOM(t);
  const state = fixture(), exports = [];
  const root = mountToolbox(t, renderTimesheets({ state, initialDate: date, initialEngineer: 'Alice Green', showEngineerFilter: true,
    onExport: async options => { const output = createTimesheetPackage(state, options); exports.push(output); return { package: output }; },
  }));
  assert.equal(root.querySelector('[aria-label="Engineer filter"]').value, 'Alice Green');
  assert.ok(root.querySelector('[data-session-id="alice"]'));
  assert.equal(root.querySelector('[data-session-id="bob"]'), null);
  assert.ok(root.querySelector('[data-session-id="alice-undated"]'));
  assert.equal(root.querySelector('[data-session-id="bob-undated"]'), null);
  assert.match(root.querySelector('.timesheet-submission-note').textContent, /^1 session/);
  click(root, '[data-timesheet-export]');
  await until(() => exports.length === 1 && root.getAttribute('aria-busy') === 'false');
  assert.deepEqual(exports[0].entries.map(row => row.entry.id), ['alice']);
  assert.deepEqual(exports[0].archivedEntries.map(row => row.entry.id), ['alice-trash']);
  field(root, '[aria-label="Engineer filter"]', 'Bob Green', 'change');
  assert.equal(root.getViewState().engineer, 'Bob Green');
  assert.equal(root.querySelector('[data-session-id="alice"]'), null);
  assert.ok(root.querySelector('[data-session-id="bob"]'));
  field(root, '[aria-label="Engineer filter"]', '', 'change');
  assert.equal(root.querySelectorAll('.timesheet-scroll [data-session-id]').length, 2);
  assert.equal(root.getViewState().engineer, '');
});

test('filtered submission sends only visible engineer references and excludes unrelated trash', async t => {
  installToolboxDOM(t);
  let state = fixture(), sent;
  const root = mountToolbox(t, renderTimesheets({ state, initialDate: date, initialEngineer: 'alice green',
    onSubmit: async options => { sent = options; const result = submitTimesheets(state, options.refs, options); state = result.state; return result; },
  }));
  click(root, '[data-timesheet-submit]');
  assert.equal(root.querySelectorAll('.timesheet-submit-list li').length, 1);
  submit(root, '[data-timesheet-submit-form]');
  await until(() => !root.querySelector('.timesheet-dialog'));
  assert.equal(sent.engineer, 'alice green');
  assert.deepEqual(sent.refs, [{ jobId: state.jobs[0].id, entryId: 'alice' }]);
  assert.ok(state.jobs[0].workflow.timesheets[0].submissionId);
  assert.equal(state.jobs[1].workflow.timesheets[0].submissionId, undefined);
  assert.equal(root.getViewState().engineer, 'alice green');
});

test('new sessions inherit the selected or running engineer and existing names change only when edited', async t => {
  installToolboxDOM(t);
  let state = fixture(), saved;
  state.officeDays = [{ status: 'running', engineer: 'Running Engineer' }];
  const root = mountToolbox(t, renderTimesheets({ state, initialDate: date, initialEngineer: 'Alice Green',
    onSave: async value => { saved = value; state = saveTimesheet(state, value.entry, value); return { state }; },
  }));
  click(root, '[data-timesheet-add]');
  assert.equal(root.querySelector('[aria-label="Engineer"]').value, 'Alice Green');
  field(root, '[aria-label="Description"]', 'New named session');
  submit(root, '[data-timesheet-form]');
  await until(() => !root.querySelector('.timesheet-dialog'));
  assert.equal(saved.entry.engineer, 'Alice Green');
  click(root, '[data-session-id="alice"]');
  assert.equal(root.querySelector('[aria-label="Engineer"]').value, ' ALICE  Green ');
  field(root, '[aria-label="Description"]', 'Preserve the recorded engineer spelling');
  submit(root, '[data-timesheet-form]');
  await until(() => !root.querySelector('.timesheet-dialog'));
  assert.equal(saved.entry.engineer, ' ALICE  Green ');
  root.dispose(); root.remove();
  const mobile = mountToolbox(t, renderTimesheets({ state, initialDate: date,
    onSave: async value => { saved = value; state = saveTimesheet(state, value.entry, value); return { state }; },
  }));
  assert.equal(mobile.querySelector('[aria-label="Engineer filter"]'), null, 'the mobile default keeps its current navigation');
  click(mobile, '[data-timesheet-add]');
  assert.equal(mobile.querySelector('[aria-label="Engineer"]').value, 'Running Engineer');
  field(mobile, '[aria-label="Engineer"]', '  Office   Engineer  ');
  submit(mobile, '[data-timesheet-form]');
  await until(() => !mobile.querySelector('.timesheet-dialog'));
  assert.equal(saved.entry.engineer, 'Office Engineer');
});
