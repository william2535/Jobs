/** Render only the supplied frozen snapshot; never read current application state. */
import { renderServiceReport } from './service-report.js';

const el = (tag, className = '', text) => { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = String(text ?? ''); return node; };
function metadata(parent, pairs) {
  const list = el('dl', 'service-report-metadata');
  for (const [label, value] of pairs) if (String(value || '').trim()) { const row = el('div'); row.append(el('dt', '', label), el('dd', '', value)); list.append(row); }
  if (list.children.length) parent.append(list);
}
function section(parent, title, value) {
  if (!String(value || '').trim()) return;
  const block = el('section', 'service-report-section'); block.append(el('h2', '', title), el('p', '', value)); parent.append(block);
}
export function renderCertificate({ certificate, includeEvidence = true }) {
  if (!certificate?.fields || !certificate?.evidence?.job) throw Error('Choose a saved certificate snapshot.');
  const { fields: f, evidence } = certificate, root = el('article', 'service-report certificate-document');
  root.dataset.certificateId = certificate.id;
  const cover = el('section', 'service-report-cover certificate-cover'), header = el('header', 'service-report-header'), title = el('div');
  title.append(el('span', 'service-report-draft-badge certificate-state', certificate.draft ? 'Draft certificate — not issued' : 'Issued certificate'), el('h1', '', f.title || 'Visit certificate'));
  header.append(title, el('span', 'service-report-brand', f.companyName || 'JOBS')); cover.append(header);
  metadata(cover, [['Certificate number', f.number], ['Issue date', f.issueDate], ['Visit / work date', f.visitDate], ['Discipline', f.discipline], ['Visit / work type', f.jobType], ['System / equipment', f.system]]);
  const customer = el('section', 'service-report-section'); customer.append(el('h2', '', 'Site and customer'));
  metadata(customer, [['Site / premises', f.siteName], ['Site address / location', f.siteAddress], ['Customer / client', f.clientName], ['Customer address', f.clientAddress], ['Customer contact', f.clientContact], ['Customer email', f.clientEmail], ['Customer phone', f.clientPhone]]); cover.append(customer);
  const issuer = el('section', 'service-report-section'); issuer.append(el('h2', '', 'Issuing organisation'));
  metadata(issuer, [['Company', f.companyName], ['Address', f.companyAddress], ['Contact details', f.companyContact], ['Declaring engineer', f.engineerName]]); cover.append(issuer); root.append(cover);
  for (const [key, label] of [['scope', 'Agreed scope / work boundary'], ['workDescription', 'Work actually carried out'], ['findings', 'Findings / outstanding defects'], ['limitations', 'Limitations / exclusions'], ['outcome', 'Outcome / condition left'], ['standard', 'Recorded standard / edition']]) section(root, label, f[key]);
  const declaration = el('section', 'service-report-section certificate-declaration'); declaration.append(el('h2', '', 'Engineer declaration'), el('p', '', f.declaration));
  metadata(declaration, [['Declared by', f.engineerName], ['Review recorded', certificate.reviewedAt], ['Issued', certificate.issuedAt]]);
  declaration.append(el('p', 'service-report-caption', 'The engineer name is a typed declaration record, not a cryptographic digital signature. This visit certificate applies only to the stated work and limitations. It is not a claim of third-party accreditation or a validated statutory / standards-specific form.'));
  root.append(declaration);
  const provenance = el('footer', 'service-report-footer certificate-footer');
  metadata(provenance, [['Certificate ID', certificate.id], ['Revises certificate ID', certificate.revisionOf], ['Supporting job', `${evidence.job.id} / revision ${evidence.job.revision}`], ['Supporting drawing', evidence.drawing ? `${evidence.drawing.id} / revision ${evidence.drawing.revision || 'Unlabelled'}` : 'No drawing linked']]);
  provenance.append(el('p', '', certificate.draft ? 'Preview only. Complete the fields and explicitly review before issuing.' : 'Issued snapshot. Later job changes do not change this certificate; corrections require a new retained revision.')); root.append(provenance);
  if (includeEvidence) {
    const appendix = el('section', 'certificate-evidence-appendix');
    appendix.append(el('h2', '', certificate.draft ? 'Supporting visit evidence — draft preview' : 'Supporting visit evidence — captured at issue'), el('p', 'service-report-caption', 'The following saved report is supporting evidence. Its recorded outcomes, outstanding checks and draft-report labels are preserved; it does not independently certify the installation.'));
    // Checklist reports resolve their drawing through the site. Supply only the
    // frozen selected drawing, never the site's current mutable drawing list.
    const reportSite = evidence.site ? { ...evidence.site, drawings: evidence.drawing ? [evidence.drawing] : [] } : null;
    appendix.append(renderServiceReport({ job: evidence.job, site: reportSite, drawing: evidence.drawing })); root.append(appendix);
  }
  return root;
}
