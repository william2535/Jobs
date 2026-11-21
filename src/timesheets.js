/** Local calendar/clock sessions. No payroll approval or remote submission is implied. */
export const SESSION_TYPES = ['Work', 'Travel', 'Break', 'Administration', 'Training', 'Custom'];
const BASE = ['id', 'date', 'start', 'end', 'hours', 'note', 'engineer', 'endDate', 'sessionType', 'customType', 'revision'];
const EXTRA = ['submissionId', 'submittedAt', 'submissionHistory', 'deletedAt'];
const clone = value => structuredClone(value);
const list = value => Array.isArray(value) ? value : [];
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const object = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw Error(`${label} has an invalid structure.`);
};
const text = (value, label, required = false, max = 10000) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error(`${label} must be ${required ? 'nonempty ' : ''}text of at most ${max} characters.`);
  return value;
};
function day(value, required = false) {
  text(value, 'Session date', required, 10);
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw Error('Use a real date in YYYY-MM-DD format.');
  return value;
}
function clock(value) {
  text(value, 'Session time', false, 5);
  if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw Error('Use a time in HH:mm format.');
  return value;
}
function instant(value) {
  text(value, 'Saved timestamp', true, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)) throw Error('Saved timestamp is invalid.');
  return value;
}
const minuteOfDay = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const localMinute = (date, time) => Date.parse(`${day(date, true)}T00:00:00Z`) / 60000 + minuteOfDay(clock(time));
const roundedHours = minutes => Math.round(minutes / 60 * 1000000) / 1000000;

function interval(entry) {
  const start = clock(entry.start || ''), end = clock(entry.end || '');
  if (Boolean(start) !== Boolean(end)) throw Error('Enter both start and finish times, or enter recorded hours.');
  if (!start) return null;
  const date = day(entry.date || ''), endDate = day(entry.endDate || date);
  if (entry.sessionType && !date) throw Error('Enter the session start and finish dates.');
  if (endDate && !date) throw Error('A finish date needs a start date.');
  const from = date ? localMinute(date, start) : minuteOfDay(start);
  const to = date ? localMinute(endDate || date, end) : minuteOfDay(end);
  if (to < from) throw Error('Finish must be after start. Enter the next date for overnight work.');
  if (to - from > 31 * 24 * 60) throw Error('A timed session may cover at most 31 days.');
  return { from, to, minutes: to - from, date, endDate };
}

function baseEntry(value) {
  object(value, BASE, 'Time entry');
  const entry = {
    id: text(value.id, 'Time entry ID', true, 300), date: day(value.date ?? ''),
    start: clock(value.start ?? ''), end: clock(value.end ?? ''),
    hours: null, note: text(value.note ?? '', 'Session description'), engineer: text(value.engineer ?? '', 'Engineer'),
  };
  if (value.endDate !== undefined) entry.endDate = day(value.endDate || entry.date);
  if (value.sessionType !== undefined) {
    if (!SESSION_TYPES.includes(value.sessionType)) throw Error('Choose a supported session type.');
    entry.sessionType = value.sessionType;
    day(entry.date, true);
    entry.customType = entry.sessionType === 'Custom' ? text(value.customType ?? '', 'Custom session type', true, 200).trim() : '';
  } else if (value.customType !== undefined && value.customType !== '') throw Error('A custom type needs the Custom session type.');
  if (value.revision !== undefined) {
    if (!Number.isSafeInteger(value.revision) || value.revision < 1) throw Error('Time entry revision must be a positive integer.');
    entry.revision = value.revision;
  }
  const measured = interval(entry);
  const entered = value.hours === '' || value.hours === null || value.hours === undefined ? null : typeof value.hours === 'string' ? Number(value.hours) : value.hours;
  if (entered !== null && (typeof entered !== 'number' || !Number.isFinite(entered) || entered < 0 || entered * 60 > Number.MAX_SAFE_INTEGER)) throw Error('Recorded hours must be a finite nonnegative number.');
  // An older paid/entered-hours record remains authoritative until explicitly converted.
  entry.hours = entry.sessionType && measured ? roundedHours(measured.minutes) : entered ?? (measured ? Math.round(measured.minutes / 60 * 100) / 100 : null);
  if (entry.hours === null) throw Error('Enter recorded hours or start and finish times.');
  return entry;
}
const plain = entry => Object.fromEntries(BASE.filter(key => entry[key] !== undefined).map(key => [key, clone(entry[key])]));

export function validateTimesheetEntry(value) {
  object(value, [...BASE, ...EXTRA], 'Time entry');
  const entry = baseEntry(plain(value));
  if (value.submissionHistory !== undefined) {
    if (!Array.isArray(value.submissionHistory) || value.submissionHistory.length > 100) throw Error('Keep at most 100 retained submissions per time entry.');
    const seen = new Set();
    entry.submissionHistory = value.submissionHistory.map(record => {
      object(record, ['id', 'submittedAt', 'jobId', 'entry'], 'Time submission');
      const id = text(record.id, 'Submission ID', true, 160);
      if (seen.has(id)) throw Error('Time submission IDs must be unique.');
      seen.add(id);
      const snapshot = baseEntry(record.entry);
      if (snapshot.id !== entry.id || (snapshot.revision || 1) > (entry.revision || 1)) throw Error('Time submission references an invalid entry revision.');
      return { id, submittedAt: instant(record.submittedAt), jobId: record.jobId === null ? null : text(record.jobId, 'Submitted job ID', true, 1000), entry: snapshot };
    });
  }
  if (value.submissionId !== undefined || value.submittedAt !== undefined) {
    entry.submissionId = text(value.submissionId, 'Submission ID', true, 160);
    entry.submittedAt = instant(value.submittedAt);
    const receipt = list(entry.submissionHistory).find(item => item.id === entry.submissionId);
    if (!receipt || receipt.submittedAt !== entry.submittedAt || JSON.stringify(receipt.entry) !== JSON.stringify(plain(entry))) throw Error('Submitted status must match its retained session snapshot.');
  }
  if (value.deletedAt !== undefined) {
    entry.deletedAt = instant(value.deletedAt);
    if (entry.submissionId) throw Error('A deleted session cannot be marked as currently submitted.');
  }
  if (new TextEncoder().encode(JSON.stringify(entry)).byteLength > 2 * 1024 * 1024) throw Error('Time entry submission history is too large.');
  return entry;
}
export function validateTimesheetEntries(values = []) {
  if (!Array.isArray(values) || values.length > 5000) throw Error('Keep at most 5,000 time entries in each record collection.');
  const entries = values.map(validateTimesheetEntry);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw Error('Time entry IDs must be unique within each job or unassigned collection.');
  return entries;
}

/** Derived reads tolerate incomplete legacy display records; writes use strict validation. */
export function minutesForTimesheet(entry) {
  if (!entry || entry.deletedAt) return 0;
  try {
    if (entry.sessionType && entry.start && entry.end) return interval(entry).minutes;
    if (typeof entry.hours === 'number' && Number.isFinite(entry.hours) && entry.hours >= 0) return Math.round(entry.hours * 60);
    return interval(entry)?.minutes || 0;
  } catch { return 0; }
}
export const isWorkSession = entry => !entry?.sessionType || ['Work', 'Administration', 'Training'].includes(entry.sessionType);
export function splitTimesheetByDay(entry) {
  if (!entry || entry.deletedAt) return [];
  const minutes = minutesForTimesheet(entry);
  if (!entry.sessionType || !entry.start || !entry.end || !entry.date)
    return [{ date: entry.date || '', start: entry.start || '', end: entry.end || '', minutes, hours: roundedHours(minutes) }];
  try {
    const measured = interval(entry), segments = [];
    if (measured.from === measured.to) return [{ date: entry.date, start: entry.start, end: entry.end, minutes: 0, hours: 0 }];
    for (let cursor = measured.from; cursor < measured.to;) {
      const boundary = (Math.floor(cursor / 1440) + 1) * 1440, finish = Math.min(boundary, measured.to);
      const clockText = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
      const duration = finish - cursor;
      segments.push({ date: new Date(cursor * 60000).toISOString().slice(0, 10), start: clockText((cursor % 1440 + 1440) % 1440), end: finish === boundary ? '24:00' : clockText((finish % 1440 + 1440) % 1440), minutes: duration, hours: roundedHours(duration) });
      cursor = finish;
    }
    return segments;
  } catch { return []; }
}
export function shiftLocalDateTime(value, deltaMinutes) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isSafeInteger(deltaMinutes) || Math.abs(deltaMinutes) > 44640) throw Error('Choose a local date/time and a valid minute adjustment.');
  const result = new Date((localMinute(value.slice(0, 10), value.slice(11)) + deltaMinutes) * 60000).toISOString().slice(0, 16);
  if (!/^\d{4}-/.test(result)) throw Error('Adjusted date is outside the supported range.');
  return result;
}
export function timesheetEntries(state, { includeDeleted = false } = {}) {
  const rows = [
    ...list(state?.jobs).flatMap(job => list(job.workflow?.timesheets).map(entry => ({ jobId: job.id, job, entry: clone(entry) }))),
    ...list(state?.unassignedTimesheets).map(entry => ({ jobId: null, job: null, entry: clone(entry) })),
  ].filter(row => row.entry && (includeDeleted || !row.entry.deletedAt));
  const counts = new Map();
  for (const { entry } of rows) if (entry.id && !entry.deletedAt) counts.set(entry.id, (counts.get(entry.id) || 0) + 1);
  return rows.map(row => ({ ...row, conflict: !!row.entry.id && !row.entry.deletedAt && counts.get(row.entry.id) > 1 }));
}
export function timesheetDayEntries(state, date) {
  day(date, true);
  return timesheetEntries(state).flatMap(row => splitTimesheetByDay(row.entry).filter(segment => segment.date === date).map(segment => ({ ...row, segment })));
}
export function timesheetDayArchives(state, date) {
  day(date, true);
  return timesheetEntries(state, { includeDeleted: true }).filter(row => row.entry.deletedAt).flatMap(row =>
    splitTimesheetByDay({ ...row.entry, deletedAt: undefined }).filter(segment => segment.date === date).map(segment => ({ ...row, segment })));
}

export function prepareTimesheetEdit(previous, edited) {
  const old = previous ? validateTimesheetEntry(previous) : null;
  if (old?.deletedAt) throw Error('Restore this deleted time entry before editing it.');
  if (old && edited.id !== old.id) throw Error('A time entry must keep its stable ID.');
  if (old && (edited.revision ?? 1) !== (old.revision ?? 1)) throw Error('This time entry changed since it was opened. Reopen the latest record before saving.');
  const source = { ...(old || {}), ...clone(edited), revision: old ? (old.revision || 1) + 1 : 1 };
  delete source.submissionId; delete source.submittedAt; delete source.deletedAt;
  if (old?.submissionHistory) source.submissionHistory = clone(old.submissionHistory);
  else delete source.submissionHistory;
  const next = validateTimesheetEntry(source);
  const same = value => JSON.stringify({ ...plain(value), revision: 0 });
  return old && same(old) === same(next) ? old : next;
}
export function deleteTimesheetEntry(entry) {
  const next = validateTimesheetEntry(entry);
  if (next.deletedAt) return next;
  next.deletedAt = now(); next.revision = (next.revision || 1) + 1;
  delete next.submissionId; delete next.submittedAt;
  return validateTimesheetEntry(next);
}
export function restoreTimesheetEntry(entry) {
  const next = validateTimesheetEntry(entry);
  if (!next.deletedAt) return next;
  delete next.deletedAt; next.revision = (next.revision || 1) + 1;
  return validateTimesheetEntry(next);
}

function collection(state, jobId) {
  if (jobId === null) { state.unassignedTimesheets ??= []; return state.unassignedTimesheets; }
  const job = list(state.jobs).find(job => job.id === jobId);
  if (!job) throw Error('The selected job is no longer available.');
  job.workflow ??= { version: 1 };
  job.workflow.timesheets ??= [];
  return job.workflow.timesheets;
}
function reviseJobs(state, owners, entryId, action, at = now()) {
  for (const jobId of new Set(owners.filter(id => id !== null))) {
    const job = state.jobs.find(job => job.id === jobId);
    job.revision = (job.revision || 0) + 1; job.updatedAt = at;
    job.workflow.timeline ??= [];
    if (job.workflow.timeline.length >= 5000) throw Error('The job timeline is full. Export it before recording a separate visit.');
    job.workflow.timeline.push({ id: uid(), at, action, collection: 'timesheets', recordId: entryId, summary: 'Time session' });
  }
}
export function saveTimesheet(state, entry, { jobId = null, previousJobId } = {}) {
  const next = clone(state), target = collection(next, jobId);
  const previous = previousJobId === undefined ? null : collection(next, previousJobId).find(item => item.id === entry.id);
  if (previousJobId !== undefined && !previous) throw Error('The time entry is no longer available.');
  if (!previous && timesheetEntries(next, { includeDeleted: true }).some(row => row.entry.id === entry.id)) throw Error('This time entry already exists. Open the correct record before editing.');
  if (previousJobId !== jobId && target.some(item => item.id === entry.id)) throw Error('That job already contains this time entry. Review the conflict before moving it.');
  let updated = prepareTimesheetEdit(previous, entry);
  const moved = previous && previousJobId !== jobId;
  if (moved) {
    updated = { ...updated, revision: (previous.revision || 1) + 1 };
    delete updated.submissionId; delete updated.submittedAt;
  }
  if (previous && !moved && JSON.stringify(updated) === JSON.stringify(validateTimesheetEntry(previous))) return next;
  if (previous) {
    const source = collection(next, previousJobId), index = source.findIndex(item => item.id === entry.id);
    source.splice(index, 1);
  }
  target.push(updated); validateTimesheetEntries(target);
  reviseJobs(next, previous ? [previousJobId, jobId] : [jobId], updated.id, moved ? 'moved' : 'saved');
  return next;
}
function markDeleted(state, { jobId = null, entryId }, restore) {
  const next = clone(state), entries = collection(next, jobId), index = entries.findIndex(entry => entry.id === entryId);
  if (index < 0) throw Error('The time entry is no longer available.');
  entries[index] = restore ? restoreTimesheetEntry(entries[index]) : deleteTimesheetEntry(entries[index]);
  reviseJobs(next, [jobId], entryId, restore ? 'restored' : 'deleted');
  return next;
}
export const deleteTimesheet = (state, ref) => markDeleted(state, ref, false);
export const restoreTimesheet = (state, ref) => markDeleted(state, ref, true);

const matches = (row, ref) => row.jobId === ref.jobId && row.entry.id === ref.entryId;
function period(options) {
  const from = day(options.from, true), to = day(options.to || from, true);
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) throw Error('Choose a timesheet period of at most 367 calendar days.');
  return { from, to };
}
export function createTimesheetPackage(state, options) {
  const selectedPeriod = period(options), rows = timesheetEntries(state).filter(row =>
    (!options.refs || options.refs.some(ref => matches(row, ref))) &&
    splitTimesheetByDay(row.entry).some(segment => segment.date >= selectedPeriod.from && segment.date <= selectedPeriod.to));
  if (options.refs && (new Set(options.refs.map(ref => JSON.stringify(ref))).size !== options.refs.length || options.refs.some(ref => !rows.some(row => matches(row, ref))))) throw Error('Selected sessions must belong to this timesheet period.');
  const exportRow = row => {
    const site = list(state.sites).find(site => site.id === row.job?.siteId);
    return { jobId: row.jobId, jobTitle: row.job?.workflow?.details?.title || '', siteId: site?.id || null, siteName: site?.name || '', conflict: row.conflict, entry: validateTimesheetEntry(row.entry) };
  };
  const entries = rows.map(exportRow);
  const archivedEntries = timesheetEntries(state, { includeDeleted: true }).filter(row => row.entry.deletedAt &&
    splitTimesheetByDay({ ...row.entry, deletedAt: undefined }).some(segment => segment.date >= selectedPeriod.from && segment.date <= selectedPeriod.to)).map(exportRow);
  const total = predicate => rows.filter(row => !row.conflict && predicate(row)).reduce((sum, row) => sum + splitTimesheetByDay(row.entry).filter(segment => segment.date >= selectedPeriod.from && segment.date <= selectedPeriod.to).reduce((minutes, segment) => minutes + segment.minutes, 0), 0);
  return { format: 'JobsTimesheetPackage', version: 1, exportedAt: now(), period: selectedPeriod, delivery: { status: 'local-export', sent: false }, ...(options.submissionId ? { submissionId: options.submissionId } : {}), entries, archivedEntries,
    totals: { minutes: total(() => true), workMinutes: total(row => isWorkSession(row.entry)), unassignedMinutes: total(row => row.jobId === null), conflictCount: rows.filter(row => row.conflict).length } };
}
export function submitTimesheets(state, refs, options) {
  if (!Array.isArray(refs) || !refs.length) throw Error('Choose at least one saved session to submit locally.');
  const preview = createTimesheetPackage(state, { ...options, refs });
  if (preview.entries.some(row => row.conflict)) throw Error('Review conflicting imported time entries before submitting them.');
  const next = clone(state), submissionId = uid(), submittedAt = now(), owners = [];
  for (const ref of refs) {
    const entries = collection(next, ref.jobId), index = entries.findIndex(entry => entry.id === ref.entryId), current = validateTimesheetEntry(entries[index]);
    current.revision ??= 1;
    const snapshot = plain(current);
    current.submissionHistory = [...list(current.submissionHistory), { id: submissionId, submittedAt, jobId: ref.jobId, entry: snapshot }];
    current.submissionId = submissionId; current.submittedAt = submittedAt;
    entries[index] = validateTimesheetEntry(current);
    owners.push(ref.jobId);
  }
  reviseJobs(next, owners, submissionId, 'submitted-locally', submittedAt);
  return { state: next, package: createTimesheetPackage(next, { ...options, refs, submissionId }) };
}
