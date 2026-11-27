/** Manual equipment and reusable specifications, separate from drawing/source and visit evidence. */
import { id, now, attachJobToSite } from './model.js';
import { applyDrawingToJob } from './revisions.js';

const clone = value => structuredClone(value);
const fields = ['type', 'typeName', 'manufacturer', 'model', 'description'];
const text = (value, label, max = 200, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw Error(`${label} must be ${required ? 'nonempty ' : ''}text of at most ${max} characters.`);
  return value.trim();
};
const specification = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Choose an equipment specification.');
  return Object.fromEntries(fields.map(key => [key, text(value[key] ?? '', key, key === 'description' ? 5000 : 200, key === 'type')]));
};

export function validateAssetTemplates(items = []) {
  if (!Array.isArray(items) || items.length > 500) throw Error('Keep at most 500 asset favourites.');
  const ids = new Set(), signatures = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['id', 'name', ...fields].includes(key)))
      throw Error('Asset favourite has an invalid structure.');
    const templateId = text(item.id, 'Asset favourite ID', 160, true);
    const name = text(item.name, 'Asset favourite name', 200, true), values = specification(item);
    const signature = JSON.stringify(values);
    if (ids.has(templateId) || signatures.has(signature)) throw Error('Asset favourites must have unique IDs and specifications.');
    ids.add(templateId); signatures.add(signature);
    return { id: templateId, name, ...values };
  });
}

/** Only reusable specifications are retained. Location, identities and evidence are never favourites. */
export function saveAssetTemplate(templates, asset) {
  const next = validateAssetTemplates(templates), values = specification(asset);
  if (next.some(item => JSON.stringify(specification(item)) === JSON.stringify(values))) return next;
  return validateAssetTemplates([...next, { id: id(), name: values.typeName || values.type, ...values }]);
}

const blankResult = assetId => ({ id: id(), assetId, state: 'Not tested', observations: '', readings: [], notes: '', defects: '', photos: [] });
const register = () => ({ id: id(), revision: 'Register 1', kind: 'working', floors: [], assets: [], source: null, issuedSnapshots: [] });
const drawingFor = (state, job) => job.siteId == null ? job.assetRegister : state.sites.find(site => site.id === job.siteId)?.drawings.find(drawing => drawing.id === job.drawingId);

const referenceKey = value => String(value || '').trim().toLowerCase();
function assetQuantity(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100)
    throw Error('Choose a whole number of assets from 1 to 100.');
  return value;
}
function incrementReference(reference) {
  const number = reference.match(/\d+$/u)?.[0];
  const next = number
    ? reference.slice(0, -number.length) + (BigInt(number) + 1n).toString().padStart(number.length, '0')
    : `${reference} 001`;
  if (next.length > 200) throw Error('Reference is too long to number automatically. Shorten it first.');
  return next;
}

/** The same collision-safe sequence is used by the preview and the saved batch. */
export function previewAssetReferences(assets, firstReference, quantity = 1) {
  assetQuantity(quantity);
  let reference = text(firstReference, 'Reference', 200, true);
  const used = new Set(assets.map(asset => referenceKey(asset.reference)));
  const references = [];
  while (references.length < quantity) {
    if (!used.has(referenceKey(reference))) {
      references.push(reference);
      used.add(referenceKey(reference));
    }
    if (references.length < quantity) reference = incrementReference(reference);
  }
  return references;
}

/** Start after the selected device, preserving its tag prefix and number padding. */
export function nextAssetReference(assets, sourceReference) {
  return previewAssetReferences(assets, incrementReference(text(sourceReference, 'Reference', 200, true)))[0];
}

/** Adding unplaced equipment does not change any plan pixels. Keep the engine's
 * actual PNG sheets, with their original provenance, rather than rerasterizing. */
function retainPlanPreviews(revised, previous) {
  for (const [index, preview] of (revised.planPreviews || []).entries()) {
    if (preview.drawingId !== previous.id) continue;
    preview.sourcePreviewId ??= preview.id;
    preview.sourcePreviewDrawingId ??= previous.id;
    preview.sourcePreviewRevision ??= preview.revision;
    preview.id = `preview:${revised.id}:${index}`;
    preview.drawingId = revised.id;
    if (preview.snapshotId == null) preview.revision = String(revised.revision);
  }
  if (revised.planPreviewAttemptedFor === previous.id) revised.planPreviewAttemptedFor = revised.id;
}

/** Independent of any drawing symbol: no source mapping, coordinates or copied test result. */
function manualAsset(values, drawing) {
  const info = specification(values);
  const floorId = values.floorId == null || values.floorId === '' ? null : text(values.floorId, 'Floor ID', 1000, true);
  const floor = floorId == null ? null : drawing.floors.find(item => item.id === floorId);
  if (floorId && !floor) throw Error('Choose a floor in this job, or leave the floor unassigned.');
  return { id: id(), ...info, reference: text(values.reference, 'Reference', 200, true),
    location: text(values.location ?? '', 'Location', 500), floorId, floorName: floor?.name || '',
    x: null, y: null, photos: [], drawingStatus: 'notRecorded', origin: 'manual' };
}

function assetTarget(state, jobId, quantity) {
  assetQuantity(quantity);
  const job = state.jobs.find(item => item.id === jobId);
  if (!job) throw Error('Choose a job before adding equipment.');
  let drawing = drawingFor(state, job);
  if (job.siteId == null) {
    if (job.drawingId != null) throw Error('The standalone job has an invalid drawing reference.');
    drawing ??= register();
  } else if (!drawing) throw Error('This job’s drawing could not be found.');
  if (drawing.assets.length + quantity > 50000) throw Error('A job can contain at most 50,000 assets.');
  return { job, drawing };
}

/** All batch validation happens before this single revision is applied. */
function commitAssets(state, job, drawing, assets) {
  if (job.siteId == null) {
    const next = clone(state), updatedJob = next.jobs.find(item => item.id === job.id);
    const updatedDrawing = updatedJob.assetRegister || drawing;
    updatedDrawing.assets.push(...assets);
    updatedDrawing.revision = `Register ${updatedDrawing.assets.length}`;
    updatedJob.assetRegister = updatedDrawing;
    updatedJob.results.push(...assets.map(asset => blankResult(asset.id)));
    updatedJob.revision++; updatedJob.updatedAt = now();
    return { state: next, job: updatedJob, asset: assets[0], assets };
  }
  const revised = clone(drawing);
  revised.id = id(); revised.basedOnDrawingId = drawing.id; revised.kind = 'working';
  revised.revision = `${drawing.revision} · Assets ${job.revision + 1}`;
  revised.assets.push(...assets);
  retainPlanPreviews(revised, drawing);
  const updated = applyDrawingToJob(state, job.id, revised);
  const updatedJob = updated.jobs.find(item => item.id === job.id);
  const added = drawingFor(updated, updatedJob).assets.slice(-assets.length);
  return { state: updated, job: updatedJob, asset: added[0], assets: added };
}

function firstReference(values) {
  const info = specification(values);
  const reference = text(values.reference ?? '', 'Reference', 200);
  return reference || `${(info.typeName || info.type).slice(0, 196).trimEnd()} 001`;
}

/** Create up to 100 fresh, unplaced assets in one all-or-nothing working revision. */
export function addJobAssets(state, jobId, values, quantity = 1) {
  const { job, drawing } = assetTarget(state, jobId, quantity);
  const references = previewAssetReferences(drawing.assets, firstReference(values), quantity);
  const assets = references.map(reference => manualAsset({ ...values, reference }, drawing));
  return commitAssets(state, job, drawing, assets);
}

/** Keep explicit single-add collision checks; a blank tag is generated automatically. */
export function addJobAsset(state, jobId, values) {
  const { job, drawing } = assetTarget(state, jobId, 1);
  const first = firstReference(values);
  const asset = manualAsset({ ...values, reference: first }, drawing);
  if (values.reference?.trim() && drawing.assets.some(item => referenceKey(item.reference) === referenceKey(first)))
    throw Error('This reference is already used in the job. Give the new asset its own reference.');
  [asset.reference] = previewAssetReferences(drawing.assets, first);
  return commitAssets(state, job, drawing, [asset]);
}

/** Duplication copies a specification, never a source ID, position, serial or visit evidence. */
export function duplicateJobAssets(state, jobId, assetId, values = {}, quantity = 1) {
  assetQuantity(quantity);
  const job = state.jobs.find(item => item.id === jobId);
  const drawing = job && drawingFor(state, job);
  const asset = drawing?.assets.find(item => item.id === assetId);
  if (!asset) throw Error('Choose an existing asset to duplicate.');
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw Error('Choose an equipment specification.');
  const override = text(values.reference ?? '', 'Reference', 200);
  const reference = override || nextAssetReference(drawing.assets, asset.reference?.trim() || asset.typeName || asset.type);
  return addJobAssets(state, jobId, {
    ...specification(asset), location: asset.location || '', floorId: asset.floorId ?? null, ...values, reference,
  }, quantity);
}

export function duplicateJobAsset(state, jobId, assetId, values = {}) {
  return duplicateJobAssets(state, jobId, assetId, values);
}

/** Attach a standalone register by retaining it as a historical drawing and making
 * a new site drawing. Other visits and the site's original drawings stay unchanged. */
export function attachAssetJobToSite(state, jobId, siteId) {
  const next = clone(state), job = next.jobs.find(item => item.id === jobId), site = next.sites.find(item => item.id === siteId);
  if (!job || !site?.name?.trim()) throw Error('Choose a job and a named site.');
  if (job.siteId === site.id) return { state: next, job };
  if (job.siteId != null || job.drawingId != null) throw Error('This job already has site or drawing evidence.');
  if (!job.assetRegister) {
    const attached = attachJobToSite(job, site);
    next.jobs[next.jobs.indexOf(job)] = attached;
    return { state: next, job: attached };
  }
  const previous = job.assetRegister, base = site.drawings.at(-1);
  if (!base || site.drawings.some(item => item.id === previous.id)) throw Error('The asset register conflicts with the site’s saved drawings.');
  if (previous.assets.length + base.assets.length > 50000) throw Error('The combined register would exceed 50,000 assets. Existing work was kept.');
  const existingIds = new Set(base.assets.map(asset => asset.id));
  if (previous.assets.some(asset => existingIds.has(asset.id))) throw Error('An asset identity already exists at this site; existing work was kept.');
  const merged = clone(base);
  merged.id = id(); merged.kind = 'working'; merged.basedOnDrawingId = base.id;
  merged.revision = `${base.revision} · Register ${job.revision + 1}`;
  // Register assets have no plan positions. Preserve their stable identity and evidence.
  merged.assets.push(...clone(previous.assets));
  retainPlanPreviews(merged, base);
  site.drawings.push(clone(previous));
  job.siteId = site.id; job.drawingId = previous.id;
  for (const record of [job.fireMaintenance, ...(job.fireMaintenance?.history || [])]) {
    if (record && record.drawingId === null && record.equipment.some(item => item.assetId != null)) {
      record.drawingId = previous.id; record.drawingRevision = String(previous.revision);
    }
  }
  delete job.assetRegister;
  const updated = applyDrawingToJob(next, jobId, merged);
  return { state: updated, job: updated.jobs.find(item => item.id === jobId) };
}
