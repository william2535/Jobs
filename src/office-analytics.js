/** Read-only office summaries of records saved on this computer; never a live remote feed. */
import { minutesForTimesheet } from './timesheets.js';
import { engineerKey, normaliseEngineerName } from './engineer-identity.js';

export const UNTAGGED_ENGINEER_KEY = '__jobs_untagged__';
const list = value => Array.isArray(value) ? value : [];
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const nameOf = value => { try { return normaliseEngineerName(value || '', { required: false }); } catch { return ''; } };
const keyOf = value => { try { return engineerKey(value || '') ? `engineer:${engineerKey(value)}` : UNTAGGED_ENGINEER_KEY; } catch { return UNTAGGED_ENGINEER_KEY; } };
const dayKey = (officeId, id) => JSON.stringify([officeId || '', id]);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const localMinute = value => /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '') && validDate(value.slice(0, 10)) ? Date.parse(`${value}:00Z`) / 60000 : null;
const dateMinute = date => Date.parse(`${date}T00:00:00Z`) / 60000;
function entryInterval(entry) {
  const from = localMinute(`${entry.date}T${entry.start}`), to = localMinute(`${entry.endDate || entry.date}T${entry.end}`);
  return from !== null && to !== null && to >= from ? { from, to } : null;
}
function jobView(job, sites) {
  return { id: job.id, sourceId: job.sourceJobId || job.id, title: job.workflow?.details?.title || job.workflow?.details?.reference || job.title || job.workType || `Job ${String(job.id).slice(0, 8)}`, status: job.status || 'Open', engineer: nameOf(job.engineer), engineerNeedsReview: !!job.engineer && !nameOf(job.engineer), siteName: sites.get(job.siteId)?.name || '' };
}
function emptyTotals() {
  return { attendanceMinutes: null, jobWorkMinutes: 0, travelMinutes: 0, breakMinutes: 0, otherMinutes: 0, unallocatedMinutes: 0, recordedMinutes: 0, outsideAttendanceMinutes: 0, utilisationPercent: null, completedJobs: 0, jobCount: 0, conflictCount: 0 };
}
const round = value => Math.round(value * 100) / 100;
const category = row => row.entry.sessionType === 'Travel' ? 'travelMinutes' : row.entry.sessionType === 'Break' ? 'breakMinutes' : row.entry.sessionType === 'Work' || !row.entry.sessionType ? (row.jobId ? 'jobWorkMinutes' : 'unallocatedMinutes') : 'otherMinutes';
function inDateRange(date, filters) { return !date ? !filters.from && !filters.to : (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to); }
function clipped(interval, bounds) { return Math.max(0, Math.min(interval.to, bounds.to) - Math.max(interval.from, bounds.from)); }
function intervalVisible(interval, bounds) { return interval.from === interval.to ? interval.from >= bounds.from && interval.from < bounds.to : clipped(interval, bounds) > 0; }
function dateBounds(filters) { return { from: filters.from ? dateMinute(filters.from) : -Infinity, to: filters.to ? dateMinute(filters.to) + 1440 : Infinity }; }
function visibleEntry(row, bounds, forceConflict = false) {
  const entry = row.entry, timed = entryInterval(entry);
  const minutes = entry.deletedAt ? 0 : timed && entry.sessionType ? clipped(timed, bounds) : minutesForTimesheet(entry);
  return { id: entry.id, jobId: row.jobId, sourceJobId: row.job?.sourceId || row.jobId, jobTitle: row.job?.title || '', date: entry.date || '', start: entry.start || '', end: entry.end || '', endDate: entry.endDate || entry.date || '', sessionType: entry.sessionType || 'Recorded time', minutes, engineer: nameOf(entry.engineer), note: entry.note || '', conflict: forceConflict, deletedAt: entry.deletedAt || null, submitted: !!entry.submissionId, category: category(row) };
}
function calculateDay(day, rows, filters, extraIssues = []) {
  const issues = new Set(extraIssues), totals = emptyTotals(), bounds = dateBounds(filters);
  const from = localMinute(day.localStart), to = localMinute(day.localFinish);
  const attendance = from !== null && to !== null && to >= from ? { from, to } : null;
  if (attendance) {
    totals.attendanceMinutes = clipped(attendance, bounds);
    day.attendanceWindow = { from: Math.max(attendance.from, bounds.from), to: Math.min(attendance.to, bounds.to) };
    day.partial = totals.attendanceMinutes !== attendance.to - attendance.from;
  } else if (day.source === 'return' && Number.isFinite(day.savedAttendanceMinutes) && inDateRange(day.date, filters)) {
    totals.attendanceMinutes = day.savedAttendanceMinutes;
    issues.add('Attendance has no saved start and finish times.');
  }
  const grouped = new Map();
  for (const row of rows) {
    const id = String(row.entry.id || ''), values = grouped.get(id) || [];
    values.push(row); grouped.set(id, values);
  }
  const accepted = [], entries = [];
  for (const values of grouped.values()) {
    const identical = new Set(values.map(row => canonical({ entry: row.entry, jobId: row.jobId }))).size === 1;
    const conflict = values.some(row => row.conflict) || !identical;
    const chosen = identical ? values.slice(0, 1) : values;
    for (const row of chosen) {
      const timed = entryInterval(row.entry), view = visibleEntry(row, bounds, conflict);
      if (timed ? !intervalVisible(timed, bounds) : !inDateRange(row.entry.date, filters)) continue;
      if (row.entry.deletedAt) { entries.push(view); continue; }
      if (conflict) { entries.push(view); continue; }
      accepted.push({ ...row, timed, view }); entries.push(view);
    }
    if (conflict) { totals.conflictCount++; issues.add('Conflicting time records need review.'); }
  }
  for (const row of accepted) {
    if (row.entry.engineer && !nameOf(row.entry.engineer)) issues.add('An engineer name needs review.');
    totals.recordedMinutes += row.view.minutes;
    totals[row.view.category] += row.view.minutes;
    if (!row.timed || !row.entry.sessionType) issues.add('Recorded hours without a confirmed timed session need review.');
    if (attendance && row.timed) {
      const inside = clipped(row.timed, { from: Math.max(bounds.from, attendance.from), to: Math.min(bounds.to, attendance.to) });
      const outside = Math.max(0, row.view.minutes - inside);
      if (outside) { totals.outsideAttendanceMinutes += outside; issues.add('Some recorded time is outside this attendance interval.'); }
    }
  }
  const intervals = accepted.filter(row => row.timed && row.view.minutes > 0).map(row => ({ from: Math.max(row.timed.from, bounds.from), to: Math.min(row.timed.to, bounds.to) })).sort((a, b) => a.from - b.from || a.to - b.to);
  let lastEnd = -Infinity;
  for (const interval of intervals) { if (interval.from < lastEnd) issues.add('Overlapping time sessions need review.'); lastEnd = Math.max(lastEnd, interval.to); }
  if (day.missingTime) issues.add('A saved time entry is missing from this computer.');
  if (day.missingJobs) issues.add('A job from this pack is missing from this computer.');
  if (totals.recordedMinutes && totals.attendanceMinutes === null) issues.add('No completed attendance was supplied for these sessions.');
  if (day.status === 'running') issues.add('Day is in progress on this device; no finish time has been recorded.');
  totals.jobCount = new Set(day.jobs.map(job => job.sourceId)).size;
  totals.completedJobs = new Set(day.jobs.filter(job => job.status === 'Complete').map(job => job.sourceId)).size;
  totals.conflictCount += day.jobConflictCount || 0;
  if (attendance && totals.attendanceMinutes > 0 && !issues.size) totals.utilisationPercent = round(totals.jobWorkMinutes / totals.attendanceMinutes * 100);
  day.entries = entries.sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`) || a.id.localeCompare(b.id));
  day.totals = totals; day.issues = [...issues];
  return day;
}
function combine(days, jobs) {
  const result = emptyTotals(), byId = new Map();
  let hasAttendance = false, uncertain = false;
  for (const day of days) {
    result.conflictCount += day.totals.conflictCount;
    result.outsideAttendanceMinutes += day.totals.outsideAttendanceMinutes;
    if (day.totals.attendanceMinutes !== null) hasAttendance = true;
    for (const entry of day.entries) {
      if (entry.deletedAt || entry.conflict) continue;
      const key = `${keyOf(entry.engineer)}:${entry.id}`, values = byId.get(key) || [];
      values.push(entry); byId.set(key, values);
    }
  }
  for (const entries of byId.values()) {
    const signatures = new Set(entries.map(entry => canonical({ sourceJobId: entry.sourceJobId, date: entry.date, start: entry.start, endDate: entry.endDate, end: entry.end, minutes: entry.minutes, category: entry.category, note: entry.note })));
    if (signatures.size > 1) { result.conflictCount++; uncertain = true; continue; }
    const entry = entries[0]; result.recordedMinutes += entry.minutes; result[entry.category] += entry.minutes;
  }
  const byEngineer = new Map();
  for (const day of days) {
    if (day.totals.attendanceMinutes === null) continue;
    const owner = day.engineerKey, values = byEngineer.get(owner) || []; values.push(day); byEngineer.set(owner, values);
  }
  if (hasAttendance) {
    result.attendanceMinutes = 0;
    for (const values of byEngineer.values()) {
      const windows = values.filter(day => day.attendanceWindow).map(day => day.attendanceWindow).sort((a, b) => a.from - b.from || a.to - b.to);
      let cursor = -Infinity;
      for (const window of windows) { if (window.from < cursor) uncertain = true; result.attendanceMinutes += Math.max(0, window.to - Math.max(cursor, window.from)); cursor = Math.max(cursor, window.to); }
      result.attendanceMinutes += values.filter(day => !day.attendanceWindow).reduce((sum, day) => sum + day.totals.attendanceMinutes, 0);
    }
  }
  const contributing = days.filter(day => day.totals.recordedMinutes || day.totals.attendanceMinutes !== null || day.status === 'running');
  if (result.attendanceMinutes > 0 && contributing.every(day => day.totals.utilisationPercent !== null) && !uncertain) result.utilisationPercent = round(result.jobWorkMinutes / result.attendanceMinutes * 100);
  result.jobCount = new Set(jobs.map(job => job.sourceId)).size;
  result.completedJobs = new Set(jobs.filter(job => job.status === 'Complete').map(job => job.sourceId)).size;
  return result;
}

/** Group current saved/received records by the engineer's name tag. No state mutations. */
export function buildOfficeOverview(state = {}, { from = '', to = '', engineerKey: selectedEngineer = '' } = {}) {
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) throw Error('Choose a valid office date range, with From before To.');
  const filters = { from, to, engineerKey: selectedEngineer }, bounds = dateBounds(filters);
  const sites = new Map(list(state.sites).map(site => [site.id, site]));
  const jobs = new Map(list(state.jobs).map(job => [job.id, job]));
  const preferredNames = new Map();
  const rememberName = value => { const key = keyOf(value); if (!preferredNames.has(key)) preferredNames.set(key, nameOf(value) || 'Untagged'); };
  for (const record of list(state.officeReceipts)) rememberName(record.summary?.engineer);
  for (const day of list(state.officeDays)) rememberName(day.engineer);
  for (const job of jobs.values()) rememberName(job.engineer);
  const views = new Map([...jobs.values()].map(job => [job.id, jobView(job, sites)]));
  const allRows = [...jobs.values()].flatMap(job => list(job.workflow?.timesheets).map(entry => ({ entry, jobId: job.id, job: views.get(job.id) })));
  allRows.push(...list(state.unassignedTimesheets).map(entry => ({ entry, jobId: null, job: null })));
  for (const row of allRows) rememberName(row.entry.engineer);
  const returned = new Map(), assignments = [], associatedIds = new Set(), consumedAssignments = new Set();
  for (const record of list(state.officeReceipts)) {
    for (const mapping of list(record.mappings)) { associatedIds.add(mapping.jobId); associatedIds.add(mapping.sourceJobId); }
    if (record.summary?.kind === 'return') {
      const key = dayKey(record.summary.officeId, record.receipt.dayId), values = returned.get(key) || [];
      values.push(record); returned.set(key, values);
      if (record.summary.parentPackId) consumedAssignments.add(record.summary.parentPackId);
    } else assignments.push(record);
  }
  const assignmentsById = new Map(assignments.map(record => [record.receipt.packId, record]));
  for (const id of [...consumedAssignments]) {
    let current = assignmentsById.get(id); const seen = new Set();
    while (current?.summary.parentPackId && !seen.has(current.receipt.packId)) {
      seen.add(current.receipt.packId); consumedAssignments.add(current.summary.parentPackId); current = assignmentsById.get(current.summary.parentPackId);
    }
  }
  const descriptors = [];
  for (const [key, values] of returned) {
    values.sort((a, b) => String(a.receipt.receivedAt).localeCompare(String(b.receipt.receivedAt)));
    const record = values.at(-1), raw = record.day;
    descriptors.push({ id: record.receipt.dayId, key, engineer: nameOf(record.summary.engineer), engineerKey: keyOf(record.summary.engineer), date: record.summary.date, localStart: raw?.localStart || null, localFinish: raw?.localFinish || null, status: 'received', source: 'return', receipt: record.receipt, receivedAt: record.receipt.receivedAt, jobIds: record.mappings.map(mapping => mapping.jobId), trackedIds: list(raw?.timesheetEntryIds), timeConflicts: list(record.timeConflicts), savedAttendanceMinutes: record.summary.attendanceMinutes, jobConflictCount: record.mappings.filter(mapping => mapping.conflict).length, priorReturns: values.slice(0, -1).reverse().map(previous => ({ receipt: previous.receipt, receivedAt: previous.receipt.receivedAt, jobIds: previous.mappings.map(mapping => mapping.jobId), jobs: previous.mappings.map(mapping => views.get(mapping.jobId)).filter(Boolean) })), label: record.summary.label || '' });
  }
  for (const raw of list(state.officeDays)) {
    const key = dayKey(raw.officeId, raw.id);
    consumedAssignments.add(raw.packId); raw.jobIds.forEach(id => associatedIds.add(id));
    if (returned.has(key) && raw.status !== 'running') continue;
    if (returned.has(key)) descriptors.splice(descriptors.findIndex(day => day.key === key), 1);
    descriptors.push({ id: raw.id, key, engineer: nameOf(raw.engineer), engineerKey: keyOf(raw.engineer), date: raw.date, localStart: raw.localStart, localFinish: raw.localFinish, status: raw.status, source: 'local', receipt: raw.receipt, receivedAt: null, jobIds: [...raw.jobIds], trackedIds: list(raw.timesheetEntryIds), timeConflicts: [], priorReturns: [], jobConflictCount: 0, label: '' });
  }
  for (const record of assignments) {
    if (consumedAssignments.has(record.receipt.packId)) continue;
    descriptors.push({ id: record.receipt.packId, key: `assignment:${record.receipt.packId}`, engineer: nameOf(record.summary.engineer), engineerKey: keyOf(record.summary.engineer), date: record.summary.date, localStart: null, localFinish: null, status: 'assigned', source: 'assignment', receipt: record.receipt, receivedAt: record.receipt.receivedAt, jobIds: record.mappings.map(mapping => mapping.jobId), trackedIds: [], timeConflicts: [], priorReturns: [], jobConflictCount: record.mappings.filter(mapping => mapping.conflict).length, label: record.summary.label || '' });
  }
  const activeIds = new Set(descriptors.flatMap(day => day.jobIds)), retiredIds = new Set([...associatedIds].filter(id => !activeIds.has(id)));
  // Current conflicting owners remain conflicts even when a date/engineer filter
  // hides the other copy. Retained obsolete return jobs are intentionally excluded.
  const currentIds = new Map();
  for (const row of allRows) {
    if (row.entry.deletedAt || retiredIds.has(row.jobId)) continue;
    const values = currentIds.get(row.entry.id) || []; values.push(row); currentIds.set(row.entry.id, values);
  }
  for (const values of currentIds.values()) {
    const signatures = new Set(values.map(row => canonical({ engineer: keyOf(row.entry.engineer), sourceJobId: row.job?.sourceId || row.jobId, date: row.entry.date, start: row.entry.start, endDate: row.entry.endDate || row.entry.date, end: row.entry.end, hours: row.entry.hours, sessionType: row.entry.sessionType || '' })));
    if (signatures.size > 1) for (const row of values) row.conflict = true;
  }
  const claimed = new Set(), allDays = [];
  for (const descriptor of descriptors) {
    const start = localMinute(descriptor.localStart), finish = localMinute(descriptor.localFinish);
    const attendance = start !== null ? { from: start, to: finish ?? Infinity } : validDate(descriptor.date) ? { from: dateMinute(descriptor.date), to: dateMinute(descriptor.date) + 1440 } : null;
    const candidates = descriptor.source === 'assignment' ? [] : allRows.filter(row => descriptor.jobIds.includes(row.jobId) && keyOf(row.entry.engineer) === descriptor.engineerKey && (entryInterval(row.entry) ? !attendance || clipped(entryInterval(row.entry), attendance) > 0 || (entryInterval(row.entry).from === entryInterval(row.entry).to && entryInterval(row.entry).from >= attendance.from && entryInterval(row.entry).from <= attendance.to) : inDateRange(row.entry.date, { from: descriptor.localStart?.slice(0, 10) || descriptor.date, to: descriptor.localFinish?.slice(0, 10) || descriptor.date })));
    for (const id of descriptor.trackedIds) {
      const retained = descriptor.timeConflicts.find(item => item.sourceId === id);
      const matches = retained ? [{ entry: retained.entry, jobId: null, job: null, conflict: true }] : allRows.filter(row => row.entry.id === id && !retiredIds.has(row.jobId) && keyOf(row.entry.engineer) === descriptor.engineerKey);
      if (!matches.length) descriptor.missingTime = true;
      candidates.push(...matches.filter(row => !candidates.some(existing => existing === row)));
    }
    for (const row of candidates) claimed.add(`${descriptor.engineerKey}:${row.entry.id}`);
    descriptor.missingJobs = descriptor.jobIds.some(id => !jobs.has(id));
    descriptor.jobs = [...new Set([...descriptor.jobIds, ...candidates.map(row => row.jobId).filter(Boolean)])].map(id => views.get(id)).filter(Boolean);
    descriptor.jobIds = descriptor.jobs.map(job => job.id);
    if (start !== null && finish !== null ? !intervalVisible({ from: start, to: finish }, bounds) : !inDateRange(descriptor.date, filters)) continue;
    allDays.push(calculateDay(descriptor, candidates, filters));
  }
  const manual = new Map();
  for (const row of allRows) {
    const owner = keyOf(row.entry.engineer);
    if (retiredIds.has(row.jobId) || claimed.has(`${owner}:${row.entry.id}`) || row.entry.deletedAt) continue;
    const measured = entryInterval(row.entry);
    if (measured ? !intervalVisible(measured, bounds) : !inDateRange(row.entry.date, filters)) continue;
    const date = row.entry.date || '', key = JSON.stringify(['timesheets', owner, date]);
    const item = manual.get(key) || { id: key, key, engineer: nameOf(row.entry.engineer), engineerKey: owner, date, localStart: null, localFinish: null, status: 'recorded', source: 'timesheets', receipt: null, receivedAt: null, jobIds: [], jobs: [], priorReturns: [], rows: [], label: '' };
    item.rows.push(row); if (row.jobId && !item.jobIds.includes(row.jobId)) { item.jobIds.push(row.jobId); item.jobs.push(row.job); }
    manual.set(key, item);
  }
  for (const day of manual.values()) { const rows = day.rows; delete day.rows; allDays.push(calculateDay(day, rows, filters)); }
  // The same active record ID cannot be credited to two engineers or versions.
  // Scope this to displayed current-day evidence, not retained old return copies.
  const ownership = new Map();
  for (const day of allDays) for (const entry of day.entries) {
    if (entry.deletedAt) continue;
    const values = ownership.get(entry.id) || []; values.push({ day, entry }); ownership.set(entry.id, values);
  }
  for (const values of ownership.values()) {
    const signatures = new Set(values.map(({ entry }) => canonical({ engineer: keyOf(entry.engineer), sourceJobId: entry.sourceJobId, date: entry.date, start: entry.start, endDate: entry.endDate, end: entry.end, minutes: entry.minutes, category: entry.category, note: entry.note })));
    if (signatures.size < 2) continue;
    const affected = new Set();
    for (const { day, entry } of values) {
      if (!entry.conflict) { day.totals.recordedMinutes -= entry.minutes; day.totals[entry.category] -= entry.minutes; affected.add(day); }
      entry.conflict = true;
      if (!day.issues.includes('A time entry has conflicting ownership or versions.')) day.issues.push('A time entry has conflicting ownership or versions.');
      day.totals.utilisationPercent = null;
    }
    for (const day of affected) day.totals.conflictCount++;
  }
  const windows = new Map();
  for (const day of allDays) {
    if (!day.attendanceWindow) continue;
    const previous = windows.get(day.engineerKey) || [];
    for (const other of previous) if (day.attendanceWindow.from < other.attendanceWindow.to && other.attendanceWindow.from < day.attendanceWindow.to) {
      for (const affected of [day, other]) { if (!affected.issues.includes('Overlapping office days need review.')) affected.issues.push('Overlapping office days need review.'); affected.totals.utilisationPercent = null; }
    }
    previous.push(day); windows.set(day.engineerKey, previous);
  }
  allDays.sort((a, b) => b.date.localeCompare(a.date) || a.engineer.localeCompare(b.engineer) || a.key.localeCompare(b.key));
  const groups = new Map();
  const ensure = (key, name) => { if (!groups.has(key)) groups.set(key, { key, name: preferredNames.get(key) || name || 'Untagged', days: [], jobs: [], jobIds: [], packCount: 0 }); return groups.get(key); };
  for (const day of allDays) {
    const group = ensure(day.engineerKey, day.engineer); group.days.push(day); group.jobs.push(...day.jobs);
    if (day.source === 'return' || day.source === 'assignment') group.packCount += 1 + day.priorReturns.length;
  }
  for (const job of views.values()) {
    if (associatedIds.has(job.id) || retiredIds.has(job.id)) continue;
    if ((from || to) && !allDays.some(day => day.jobIds.includes(job.id))) continue;
    ensure(keyOf(job.engineer), job.engineer).jobs.push(job);
  }
  for (const group of groups.values()) {
    const unique = new Map();
    for (const job of group.jobs) if (!unique.has(job.sourceId)) unique.set(job.sourceId, job);
    group.jobs = [...unique.values()]; group.jobIds = group.jobs.map(job => job.id); group.totals = combine(group.days, group.jobs);
  }
  const allEngineers = [...groups.values()].sort((a, b) => a.key === UNTAGGED_ENGINEER_KEY ? 1 : b.key === UNTAGGED_ENGINEER_KEY ? -1 : a.name.localeCompare(b.name));
  const engineers = selectedEngineer ? allEngineers.filter(group => group.key === selectedEngineer) : allEngineers;
  const days = allDays.filter(day => !selectedEngineer || day.engineerKey === selectedEngineer), selectedJobs = engineers.flatMap(group => group.jobs);
  const totals = combine(days, selectedJobs);
  return { filters, engineers, engineerOptions: [...preferredNames].map(([key, name]) => ({ key, name })).sort((a, b) => a.key === UNTAGGED_ENGINEER_KEY ? 1 : b.key === UNTAGGED_ENGINEER_KEY ? -1 : a.name.localeCompare(b.name)), days, totals, untaggedJobs: engineers.find(group => group.key === UNTAGGED_ENGINEER_KEY)?.jobs.filter(job => !job.engineer) || [], hasData: !!(allDays.length || views.size), totalEngineers: allEngineers.filter(group => group.key !== UNTAGGED_ENGINEER_KEY).length };
}

/** One row per current day/assignment; spreadsheet text cannot become a formula. */
export function exportOfficeCsv(overview) {
  const headers = ['Engineer', 'Date', 'Status', 'Started', 'Finished', 'Attendance minutes', 'Job work minutes', 'Travel minutes', 'Break minutes', 'Other minutes', 'Unallocated minutes', 'Recorded minutes', 'Job time utilisation %', 'Completed jobs', 'Jobs', 'Conflicts', 'Issues', 'Received at', 'Date range clipped', 'Report from', 'Report to'];
  const cell = value => { let text = value === null || value === undefined ? '' : String(value); if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; };
  const rows = overview.days.map(day => [day.engineer || 'Untagged', day.date, day.status, day.localStart, day.localFinish, day.totals.attendanceMinutes, day.totals.jobWorkMinutes, day.totals.travelMinutes, day.totals.breakMinutes, day.totals.otherMinutes, day.totals.unallocatedMinutes, day.totals.recordedMinutes, day.totals.utilisationPercent, day.totals.completedJobs, day.totals.jobCount, day.totals.conflictCount, day.issues.join(' '), day.receivedAt, day.partial ? 'Yes' : 'No', overview.filters.from, overview.filters.to]);
  return [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
