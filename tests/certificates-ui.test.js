import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCertificates } from '../src/certificates-ui.js';
import { CERTIFICATE_FIELDS, createCertificateDraft, saveCertificateDraft, reviewCertificateDraft, issueCertificate } from '../src/certificates.js';
import { createQuickJob } from '../src/model.js';
import { installToolboxDOM, mountToolbox, field, click, submit, until } from './helpers/toolbox-dom.js';

function installDOM(t) {
  const window = installToolboxDOM(t);
  // happy-dom omits table-section rows; browsers supply the live collection.
  if (!Object.getOwnPropertyDescriptor(window.HTMLTableSectionElement.prototype, 'rows'))
    Object.defineProperty(window.HTMLTableSectionElement.prototype, 'rows', {configurable: true, get() { return this.querySelectorAll(':scope > tr'); }});
  return window;
}

function jobWithDraft() {
  const job = createQuickJob(null, {discipline: 'Intruder', workType: 'Call out', engineer: 'Training Engineer', scope: 'Investigate the recorded fault'});
  job.results = [{id: 'result-a', assetId: 'asset-a', state: 'Not tested', readings: [], photos: []}];
  job.certificates = saveCertificateDraft(job, createCertificateDraft(job));
  return job;
}
function completeFields(root) {
  for (const item of CERTIFICATE_FIELDS) {
    const input = root.querySelector(`[name="${item.key}"]`);
    if (item.required && !input.value) field(root, `[name="${item.key}"]`, item.type === 'date' ? '2026-11-24' : `Synthetic ${item.label}`);
  }
}
function issuedJob() {
  const job = jobWithDraft(), draft = job.certificates.draft;
  for (const item of CERTIFICATE_FIELDS) if (item.required && !draft.fields[item.key]) draft.fields[item.key] = item.type === 'date' ? '2026-11-24' : `Synthetic ${item.label}`;
  job.certificates = issueCertificate(job, reviewCertificateDraft(job, draft));
  return job;
}

test('certificate drafts are available to a standalone visit and preserve failed edits', async t => {
  installDOM(t);
  const job = jobWithDraft(), original = structuredClone(job); let saved = null, succeed = false;
  const dirty = [];
  const root = mountToolbox(t, renderCertificates({job, onDirty: value => dirty.push(value), onSave: async value => { saved = value; return succeed; }}));
  field(root, '[name="siteName"]', 'Training standalone premises');
  field(root, '[name="findings"]', 'Not tested equipment remains outstanding.');
  submit(root, '.certificate-form');
  await until(() => root.querySelector('.certificate-error').textContent.includes('could not be saved'));
  assert.equal(root.querySelector('[name="siteName"]').value, 'Training standalone premises');
  assert.deepEqual(job, original);
  assert.equal(dirty.at(-1), true);
  succeed = true;
  submit(root, '.certificate-form');
  await until(() => dirty.at(-1) === false);
  assert.equal(saved.certificates.draft.fields.siteName, 'Training standalone premises');
  assert.deepEqual(saved.results, original.results);
});

test('review displays missing details and explicit confirmation gates issue without passing devices', async t => {
  installDOM(t);
  const job = jobWithDraft(); let saved = null;
  const root = mountToolbox(t, renderCertificates({job, onSave: async value => { saved = value; return true; }}));
  click(root, '[data-certificate-review]');
  assert.equal(root.querySelector('.certificate-review').hidden, false);
  assert.match(root.querySelector('.certificate-missing').textContent, /Customer|Site|company/i);
  assert.match(root.querySelector('.certificate-warnings').textContent, /Not tested/);
  const confirm = root.querySelector('[data-certificate-confirm]'); confirm.checked = true; confirm.dispatchEvent(new Event('change'));
  assert.equal(root.querySelector('[data-certificate-issue]').disabled, true);
  click(root, '[data-certificate-edit]');
  completeFields(root);
  click(root, '[data-certificate-review]');
  assert.equal(root.querySelector('[data-certificate-confirm]').checked, false);
  assert.equal(root.querySelector('[data-certificate-issue]').disabled, true);
  root.querySelector('[data-certificate-confirm]').checked = true;
  root.querySelector('[data-certificate-confirm]').dispatchEvent(new Event('change'));
  click(root, '[data-certificate-issue]');
  await until(() => saved?.certificates.issued.length === 1);
  assert.equal(saved.certificates.draft, null);
  assert.equal(saved.certificates.issued[0].evidence.job.results[0].state, 'Not tested');
  assert.equal(job.certificates.issued.length, 0);
  assert.deepEqual(saved.results, job.results);
});

test('issued exports use detached old snapshots and revision retains the earlier issue', async t => {
  installDOM(t);
  const job = issuedJob(), original = structuredClone(job.certificates.issued[0]);
  const sent = []; let revised;
  const root = mountToolbox(t, renderCertificates({job, onSave: async value => { revised = value; return true; }, onPrint: value => sent.push(['print', value]), onDownload: value => sent.push(['download', value]), onShare: value => sent.push(['share', value])}));
  for (const action of ['print', 'download', 'share']) {
    click(root, `[data-certificate-${action}]`);
    await until(() => root.getAttribute('aria-busy') === 'false');
  }
  assert.equal(sent.length, 3);
  for (const [, snapshot] of sent) { assert.deepEqual(snapshot, original); assert.notEqual(snapshot, job.certificates.issued[0]); }
  click(root, '[data-certificate-revise]');
  await until(() => revised?.certificates.draft);
  assert.equal(revised.certificates.draft.revisionOf, original.id);
  assert.deepEqual(revised.certificates.issued, [original]);
  assert.equal(revised.certificates.draft.review, null);
});

test('editing a revision cannot export unsaved draft content or silently overwrite an issue', async t => {
  installDOM(t);
  const job = issuedJob();
  job.certificates.draft = createCertificateDraft(job);
  let exports = 0;
  const root = mountToolbox(t, renderCertificates({job, onSave: async () => false, onShare: () => { exports++; }}));
  assert.equal(root.querySelector('[data-certificate-revise]').disabled, true);
  field(root, '[name="siteName"]', 'Unsaved alternate site');
  click(root, '[data-certificate-share]');
  await until(() => root.querySelector('.certificate-error').textContent.includes('Save the certificate draft'));
  assert.equal(exports, 0);
  assert.notEqual(job.certificates.issued[0].fields.siteName, 'Unsaved alternate site');
});
