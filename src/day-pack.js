/** Offline multi-job assignments and day returns. Validation precedes every candidate import. */
import { createJobPackage, importJobPackage, validateJobPackage } from './packages.js';
import { validateTimesheetEntry, validateTimesheetEntries, timesheetEntries, minutesForTimesheet } from './timesheets.js';
import { createDayReceipt, validateDayReceipt, validateOfficeDay } from './day-session.js';

export const DAY_PACK_FORMAT = 'JobsDayPack';
export const DAY_PACK_VERSION = 1;
export const MAX_DAY_PACK_BYTES = 100 * 1024 * 1024;
export const MAX_DAY_EXPANDED_BYTES = 256 * 1024 * 1024;
export const MAX_DAY_JOBS = 100;
const envelopeKeys = ['format', 'version', 'kind', 'packId', 'checksum', 'createdAt', 'date', 'engineer', 'label', 'officeId', 'parentPackId', 'jobIds', 'packages', 'day', 'unassignedTimesheets'];
const summaryKeys = ['kind', 'date', 'engineer', 'label', 'officeId', 'parentPackId', 'jobCount', 'conflictCount', 'attendanceMinutes', 'unallocatedMinutes'];
const clone = value => structuredClone(value), encoder = new TextEncoder();
const fail = message => { throw Error(`Invalid day pack: ${message}`); };
const object = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(`${label} has an invalid structure.`);
};
function text(value, label, required = true, max = 1000) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${label} must be ${required ? 'nonempty ' : ''}text of at most ${max} characters.`);
  return value;
}
function date(value) {
  text(value, 'date', true, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('choose a real date.');
  return value;
}
function instant(value) {
  text(value, 'createdAt', true, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)) fail('createdAt is invalid.');
  return value;
}
function parent(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^day-pack-[a-f0-9]{64}$/.test(value)) fail('parent day pack ID is invalid.');
  return value;
}
function jobIds(values) {
  if (!Array.isArray(values) || !values.length || values.length > MAX_DAY_JOBS) fail(`choose between 1 and ${MAX_DAY_JOBS} jobs.`);
  values.forEach(value => text(value, 'job ID'));
  if (new Set(values).size !== values.length) fail('job IDs must be unique.');
  return [...values];
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  if (!globalThis.crypto?.subtle) throw Error('Day packs need HTTPS or localhost for integrity checks.');
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(canonical(value)));
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}
/** Bound depth, actual encoded size and JSON types before cloning/expanding or hashing. */
function measuredBytes(value, limit) {
  let bytes = 0, nodes = 0; const ancestors = new Set(), sizes = new Map();
  const add = value => { let size = sizes.get(value); if (size === undefined) { if (value.length > limit) fail('a value exceeds the size limit.'); size = encoder.encode(JSON.stringify(value)).byteLength; sizes.set(value, size); } bytes += size; };
  function visit(value, depth = 0) {
    if (++nodes > 1000000 || depth > 80) fail('structure is too large or deeply nested.');
    if (value === null) bytes += 4;
    else if (typeof value === 'string') add(value);
    else if (typeof value === 'boolean') bytes += value ? 4 : 5;
    else if (typeof value === 'number' && Number.isFinite(value)) bytes += String(value).length;
    else if (value && typeof value === 'object') {
      if (ancestors.has(value)) fail('cyclic data is unsupported.');
      if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('only plain JSON records can be transferred.');
      ancestors.add(value); bytes += 2;
      if (Array.isArray(value)) {
        if (value.length > 100000) fail('a collection is too large.');
        for (const child of value) { bytes++; visit(child, depth + 1); }
      } else for (const [key, child] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('unsafe object key.');
        add(key); bytes += 2; visit(child, depth + 1);
      }
      ancestors.delete(value);
    } else fail('unsupported non-JSON value.');
    if (bytes > limit) fail(`the ${limit === MAX_DAY_PACK_BYTES ? '100 MiB file' : '256 MiB expanded'} limit was exceeded. Choose fewer jobs or keep separate packs.`);
  }
  visit(value); return bytes;
}
function readInput(input) {
  let value = input;
  if (typeof input === 'string') {
    if (input.length > MAX_DAY_PACK_BYTES || encoder.encode(input).byteLength > MAX_DAY_PACK_BYTES) fail('the 100 MiB file limit was exceeded.');
    try { value = JSON.parse(input); } catch { fail('file is not valid JSON.'); }
  }
  measuredBytes(value, MAX_DAY_PACK_BYTES);
  return value;
}
function header(value) {
  object(value, envelopeKeys, 'envelope');
  if (value.format !== DAY_PACK_FORMAT || value.version !== DAY_PACK_VERSION || !['assignment', 'return'].includes(value.kind)) fail('choose a supported Jobs day pack.');
  const body = { format: value.format, version: 1, kind: value.kind, createdAt: instant(value.createdAt), date: date(value.date), engineer: text(value.engineer, 'engineer', value.kind === 'return', 200), label: text(value.label, 'label', false, 200), officeId: text(value.officeId, 'office ID', true, 200), parentPackId: parent(value.parentPackId), jobIds: jobIds(value.jobIds), packages: value.packages, day: value.day, unassignedTimesheets: validateTimesheetEntries(value.unassignedTimesheets) };
  if (!Array.isArray(body.packages) || body.packages.length !== body.jobIds.length) fail('every selected job needs exactly one complete job package.');
  if (body.kind === 'assignment') {
    if (body.day !== null || body.unassignedTimesheets.length) fail('an assignment cannot claim completed attendance or returned time.');
  } else {
    body.day = validateOfficeDay(body.day);
    if (body.day.status !== 'finished' || body.day.preparedPackId !== null || body.day.receipt !== null || body.day.receiptHistory.length) fail('a return must contain finished attendance without a delivery claim.');
    if (body.parentPackId !== body.day.packId || body.day.officeId !== body.officeId || body.day.engineer !== body.engineer || body.day.date !== body.date || canonical(body.day.jobIds) !== canonical(body.jobIds)) fail('returned day identity does not match its jobs or original assignment.');
    if (canonical([...body.day.timesheetEntryIds].sort()) !== canonical(body.unassignedTimesheets.map(entry => entry.id).sort())) fail('returned attendance needs each of its saved unallocated time entries.');
    if (body.unassignedTimesheets.some(entry => entry.engineer.trim().toLocaleLowerCase() !== body.engineer.trim().toLocaleLowerCase())) fail('returned time belongs to another engineer; review the day first.');
  }
  return body;
}
const attendanceMinutes = day => day ? (Date.parse(`${day.localFinish}:00Z`) - Date.parse(`${day.localStart}:00Z`)) / 60000 : 0;
function summaryFor(body, conflictCount = 0) {
  return { kind: body.kind, date: body.date, engineer: body.engineer, label: body.label, officeId: body.officeId, parentPackId: body.parentPackId, jobCount: body.jobIds.length, conflictCount, attendanceMinutes: attendanceMinutes(body.day), unallocatedMinutes: body.unassignedTimesheets.filter(entry => entry.id.startsWith(`${body.day?.id}:unallocated:`)).reduce((sum, entry) => sum + minutesForTimesheet(entry), 0) };
}

export async function createDayPack(state, { jobIds: chosenIds, engineer = '', date: selectedDate, label = '', officeId, kind = 'assignment', parentPackId = null, day = null, createdAt = new Date().toISOString() }) {
  const finished = day ? validateOfficeDay(day) : null;
  if (kind === 'return' && (!finished || finished.status === 'running')) throw Error('Finish the day before preparing its return pack.');
  const selected = jobIds(chosenIds || day?.jobIds), entries = [];
  if (kind === 'return') {
    // Timesheets can allocate the saved day gaps to jobs after the day finishes.
    // Resolve current ownership without changing the local day's stable tracking IDs.
    const rows = timesheetEntries(state, { includeDeleted: true });
    const returnJobIds = new Set([...finished.jobIds, ...selected]);
    for (const id of finished.timesheetEntryIds) {
      const matches = rows.filter(row => row.entry.id === id);
      if (!matches.length) throw Error('The day’s saved time entry is missing. Review timesheets before returning it.');
      if (matches.length > 1) throw Error('The day’s saved time entry has conflicting copies. Review timesheets before returning it.');
      const { entry, jobId } = matches[0];
      if (entry.engineer.trim().toLocaleLowerCase() !== finished.engineer.trim().toLocaleLowerCase()) throw Error('The day’s saved time entry belongs to another engineer. Review timesheets before returning it.');
      if (jobId === null) entries.push(entry);
      else returnJobIds.add(jobId);
    }
    selected.splice(0, selected.length, ...jobIds([...returnJobIds]));
  }
  const packages = []; let expandedBytes = 0;
  for (const jobId of selected) {
    const job = state.jobs?.find(job => job.id === jobId);
    if (!job) throw Error('A selected job is no longer saved. Review the day pack before sharing.');
    const site = job.siteId === null ? null : state.sites?.find(site => site.id === job.siteId);
    if (job.siteId !== null && !site) throw Error('A selected job’s site is missing.');
    const complete = await createJobPackage(site, job);
    expandedBytes += measuredBytes(validateJobPackage(complete), MAX_DAY_EXPANDED_BYTES);
    if (expandedBytes > MAX_DAY_EXPANDED_BYTES) fail('combined expanded jobs exceed 256 MiB.');
    packages.push(complete);
    measuredBytes(packages, MAX_DAY_PACK_BYTES);
  }
  const body = header({ format: DAY_PACK_FORMAT, version: 1, kind, createdAt, date: selectedDate || finished?.date, engineer: kind === 'return' ? finished.engineer : engineer.trim(), label: label.trim(), officeId: officeId || finished?.officeId, parentPackId: kind === 'return' ? finished.packId : parentPackId, jobIds: selected, packages, day: kind === 'return' ? { ...finished, jobIds: selected, timesheetEntryIds: entries.map(entry => entry.id), status: 'finished', preparedPackId: null, receipt: null, receiptHistory: [] } : null, unassignedTimesheets: kind === 'return' ? entries : [] });
  if (expandedBytes + measuredBytes({ ...body, packages: [] }, MAX_DAY_EXPANDED_BYTES) > MAX_DAY_EXPANDED_BYTES) fail('combined expanded jobs and day records exceed 256 MiB.');
  const { createdAt: ignored, ...identity } = body;
  const packId = `day-pack-${await digest(identity)}`, checksum = `sha256:${await digest({ ...body, packId })}`;
  const pack = { ...body, packId, checksum };
  measuredBytes(pack, MAX_DAY_PACK_BYTES);
  return pack;
}

/** All inner packages, image hashes and aggregate expansion limits validate before returning. */
export async function inspectDayPack(input) {
  const source = readInput(input), body = header(source);
  if (typeof source.packId !== 'string' || !/^day-pack-[a-f0-9]{64}$/.test(source.packId) || typeof source.checksum !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(source.checksum)) fail('identity or checksum is invalid.');
  const { createdAt: ignored, ...identity } = body;
  if (source.packId !== `day-pack-${await digest(identity)}` || source.checksum !== `sha256:${await digest({ ...body, packId: source.packId })}`) fail('checksum does not match the day pack content.');
  let expandedBytes = measuredBytes({ ...body, packages: [] }, MAX_DAY_EXPANDED_BYTES);
  for (const [index, pack] of body.packages.entries()) {
    const checked = validateJobPackage(pack);
    if (checked.job.id !== body.jobIds[index]) fail('package jobs do not match their selected IDs.');
    expandedBytes += measuredBytes(checked, MAX_DAY_EXPANDED_BYTES);
    if (expandedBytes > MAX_DAY_EXPANDED_BYTES) fail('combined expanded jobs exceed 256 MiB.');
    await importJobPackage({ sites: [], jobs: [] }, pack);
  }
  return { pack: clone({ ...body, packId: source.packId, checksum: source.checksum }), summary: summaryFor(body) };
}

export function validateOfficeReceipts(values = []) {
  if (!Array.isArray(values) || values.length > 5000) throw Error('Keep at most 5,000 received day packs.');
  const seen = new Set();
  return values.map(record => {
    object(record, ['receipt', 'summary', 'mappings', 'timeConflicts', 'day'], 'received day record');
    const receipt = validateDayReceipt(record.receipt), summary = record.summary;
    object(summary, summaryKeys, 'received day summary');
    if (seen.has(receipt.packId)) fail('a day pack has more than one saved receipt.');
    seen.add(receipt.packId);
    if (!['assignment', 'return'].includes(summary.kind) || (summary.kind === 'return') !== (receipt.dayId !== null)) fail('received day kind does not match its receipt.');
    date(summary.date); text(summary.engineer, 'summary engineer', summary.kind === 'return', 200); text(summary.label, 'summary label', false, 200); text(summary.officeId, 'summary office', true, 200); parent(summary.parentPackId);
    if (summary.engineer !== receipt.engineer || summary.officeId !== receipt.officeId) fail('received summary belongs to a different engineer or office.');
    for (const key of ['jobCount', 'conflictCount', 'attendanceMinutes', 'unallocatedMinutes']) if (!Number.isSafeInteger(summary[key]) || summary[key] < 0 || summary[key] > 31 * 1440) fail(`received summary ${key} is invalid.`);
    if (!summary.jobCount || summary.jobCount > MAX_DAY_JOBS) fail('received job count is invalid.');
    if (summary.kind === 'assignment' && (summary.attendanceMinutes || summary.unallocatedMinutes)) fail('an assignment cannot claim completed attendance.');
    if (!Array.isArray(record.mappings) || record.mappings.length !== summary.jobCount) fail('received jobs need their complete source mapping.');
    const mappings = record.mappings.map(mapping => {
      object(mapping, ['sourceJobId', 'jobId', 'duplicate', 'conflict'], 'received job mapping');
      text(mapping.sourceJobId, 'source job ID'); text(mapping.jobId, 'local job ID');
      if (typeof mapping.duplicate !== 'boolean' || typeof mapping.conflict !== 'boolean') fail('job import outcomes must be explicit.');
      return { ...mapping };
    });
    if (new Set(mappings.map(mapping => mapping.sourceJobId)).size !== mappings.length || new Set(mappings.map(mapping => mapping.jobId)).size !== mappings.length) fail('received job mappings must be unique.');
    let timeConflicts;
    if (record.timeConflicts !== undefined) {
      if (!Array.isArray(record.timeConflicts) || record.timeConflicts.length > 5000) fail('too many retained time conflicts.');
      timeConflicts = record.timeConflicts.map(item => {
        object(item, ['sourceId', 'entry'], 'retained time conflict'); text(item.sourceId, 'conflicting time ID');
        const entry = validateTimesheetEntry(item.entry);
        if (entry.id !== item.sourceId) fail('retained time conflict lost its source identity.');
        return { sourceId: item.sourceId, entry };
      });
      if (new Set(timeConflicts.map(item => item.sourceId)).size !== timeConflicts.length) fail('retained time conflicts contain duplicate IDs.');
    }
    let day;
    if (record.day !== undefined) {
      day = record.day === null ? null : validateOfficeDay(record.day);
      if ((summary.kind === 'return') !== Boolean(day) || (day && (day.id !== receipt.dayId || day.status !== 'finished' || day.officeId !== summary.officeId || day.engineer !== summary.engineer || day.date !== summary.date || day.packId !== summary.parentPackId || attendanceMinutes(day) !== summary.attendanceMinutes))) fail('received attendance does not match its receipt and summary.');
    }
    return { receipt, summary: { ...summary }, mappings, ...(timeConflicts ? { timeConflicts } : {}), ...(day !== undefined ? { day } : {}) };
  });
}

/** No storage/network calls: caller commits once, then may expose the receipt. */
export async function importDayPack(state, input, { receivedAt = new Date().toISOString() } = {}) {
  const { pack, summary } = await inspectDayPack(input), records = validateOfficeReceipts(state.officeReceipts);
  const remembered = records.find(record => record.receipt.packId === pack.packId);
  if (remembered && remembered.mappings.every(mapping => state.jobs.some(job => job.id === mapping.jobId))) return { state, pack, summary: remembered.summary, mappings: remembered.mappings, jobIds: remembered.mappings.map(mapping => mapping.jobId), jobs: remembered.mappings.map(mapping => state.jobs.find(job => job.id === mapping.jobId)), receipt: remembered.receipt, duplicate: true, conflicts: [...remembered.mappings.filter(mapping => mapping.conflict), ...(remembered.timeConflicts || []).map(item => ({ type: 'timesheet', ...item }))] };
  let next = clone(state); const mappings = [], conflicts = [], timeConflicts = [];
  for (const wire of pack.packages) {
    const imported = await importJobPackage(next, wire); next = imported.state;
    const mapping = { sourceJobId: wire.job.id, jobId: imported.job.id, duplicate: imported.duplicate, conflict: imported.conflict };
    mappings.push(mapping); if (mapping.conflict) conflicts.push({ type: 'job', ...mapping });
  }
  next.unassignedTimesheets ??= [];
  for (const original of pack.unassignedTimesheets) {
    const sameId = timesheetEntries(next, { includeDeleted: true }).find(row => row.entry.id === original.id);
    if (!sameId) { next.unassignedTimesheets.push(clone(original)); continue; }
    if (canonical(sameId.entry) === canonical(original)) continue;
    // Keep both versions for office review without double-counting conflicting active time.
    const retained = { sourceId: original.id, entry: clone(original) };
    timeConflicts.push(retained); conflicts.push({ type: 'timesheet', ...retained });
  }
  next.unassignedTimesheets = validateTimesheetEntries(next.unassignedTimesheets);
  const receipt = remembered?.receipt || await createDayReceipt({ packId: pack.packId, dayId: pack.day?.id || null, officeId: pack.officeId, engineer: pack.engineer, receivedAt });
  const importedSummary = { ...summary, conflictCount: conflicts.length };
  next.officeReceipts = validateOfficeReceipts([...records.filter(record => record.receipt.packId !== pack.packId), { receipt, summary: importedSummary, mappings, day: pack.day, ...(timeConflicts.length ? { timeConflicts } : {}) }]);
  return { state: next, pack, summary: importedSummary, mappings, jobIds: mappings.map(mapping => mapping.jobId), jobs: mappings.map(mapping => next.jobs.find(job => job.id === mapping.jobId)), receipt, duplicate: false, conflicts };
}
