/** Portable recovery for the job workspace. This module never reads or writes browser storage. */
import { validateJobPackage } from './packages.js';
import { validateQuickDefects } from './quick-defects.js';
import { validateTimesheetEntries } from './timesheets.js';
import { validateAssetTemplates } from './asset-library.js';

export const WORKSPACE_BACKUP_FORMAT = 'JobsWorkspaceBackup';
export const WORKSPACE_BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_EXPANDED_BYTES = 256 * 1024 * 1024;
const WORKSPACE_KEYS = ['sites', 'jobs', 'quickDefects', 'unassignedTimesheets', 'assetTemplates'];
const ENVELOPE_KEYS = ['format', 'version', 'createdAt', 'appVersion', 'kind', 'workspace', 'attachments', 'attachmentRefs', 'checksum', 'backupId'];
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
const encoder = new TextEncoder();
const fail = message => { throw Error(`Invalid workspace backup: ${message}`); };
const image = value => typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp|gif|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value);
const object = (value, label, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  if (keys && Object.keys(value).some(key => !keys.includes(key))) fail(`${label} contains unsupported fields.`);
};
const text = (value, label, max = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} must be nonempty text of at most ${max} characters.`);
};
function collection(value, label, max = 50000) {
  if (!Array.isArray(value) || value.length > max) fail(`${label} must be an array with at most ${max} entries.`);
  return value;
}
function uniqueRecords(values, label) {
  const ids = new Set();
  for (const item of collection(values, label)) {
    object(item, label); text(item.id, `${label} ID`);
    if (ids.has(item.id)) fail(`${label} has duplicate IDs.`);
    ids.add(item.id);
  }
}

/** Bound JSON before cloning, hashing or expanding media. Optional undefined object fields are omitted. */
function checkedJSON(value, limit) {
  let bytes = 0, nodes = 0;
  const ancestors = new Set(), stringBytes = new Map();
  function addString(value) {
    let size = stringBytes.get(value);
    if (size === undefined) {
      if (value.length > limit) fail('a value exceeds the backup size limit.');
      size = encoder.encode(JSON.stringify(value)).byteLength;
      stringBytes.set(value, size);
    }
    bytes += size;
  }
  function walk(item, depth = 0) {
    if (++nodes > 1000000 || depth > 80) fail('structure is too large or too deeply nested.');
    let result;
    if (item === null) { bytes += 4; result = null; }
    else if (typeof item === 'string') { addString(item); result = item; }
    else if (typeof item === 'boolean') { bytes += item ? 4 : 5; result = item; }
    else if (typeof item === 'number' && Number.isFinite(item)) { bytes += String(item).length; result = item; }
    else if (item && typeof item === 'object') {
      if (ancestors.has(item)) fail('cyclic data is unsupported.');
      if (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail('only plain JSON records can be backed up.');
      ancestors.add(item); bytes += 2;
      if (Array.isArray(item)) {
        if (item.length > 100000) fail('a collection is too large.');
        result = Array.from(item, child => { bytes++; return walk(child, depth + 1); });
      } else {
        result = {};
        for (const [key, child] of Object.entries(item)) {
          if (unsafe.has(key)) fail('unsafe object key.');
          if (child === undefined) continue;
          addString(key); bytes += 2;
          result[key] = walk(child, depth + 1);
        }
      }
      ancestors.delete(item);
    } else fail('unsupported non-JSON value.');
    if (bytes > limit) fail(`backup exceeds the ${limit === MAX_BACKUP_BYTES ? '100 MiB file' : '256 MiB expanded'} limit.`);
    return result;
  }
  return { value: walk(value), bytes };
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  if (!globalThis.crypto?.subtle) throw Error('Backup integrity checks require a secure browser context (HTTPS or localhost).');
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function envelope(site, job) {
  return { format: 'JobsPackage', version: site ? 1 : 3, site, job, ...(site ? {} : { attachments: [], attachmentRefs: [] }) };
}
function validationVisit(site) {
  // A temporary validation envelope only. It is never returned, stored or counted as a job.
  // Existing package validation checks every drawing, including sites without any visits.
  const drawing = site.drawings[0];
  return {
    id: 'workspace-validation-only', siteId: site.id, drawingId: drawing.id, revision: 1,
    system: '', workType: '', scope: '', instructions: '', engineer: '', status: 'Open',
    createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z', aiProposals: [],
    results: collection(drawing.assets, 'drawing assets').map((asset, index) => ({
      id: `validation-result-${index}`, assetId: asset.id, state: 'Not tested',
      observations: '', notes: '', defects: '', readings: [], photos: [],
    })),
  };
}
function drawingsForJob(site, job) {
  const needed = new Set([job.drawingId]);
  for (const record of [job.checklist, ...(job.checklist?.history || []), job.fireMaintenance, ...(job.fireMaintenance?.history || [])])
    if (record?.drawingId != null) needed.add(record.drawingId);
  for (const item of job.archivedResults || []) needed.add(item.drawingId);
  for (const item of job.drawingChanges || []) { needed.add(item.fromDrawingId); needed.add(item.toDrawingId); }
  const byId = new Map(site.drawings.map(drawing => [drawing.id, drawing]));
  for (const id of needed) {
    const ancestor = byId.get(id)?.basedOnDrawingId;
    if (ancestor) needed.add(ancestor);
  }
  return { ...site, drawings: site.drawings.filter(drawing => needed.has(drawing.id)) };
}
function validatedWorkspace(input) {
  object(input, 'workspace', WORKSPACE_KEYS);
  const checked = checkedJSON(input, MAX_BACKUP_EXPANDED_BYTES).value;
  uniqueRecords(checked.sites, 'sites'); uniqueRecords(checked.jobs, 'jobs');
  checked.quickDefects ??= [];
  checked.unassignedTimesheets ??= [];
  checked.assetTemplates ??= [];
  // Use the existing strict validators, but retain the actual saved JSON rather than
  // their default-filled/trimmed return values. Recovery preserves import receipts.
  validateQuickDefects(checked.quickDefects);
  validateTimesheetEntries(checked.unassignedTimesheets);
  validateAssetTemplates(checked.assetTemplates);
  const sites = new Map();
  for (const site of checked.sites) {
    collection(site.drawings, 'site drawings');
    if (!site.drawings.length) fail('a site must retain at least one drawing.');
    validateJobPackage(envelope(site, validationVisit(site)));
    sites.set(site.id, site);
  }
  for (const job of checked.jobs) {
    if (job.importHistory !== undefined) {
      for (const receipt of collection(job.importHistory, 'import receipts')) text(receipt, 'import receipt');
    }
    const site = job.siteId === null ? null : sites.get(job.siteId);
    if (job.siteId !== null && !site) fail('job references a missing site.');
    validateJobPackage(envelope(site ? drawingsForJob(site, job) : null, job));
  }
  return checked;
}

async function poolWorkspace(workspace) {
  const attachments = [], attachmentRefs = [], byImage = new Map();
  function visit(value, path) {
    if (image(value)) {
      let item = byImage.get(value);
      if (!item) { item = { id: '', image: value }; byImage.set(value, item); attachments.push(item); }
      attachmentRefs.push({ path, item });
      return null;
    }
    if (Array.isArray(value)) return value.map((child, index) => visit(child, [...path, index]));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child, [...path, key])]));
    return value;
  }
  const pooled = visit(workspace, ['workspace']);
  for (const item of attachments) item.id = `image-${await digest(item.image)}`;
  return { workspace: pooled, attachments, attachmentRefs: attachmentRefs.map(ref => ({ path: ref.path, attachmentId: ref.item.id })) };
}
async function expandWorkspace(pack) {
  uniqueRecords(pack.attachments, 'attachments'); collection(pack.attachmentRefs, 'attachment references', 100000);
  const pool = new Map();
  for (const item of pack.attachments) {
    object(item, 'attachment', ['id', 'image']);
    if (!image(item.image) || item.id !== `image-${await digest(item.image)}`) fail('attachment content does not match its ID.');
    pool.set(item.id, item.image);
  }
  const expanded = { workspace: pack.workspace };
  let expandedBytes = checkedJSON(expanded.workspace, MAX_BACKUP_EXPANDED_BYTES).bytes;
  const paths = new Set(), used = new Set();
  for (const ref of pack.attachmentRefs) {
    object(ref, 'attachment reference', ['path', 'attachmentId']);
    if (!Array.isArray(ref.path) || ref.path.length < 3 || ref.path.length > 80 || ref.path[0] !== 'workspace') fail('invalid attachment path.');
    if (!pool.has(ref.attachmentId)) fail('attachment reference points to missing media.');
    const key = JSON.stringify(ref.path);
    if (paths.has(key)) fail('duplicate attachment path.');
    paths.add(key); used.add(ref.attachmentId);
    let target = expanded;
    for (let index = 0; index < ref.path.length; index++) {
      const part = ref.path[index];
      if (!target || typeof target !== 'object' || unsafe.has(part) ||
        (Array.isArray(target) ? !Number.isSafeInteger(part) || part < 0 || part >= target.length : typeof part !== 'string') ||
        !Object.hasOwn(target, part)) fail('invalid attachment path segment.');
      if (index === ref.path.length - 1) {
        if (target[part] !== null) fail('attachment path must target an empty placeholder.');
        const included = pool.get(ref.attachmentId);
        expandedBytes += included.length - 2;
        if (expandedBytes > MAX_BACKUP_EXPANDED_BYTES) fail('backup exceeds the 256 MiB expanded limit.');
        target[part] = included;
      } else target = target[part];
    }
  }
  if (used.size !== pool.size) fail('backup contains unreferenced attachments.');
  return expanded.workspace;
}
function summary(workspace, attachments) {
  return {
    sites: workspace.sites.length, jobs: workspace.jobs.length,
    drawings: workspace.sites.reduce((sum, site) => sum + site.drawings.length, 0) + workspace.jobs.filter(job => job.assetRegister).length,
    assets: workspace.sites.reduce((sum, site) => sum + (site.drawings.at(-1)?.assets.length || 0), 0) + workspace.jobs.reduce((sum, job) => sum + (job.assetRegister?.assets.length || 0), 0),
    quickDefects: workspace.quickDefects.length, unassignedTimesheets: workspace.unassignedTimesheets.length,
    assetTemplates: workspace.assetTemplates.length,
    attachments,
  };
}
function workspaceIdentity(workspace) {
  // IndexedDB getAll() returns site/job records in key order after reopening.
  // Their collection order is not identity; drawing/revision and evidence order is.
  const byId = (left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  return canonical({ ...workspace, sites: [...workspace.sites].sort(byId), jobs: [...workspace.jobs].sort(byId) });
}

export async function createWorkspaceBackup(snapshot, { appVersion = 'unspecified', kind = 'backup' } = {}) {
  if (!['backup', 'recovery'].includes(kind)) fail('unsupported backup kind.');
  text(appVersion, 'app version', 80);
  const workspace = validatedWorkspace(snapshot);
  const payload = {
    format: WORKSPACE_BACKUP_FORMAT, version: WORKSPACE_BACKUP_VERSION,
    createdAt: new Date().toISOString(), appVersion, kind, ...await poolWorkspace(workspace),
  };
  checkedJSON(payload, MAX_BACKUP_BYTES);
  const checksum = await digest(payload);
  const pack = { ...payload, checksum: `sha256:${checksum}`, backupId: `workspace-${checksum}` };
  checkedJSON(pack, MAX_BACKUP_BYTES);
  return pack;
}

export async function inspectWorkspaceBackup(input) {
  if (typeof input === 'string') {
    if (input.length > MAX_BACKUP_BYTES || encoder.encode(input).byteLength > MAX_BACKUP_BYTES) fail('file exceeds the 100 MiB import limit.');
    try { input = JSON.parse(input); } catch { fail('file is not valid JSON.'); }
  }
  object(input, 'root', ENVELOPE_KEYS);
  const pack = checkedJSON(input, MAX_BACKUP_BYTES).value;
  if (pack.format !== WORKSPACE_BACKUP_FORMAT || pack.version !== WORKSPACE_BACKUP_VERSION) fail('unsupported format or version.');
  if (!['backup', 'recovery'].includes(pack.kind)) fail('unsupported backup kind.');
  text(pack.appVersion, 'app version', 80);
  if (typeof pack.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(pack.createdAt) || !Number.isFinite(Date.parse(pack.createdAt)) || new Date(pack.createdAt).toISOString() !== pack.createdAt) fail('invalid creation time.');
  if (typeof pack.checksum !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(pack.checksum)) fail('missing or invalid checksum.');
  const { checksum, backupId, ...payload } = pack;
  const expected = await digest(payload);
  if (checksum !== `sha256:${expected}` || backupId !== `workspace-${expected}`) fail('checksum mismatch; this backup was changed or damaged.');
  const workspace = validatedWorkspace(await expandWorkspace(pack));
  return {
    workspace, summary: summary(workspace, pack.attachments.length),
    metadata: { format: pack.format, version: pack.version, kind: pack.kind, createdAt: pack.createdAt, appVersion: pack.appVersion, checksum, backupId },
  };
}

export async function restoreWorkspaceBackup(current, input) {
  const incoming = await inspectWorkspaceBackup(input);
  const existing = validatedWorkspace(current);
  if (workspaceIdentity(existing) === workspaceIdentity(incoming.workspace)) return { state: current, duplicate: true, summary: incoming.summary, metadata: incoming.metadata, message: 'This workspace backup is already present. No records changed.' };
  if (WORKSPACE_KEYS.some(key => existing[key].length)) throw Error('Restore needs an empty job workspace. Your existing work was kept. Use individual job imports to combine work, or restore this backup in a separate browser profile or device.');
  return {
    state: incoming.workspace, duplicate: false, summary: incoming.summary, metadata: incoming.metadata,
    message: incoming.metadata.kind === 'recovery'
      ? 'Recovery snapshot prepared. Save it locally to recover the recorded save attempt.'
      : 'Workspace backup prepared for local restore.',
  };
}
