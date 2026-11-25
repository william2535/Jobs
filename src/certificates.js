/** Visit certificates are explicit engineer declarations, not automatic equipment passes. */
import { disciplineLabel, jobTypeLabel } from './job-options.js';
import { effectiveJob } from './job-settings.js';

export const CERTIFICATE_FIELDS = [
  ['title', 'Certificate title', 'text', true, 'Document'],
  ['number', 'Certificate number', 'text', true, 'Document'],
  ['issueDate', 'Issue date', 'date', true, 'Document'],
  ['visitDate', 'Visit / work date', 'date', true, 'Document'],
  ['discipline', 'Discipline', 'text', true, 'System and visit'],
  ['jobType', 'Visit / work type', 'text', true, 'System and visit'],
  ['system', 'System / equipment', 'text', false, 'System and visit'],
  ['siteName', 'Site / premises', 'text', true, 'Site and customer'],
  ['siteAddress', 'Site address / location', 'textarea', true, 'Site and customer'],
  ['clientName', 'Customer / client', 'text', true, 'Site and customer'],
  ['clientAddress', 'Customer address', 'textarea', false, 'Site and customer'],
  ['clientContact', 'Customer contact', 'text', false, 'Site and customer'],
  ['clientEmail', 'Customer email', 'email', false, 'Site and customer'],
  ['clientPhone', 'Customer phone', 'text', false, 'Site and customer'],
  ['companyName', 'Issuing company / organisation', 'text', true, 'Issuer'],
  ['companyAddress', 'Company address', 'textarea', false, 'Issuer'],
  ['companyContact', 'Company contact details', 'textarea', false, 'Issuer'],
  ['engineerName', 'Declaring engineer name', 'text', true, 'Issuer'],
  ['scope', 'Agreed scope / work boundary', 'textarea', true, 'Work and findings'],
  ['workDescription', 'Work actually carried out', 'textarea', true, 'Work and findings'],
  ['findings', 'Findings / outstanding defects', 'textarea', true, 'Work and findings'],
  ['limitations', 'Limitations / exclusions', 'textarea', true, 'Work and findings'],
  ['outcome', 'Outcome / condition left', 'textarea', true, 'Work and findings'],
  ['standard', 'Applicable standard / edition (if relevant)', 'text', false, 'Work and findings'],
  ["certificateKind","Fire certificate type (installation / commissioning / acceptance / modification)","text",false,"Fire certification"],
  ["specificationRef","Specification reference and revision","text",false,"Fire certification"],
  ["systemCategory","System category","text",false,"Fire certification"],
  ["variations","Agreed variations, reasons, alternatives and agreement references","textarea",false,"Fire certification"],
  ["wiringTests","Wiring test results and recipient","textarea",false,"Fire certification"],
  ["drawingRefs","As-fitted drawing and zone plan references","textarea",false,"Fire certification"],
  ["functionalTests","Functional tests, cause and effect and signalling results","textarea",false,"Fire certification"],
  ["handover","Documents, keys and user training provided","textarea",false,"Fire certification"],
  ["soundReadings","Sound readings: point, location, ambient dB(A), alarm dB(A), result","textarea",false,"Fire certification"],
  ["batteryEvidence","Standby capacity calculation and PSU references","textarea",false,"Fire certification"],
  ["soakTest","Soak test period or reason not applicable","textarea",false,"Fire certification"],
  ["followUp","Incomplete works, false alarm risks and return visit","textarea",false,"Fire certification"],
  ["acceptance","Customer acceptance, name, position, date and limitations","textarea",false,"Fire certification"],
  ['declaration', 'Engineer declaration', 'textarea', true, 'Declaration'],
].map(([key, label, type, required, section]) => ({ key, label, type, required, section }));

export const FIRE_CHECKLISTS = {
  "installation": [
    "Cable type, size and fire resistance suit the design",
    "Mechanical protection where required",
    "Suitable cable supports, containment and fixings",
    "Wiring segregation",
    "Fire-stopped penetrations",
    "Insulation and continuity / loop resistance recorded and satisfactory",
    "Loop wiring and fault isolation match design",
    "Wiring and zone coverage match design",
    "Secure joints and terminations without strain",
    "Junction boxes labelled and shown on drawings",
    "Termination and accessory boxes securely fixed"
  ],
  "commissioning": [
    "System matches approved specification and design",
    "Building layout changes recorded",
    "Design changes referred for approval",
    "Installation matches system category",
    "Variations documented and agreed",
    "Cable fire resistance matches design",
    "Visible cables segregated and supported",
    "Mechanical protection where required",
    "Visible junction boxes labelled and shown on drawings",
    "Insulation and continuity resistance results recorded",
    "Visible penetrations protected and fire-stopped",
    "Mains supply protection, isolation and labelling satisfactory",
    "Supply identified at distribution boards",
    "Standby capacity verified for all PSUs",
    "Batteries identified and dated",
    "Field wiring labelled and terminated correctly",
    "Detectors, call points, warning and ancillary devices tested and recorded",
    "Isolators fitted, tested and shown on drawings",
    "Cause and effect tested and recorded",
    "Warning circuits and fault resilience match design",
    "Sound levels and visual alarm operation recorded",
    "Detector types and spacing match design",
    "Call point siting and travel distances suitable",
    "Remote signalling tested where applicable",
    "Zone plans fitted at required locations",
    "As-fitted drawings reflect installation, cable sizes and routes",
    "Logbook and operating instructions issued",
    "Responsible person trained",
    "Site tidy and surplus materials removed"
  ]
};
export function checklistMissing(fields) {
  const checks = FIRE_CHECKLISTS[fields.certificateKind];
  if (!Array.isArray(checks)) return [];
  const missing = [];
  checks.forEach((label,i) => {
    const value = fields['fireCheck'+i] || '';
    const match = /^(Yes|No|N\/A)\n([\s\S]*)$/.exec(value);
    if (!match || (match[1] !== 'Yes' && !match[2].trim())) missing.push(label + ' (result and exception evidence)');
  });
  return missing;
}
export const FIRE_CERTIFICATE_TEMPLATES = Object.freeze({
  installation: {title:'Fire alarm installation certificate', fields:['specificationRef','systemCategory','variations','wiringTests','drawingRefs']},
  commissioning: {title:'Fire alarm commissioning certificate', fields:['specificationRef','systemCategory','variations','functionalTests','handover','soundReadings','batteryEvidence','soakTest','followUp']},
  acceptance: {title:'Fire alarm acceptance certificate', fields:['variations','functionalTests','drawingRefs','handover','acceptance','followUp']},
  modification: {title:'Fire alarm modification certificate', fields:['variations','functionalTests','followUp']}
});
export function applyFireCertificateTemplate(draft, kind) {
  const template = Object.hasOwn(FIRE_CERTIFICATE_TEMPLATES, kind) ? FIRE_CERTIFICATE_TEMPLATES[kind] : null;
  if (!template) return {...draft, fields:{...draft.fields, certificateKind:''}, review:null};
  return {...draft, fields:{...draft.fields, certificateKind:kind, title:template.title, standard:kind === 'modification' ? '' : 'BS 5839-1:2025', declaration:'I confirm the recorded work and evidence within the stated scope, subject to the recorded variations and limitations. No unrecorded test or approval is implied.'}, review:null};
}

for (let i=0;i<29;i++) CERTIFICATE_FIELDS.push({key:'fireCheck'+i,label:'Checklist item '+(i+1),type:'textarea',required:false,section:'Fire checklist'});
const FIELD_KEYS = CERTIFICATE_FIELDS.map(field => field.key);
const MAX_ISSUES = 100;
const MAX_BYTES = 96 * 1024 * 1024;
const clone = value => structuredClone(value);
const now = () => new Date().toISOString();
const fail = message => { throw Error(`Certificate: ${message}`); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(`${label} has an invalid structure.`);
}
function text(value, label, required = false, max = 10000) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${label} must be ${required ? 'nonempty ' : ''}text of at most ${max} characters.`);
  return value.trim();
}
function timestamp(value, label) {
  const checked = text(value, label, true, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(checked) || !Number.isFinite(Date.parse(checked)) || new Date(checked).toISOString().slice(0, 10) !== checked.slice(0, 10)) fail(`${label} must be a valid UTC timestamp.`);
  return checked;
}
function fields(value) {
  object(value, FIELD_KEYS, 'Fields');
  return Object.fromEntries(CERTIFICATE_FIELDS.map(field => {
    const result = text(value[field.key] ?? '', field.label);
    if (field.type === 'date' && result && (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result)) fail(`${field.label} must be a real date.`);
    if (field.type === 'email' && result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(`${field.label} must be a valid email address.`);
    return [field.key, result];
  }));
}
function review(value) {
  if (value === null) return null;
  object(value, ['reviewedAt', 'signature'], 'Review');
  const signature = text(value.signature, 'Review fingerprint', true, 100);
  if (!/^review-v1-[0-9a-f]{16}$/.test(signature)) fail('Review fingerprint is invalid.');
  return { reviewedAt: timestamp(value.reviewedAt, 'Review time'), signature };
}
function draftRecord(value) {
  object(value, ['id', 'revisionOf', 'createdAt', 'updatedAt', 'fields', 'review'], 'Draft');
  const record = { id: text(value.id, 'Draft ID', true, 160), revisionOf: value.revisionOf === null ? null : text(value.revisionOf, 'Earlier issue ID', true, 160), createdAt: timestamp(value.createdAt, 'Draft creation time'), updatedAt: timestamp(value.updatedAt, 'Draft update time'), fields: fields(value.fields), review: review(value.review) };
  if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) fail('Draft update time precedes its creation.');
  return record;
}
function safeJSON(value, seen = new Set(), depth = 0, key = '') {
  if (depth > 100) fail('Supporting evidence is nested too deeply.');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('Supporting evidence contains a non-finite number.'); return; }
  if (typeof value === 'string') {
    if (key === 'image' && value && !/^data:image\/(?:png|jpe?g|webp|gif|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) fail('Supporting evidence images must be embedded raster images.');
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) fail('Supporting evidence must contain only JSON data without cycles.');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail('Supporting evidence must contain plain records.');
  seen.add(value);
  for (const [childKey, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype', 'certificates'].includes(childKey)) fail('Supporting evidence contains an unsupported nested field.');
    safeJSON(item, seen, depth + 1, childKey);
  }
  seen.delete(value);
}
function evidenceRecord(value) {
  object(value, ['job', 'site', 'drawing'], 'Supporting evidence');
  safeJSON(value);
  if (!value.job || typeof value.job !== 'object' || Array.isArray(value.job)) fail('A saved supporting job is required.');
  text(value.job.id, 'Supporting job ID', true, 160);
  if (!Number.isSafeInteger(value.job.revision) || value.job.revision < 1) fail('Supporting job revision is invalid.');
  if (value.site !== null) {
    if (!value.site || typeof value.site !== 'object' || Array.isArray(value.site)) fail('Supporting site is invalid.');
    text(value.site.id, 'Supporting site ID', true, 1000);
  }
  if (value.drawing !== null) {
    if (!value.drawing || typeof value.drawing !== 'object' || Array.isArray(value.drawing)) fail('Supporting drawing is invalid.');
    text(value.drawing.id, 'Supporting drawing ID', true, 1000);
    if (typeof value.drawing.revision !== 'string' && typeof value.drawing.revision !== 'number') fail('Supporting drawing revision is required.');
  }
  return clone(value);
}
function requiredFields(value) {
  return CERTIFICATE_FIELDS.filter(field => field.required && !value[field.key]?.trim()).map(field => field.label);
}
function issuedRecord(value) {
  object(value, ['id', 'draftId', 'revisionOf', 'issuedAt', 'reviewedAt', 'fields', 'evidence'], 'Issued certificate');
  const record = { id: text(value.id, 'Issued ID', true, 160), draftId: text(value.draftId, 'Source draft ID', true, 160), revisionOf: value.revisionOf === null ? null : text(value.revisionOf, 'Earlier issue ID', true, 160), issuedAt: timestamp(value.issuedAt, 'Issue time'), reviewedAt: timestamp(value.reviewedAt, 'Review time'), fields: fields(value.fields), evidence: evidenceRecord(value.evidence) };
  if (requiredFields(record.fields).length) fail(`Issued certificate is incomplete: ${requiredFields(record.fields).join(', ')}.`);
  if (Date.parse(record.reviewedAt) > Date.parse(record.issuedAt)) fail('Review time cannot follow issue time.');
  return record;
}
export function validateJobCertificates(value) {
  if (value === undefined) return undefined;
  object(value, ['version', 'draft', 'issued'], 'Collection');
  if (value.version !== 1 || !Array.isArray(value.issued) || value.issued.length > MAX_ISSUES) fail(`Use version 1 and at most ${MAX_ISSUES} issued certificates.`);
  const seen = new Set(), numbers = new Set();
  const issued = value.issued.map(item => {
    const record = issuedRecord(item);
    if (seen.has(record.id)) fail('Issued certificate IDs must be unique.');
    if (record.revisionOf !== null && !seen.has(record.revisionOf)) fail('An issue revision must refer to an earlier retained issue.');
    const number = record.fields.number.toLocaleLowerCase();
    if (numbers.has(number)) fail('Certificate numbers must be unique within this job.');
    seen.add(record.id); numbers.add(number); return record;
  });
  const draft = value.draft === null ? null : draftRecord(value.draft);
  if (draft?.revisionOf !== null && draft?.revisionOf !== undefined && !seen.has(draft.revisionOf)) fail('Draft revision must refer to a retained issue.');
  const result = { version: 1, draft, issued };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_BYTES) fail('Certificate records exceed the 96 MiB limit. Export this job before starting another visit.');
  return result;
}
const collection = job => validateJobCertificates(job.certificates) || { version: 1, draft: null, issued: [] };
function captureEvidence(job, site = null, drawing = null) {
  const saved = effectiveJob(job, site); delete saved.certificates;
  // A source drawing backup is not report evidence; the selected drawing itself is retained.
  drawing ||= job.assetRegister || site?.drawings?.find(item => item.id === job.drawingId) || null;
  if (drawing && drawing.id !== job.drawingId && drawing.id !== job.assetRegister?.id) fail('The selected drawing does not belong to this job.');
  if (job.drawingId && !drawing) fail('Load this job’s selected drawing before preparing its certificate.');
  const selected = drawing ? clone(drawing) : null;
  if (selected) delete selected.source;
  const siteRecord = site ? { id: site.id, name: site.name || '', address: site.address || '', ...(site.profile ? { profile: clone(site.profile) } : {}) } : null;
  // JSON round-trip removes optional undefined properties from normal application records.
  return evidenceRecord(JSON.parse(JSON.stringify({ job: saved, site: siteRecord, drawing: selected })));
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function fingerprint(draft, evidence) {
  const stable = clone(evidence);
  delete stable.job.revision; delete stable.job.updatedAt;
  const input = canonical({ fields: draft.fields, revisionOf: draft.revisionOf, evidence: stable });
  let a = 2166136261, b = 2246822519;
  for (let i = 0; i < input.length; i++) { const c = input.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 3266489917); }
  // Detects stale reviews; this is not a digital signature or an identity proof.
  return `review-v1-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export function createCertificateDraft(job, site = null, drawing = null) {
  const saved = collection(job); if (saved.draft) return clone(saved.draft);
  job = effectiveJob(job, site);
  const stamp = now(), details = job.workflow?.details || {}, maintenance = job.fireMaintenance?.fields || {}, checklist = job.checklist?.fields || {};
  const values = Object.fromEntries(FIELD_KEYS.map(key => [key, '']));
  const discipline = disciplineLabel(job) || (job.workType === 'Fire alarm maintenance' ? 'Fire' : ''), type = jobTypeLabel(job) || '';
  Object.assign(values, {
    title: `${discipline || 'System'} ${type || 'visit'} certificate`,
    number: `${details.reference || 'CERT'}-${String(job.id || '').slice(0, 8)}-${String(saved.issued.length + 1).padStart(2, '0')}`,
    issueDate: stamp.slice(0, 10), visitDate: maintenance.visitDate || checklist.visitDate || '',
    discipline, jobType: type, system: job.system || '', siteName: site?.name || '', siteAddress: site?.address || '',
    clientName: details.client || '', clientContact: details.contactName || '', clientEmail: details.contactEmail || '', clientPhone: details.contactPhone || '',
    companyName: maintenance.company || checklist.company || '', engineerName: maintenance.engineer || checklist.engineer || job.engineer || '',
    scope: maintenance.scope || checklist.scope || job.scope || details.description || '',
    workDescription: '', limitations: maintenance.limitations || checklist.limitations || '', outcome: maintenance.conditionLeft || checklist.conditionLeft || '',
    standard: maintenance.standard || checklist.standard || '',
    declaration: 'I confirm that this certificate accurately records the work, findings, outcome and limitations stated above, based on the supporting visit records. My declaration is limited to the stated scope.',
  });
  return draftRecord({ id: crypto.randomUUID(), revisionOf: null, createdAt: stamp, updatedAt: stamp, fields: values, review: null });
}
export function saveCertificateDraft(job, draft) {
  const saved = collection(job), checked = draftRecord(draft);
  if (saved.draft && saved.draft.id !== checked.id) fail('Another draft exists. Reopen it before editing.');
  if (saved.draft && canonical(saved.draft.fields) !== canonical(checked.fields)) checked.review = null;
  checked.updatedAt = now();
  return validateJobCertificates({ ...saved, draft: checked });
}
export function certificateReadiness(job, draft, site = null, drawing = null) {
  const checked = draftRecord(draft), saved = collection(job), evidence = captureEvidence(job, site, drawing);
  const missing = [...requiredFields(checked.fields), ...checklistMissing(checked.fields)];
  const template = Object.hasOwn(FIRE_CERTIFICATE_TEMPLATES, checked.fields.certificateKind) ? FIRE_CERTIFICATE_TEMPLATES[checked.fields.certificateKind] : null;
  if (template) for (const key of [...template.fields, 'standard']) if (!checked.fields[key]?.trim()) missing.push(CERTIFICATE_FIELDS.find(field => field.key === key).label);
  if (saved.issued.some(record => record.fields.number.toLocaleLowerCase() === checked.fields.number.toLocaleLowerCase())) missing.push('A new, unique certificate number');
  const warnings = [];
  const results = job.results || [];
  const count = state => results.filter(result => result.state === state).length;
  if (count('Not tested')) warnings.push(`${count('Not tested')} device result(s) remain Not tested. State the untested scope and limitations; issuing does not pass them.`);
  if (count('Unsatisfactory')) warnings.push(`${count('Unsatisfactory')} device result(s) are Unsatisfactory. Include the unresolved findings and condition left.`);
  if (count('Inaccessible')) warnings.push(`${count('Inaccessible')} device result(s) are Inaccessible. Explain the access limitation.`);
  if (!results.length) warnings.push('No device results are attached. Confirm that the stated work scope and evidence are sufficient for this visit.');
  const reviewed = !!checked.review && checked.review.signature === fingerprint(checked, evidence);
  return { ready: missing.length === 0 && reviewed, missing, warnings, reviewed };
}
export function reviewCertificateDraft(job, draft, site = null, drawing = null) {
  const checked = draftRecord(draft), readiness = certificateReadiness(job, checked, site, drawing);
  if (readiness.missing.length) fail(`Complete before review: ${readiness.missing.join(', ')}.`);
  checked.review = { reviewedAt: now(), signature: fingerprint(checked, captureEvidence(job, site, drawing)) };
  return checked;
}
export function issueCertificate(job, draft, site = null, drawing = null) {
  const checked = draftRecord(draft), saved = collection(job), readiness = certificateReadiness(job, checked, site, drawing);
  if (saved.issued.some(record => record.draftId === checked.id)) fail('This draft has already been issued. Create a revision to make a correction.');
  if (saved.draft && saved.draft.id !== checked.id) fail('Another draft exists. Reopen the saved draft.');
  if (readiness.missing.length) fail(`Complete before issue: ${readiness.missing.join(', ')}.`);
  if (!readiness.reviewed) fail('Review and confirm this exact certificate and its saved evidence before issue. Changes require another review.');
  const record = { id: crypto.randomUUID(), draftId: checked.id, revisionOf: checked.revisionOf, issuedAt: now(), reviewedAt: checked.review.reviewedAt, fields: clone(checked.fields), evidence: captureEvidence(job, site, drawing) };
  return validateJobCertificates({ version: 1, draft: null, issued: [...saved.issued, record] });
}
export function reviseCertificate(job, issueId) {
  const saved = collection(job);
  if (saved.draft) fail('Finish or reopen the existing draft before creating another revision.');
  const issued = saved.issued.find(item => item.id === issueId);
  if (!issued) fail('Choose a retained issued certificate to revise.');
  const stamp = now();
  return draftRecord({ id: crypto.randomUUID(), revisionOf: issued.id, createdAt: stamp, updatedAt: stamp, fields: { ...clone(issued.fields), number: `${issued.fields.number}-R${saved.issued.length + 1}`, issueDate: stamp.slice(0, 10) }, review: null });
}
export function snapshotCertificatePreview(job, draft, site = null, drawing = null) {
  const checked = draftRecord(draft);
  return { id: checked.id, draftId: checked.id, revisionOf: checked.revisionOf, issuedAt: null, reviewedAt: checked.review?.reviewedAt || null, fields: clone(checked.fields), evidence: captureEvidence(job, site, drawing), draft: true };
}
