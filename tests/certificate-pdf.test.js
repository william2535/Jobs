import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { installToolboxDOM } from './helpers/toolbox-dom.js';
import { newSite, newJob } from '../src/model.js';
import { createCertificateDraft, reviewCertificateDraft, issueCertificate } from '../src/certificates.js';
import { generateCertificatePdf, certificatePdfFilename, shareCertificatePdf } from '../src/certificate-pdf.js';

const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR4nGNgyJgDQhAKABoOBBHF5IdqAAAAAElFTkSuQmCC';
const hasPoppler = ['pdfinfo', 'pdftotext', 'pdfimages'].every(command => spawnSync(command, ['-v']).status === 0);
function dom(t) {
  const window = installToolboxDOM(t);
  // The browser collection is absent in happy-dom's table section implementation.
  Object.defineProperty(window.HTMLTableSectionElement.prototype, 'rows', { configurable: true, get() { return this.querySelectorAll(':scope > tr'); } });
}
function fixture(count = 1) {
  const site = newSite('Synthetic Café — “West”', 'Synthetic site address');
  const drawing = site.drawings[0];
  drawing.assets = Array.from({ length: count }, (_, i) => ({ id: `asset-${i}`, reference: `DEV-${i + 1}`, type: 'smoke', typeName: 'Smoke detector', floorId: drawing.floors[0].id, floorName: 'Ground floor' }));
  const job = newJob(site, { discipline: 'Fire', workType: 'Maintenance', engineer: 'Renée O’Neill', scope: 'Synthetic scheduled visit only' });
  for (const [i, result] of job.results.entries()) {
    result.state = i === 0 ? 'Unsatisfactory' : i === 1 ? 'Inaccessible' : 'Satisfactory';
    result.notes = `Observed device ${i + 1}: ${'Recorded local test evidence and measured condition. '.repeat(8)} EVIDENCE_${i + 1}_END`;
    result.readings = [{ name: 'Resistance', value: '2.4', unit: 'Ω' }];
  }
  job.results[0].photos = [{ id: 'test-photo', image: photo, caption: 'Captured evidence photograph' }];
  job.notesDocument = { version: 1, blocks: [{ id: 'note-checklist', type: 'checklist', align: 'left', items: [
    { id: 'note-done', checked: true, runs: [{ text: 'Access checked' }] },
    { id: 'note-open', checked: false, runs: [{ text: 'Replacement required' }] },
  ] }], photos: [] };
  const draft = createCertificateDraft(job, site, drawing);
  Object.assign(draft.fields, {
    title: 'Synthetic service visit certificate', number: 'SYN/2026/001', issueDate: '2026-11-24', visitDate: '2026-11-23',
    siteName: site.name, siteAddress: site.address, clientName: 'Synthetic Customer', companyName: 'Synthetic Service Company',
    scope: 'Only the devices and work listed', workDescription: 'Functional tests; temperature 20°C; “quoted” observations — £25 part.',
    findings: 'Device 1 unsatisfactory; recorded fault remains.', limitations: 'Device 2 inaccessible; access required.', outcome: 'Recorded fault and access limitations remain.',
  });
  const reviewed = reviewCertificateDraft(job, draft, site, drawing);
  const certificate = issueCertificate(job, reviewed, site, drawing).issued[0];
  return { certificate, job, site, drawing };
}

test('offline certificate PDF paginates saved evidence, Unicode text, long answers and embedded photos', { skip: hasPoppler ? false : 'Install poppler-utils for PDF extraction/layout verification (enabled in verify CI).' }, async t => {
  dom(t);
  const { certificate, job, site } = fixture(18), original = structuredClone(certificate);
  // Simulate live application changes after issue. Export must use the retained snapshot.
  job.results[0].notes = 'LIVE_JOB_CHANGED'; site.name = 'LIVE_SITE_CHANGED';
  certificate.fields.scope += `\n${'Long scope paragraph preserves every word. '.repeat(170)} SCOPE_END`;
  const before = structuredClone(certificate), blob = await generateCertificatePdf(certificate);
  assert.deepEqual(certificate, before, 'PDF generation must not alter the issued record');
  assert.equal(blob.type, 'application/pdf');
  const bytes = Buffer.from(await blob.arrayBuffer()); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  const directory = await mkdtemp(join(tmpdir(), 'jobs-certificate-pdf-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'certificate.pdf'); await writeFile(path, bytes);
  const metadata = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
  const pages = Number(metadata.match(/^Pages:\s+(\d+)/m)?.[1]); assert.ok(pages > 4, metadata);
  const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  for (const value of ['Synthetic Café — “West”', 'Renée O’Neill', '20°C', '£25', 'Resistance', '2.4', 'Ω', 'SCOPE_END', 'Unsatisfactory', 'Inaccessible', 'Captured evidence photograph', 'Complete: Access checked', 'Incomplete: Replacement required', original.id]) assert.ok(text.includes(value), `Missing PDF text: ${value}`);
  for (let i = 1; i <= 18; i++) assert.ok(text.includes(`EVIDENCE_${i}_END`), `Device ${i} evidence lost across pages`);
  assert.ok(!text.includes('LIVE_JOB_CHANGED') && !text.includes('LIVE_SITE_CHANGED'));
  const images = execFileSync('pdfimages', ['-list', path], { encoding: 'utf8' }); assert.match(images, /\bimage\b/);
  const bbox = execFileSync('pdftotext', ['-bbox', path, '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  for (const match of bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">/g)) {
    assert.ok(Number(match[1]) >= 44 && Number(match[3]) <= 553, `Text outside horizontal page margins: ${match[0]}`);
    assert.ok(Number(match[2]) >= 20 && Number(match[4]) <= 830, `Text outside page: ${match[0]}`);
  }
});

test('PDF filenames stay within a single safe filename and drafts cannot be exported as issued', async t => {
  dom(t);
  const { certificate } = fixture();
  assert.equal(certificatePdfFilename(certificate), 'Certificate-SYN-2026-001.pdf');
  certificate.fields.number = '../../<script>:bad?\\file';
  assert.doesNotMatch(certificatePdfFilename(certificate), /[<>:"/\\|?*]/);
  await assert.rejects(generateCertificatePdf({ ...certificate, draft: true }), /Issue and save/);
  await assert.rejects(generateCertificatePdf({ ...certificate, issuedAt: null }), /Issue and save/);
});

function shareHost({ share, canShare = () => true } = {}) {
  const downloads = [], handedOff = [], revoked = [];
  const host = {
    File, navigator: { canShare, share: share && (async data => { handedOff.push(data); return share(data); }) },
    document: { body: { append() {} }, createElement() { return { click() { downloads.push(this.download); }, remove() {} }; } },
    URL: { createObjectURL(file) { assert.equal(file.type, 'application/pdf'); return 'blob:synthetic-pdf'; }, revokeObjectURL: url => revoked.push(url) },
    setTimeout(fn) { fn(); return 0; },
  };
  return { host, downloads, handedOff, revoked };
}

test('file sharing sends the generated PDF once; cancelling does not download a duplicate', async t => {
  dom(t); const { certificate } = fixture();
  const accepted = shareHost({ share: async () => {} });
  assert.equal((await shareCertificatePdf(certificate, { host: accepted.host })).status, 'shared');
  assert.equal(accepted.handedOff.length, 1); assert.deepEqual(accepted.downloads, []);
  const file = accepted.handedOff[0].files[0]; assert.equal(file.name, certificatePdfFilename(certificate)); assert.equal(file.type, 'application/pdf');
  assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  const cancelled = shareHost({ share: async () => { throw new DOMException('User closed the share sheet', 'AbortError'); } });
  assert.equal((await shareCertificatePdf(certificate, { host: cancelled.host })).status, 'cancelled');
  assert.equal(cancelled.handedOff.length, 1); assert.deepEqual(cancelled.downloads, []);
});

test('unsupported sharing downloads once; explicit download bypasses share and errors after handoff are surfaced', async t => {
  dom(t); const { certificate } = fixture();
  for (const config of [{}, { share: async () => {}, canShare: () => false }, { share: async () => { throw new DOMException('No file sharing', 'NotSupportedError'); } }]) {
    const f = shareHost(config);
    assert.equal((await shareCertificatePdf(certificate, { host: f.host })).status, 'downloaded');
    assert.deepEqual(f.downloads, [certificatePdfFilename(certificate)]); assert.deepEqual(f.revoked, ['blob:synthetic-pdf']);
  }
  const direct = shareHost({ share: async () => assert.fail('Download must not call share') });
  assert.equal((await shareCertificatePdf(certificate, { host: direct.host, downloadOnly: true })).status, 'downloaded');
  const failed = shareHost({ share: async () => { throw new DOMException('Destination error', 'DataError'); } });
  await assert.rejects(shareCertificatePdf(certificate, { host: failed.host }), /Destination error/);
  assert.deepEqual(failed.downloads, []);
});
