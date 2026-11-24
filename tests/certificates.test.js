import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  CERTIFICATE_FIELDS, createCertificateDraft, saveCertificateDraft, certificateReadiness,
  reviewCertificateDraft, issueCertificate, reviseCertificate, validateJobCertificates, snapshotCertificatePreview,
} from '../src/certificates.js';
import { renderCertificate } from '../src/certificate-renderer.js';
import { createChecklistDraft } from '../src/job-checklist.js';

const site = { id: 'tutorial-site', name: 'Tutorial practice site', address: 'Sample address — not a real visit' };
const drawing = { id: 'drawing-1', revision: 'R1', kind: 'working', assets: [{ id: 'smoke-1', reference: 'SD-01', type: 'smoke' }], source: { omittedSourceBackup: true } };
function job(overrides = {}) {
  return { id: 'sample-job-1', revision: 4, siteId: site.id, drawingId: drawing.id, discipline: 'Fire', workType: 'Maintenance', engineer: '', scope: 'Tutorial only', results: [{ assetId: 'smoke-1', state: 'Not tested', observations: 'No on-site test performed.' }], workflow: { version: 1, details: { reference: 'SAMPLE-001', client: 'Sample customer', contactEmail: 'sample@example.test' } }, ...overrides };
}
function complete(value = job()) {
  const draft = createCertificateDraft(value, value.siteId ? site : null, value.drawingId ? drawing : null);
  for (const field of CERTIFICATE_FIELDS.filter(field => field.required)) if (!draft.fields[field.key]) draft.fields[field.key] = field.type === 'date' ? '2026-11-24' : `Sample ${field.label}`;
  draft.fields.workDescription = 'Tutorial record only: no equipment inspected.';
  draft.fields.findings = 'No inspection findings recorded; equipment remains untested.';
  draft.fields.limitations = 'No on-site verification was performed.';
  draft.fields.outcome = 'Demonstration only; no certification of installation compliance.';
  return draft;
}
function issued(value = job()) {
  const draft = complete(value);
  return issueCertificate(value, reviewCertificateDraft(value, draft, site, drawing), site, drawing);
}

test('every discipline and visit type can create a draft without inventing results or a visit date', () => {
  for (const discipline of ['Fire', 'Intruder', 'Security', 'CCTV', 'Access control', 'Custom']) {
    for (const workType of ['Maintenance', 'Small works', 'Install', 'Take over visit', 'Call out', 'Custom']) {
      const value = job({ discipline, workType, customDiscipline: discipline === 'Custom' ? 'Water monitoring' : '', customWorkType: workType === 'Custom' ? 'Special visit' : '' }), before = structuredClone(value);
      const draft = createCertificateDraft(value, site, drawing);
      assert.equal(draft.fields.discipline, discipline === 'Custom' ? 'Water monitoring' : discipline);
      assert.equal(draft.fields.jobType, workType === 'Custom' ? 'Special visit' : workType);
      assert.equal(draft.fields.visitDate, '');
      assert.equal(draft.fields.findings, '');
      assert.equal(draft.fields.outcome, '');
      assert.equal(draft.fields.engineerName, '');
      assert.equal(draft.review, null);
      assert.equal(draft.fields.clientEmail, 'sample@example.test');
      assert.deepEqual(value, before);
    }
  }
  assert.equal(validateJobCertificates(undefined), undefined);
});

test('incomplete drafts save but issue requires complete fields and explicit review', () => {
  const value = job(), empty = createCertificateDraft(value, site, drawing);
  assert.equal(saveCertificateDraft(value, empty).draft.id, empty.id);
  assert(certificateReadiness(value, empty, site, drawing).missing.includes('Work actually carried out'));
  assert.throws(() => issueCertificate(value, empty, site, drawing), /Complete before issue/);
  const draft = complete(value), readiness = certificateReadiness(value, draft, site, drawing);
  assert.deepEqual(readiness.missing, []);
  assert.equal(readiness.ready, false);
  assert(readiness.warnings.some(message => message.includes('Not tested')));
  assert.throws(() => issueCertificate(value, draft, site, drawing), /Review and confirm/);
  const checked = reviewCertificateDraft(value, draft, site, drawing);
  assert.equal(certificateReadiness(value, checked, site, drawing).ready, true);
});

test('shared site settings and explicit job overrides seed and freeze the effective visit information', () => {
  const shared = { ...site, profile: { version: 1, discipline: 'CCTV', workType: 'Call out', client: 'Shared customer', contactEmail: 'office@example.test', engineer: 'Shared engineer', scope: 'Shared recorded scope' } };
  const value = job({ discipline: '', workType: '', workflow: { version: 1, details: { reference: 'SITE-001' } }, settings: { version: 1, overrides: {} } });
  const draft = createCertificateDraft(value, shared, drawing);
  assert.equal(draft.fields.discipline, 'CCTV');
  assert.equal(draft.fields.jobType, 'Call out');
  assert.equal(draft.fields.clientName, 'Shared customer');
  assert.equal(draft.fields.clientEmail, 'office@example.test');
  assert.equal(draft.fields.engineerName, 'Shared engineer');
  const overridden = { ...value, settings: { version: 1, overrides: { engineer: 'Visit engineer' } } };
  const custom = createCertificateDraft(overridden, shared, drawing);
  assert.equal(custom.fields.engineerName, 'Visit engineer');
  for (const field of CERTIFICATE_FIELDS.filter(field => field.required)) if (!custom.fields[field.key]) custom.fields[field.key] = field.type === 'date' ? '2026-11-24' : `Sample ${field.label}`;
  const record = issueCertificate(overridden, reviewCertificateDraft(overridden, custom, shared, drawing), shared, drawing).issued[0];
  assert.equal(record.evidence.job.discipline, 'CCTV');
  assert.equal(record.evidence.job.engineer, 'Visit engineer');
  assert.equal(value.discipline, '');
  assert.throws(() => certificateReadiness(value, custom, shared, { ...drawing, id: 'unrelated' }), /does not belong/);
});

test('field and supporting evidence edits invalidate review; certificate-only save revisions do not', () => {
  const value = job(), reviewed = reviewCertificateDraft(value, complete(value), site, drawing);
  assert.equal(certificateReadiness({ ...value, revision: 5, updatedAt: new Date().toISOString() }, reviewed, site, drawing).reviewed, true);
  const changed = structuredClone(reviewed); changed.fields.limitations += ' Changed.';
  assert.equal(certificateReadiness(value, changed, site, drawing).reviewed, false);
  assert.throws(() => issueCertificate(value, changed, site, drawing), /Review and confirm/);
  const changedJob = structuredClone(value); changedJob.results[0].state = 'Unsatisfactory';
  assert.equal(certificateReadiness(changedJob, reviewed, site, drawing).reviewed, false);
  assert.equal(certificateReadiness(value, reviewed, { ...site, name: 'Changed site' }, drawing).reviewed, false);
  const store = saveCertificateDraft(value, reviewed);
  assert.equal(saveCertificateDraft({ ...value, certificates: store }, changed).draft.review, null);
});

test('issue captures complete detached evidence without changing device outcomes or recursing through prior certificates', () => {
  const value = job(), before = structuredClone(value), store = issued(value), record = store.issued[0];
  assert.equal(store.draft, null);
  assert.equal(record.evidence.job.results[0].state, 'Not tested');
  assert.equal(record.evidence.job.revision, 4);
  assert.equal(record.evidence.job.certificates, undefined);
  assert.equal(record.evidence.drawing.source, undefined);
  value.results[0].state = 'Satisfactory';
  assert.equal(record.evidence.job.results[0].state, 'Not tested');
  assert.deepEqual(before, job());
  const withIssue = { ...before, certificates: store };
  const revision = reviseCertificate(withIssue, record.id);
  assert.equal(revision.revisionOf, record.id);
  assert.notEqual(revision.fields.number, record.fields.number);
  assert.equal(revision.review, null);
  revision.fields.workDescription = 'Revised sample description';
  const revised = issueCertificate(withIssue, reviewCertificateDraft(withIssue, revision, site, drawing), site, drawing);
  assert.equal(revised.issued.length, 2);
  assert.deepEqual(revised.issued[0], record);
  assert.equal(revised.issued[1].evidence.job.certificates, undefined);
  assert.equal(revised.issued[1].revisionOf, record.id);
  assert.throws(() => reviseCertificate({ ...withIssue, certificates: saveCertificateDraft(withIssue, revision) }, record.id), /existing draft/);
});

test('standalone visits can supply customer/site details and keep their absent site and drawing', () => {
  const value = job({ siteId: null, drawingId: null, results: [] }), draft = complete(value);
  draft.fields.siteName = site.name;
  const store = issueCertificate(value, reviewCertificateDraft(value, draft), null, null);
  assert.equal(store.issued[0].evidence.site, null);
  assert.equal(store.issued[0].evidence.drawing, null);
  assert.equal(store.issued[0].fields.siteName, site.name);
});

test('validators reject malformed issues, duplicate numbers, recursive certificates and external images', () => {
  const good = issued();
  assert.deepEqual(validateJobCertificates(JSON.parse(JSON.stringify(good))), good);
  const badDate = structuredClone(good); badDate.issued[0].fields.visitDate = '2026-02-30';
  assert.throws(() => validateJobCertificates(badDate), /real date/);
  const missing = structuredClone(good); missing.issued[0].fields.declaration = '';
  assert.throws(() => validateJobCertificates(missing), /incomplete/);
  const recursive = structuredClone(good); recursive.issued[0].evidence.job.certificates = good;
  assert.throws(() => validateJobCertificates(recursive), /nested field/);
  const external = structuredClone(good); external.issued[0].evidence.job.results[0].photos = [{ image: 'https://example.test/private.png' }];
  assert.throws(() => validateJobCertificates(external), /embedded raster/);
  const dangling = structuredClone(good); dangling.issued[0].revisionOf = 'missing';
  assert.throws(() => validateJobCertificates(dangling), /earlier retained issue/);
  const duplicate = structuredClone(good); duplicate.issued.push({ ...structuredClone(duplicate.issued[0]), id: 'different-id' });
  assert.throws(() => validateJobCertificates(duplicate), /numbers must be unique/);
});

test('certificate renderer uses only the snapshot, preserves supporting not-tested evidence and escapes editable text', () => {
  const window = new Window();
  // Happy DOM does not implement HTMLTableSectionElement.rows; browsers do.
  Object.defineProperty(window.HTMLTableSectionElement.prototype, 'rows', { configurable: true, get() { return this.querySelectorAll(':scope > tr'); } });
  const old = { document: globalThis.document, Node: globalThis.Node };
  globalThis.document = window.document; globalThis.Node = window.Node;
  try {
    const value = job(), draft = complete(value); draft.fields.siteName = '<script>bad()</script> Sample site';
    const record = issueCertificate(value, reviewCertificateDraft(value, draft, site, drawing), site, drawing).issued[0];
    const node = renderCertificate({ certificate: record });
    assert.match(node.querySelector('h1').textContent, /certificate/);
    assert.equal(node.querySelector('.certificate-state').textContent, 'Issued certificate');
    assert.equal(node.querySelectorAll('script').length, 0);
    assert(node.textContent.includes('<script>bad()</script> Sample site'));
    assert(node.textContent.includes('Not tested'));
    assert(node.textContent.includes('not a cryptographic digital signature'));
    assert.equal(node.querySelectorAll('.certificate-evidence-appendix').length, 1);
    assert.equal(renderCertificate({ certificate: record, includeEvidence: false }).querySelectorAll('.certificate-evidence-appendix').length, 0);
    assert.equal(renderCertificate({ certificate: snapshotCertificatePreview(value, draft, site, drawing) }).querySelector('.certificate-state').textContent, 'Draft certificate — not issued');
    const selectedDrawing = { ...drawing, revision: 'R12' }, checklistJob = job();
    checklistJob.checklist = { ...createChecklistDraft(checklistJob), revision: 1, savedAt: new Date().toISOString(), drawingRevision: 'R12' };
    const checklistDraft = complete(checklistJob);
    const frozen = issueCertificate(checklistJob, reviewCertificateDraft(checklistJob, checklistDraft, site, selectedDrawing), site, selectedDrawing).issued[0];
    selectedDrawing.revision = 'R99';
    const report = renderCertificate({ certificate: frozen }).querySelector('.checklist-report');
    const drawingLabel = [...report.querySelectorAll('dt')].find(node => node.textContent === 'Drawing ID / revision');
    assert.equal(drawingLabel.nextElementSibling.textContent, 'drawing-1 / R12');
  } finally { globalThis.document = old.document; globalThis.Node = old.Node; window.happyDOM.abort(); }
});
