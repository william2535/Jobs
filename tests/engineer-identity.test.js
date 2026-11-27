import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseEngineerName, engineerKey, readEngineerName, writeEngineerName, tagDayJobs } from '../src/engineer-identity.js';
import { promptEngineerName } from '../src/engineer-identity-ui.js';
import { newSite, newJob } from '../src/model.js';
import { effectiveJob } from '../src/job-settings.js';
import { createJobPackage, importJobPackage } from '../src/packages.js';
import { installToolboxDOM, mountToolbox, field, click, submit, until } from './helpers/toolbox-dom.js';

test('engineer tags group spacing, case and compatibility variants without losing distinct names', () => {
  assert.equal(normaliseEngineerName('  Ａｌｉｃｅ\u00a0  Jones  '), 'Alice Jones');
  assert.equal(engineerKey('  ALICE Jones '), engineerKey('Alice  Jones'));
  assert.notEqual(engineerKey('José'), engineerKey('Jose'));
  assert.notEqual(engineerKey('Anne-Marie'), engineerKey('Anne Marie'));
  assert.equal(engineerKey(''), '');
  assert.equal(normaliseEngineerName(undefined, { required: false }), '');
  assert.throws(() => normaliseEngineerName(' '), /Enter your name/);
  for (const name of ['Alice\nJones', 'Alice\u0000Jones', 'Alice\u202eJones', 'Alice\u200bJones'])
    assert.throws(() => normaliseEngineerName(name), /control or hidden/);
  assert.throws(() => normaliseEngineerName('x'.repeat(201)), /200/);
  assert.throws(() => normaliseEngineerName('\ufb03'.repeat(67)), /200/);
  assert.throws(() => normaliseEngineerName({ name: 'Alice' }), /as text/);
});

test('saved engineer preference is normalized and storage failures never pretend a successful save', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(readEngineerName(storage), '');
  assert.equal(writeEngineerName('  Alice   Jones ', storage), true);
  assert.equal(values.get('jobs.work-engineer'), 'Alice Jones');
  assert.equal(readEngineerName(storage), 'Alice Jones');
  values.set('jobs.work-engineer', 'Alice\u0000Jones');
  assert.equal(readEngineerName(storage), '');
  const denied = { getItem() { throw Error('Storage denied'); }, setItem() { throw Error('Storage denied'); } };
  assert.equal(readEngineerName(denied), '');
  assert.equal(writeEngineerName('Alice', denied), false);
  assert.equal(writeEngineerName('Alice', null), false);
  assert.throws(() => writeEngineerName('', storage), /Enter your name/);
});

test('confirmed day names pin selected job copies and travel in ordinary exported packs', async () => {
  const site = newSite('Synthetic office premises');
  site.profile = { version: 1, engineer: 'Office planner' };
  const job = newJob(site), untouched = newJob(site);
  const state = { sites: [site], jobs: [job, untouched], officeReceipts: [{ testEvidence: 'Never rewrite stored receipts' }] };
  const before = structuredClone(state);
  const tagged = tagDayJobs(state, [job.id], ' Alice   Jones ', { at: '2026-11-27T08:00:00.000Z' });
  assert.deepEqual(state, before);
  assert.equal(tagged.jobs[0].engineer, 'Alice Jones');
  assert.equal(tagged.jobs[0].settings.overrides.engineer, 'Alice Jones');
  assert.equal(effectiveJob(tagged.jobs[0], site).engineer, 'Alice Jones');
  assert.equal(tagged.jobs[0].revision, job.revision + 1);
  assert.equal(tagged.jobs[0].updatedAt, '2026-11-27T08:00:00.000Z');
  assert.equal(tagged.jobs[0].workflow.timeline.length, 1);
  assert.deepEqual(tagged.jobs[1], untouched);
  assert.deepEqual(tagged.sites, state.sites);
  assert.deepEqual(tagged.officeReceipts, state.officeReceipts);
  assert.deepEqual(tagDayJobs(tagged, [job.id], 'Alice Jones'), tagged, 'A repeated identical tag does not create revisions or history');
  const pack = await createJobPackage(site, tagged.jobs[0]);
  const received = await importJobPackage({ sites: [], jobs: [] }, pack);
  assert.equal(received.job.engineer, 'Alice Jones');
  assert.equal(effectiveJob(received.job, received.state.sites[0]).engineer, 'Alice Jones');
});

test('invalid tagging attempts do not alter jobs, time or earlier certificate evidence', () => {
  const site = newSite('Synthetic site'), job = newJob(site);
  job.certificates = { historicalEvidence: { engineer: 'Earlier engineer' } };
  const state = { sites: [site], jobs: [job] }, before = structuredClone(state);
  for (const ids of [[], [job.id, job.id], ['missing']]) assert.throws(() => tagDayJobs(state, ids, 'Alice'));
  assert.throws(() => tagDayJobs(state, [job.id], 'Alice', { at: 'not a date' }), /time is invalid/);
  assert.deepEqual(state, before);
  assert.deepEqual(tagDayJobs(state, [job.id], 'Alice').jobs[0].certificates, job.certificates);
});

const mount = (t, options) => {
  const dialog = mountToolbox(t, promptEngineerName(options));
  dialog.openPrompt();
  return dialog;
};

test('opening an NFC name prompt requires explicit confirmation and rejects blank names', async t => {
  installToolboxDOM(t);
  const accepted = [];
  const dialog = mount(t, { name: ' Alice ', onConfirm: name => accepted.push(name) });
  assert.equal(dialog.getAttribute('aria-label'), 'Engineer tag');
  assert.equal(dialog.querySelector('input').value, 'Alice');
  assert.deepEqual(accepted, []);
  field(dialog, 'input', ' '); submit(dialog, 'form');
  assert.match(dialog.querySelector('[role="alert"]').textContent, /Enter your name/);
  assert.deepEqual(accepted, []);
  field(dialog, 'input', ' Alice   Jones '); submit(dialog, 'form');
  await until(() => !dialog.isConnected);
  assert.deepEqual(accepted, ['Alice Jones']);
});

test('failed or pending name confirmation stays editable for retry and cannot cancel midway', async t => {
  installToolboxDOM(t);
  let finish, attempts = 0, cancelled = 0;
  const dialog = mount(t, { name: 'Alice', onConfirm: () => ++attempts === 1 ? false : new Promise(resolve => { finish = resolve; }), onCancel: () => cancelled++ });
  submit(dialog, 'form');
  await until(() => dialog.getAttribute('aria-busy') === 'false');
  assert.equal(dialog.open, true);
  assert.match(dialog.querySelector('[role="alert"]').textContent, /not confirmed/);
  submit(dialog, 'form');
  assert.equal(dialog.closePrompt(), false);
  const cancel = new Event('cancel', { cancelable: true });
  dialog.dispatchEvent(cancel); assert.equal(cancel.defaultPrevented, true);
  assert.equal(cancelled, 0);
  finish(true); await until(() => !dialog.isConnected);
  assert.equal(cancelled, 0);
});

test('a running day locks its engineer and a cancelled prompt never confirms or starts work', async t => {
  installToolboxDOM(t);
  const accepted = []; let cancelled = 0;
  const active = mount(t, { name: 'Another engineer', activeEngineer: 'Alice Jones', onConfirm: name => accepted.push(name) });
  assert.equal(active.querySelector('input').readOnly, true);
  field(active, 'input', 'Changed through script');
  submit(active, 'form'); await until(() => !active.isConnected);
  assert.deepEqual(accepted, ['Alice Jones']);
  const dialog = mount(t, { name: 'Bob', onConfirm: name => accepted.push(name), onCancel: () => cancelled++ });
  click(dialog, '[data-engineer-cancel]');
  dialog.dispose();
  assert.equal(cancelled, 1);
  assert.deepEqual(accepted, ['Alice Jones']);
});

test('untrusted names remain text and the confirmed handover dialog retains focus', async t => {
  installToolboxDOM(t);
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  let target;
  const dialog = mount(t, { name: '<img src=x onerror=alert(1)>', onConfirm: () => {
    target = document.createElement('dialog'); const control = document.createElement('button'); target.append(control);
    document.body.append(target); target.showModal(); control.focus();
  } });
  assert.equal(dialog.querySelector('img'), null);
  assert.equal(dialog.querySelector('input').value, '<img src=x onerror=alert(1)>');
  submit(dialog, 'form'); await until(() => !dialog.isConnected);
  assert.equal(target.open, true);
  assert.equal(document.activeElement, target.querySelector('button'));
  target.close(); target.remove(); opener.remove();
});
