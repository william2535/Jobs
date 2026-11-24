import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { newSite, newJob, createQuickJob } from '../src/model.js';
import {
  validateJobCertificates, createCertificateDraft, saveCertificateDraft,
  reviewCertificateDraft, issueCertificate, reviseCertificate, certificateReadiness,
} from '../src/certificates.js';
import { createJobPackage, importJobPackage, validateJobPackage } from '../src/packages.js';
import { createWorkspaceBackup, inspectWorkspaceBackup, restoreWorkspaceBackup } from '../src/workspace-backup.js';
import { saveState, loadState } from '../src/storage.js';

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=';
const AT = '2026-11-24T10:00:00.000Z';
const empty = () => ({ sites: [], jobs: [], quickDefects: [], unassignedTimesheets: [], assetTemplates: [] });
function fixture(discipline = 'Fire', standalone = false) {
  const site = standalone ? null : newSite('Synthetic certificate premises', '1 Example Road');
  if (site) site.drawings[0].assets.push({
    id: 'certificate-device', type: 'smoke', reference: 'SYN-001',
    floorId: site.drawings[0].floors[0].id, x: .5, y: .5,
    photos: [{ id: 'drawing-photo', caption: 'Synthetic image', image: PIXEL }],
  });
  const job = site ? newJob(site) : createQuickJob(null, { title: 'Synthetic visit' });
  Object.assign(job, { discipline, workType: 'Maintenance', engineer: 'Synthetic Engineer', revision: 3 });
  if (job.results[0]) Object.assign(job.results[0], {
    state: 'Unsatisfactory', observations: 'Device needs investigation.',
    photos: [{ id: 'visit-photo', caption: 'Synthetic evidence', image: PIXEL }],
  });
  const fields = {
    title: `${discipline} visit certificate`, number: 'SYN-001', issueDate: '2026-11-24', visitDate: '2026-11-24',
    discipline, jobType: 'Maintenance', system: `${discipline} system`,
    siteName: site?.name || 'Standalone visit location', siteAddress: site?.address || '2 Example Road',
    clientName: 'Synthetic client', clientAddress: '1 Example Road',
    companyName: 'Synthetic company', companyAddress: '3 Example Road', companyContact: 'example@example.invalid',
    engineerName: 'Synthetic Engineer', scope: 'Recorded equipment only', workDescription: 'Recorded visit work',
    findings: 'Review the recorded defect.', limitations: 'Unrecorded checks remain unrecorded.',
    outcome: 'Completed with defects', standard: '', declaration: 'The recorded work and limitations were reviewed.',
  };
  const drawing = site ? structuredClone(site.drawings[0]) : null;
  if (drawing) for (const key of ['source', 'issuedSnapshots', 'planPreviews', 'planPreviewErrors', 'planPreviewAttemptedFor']) delete drawing[key];
  const evidence = {
    job: structuredClone(job),
    site: site ? { id: site.id, name: site.name, address: site.address, profile: site.profile || null } : null,
    drawing,
  };
  const issued = { id: 'certificate-issued-1', draftId: 'certificate-draft-1', revisionOf: null, issuedAt: AT, reviewedAt: AT, fields, evidence };
  const draft = { id: 'certificate-draft-2', revisionOf: issued.id, createdAt: AT, updatedAt: AT, fields: { ...fields, number: 'SYN-002' }, review: null };
  job.certificates = validateJobCertificates({ version: 1, draft, issued: [issued] });
  return { site, job };
}

test('the real review, issue and revision workflow survives local reopen and portable exports', async () => {
  const { site, job } = fixture(), values = structuredClone(job.certificates.issued[0].fields);
  delete job.certificates;
  const drawing = site.drawings[0];
  const draft = createCertificateDraft(job, site, drawing);
  draft.fields = values;
  job.certificates = saveCertificateDraft(job, draft);
  const reviewed = reviewCertificateDraft(job, job.certificates.draft, site, drawing);
  job.certificates = saveCertificateDraft(job, reviewed);
  const state = { ...empty(), sites: [site], jobs: [job] };
  await saveState(state);
  const reopened = await loadState(), saved = reopened.jobs[0];
  assert.equal(certificateReadiness(saved, saved.certificates.draft, reopened.sites[0], drawing).ready, true);
  saved.certificates = issueCertificate(saved, saved.certificates.draft, reopened.sites[0], drawing);
  saved.revision++;
  await saveState(reopened);
  const issued = structuredClone(saved.certificates.issued[0]);
  const revisedDraft = reviseCertificate(saved, issued.id);
  revisedDraft.fields.number = 'SYN-002';
  revisedDraft.fields.findings = 'Revised recorded findings';
  saved.certificates = saveCertificateDraft(saved, revisedDraft);
  await saveState(reopened);
  const exported = await createJobPackage(reopened.sites[0], saved);
  const imported = await importJobPackage(empty(), exported);
  assert.deepEqual(imported.job.certificates.issued[0], issued);
  assert.equal(imported.job.certificates.draft.revisionOf, issued.id);
  assert.equal(imported.job.certificates.draft.review, null);
  const restored = await restoreWorkspaceBackup(empty(), await createWorkspaceBackup(reopened));
  assert.deepEqual(restored.state.jobs[0].certificates, saved.certificates);
});

test('certificate drafts and issued evidence round trip through packages for each discipline and standalone visits', async () => {
  for (const discipline of ['Fire', 'Security', 'Intruder', 'CCTV', 'Access control']) {
    for (const standalone of [false, true]) {
      const { site, job } = fixture(discipline, standalone), original = structuredClone(job.certificates);
      const wire = await createJobPackage(site, job);
      if (site) assert.equal(wire.attachments.length, 1, 'Current and issued photos share one media attachment');
      const imported = await importJobPackage(empty(), JSON.stringify(wire));
      assert.deepEqual(imported.job.certificates, original);
      assert.deepEqual(job.certificates, original, 'Export does not mutate the live job');
      imported.job.certificates.draft.fields.findings = 'Unsaved edit after importing';
      assert.deepEqual(job.certificates, original);
      assert.deepEqual(imported.job.certificates.issued, original.issued);
    }
  }
});

test('conflicting job and drawing imports retain original certificate provenance without duplicating repeated imports', async () => {
  const { site, job } = fixture(), wire = await createJobPackage(site, job);
  const issued = structuredClone(job.certificates.issued);
  site.drawings[0].revision = 'Different local drawing';
  job.results[0].notes = 'Keep the local visit result';
  const state = { ...empty(), sites: [site], jobs: [job] }, before = structuredClone(state);
  const imported = await importJobPackage(state, wire);
  assert.equal(imported.conflict, true);
  assert.notEqual(imported.job.id, job.id);
  assert.notEqual(imported.job.drawingId, job.drawingId);
  assert.deepEqual(imported.job.certificates.issued, issued, 'Frozen evidence uses original IDs, never remapped local IDs');
  assert.deepEqual(imported.job.certificates.draft, job.certificates.draft);
  assert.deepEqual(state, before);
  const repeated = await importJobPackage(imported.state, wire);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.state.jobs.length, 2);
  const exportedAgain = await createJobPackage(imported.state.sites[0], imported.job);
  const reopened = await importJobPackage(empty(), exportedAgain);
  assert.deepEqual(reopened.job.certificates, imported.job.certificates);
});

test('workspace backup and restore preserve certificate revisions and historical evidence after live changes', async () => {
  const { site, job } = fixture(), original = structuredClone(job.certificates);
  job.results[0].observations = 'Later job observation';
  job.revision++;
  site.name = 'Renamed current site';
  const workspace = { ...empty(), sites: [site], jobs: [job] };
  const wire = await createWorkspaceBackup(workspace, { appVersion: 'certificate-test' });
  assert.equal(wire.attachments.length, 1);
  const inspection = await inspectWorkspaceBackup(wire);
  assert.deepEqual(inspection.workspace.jobs[0].certificates, original);
  const restored = await restoreWorkspaceBackup(empty(), JSON.stringify(wire));
  assert.deepEqual(restored.state.jobs[0].certificates, original);
  assert.equal(restored.state.sites[0].name, 'Renamed current site');
  assert.equal(restored.state.jobs[0].certificates.issued[0].evidence.site.name, 'Synthetic certificate premises');
  assert.equal((await restoreWorkspaceBackup(restored.state, wire)).duplicate, true);
});

test('malformed and recursive certificate data is rejected before package import or backup changes work', async () => {
  const { site, job } = fixture(), state = { ...empty(), sites: [site], jobs: [job] }, before = structuredClone(state);
  for (const change of [
    certificates => { certificates.version = 99; },
    certificates => { certificates.issued.push(structuredClone(certificates.issued[0])); },
    certificates => { certificates.issued[0].issuedAt = 'invalid date'; },
    certificates => { certificates.draft.revisionOf = 'missing-certificate'; },
    certificates => { certificates.issued[0].evidence.job.certificates = { version: 1, draft: null, issued: [] }; },
  ]) {
    const invalid = structuredClone(job); change(invalid.certificates);
    const wire = { format: 'JobsPackage', version: 1, site, job: invalid };
    assert.throws(() => validateJobPackage(wire), /certificate/i);
    await assert.rejects(importJobPackage(state, wire), /certificate/i);
    await assert.rejects(createWorkspaceBackup({ ...state, jobs: [invalid] }), /certificate/i);
    assert.deepEqual(state, before);
  }
});

test('local storage reopens certificates and atomically rejects rewriting or dropping an issued snapshot', async () => {
  const { site, job } = fixture(), state = { ...empty(), sites: [site], jobs: [job] };
  await saveState(state);
  assert.deepEqual((await loadState()).jobs[0].certificates, job.certificates);
  for (const change of [
    certificates => { certificates.issued[0].fields.findings = 'Overwrite the issued findings'; },
    certificates => { certificates.issued[0].evidence.job.scope = 'Overwrite issued scope'; },
    certificates => { certificates.issued = []; certificates.draft.revisionOf = null; },
  ]) {
    const replacement = structuredClone(state); change(replacement.jobs[0].certificates);
    await assert.rejects(saveState(replacement), /Issued certificates cannot be changed or removed/);
    assert.deepEqual(await loadState(), state);
  }
  const updated = structuredClone(state);
  updated.jobs[0].certificates.draft.fields.findings = 'Editable draft changes remain allowed';
  updated.jobs[0].revision++;
  await saveState(updated);
  assert.deepEqual((await loadState()).jobs[0].certificates, updated.jobs[0].certificates);
  const revised = structuredClone(updated);
  const current = revised.jobs[0].certificates;
  current.issued.push({
    ...structuredClone(current.issued[0]), id: 'certificate-issued-2', draftId: current.draft.id,
    revisionOf: current.issued[0].id, issuedAt: '2026-11-24T11:00:00.000Z', reviewedAt: '2026-11-24T11:00:00.000Z',
    fields: structuredClone(current.draft.fields),
  });
  current.draft = null;
  revised.jobs[0].revision++;
  await saveState(revised);
  assert.deepEqual((await loadState()).jobs[0].certificates, current, 'A new issued revision appends without changing its predecessor');
  assert.deepEqual(current.issued[0], job.certificates.issued[0]);
  const invalid = structuredClone(revised); invalid.jobs[0].certificates.version = 99;
  await assert.rejects(saveState(invalid), /certificate/i);
  assert.deepEqual(await loadState(), revised);
});
