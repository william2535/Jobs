import test from 'node:test';
import assert from 'node:assert/strict';
import { newSite, newJob } from '../src/model.js';
import { createJobPackage, importJobPackage } from '../src/packages.js';
import {
  normalizeWorkflow,
  validateWorkflow,
  updateWorkflow,
  removeWorkflowRecord,
  workflowProgress,
  renderWorkflowReport,
} from '../src/job-workflow.js';

function fixture() {
  return {
    id: 'synthetic-workflow-job',
    siteId: 'synthetic-site',
    drawingId: 'synthetic-drawing',
    revision: 4,
    status: 'Open',
    results: [
      { id: 'result-1', assetId: 'asset-1', state: 'Not tested', notes: '' },
      { id: 'result-2', assetId: 'asset-2', state: 'Unsatisfactory', notes: 'Synthetic battery defect' },
    ],
    aiProposals: [{ id: 'proposal-1', text: 'Unconfirmed suggestion' }],
  };
}

const task = (values = {}) => ({
  title: 'Check agreed access arrangements', required: true, complete: false, notes: '', ...values,
});
const product = (values = {}) => ({
  description: 'Synthetic cable', quantity: 2, unit: 'm', unitCost: 1.5, currency: 'GBP', complete: false, ...values,
});

test('older jobs gain empty workflow collections without changing existing evidence', () => {
  const job = fixture();
  const before = structuredClone(job);
  const workflow = normalizeWorkflow(job);
  assert.equal(workflow.version, 1);
  for (const collection of ['appointments', 'tasks', 'products', 'purchaseOrders', 'timesheets']) {
    assert.deepEqual(workflow[collection], []);
  }
  assert.ok(!workflow.finalisation.clientAcknowledgement?.name, 'no client acknowledgement is invented');
  assert.deepEqual(job, before);
  workflow.details.title = 'Changed detached workflow';
  assert.deepEqual(job, before);
});

test('editing and deleting workflow records retain stable identities and preserve visit evidence', () => {
  const original = fixture();
  const added = updateWorkflow(original, 'tasks', task());
  const id = added.workflow.tasks[0].id;
  assert.equal(typeof id, 'string');
  assert.ok(id.length);
  const updated = updateWorkflow(added, 'tasks', task({ id, title: 'Confirm revised access', complete: true }));
  assert.equal(updated.workflow.tasks.length, 1);
  assert.equal(updated.workflow.tasks[0].id, id);
  assert.equal(updated.workflow.tasks[0].title, 'Confirm revised access');
  assert.equal(added.workflow.tasks[0].complete, false);
  assert.deepEqual(updated.results, original.results);
  assert.deepEqual(updated.aiProposals, original.aiProposals);
  assert.equal(updated.revision, original.revision, 'the caller owns saved job revision increments');
  const removed = removeWorkflowRecord(updated, 'tasks', id);
  assert.deepEqual(removed.workflow.tasks, []);
  assert.equal(updated.workflow.tasks.length, 1);
  assert.deepEqual(removed.results, original.results);
});

test('work and product completion totals are calculated without passing equipment', () => {
  const original = fixture();
  let job = updateWorkflow(original, 'tasks', task({ complete: true }));
  job = updateWorkflow(job, 'tasks', task({ title: 'Record limitations', required: false }));
  job = updateWorkflow(job, 'tasks', task({ title: 'Check the work instruction' }));
  job = updateWorkflow(job, 'products', product({ complete: true }));
  job = updateWorkflow(job, 'products', product({ description: 'Synthetic connector', quantity: 1 }));
  const progress = workflowProgress(job);
  assert.equal(progress.complete, 1);
  assert.equal(progress.total, 3);
  assert.equal(progress.requiredComplete, 1);
  assert.equal(progress.requiredTotal, 2);
  assert.equal(progress.productsComplete, 1);
  assert.equal(progress.productsTotal, 2);
  assert.deepEqual(job.results, original.results);
});

test('valid job metadata and appointments are editable without mutating earlier records', () => {
  const original = fixture();
  let job = updateWorkflow(original, 'details', { reference: 'SYN-101', title: 'Synthetic maintenance visit', estimatedHours: 2.5 });
  job = updateWorkflow(job, 'details', { title: 'Synthetic fault visit' });
  assert.equal(job.workflow.details.reference, 'SYN-101');
  assert.equal(job.workflow.details.title, 'Synthetic fault visit');
  assert.equal(job.workflow.details.estimatedHours, 2.5);
  job = updateWorkflow(job, 'appointments', { date: '2026-11-14', start: '09:00', end: '11:30', engineer: 'Training engineer' });
  assert.equal(job.workflow.appointments[0].date, '2026-11-14');
  assert.equal(job.workflow.appointments[0].engineer, 'Training engineer');
  assert.equal(original.workflow, undefined);
});

test('timesheet hours use entered times or an explicit duration and reject reversed intervals', () => {
  let job = updateWorkflow(fixture(), 'timesheets', { date: '2026-11-14', start: '09:15', end: '11:45', hours: '', note: 'Synthetic visit' });
  assert.equal(job.workflow.timesheets[0].hours, 2.5);
  job = updateWorkflow(job, 'timesheets', { date: '2026-11-15', start: '', end: '', hours: 1.25, note: 'Synthetic follow-up' });
  assert.equal(workflowProgress(job).hours, 3.75);
  assert.throws(() => updateWorkflow(job, 'timesheets', { date: '2026-11-15', start: '12:00', end: '09:00', hours: '', note: '' }));
  assert.throws(() => updateWorkflow(job, 'timesheets', { date: '2026-11-15', start: '', end: '', hours: '', note: '' }));
});

test('invalid edits are rejected without changing the original workflow', () => {
  const job = updateWorkflow(fixture(), 'products', product());
  const original = structuredClone(job);
  for (const invalid of [
    () => updateWorkflow(job, 'products', product({ quantity: -1 })),
    () => updateWorkflow(job, 'products', product({ quantity: Infinity })),
    () => updateWorkflow(job, 'products', product({ unitCost: -0.1 })),
    () => updateWorkflow(job, 'products', product({ complete: 'yes' })),
    () => updateWorkflow(job, 'details', { estimatedHours: -1 }),
    () => updateWorkflow(job, 'details', { title: 'x'.repeat(10001) }),
    () => updateWorkflow(job, 'tasks', task({ required: 'yes' })),
    () => updateWorkflow(job, 'appointments', { date: 'bad date', start: '25:00', end: '26:00', engineer: '' }),
  ]) assert.throws(invalid);
  assert.deepEqual(job, original);
});

test('purchase orders are local records with explicit statuses and nonnegative amounts', () => {
  let job = updateWorkflow(fixture(), 'purchaseOrders', {
    reference: 'SYN-PO-1', supplier: 'Synthetic supplier', status: 'Draft', date: '2026-11-14', amount: 20.5, currency: 'GBP', notes: 'Local record only',
  });
  const record = job.workflow.purchaseOrders[0];
  job = updateWorkflow(job, 'purchaseOrders', { ...record, status: 'Submitted externally' });
  assert.equal(job.workflow.purchaseOrders.length, 1);
  assert.equal(job.workflow.purchaseOrders[0].id, record.id);
  assert.equal(job.workflow.purchaseOrders[0].status, 'Submitted externally');
  assert.throws(() => updateWorkflow(job, 'purchaseOrders', { ...record, status: 'Send now' }));
  assert.throws(() => updateWorkflow(job, 'purchaseOrders', { ...record, amount: -1 }));
  assert.deepEqual(job.results, fixture().results);
});

test('finalisation records explicit acknowledgement and status without signatures or automatic results', () => {
  const original = fixture();
  const job = updateWorkflow(original, 'finalisation', {
    status: 'Complete', technicianNote: 'Recorded work and outstanding defect.', invoiceNote: 'Training record',
    clientAcknowledgement: { name: 'Synthetic client', recordedAt: '2026-11-14T11:45:00.000Z', note: 'Visit acknowledged; not a technical declaration.' },
  });
  assert.equal(job.status, 'Complete');
  assert.equal(job.workflow.finalisation.clientAcknowledgement.name, 'Synthetic client');
  assert.equal(job.workflow.finalisation.clientAcknowledgement.recordedAt, '2026-11-14T11:45:00.000Z');
  assert.deepEqual(job.results, original.results);
  assert.deepEqual(job.aiProposals, original.aiProposals);
  assert.equal(original.status, 'Open');
  assert.equal(job.signature, undefined);
  assert.equal(job.certificate, undefined);
});

test('workflow validation rejects malformed versions and duplicate record IDs', () => {
  const job = updateWorkflow(fixture(), 'tasks', task({ id: 'same-task' }));
  const duplicate = structuredClone(job.workflow);
  duplicate.tasks.push({ ...duplicate.tasks[0] });
  assert.throws(() => validateWorkflow(duplicate));
  assert.throws(() => validateWorkflow({ ...job.workflow, version: 99 }));
  assert.throws(() => validateWorkflow({ ...job.workflow, tasks: null }));
});


test('workflow records and stable IDs survive a job-package round trip', async () => {
  const site = newSite('Synthetic workflow export site');
  let job = newJob(site, { engineer: 'Training engineer' });
  job = updateWorkflow(job, 'details', { reference: 'SYN-EXP-1', title: 'Synthetic workflow export', estimatedHours: 1 });
  job = updateWorkflow(job, 'tasks', task());
  job = updateWorkflow(job, 'products', product());
  job = updateWorkflow(job, 'appointments', { date: '2026-11-14', start: '09:00', end: '10:00', engineer: 'Training engineer' });
  job = updateWorkflow(job, 'purchaseOrders', { reference: 'SYN-PO-2', supplier: 'Synthetic supplier', status: 'Draft', date: '2026-11-14', amount: 3, currency: 'GBP', notes: '' });
  const pack = await createJobPackage(site, job);
  const imported = await importJobPackage({ sites: [], jobs: [] }, JSON.stringify(pack));
  assert.deepEqual(imported.job.workflow, job.workflow);
  assert.equal(imported.job.id, job.id);
  assert.equal(imported.job.workflow.tasks[0].id, job.workflow.tasks[0].id);
  assert.deepEqual((await createJobPackage(imported.state.sites[0], imported.job)).job.workflow, job.workflow);
});

test('malformed workflow objects and missing stored IDs reject instead of inventing identities', () => {
  const workflow = normalizeWorkflow(fixture());
  assert.throws(() => validateWorkflow({ ...workflow, details: 'not an object' }));
  assert.throws(() => validateWorkflow({ ...workflow, finalisation: [] }));
  assert.throws(() => validateWorkflow({ ...workflow, details: { title: false } }));
  assert.throws(() => validateWorkflow({ ...workflow, details: { reference: 0 } }));
  assert.throws(() => validateWorkflow({ ...workflow, tasks: [task()] }));
  assert.throws(() => validateWorkflow({ ...workflow, tasks: [task({ id: '' })] }));
  assert.throws(() => updateWorkflow(fixture(), 'tasks', task({ id: '' })));
});


test('draft workflow report includes actual work and safely separates private notes from client acknowledgement', () => {
  let job = updateWorkflow(fixture(), 'details', { reference: 'SYN-REPORT-1', title: '<img src=x onerror=alert(1)>', internalNote: 'Private office planning text' });
  job = updateWorkflow(job, 'tasks', task({ title: 'Synthetic agreed action', complete: true, notes: 'Confirmed in the visit record.' }));
  job = updateWorkflow(job, 'products', product({ description: 'Synthetic test cable', complete: true }));
  job = updateWorkflow(job, 'timesheets', { date: '2026-11-14', start: '09:00', end: '10:30', hours: '', note: 'Synthetic recorded work' });
  job = updateWorkflow(job, 'finalisation', { technicianNote: 'Device defect remains unresolved.', invoiceNote: 'Private invoice preparation text', clientAcknowledgement: { name: 'Synthetic client', recordedAt: '2026-11-14T10:30:00.000Z', note: 'Acknowledged receipt of visit summary.' } });
  const before = structuredClone(job);
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ className: '', innerHTML: '' }) };
  try {
    const report = renderWorkflowReport(job);
    assert.equal(report.className, 'workflow-report');
    assert.match(report.innerHTML, /SYN-REPORT-1/);
    assert.match(report.innerHTML, /Synthetic agreed action/);
    assert.match(report.innerHTML, /Confirmed in the visit record\./);
    assert.match(report.innerHTML, /Synthetic test cable/);
    assert.match(report.innerHTML, /GBP 3\.00/);
    assert.match(report.innerHTML, /1\.5 hours/);
    assert.match(report.innerHTML, /Device defect remains unresolved\./);
    assert.match(report.innerHTML, /Synthetic client/);
    assert.match(report.innerHTML, /2026-11-14T10:30:00\.000Z/);
    assert.match(report.innerHTML, /not a digital signature or certificate/);
    assert.match(report.innerHTML, /&lt;img/);
    assert.doesNotMatch(report.innerHTML, /<img/);
    assert.doesNotMatch(report.innerHTML, /Private office planning text/);
    assert.doesNotMatch(report.innerHTML, /Private invoice preparation text/);
    assert.deepEqual(job, before);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
