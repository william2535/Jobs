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

export function addJobAsset(state, jobId, values) {
  const next = clone(state), job = next.jobs.find(item => item.id === jobId);
  if (!job) throw Error('Choose a job before adding equipment.');
  let drawing = drawingFor(next, job);
  if (job.siteId == null) {
    if (job.drawingId != null) throw Error('The standalone job has an invalid drawing reference.');
    drawing ??= register();
  } else if (!drawing) throw Error('This job’s drawing could not be found.');
  if (drawing.assets.length >= 50000) throw Error('A job can contain at most 50,000 assets.');
  const asset = manualAsset(values, drawing);
  if (drawing.assets.some(item => String(item.reference || '').trim().toLocaleLowerCase() === asset.reference.toLocaleLowerCase()))
    throw Error('This reference is already used in the job. Give the new asset its own reference.');
  if (job.siteId == null) {
    drawing.assets.push(asset);
    drawing.revision = `Register ${drawing.assets.length}`;
    job.assetRegister = drawing;
    job.results.push(blankResult(asset.id));
    job.revision++; job.updatedAt = now();
    return { state: next, job, asset };
  }
  const revised = clone(drawing);
  revised.id = id(); revised.basedOnDrawingId = drawing.id; revised.kind = 'working';
  revised.revision = `${drawing.revision} · Assets ${job.revision + 1}`;
  revised.assets.push(asset);
  retainPlanPreviews(revised, drawing);
  const updated = applyDrawingToJob(next, jobId, revised);
  return { state: updated, job: updated.jobs.find(item => item.id === jobId), asset };
}

/** Duplication copies a specification, never a source ID, position, serial or visit evidence. */
export function duplicateJobAsset(state, jobId, assetId, values = {}) {
  const job = state.jobs.find(item => item.id === jobId);
  const asset = job && drawingFor(state, job)?.assets.find(item => item.id === assetId);
  if (!asset) throw Error('Choose an existing asset to duplicate.');
  const used = new Set(drawingFor(state, job).assets.map(item => String(item.reference || '').trim().toLocaleLowerCase()));
  const base = (asset.reference || asset.typeName || asset.type).trim();
  let suffix = ' copy', counter = 1;
  while (used.has(`${base.slice(0, 200 - suffix.length)}${suffix}`.toLocaleLowerCase())) suffix = ` copy ${++counter}`;
  const reference = `${base.slice(0, 200 - suffix.length)}${suffix}`;
  return addJobAsset(state, jobId, { ...specification(asset), reference, ...values });
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
