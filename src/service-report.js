/** A printable account of saved engineer evidence, never a compliance certificate. */
import { renderNotesReport } from './job-notes.js';
import { renderWorkflowReport } from './job-workflow.js';
import { renderChecklistReport, checklistReportTitle } from './job-checklist.js';
import { disciplineLabel, jobTypeLabel } from './job-options.js';
import { FIRE_SYSTEM_QUESTIONS, FIRE_EQUIPMENT_TEMPLATES, isFireMaintenanceJob } from './fire-maintenance.js';

const present = value => value !== undefined && value !== null && String(value).trim() !== '';
const list = value => Array.isArray(value) ? value : [];
const el = (tag, className = '', value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
};
const paragraph = (parent, value, className = '') => { if (present(value)) parent.append(el('p', className, value)); };
const section = (title, className = '') => {
  const node = el('section', `service-report-section ${className}`.trim());
  node.append(el('h2', '', title));
  return node;
};
const textBlock = (parent, label, value) => {
  if (!present(value)) return;
  const block = el('div', 'service-report-text-block');
  block.append(el('h4', '', label), el('p', '', value));
  parent.append(block);
};
function metadata(parent, pairs, className = '') {
  const dl = el('dl', `service-report-metadata ${className}`.trim());
  for (const [label, value] of pairs) {
    if (!present(value)) continue;
    const group = el('div'); group.append(el('dt', '', label), el('dd', '', value)); dl.append(group);
  }
  if (dl.children.length) parent.append(dl);
}
function table(headers, rows, className = '') {
  const root = el('table', `service-report-table ${className}`.trim());
  const head = el('thead'), headerRow = el('tr'), body = el('tbody');
  headers.forEach(label => { const cell = el('th', '', label); cell.scope = 'col'; headerRow.append(cell); });
  head.append(headerRow);
  rows.forEach(values => {
    const row = el('tr');
    values.forEach(value => { const cell = el('td'); cell.append(value instanceof Node ? value : document.createTextNode(String(value ?? ''))); row.append(cell); });
    body.append(row);
  });
  root.append(head, body); return root;
}
function status(value = 'Not tested') {
  const node = el('span', 'service-report-state', value);
  node.dataset.state = value;
  return node;
}
function photos(parent, values, title) {
  const valid = list(values).filter(photo => /^data:image\/(png|jpe?g|webp|gif|avif|bmp);base64,/i.test(photo?.image || ''));
  if (!valid.length) return;
  const group = el('div', 'service-report-photos');
  group.append(el('h4', '', title));
  for (const photo of valid) {
    const figure = el('figure'), image = el('img');
    image.src = photo.image; image.alt = photo.caption || title; image.loading = 'eager';
    figure.append(image, el('figcaption', '', photo.caption || title)); group.append(figure);
  }
  parent.append(group);
}
const assetName = asset => asset?.reference || asset?.typeName || asset?.type || asset?.id || 'Unidentified device';
const assetType = asset => asset?.typeName || asset?.type || 'Unspecified equipment';
const remarks = result => list(result?.remarks?.items);
function resultRows(job, drawing) {
  const results = list(job.results), assets = list(drawing?.assets);
  const rows = assets.map(asset => ({ asset, result: results.find(result => result.assetId === asset.id) || { assetId: asset.id, state: 'Not tested' } }));
  for (const result of results) if (!assets.some(asset => asset.id === result.assetId)) rows.push({ asset: { id: result.assetId }, result });
  return rows;
}
function defectSummary(rows) {
  const root = section('Defects & observations summary', 'service-report-defect-summary');
  const records = rows.flatMap(({ result }) => [...remarks(result), ...(present(result.defects) ? [{ severity: 'Unclassified', status: 'Not recorded' }] : [])]);
  const severities = ['Critical defect', 'Major defect', 'Minor defect', 'Observation', 'Unclassified'];
  const summary = table(['Recorded classification', 'Open', 'Resolved', 'Status not recorded'], severities.map(severity => [
    severity,
    ...['Open', 'Resolved', 'Not recorded'].map(state => records.filter(record => record.severity === severity && (record.status || 'Not recorded') === state).length),
  ]));
  [...summary.tBodies[0].rows].forEach((row, index) => { row.dataset.severity = severities[index]; });
  root.append(summary);
  paragraph(root, `${records.length} recorded finding${records.length === 1 ? '' : 's'} across the current devices. Counts use the engineer's recorded classifications; test outcomes are listed separately.`, 'service-report-caption');
  return root;
}
function servicingSummary(rows) {
  const root = section('Servicing summary', 'service-report-servicing-summary');
  const states = ['Satisfactory', 'Unsatisfactory', 'Inaccessible', 'Not applicable', 'Not tested'];
  const counts = Object.fromEntries(states.map(value => [value, rows.filter(({ result }) => (result.state || 'Not tested') === value).length]));
  paragraph(root, `${counts.Satisfactory + counts.Unsatisfactory} tested · ${counts['Not tested']} not tested · ${counts.Inaccessible} inaccessible · ${counts['Not applicable']} not applicable`);
  paragraph(root, `${counts['Not tested']} device results remain Not tested. Drawing verification never counts as today's test.`, 'service-report-caption');
  const types = [...new Set(rows.map(({ asset }) => assetType(asset)))];
  root.append(table(['Equipment', 'Quantity', 'Tested', 'Not tested', 'Inaccessible', 'Not applicable'], types.map(type => {
    const group = rows.filter(({ asset }) => assetType(asset) === type);
    const count = state => group.filter(({ result }) => (result.state || 'Not tested') === state).length;
    return [type, group.length, count('Satisfactory') + count('Unsatisfactory'), count('Not tested'), count('Inaccessible'), count('Not applicable')];
  }), 'service-report-service-counts'));
  if (!rows.length) paragraph(root, 'No devices are attached to this job.');
  return root;
}
function questionTable(questions, answers = {}) {
  return table(['Recorded check / reading', 'Answer', 'Notes / explanation'], questions.map((question, index) => {
    const answer = answers?.[question.id], value = answer?.value;
    const display = present(value) ? `${value}${question.unit ? ` ${question.unit}` : ''}` : 'Not recorded';
    const valueNode = ['Pass', 'Fail', 'N/A'].includes(value) ? status(value) : display;
    return [`${index + 1}. ${question.label}`, valueNode, answer?.notes || ''];
  }), 'service-report-questions');
}
function maintenanceAnswers(record, drawing, { historical = false } = {}) {
  const root = el('div', 'service-report-saved-maintenance');
  if (historical) root.append(el('h3', '', `Earlier maintenance revision ${record.revision}`));
  paragraph(root, `Maintenance record revision ${record.revision} · saved ${record.savedAt} · supporting job revision ${record.basedOnJobRevision}`, 'service-report-caption');
  if (historical) {
    metadata(root, [['Visit date', record.fields?.visitDate], ['Engineer', record.fields?.engineer], ['Company', record.fields?.company]]);
    textBlock(root, 'Recorded scope', record.fields?.scope);
  }
  metadata(root, [
    ['Drawing ID / revision', record.drawingId ? `${record.drawingId} / ${record.drawingRevision || 'Unlabelled'}` : 'No drawing linked'],
    ['Service interval', record.fields?.serviceInterval], ['Recorded standard / edition', record.fields?.standard],
  ]);
  if (!historical && (record.drawingId !== (drawing?.id || null) || (drawing && record.drawingRevision !== String(drawing.revision || '')))) paragraph(root, 'The drawing reference has changed since these maintenance answers were saved. Engineer review is required.', 'service-report-review');
  const system = el('section', 'service-report-system-questions');
  system.append(el('h3', '', 'System checks'), questionTable(FIRE_SYSTEM_QUESTIONS, record.systemAnswers)); root.append(system);
  for (const equipment of list(record.equipment)) {
    const template = FIRE_EQUIPMENT_TEMPLATES.find(candidate => candidate.id === equipment.templateId);
    const group = el('section', 'service-report-equipment-questions');
    group.append(el('h3', '', equipment.label || template?.label || 'Equipment checks'));
    metadata(group, [['Template', template?.label], ['Linked asset ID', equipment.assetId], ['Equipment record ID', equipment.id]]);
    if (template) group.append(questionTable(template.questions, equipment.answers));
    else paragraph(group, 'This equipment template is not supported by this report version. Its saved data remains in the job package.');
    root.append(group);
  }
  for (const [key, label] of [['limitations', 'Limitations / variations'], ['conditionLeft', 'Condition left'], ['nextActions', 'Next actions / recommendations']]) textBlock(root, label, record.fields?.[key]);
  metadata(root, [['Engineer review name', record.fields?.engineerName], ['Engineer review date', record.fields?.engineerDate], ['Client name recorded', record.fields?.clientName], ['Client unavailable reason', record.fields?.clientUnavailableReason]]);
  return root;
}
function remark(parent, item, asset) {
  const root = el('article', 'service-report-remark'); root.dataset.remarkId = item.id || '';
  root.append(el('h4', '', item.title || 'Device remark'));
  metadata(root, [['Device', assetName(asset)], ['Classification', item.severity || 'Unclassified'], ['Status', item.status || 'Not recorded'], ['Location', item.location], ['Last verified', item.lastVerified], ['Remark ID', item.id]]);
  paragraph(root, item.description);
  textBlock(root, 'Recommendation', item.recommendation);
  if (list(item.products).length) root.append(table(['Product / material', 'Quantity', 'Unit'], item.products.map(product => [product.description, product.quantity, product.unit]), 'service-report-remark-products'));
  photos(root, item.beforePhotos, 'Before photographs');
  photos(root, item.resolvedPhotos, 'Resolution photographs');
  parent.append(root);
}
function deviceEvidence({ asset, result }, { archived = false } = {}) {
  const root = el('article', 'service-report-device'); root.dataset.assetId = asset?.id || result.assetId || '';
  const head = el('div', 'service-report-device-heading');
  head.append(el('h3', '', assetName(asset)), status(result.state || 'Not tested')); root.append(head);
  metadata(root, [['Equipment', assetType(asset)], ['Floor / location', asset?.floorName], ['Asset ID', asset?.id || result.assetId], ['Result ID', result.id], ['Recorded by', result.recordedBy], ['Recorded at', result.recordedAt]]);
  textBlock(root, 'Observations', result.observations);
  textBlock(root, 'Notes', result.notes);
  textBlock(root, 'Defect notes — classification / status not recorded', result.defects);
  if (list(result.readings).length) root.append(table(['Reading', 'Value', 'Unit'], result.readings.map(reading => [reading.name, reading.value, reading.unit]), 'service-report-readings'));
  photos(root, result.photos, archived ? 'Archived visit photographs' : 'Visit photographs');
  photos(root, asset?.photos, 'Drawing photographs — source evidence');
  const currentRemarks = remarks(result).filter(item => archived || item.status !== 'Resolved');
  if (currentRemarks.length) {
    root.append(el('h3', '', 'Defects & observations'));
    currentRemarks.forEach(item => remark(root, item, asset));
  }
  if (list(result.remarks?.history).length) paragraph(root, `${result.remarks.history.length} earlier remark version(s) retained in the job package.`, 'service-report-caption');
  return root;
}

/** Caller supplies the saved job (with any effective site defaults already resolved). */
export function renderServiceReport({ site = null, job, drawing = null }) {
  const root = el('section', 'service-report job-report-content');
  const fire = isFireMaintenanceJob(job), saved = job.fireMaintenance, fields = saved?.fields || {}, details = job.workflow?.details || {};
  const rows = resultRows(job, drawing), cover = el('section', 'service-report-cover');
  const header = el('header', 'service-report-header');
  const title = el('div');
  title.append(el('span', 'service-report-draft-badge', 'Draft service report'), el('h1', '', fire ? 'Fire maintenance report' : 'Job service report'));
  header.append(title, el('span', 'service-report-brand', 'JOBS')); cover.append(header);
  paragraph(cover, fire ? 'Draft Fire maintenance report' : checklistReportTitle(job), 'service-report-document-title');
  const summary = el('div', 'service-report-property');
  metadata(summary, [
    ['Property', site?.name || 'No site linked'], ['Address', site?.address], ['Client', details.client],
    ['Job', details.reference || details.title || job.id], ['Engineer', fields.engineer || job.checklist?.fields?.engineer || job.engineer],
    ['Performed date', fields.visitDate || job.checklist?.fields?.visitDate], ['Company', fields.company || job.checklist?.fields?.company],
  ]); cover.append(summary);
  metadata(cover, [['Report reference', `${job.id} / revision ${job.revision}`], ['Site ID', site?.id], ['Discipline', disciplineLabel(job) || (fire ? 'Fire' : '')], ['Job type', fire ? 'Maintenance' : jobTypeLabel(job)], ['System', job.system], ['Drawing ID / revision', drawing ? `${drawing.id} / ${drawing.revision || 'Unlabelled'}` : 'No drawing linked'], ['Drawing record', drawing ? drawing.kind === 'issued' ? 'Issued record' : 'Working drawing' : '']]);
  const scope = section('Scope of works', 'service-report-scope');
  paragraph(scope, fields.scope || job.scope || details.description || 'No scope has been recorded.');
  if (details.description && details.description !== (fields.scope || job.scope)) textBlock(scope, 'Job description', details.description);
  textBlock(scope, 'Instructions', job.instructions); cover.append(scope, defectSummary(rows), servicingSummary(rows)); root.append(cover);
  const maintenance = section(fire ? 'Maintenance' : 'Work & device results', 'service-report-maintenance');
  if (saved) maintenance.append(maintenanceAnswers(saved, drawing));
  else if (fire) paragraph(maintenance, 'No fire maintenance checklist has been saved. Device results below are separate engineer records.');
  if (rows.length) {
    maintenance.append(el('h3', '', 'Device results'));
    rows.forEach(row => maintenance.append(deviceEvidence(row)));
  }
  textBlock(maintenance, 'Visit notes / condition left', job.visitNotes); root.append(maintenance);
  const resolved = rows.flatMap(({ asset, result }) => remarks(result).filter(item => item.status === 'Resolved').map(item => ({ asset, item })));
  if (resolved.length) {
    const repairs = section('Repairs', 'service-report-repairs');
    paragraph(repairs, 'Resolved remarks recorded by the engineer. Resolution does not change a device test outcome.', 'service-report-caption');
    resolved.forEach(({ item, asset }) => remark(repairs, item, asset)); root.append(repairs);
  }
  const notes = renderNotesReport(job); if (notes.children.length) root.append(notes);
  const workflow = renderWorkflowReport(job); if (workflow.children.length) root.append(workflow);
  if (job.checklist && site) root.append(renderChecklistReport(site, job));
  if (list(job.archivedResults).length || list(saved?.history).length) {
    const archive = section('Earlier drawing & maintenance evidence', 'service-report-archived');
    paragraph(archive, 'Historical evidence is retained separately and is outside the current device and defect summary counts.', 'service-report-caption');
    for (const entry of list(job.archivedResults)) {
      const group = el('section', 'service-report-archived-device');
      metadata(group, [['Earlier drawing ID', entry.drawingId], ['Evidence retained at', entry.removedAt]]);
      group.append(deviceEvidence({ asset: entry.asset, result: entry.result }, { archived: true })); archive.append(group);
    }
    for (const previous of list(saved?.history)) archive.append(maintenanceAnswers(previous, drawing, { historical: true }));
    root.append(archive);
  }
  const footer = el('footer', 'service-report-footer');
  footer.append(el('strong', '', 'Draft service report'), el('p', '', 'Not a certificate of compliance. Engineer review required.'), el('small', '', `Job ${job.id} · revision ${job.revision}`)); root.append(footer);
  // Every report photograph must be loaded before the print lifecycle captures it.
  root.querySelectorAll('img').forEach(image => { image.loading = 'eager'; });
  return root;
}
