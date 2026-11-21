/** Independent maintenance records. These questions do not issue a certificate or pass devices. */
const outcome = (id, label, hint = '') => ({ id, label, type: 'choice', options: ['Pass', 'Fail', 'N/A'], explanationRequiredFor: ['Fail', 'N/A'], hint });
const reading = (id, label, unit, extra = {}) => ({ id, label, type: 'number', unit, ...extra });

export const FIRE_SYSTEM_QUESTIONS = [
  outcome('mcp-siting', 'Are manual call points appropriately sited, at the required height and unobstructed?', 'Assess the actual installation and applicable requirements; record any limitations.'),
  { id: 'system-category', label: 'What is the apparent system category?', type: 'text', hint: 'Record the apparent category and the basis for it. Do not infer a verified design category from the drawing.' },
  outcome('logbook-updated', 'Has the system logbook been updated for this visit?'),
  { id: 'logbook-location', label: 'Where is the system logbook kept?', type: 'text' },
  { id: 'layout-changes', label: 'Have building layout or use changes been identified?', type: 'choice', options: ['No changes', 'Changes identified', 'Unknown'] },
  outcome('alarm-outputs', 'Did the audible and visual alarm outputs tested operate satisfactorily?', 'Record the tested scope and any untested outputs.'),
  reading('false-alarms-12-months', 'How many false alarms were recorded in the last 12 months?', '', { min: 0, integer: true }),
  { id: 'areas-devices-tested', label: 'Which areas and devices were tested during this visit?', type: 'text' },
];

export const FIRE_EQUIPMENT_TEMPLATES = [
  { id: 'fire-panel', label: 'Fire panel', questions: [
    outcome('panel-controls', 'Did the panel controls and indicators operate satisfactorily?'),
    outcome('panel-functions', 'Did the panel functions tested operate satisfactorily?'),
    outcome('panel-supply-tolerance', 'Were the measured supply voltages within the manufacturer’s specified tolerances?', 'Use the actual equipment instructions and readings. Do not assume a tolerance.'),
    reading('panel-quiescent-current', 'Panel quiescent current', 'mA'),
    reading('panel-alarm-current', 'Panel alarm current', 'mA'),
    outcome('panel-zone-plan', 'Is an appropriate, current zone plan fitted?'),
    outcome('panel-document-storage', 'Are the relevant system documents available and suitably stored?'),
  ] },
  { id: 'battery', label: 'Backup battery', questions: [
    outcome('battery-service-life', 'Has battery service life been checked against the manufacturer’s criteria?', 'Use manufacturer service-life and replacement criteria; no fixed replacement age is assumed.'),
    reading('battery-charge-voltage', 'Battery charge voltage', 'V'),
    reading('battery-load-voltage', 'Battery voltage under load', 'V'),
    reading('battery-capacity', 'Recorded battery capacity', 'Ah', { min: 0 }),
    reading('battery-quiescent-current', 'Battery quiescent current', 'mA'),
    outcome('battery-inspection-date', 'Has the battery inspection date been marked?'),
  ] },
];

export const FIRE_MAINTENANCE_FIELDS = [
  'visitDate', 'engineer', 'company', 'serviceInterval', 'standard', 'scope', 'limitations',
  'conditionLeft', 'nextActions', 'engineerName', 'engineerDate', 'clientName', 'clientUnavailableReason',
];
const SNAPSHOT_KEYS = ['revision', 'templateVersion', 'drawingId', 'drawingRevision', 'basedOnJobRevision', 'savedAt', 'fields', 'systemAnswers', 'equipment'];
const MAX_HISTORY = 100;
const clone = value => structuredClone(value);
const encodedSize = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const record = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)))
    throw Error(`${label} has an invalid structure.`);
};
const text = (value, label, limit = 10000, required = false) => {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim()))
    throw Error(`${label} must be ${required ? 'nonempty ' : ''}text of at most ${limit} characters.`);
  return value.trim();
};
const date = (value, label) => {
  const checked = text(value, label, 10);
  if (checked && (!/^\d{4}-\d{2}-\d{2}$/.test(checked) || !Number.isFinite(Date.parse(checked)) || new Date(checked).toISOString().slice(0, 10) !== checked))
    throw Error(`${label} must be a real date in YYYY-MM-DD format.`);
  return checked;
};
const emptyAnswers = questions => Object.fromEntries(questions.map(({ id }) => [id, { value: null, notes: '' }]));
const templateFor = id => FIRE_EQUIPMENT_TEMPLATES.find(template => template.id === id);

export function isFireMaintenanceJob(job) {
  return !!job && ((job.discipline === 'Fire' && job.workType === 'Maintenance') ||
    ((!job.discipline || job.discipline === 'Fire') && job.workType === 'Fire alarm maintenance'));
}

function validateAnswers(values, questions) {
  record(values, questions.map(question => question.id), 'Maintenance answers');
  return Object.fromEntries(questions.map(question => {
    const answer = values[question.id];
    record(answer, ['value', 'notes'], `Answer for ${question.label}`);
    const notes = text(answer.notes, 'Maintenance answer notes');
    let value = answer.value;
    if (value !== null) {
      if (question.type === 'choice' && !question.options.includes(value)) throw Error(`Choose a supported answer for ${question.label}`);
      if (question.type === 'text') {
        value = text(value, question.label);
        if (!value) value = null;
      }
      if (question.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) ||
          (question.integer && !Number.isSafeInteger(value)) || (question.min !== undefined && value < question.min)))
        throw Error(`${question.label} must be a finite${question.integer ? ' whole' : ''} number${question.min !== undefined ? ` of at least ${question.min}` : ''}.`);
      if (question.explanationRequiredFor?.includes(value) && !notes) throw Error(`Explain the ${value} answer for ${question.label}`);
    }
    return [question.id, { value, notes }];
  }));
}

function snapshot(value) {
  record(value, SNAPSHOT_KEYS, 'Fire maintenance record');
  if (value.templateVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1)
    throw Error('Fire maintenance template or revision is unsupported.');
  if (!Number.isSafeInteger(value.basedOnJobRevision) || value.basedOnJobRevision < 1)
    throw Error('Fire maintenance job revision is invalid.');
  const drawingId = value.drawingId === null ? null : text(value.drawingId, 'Maintenance drawing ID', 1000, true);
  const drawingRevision = text(value.drawingRevision, 'Maintenance drawing revision', 300);
  if (drawingId === null && drawingRevision) throw Error('A maintenance record without a drawing cannot have a drawing revision.');
  const savedAt = text(value.savedAt, 'Maintenance saved time', 40, true);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(savedAt) || !Number.isFinite(Date.parse(savedAt)) || new Date(savedAt).toISOString().slice(0, 10) !== savedAt.slice(0, 10))
    throw Error('Maintenance saved time must be a valid UTC timestamp.');
  record(value.fields, FIRE_MAINTENANCE_FIELDS, 'Maintenance visit details');
  const fields = Object.fromEntries(FIRE_MAINTENANCE_FIELDS.map(key => [key,
    ['visitDate', 'engineerDate'].includes(key) ? date(value.fields[key] ?? '', key) : text(value.fields[key] ?? '', key),
  ]));
  if (!Array.isArray(value.equipment) || value.equipment.length > 100) throw Error('Record at most 100 maintenance equipment checks.');
  const ids = new Set();
  const equipment = value.equipment.map(item => {
    record(item, ['id', 'templateId', 'assetId', 'label', 'answers'], 'Maintenance equipment');
    const id = text(item.id, 'Maintenance equipment ID', 160, true);
    if (ids.has(id)) throw Error('Maintenance equipment IDs must be unique.');
    ids.add(id);
    const template = templateFor(item.templateId);
    if (!template) throw Error('Maintenance equipment template is unsupported.');
    const assetId = item.assetId === null ? null : text(item.assetId, 'Maintenance asset ID', 300, true);
    if (assetId !== null && drawingId === null) throw Error('Linked maintenance equipment needs its drawing reference.');
    return { id, templateId: template.id, assetId, label: text(item.label, 'Equipment label', 300, true), answers: validateAnswers(item.answers, template.questions) };
  });
  return { revision: value.revision, templateVersion: 1, drawingId, drawingRevision, basedOnJobRevision: value.basedOnJobRevision, savedAt, fields, systemAnswers: validateAnswers(value.systemAnswers, FIRE_SYSTEM_QUESTIONS), equipment };
}

export function validateFireMaintenance(value) {
  if (value === undefined) return undefined;
  record(value, ['version', 'id', ...SNAPSHOT_KEYS, 'history'], 'Fire maintenance');
  if (value.version !== 1) throw Error('Fire maintenance version is unsupported.');
  const id = text(value.id, 'Fire maintenance ID', 160, true);
  if (!Array.isArray(value.history) || value.history.length > MAX_HISTORY) throw Error(`Fire maintenance history must contain at most ${MAX_HISTORY} records.`);
  const { version, id: ignored, history, ...current } = value;
  const checked = snapshot(current), revisions = new Set();
  let bytes = encodedSize(checked);
  if (bytes > 4 * 1024 * 1024) throw Error('Maintenance records and history exceed the 4 MiB text limit.');
  const previous = history.map(item => {
    const prior = snapshot(item);
    if (prior.revision >= checked.revision || revisions.has(prior.revision)) throw Error('Maintenance history revisions must be unique and earlier than the current revision.');
    revisions.add(prior.revision);
    bytes += encodedSize(prior);
    if (bytes > 4 * 1024 * 1024) throw Error('Maintenance records and history exceed the 4 MiB text limit.');
    return prior;
  });
  return { version: 1, id, ...checked, history: previous };
}

export function createFireMaintenanceEquipment(templateId, asset = null) {
  const template = templateFor(templateId);
  if (!template) throw Error('Maintenance equipment template is unsupported.');
  if (asset && (typeof asset.id !== 'string' || !asset.id.trim())) throw Error('Choose an equipment record with a stable asset ID.');
  return {
    id: crypto.randomUUID(), templateId, assetId: asset?.id || null,
    label: asset ? String(asset.reference || asset.typeName || asset.type || '') : '',
    answers: emptyAnswers(template.questions),
  };
}

function selectedDrawing(job, drawing) {
  if (!job || typeof job !== 'object') throw Error('Choose a job before recording maintenance.');
  if (job.drawingId == null) {
    if (drawing != null) throw Error('The selected drawing does not belong to this job.');
    return { drawingId: null, drawingRevision: '' };
  }
  if (!drawing || drawing.id !== job.drawingId || !Array.isArray(drawing.assets)) throw Error('Load this job’s selected drawing before recording maintenance.');
  return { drawingId: drawing.id, drawingRevision: String(drawing.revision ?? '') };
}

export function createFireMaintenanceDraft(job, drawing = null) {
  const selected = selectedDrawing(job, drawing), saved = validateFireMaintenance(job.fireMaintenance);
  if (saved && saved.drawingId === selected.drawingId) return clone(saved);
  return {
    version: 1, id: saved?.id || crypto.randomUUID(), revision: saved?.revision || 0, templateVersion: 1,
    ...selected, basedOnJobRevision: job.revision || 1, savedAt: '',
    fields: saved ? clone(saved.fields) : Object.fromEntries(FIRE_MAINTENANCE_FIELDS.map(key => [key,
      key === 'engineer' ? job.engineer || '' : key === 'scope' ? job.scope || job.workflow?.details?.description || '' : '',
    ])),
    systemAnswers: emptyAnswers(FIRE_SYSTEM_QUESTIONS), equipment: [], history: clone(saved?.history || []),
  };
}

export function saveFireMaintenance(job, draft, drawing = null) {
  const selected = selectedDrawing(job, drawing), saved = validateFireMaintenance(job.fireMaintenance);
  record(draft, ['version', 'id', ...SNAPSHOT_KEYS, 'history'], 'Fire maintenance draft');
  if (draft.version !== 1 || draft.templateVersion !== 1 || draft.revision !== (saved?.revision || 0) || (saved && draft.id !== saved.id))
    throw Error('This maintenance draft is out of date. Reopen the saved record before editing.');
  if (draft.drawingId !== selected.drawingId) throw Error('The job drawing changed. Reopen and review the maintenance form.');
  const candidate = validateFireMaintenance({
    ...clone(draft), ...selected, revision: (saved?.revision || 0) + 1,
    basedOnJobRevision: job.revision || 1, savedAt: new Date().toISOString(), history: clone(saved?.history || []),
  });
  if (drawing && candidate.equipment.some(item => item.assetId !== null && !drawing.assets.some(asset => asset.id === item.assetId)))
    throw Error('Maintenance equipment must belong to the selected drawing.');
  const comparable = value => JSON.stringify({ drawingId: value.drawingId, drawingRevision: value.drawingRevision, fields: value.fields, systemAnswers: value.systemAnswers, equipment: value.equipment });
  if (saved && comparable(saved) === comparable(candidate)) return clone(saved);
  if (saved) {
    const { version, id, history, ...previous } = saved;
    candidate.history.push(clone(previous));
  }
  return validateFireMaintenance(candidate);
}
