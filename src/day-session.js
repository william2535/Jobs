/** Office attendance and explicit return receipts. All operations are pure candidates for an atomic save. */
import { saveTimesheet, timesheetEntries, validateTimesheetEntry } from './timesheets.js';

const clone = value => structuredClone(value);
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const dayKeys = ['id', 'officeId', 'packId', 'parentPackId', 'engineer', 'date', 'jobIds', 'startedAt', 'localStart', 'finishedAt', 'localFinish', 'status', 'timesheetEntryIds', 'preparedPackId', 'receipt', 'receiptHistory'];
const receiptKeys = ['format', 'version', 'receiptId', 'packId', 'dayId', 'officeId', 'engineer', 'receivedAt', 'checksum'];
const object = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw Error(`${label} has an invalid structure.`);
};
const text = (value, label, required = true, max = 1000) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw Error(`${label} must be ${required ? 'nonempty ' : ''}text of at most ${max} characters.`);
  return value;
};
function date(value) {
  text(value, 'Day date', true, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw Error('Choose a real day date.');
  return value;
}
function instant(value) {
  text(value, 'Day timestamp', true, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10)) throw Error('Day timestamp is invalid.');
  return value;
}
function local(value) {
  text(value, 'Local day time', true, 16);
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw Error('Use a local date and time in YYYY-MM-DDTHH:mm format.');
  date(value.slice(0, 10));
  return value;
}
const minute = value => Date.parse(`${local(value)}:00Z`) / 60000;
const localText = value => {
  const at = new Date(instant(value)), pad = part => String(part).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
};
function ids(values, label, max = 100) {
  if (!Array.isArray(values) || values.length > max) throw Error(`${label} must contain at most ${max} IDs.`);
  values.forEach(value => text(value, label));
  if (new Set(values).size !== values.length) throw Error(`${label} must contain unique IDs.`);
  return [...values];
}
const packId = value => {
  text(value, 'Day pack ID', true, 100);
  if (!/^day-pack-[a-f0-9]{64}$/.test(value)) throw Error('Day pack ID is invalid.');
  return value;
};
const nullablePack = value => value === null ? null : packId(value);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function digest(value) {
  if (!globalThis.crypto?.subtle) throw Error('Day receipts need HTTPS or localhost.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

/** A receipt records a successful local import; its checksum is integrity, not authentication. */
export function validateDayReceipt(value) {
  object(value, receiptKeys, 'Office receipt');
  if (value.format !== 'JobsDayReceipt' || value.version !== 1) throw Error('Choose a supported Jobs day receipt.');
  const result = { format: value.format, version: 1, receiptId: text(value.receiptId, 'Receipt ID', true, 100), packId: packId(value.packId), dayId: value.dayId === null ? null : text(value.dayId, 'Receipt day ID', true, 160), officeId: text(value.officeId, 'Office ID', true, 200), engineer: text(value.engineer, 'Engineer', value.dayId !== null, 200), receivedAt: instant(value.receivedAt), checksum: text(value.checksum, 'Receipt checksum', true, 80) };
  if (!/^day-receipt-[a-f0-9]{64}$/.test(result.receiptId) || !/^sha256:[a-f0-9]{64}$/.test(result.checksum) || result.receiptId.slice(12) !== result.checksum.slice(7)) throw Error('Receipt identity is invalid.');
  return result;
}
export async function createDayReceipt({ packId: selectedPack, dayId = null, officeId, engineer, receivedAt = now() }) {
  const body = { format: 'JobsDayReceipt', version: 1, packId: packId(selectedPack), dayId: dayId === null ? null : text(dayId, 'Day ID', true, 160), officeId: text(officeId, 'Office ID', true, 200), engineer: text(engineer, 'Engineer', dayId !== null, 200), receivedAt: instant(receivedAt) };
  const hash = await digest(body);
  return validateDayReceipt({ ...body, receiptId: `day-receipt-${hash}`, checksum: `sha256:${hash}` });
}
export async function inspectDayReceipt(value) {
  let source = value;
  if (typeof value === 'string') {
    if (new TextEncoder().encode(value).byteLength > 10000) throw Error('Office receipt is too large.');
    try { source = JSON.parse(value); } catch { throw Error('Office receipt is not valid JSON.'); }
  }
  const receipt = validateDayReceipt(source), { checksum, receiptId, ...body } = receipt;
  if (checksum !== `sha256:${await digest(body)}`) throw Error('Office receipt checksum does not match its content.');
  return receipt;
}

export function validateOfficeDay(value) {
  object(value, dayKeys, 'Office day');
  const day = { id: text(value.id, 'Office day ID', true, 160), officeId: text(value.officeId, 'Office ID', true, 200), packId: packId(value.packId), parentPackId: nullablePack(value.parentPackId), engineer: text(value.engineer, 'Engineer', true, 200), date: date(value.date), jobIds: ids(value.jobIds, 'Day jobs'), startedAt: instant(value.startedAt), localStart: local(value.localStart), finishedAt: value.finishedAt === null ? null : instant(value.finishedAt), localFinish: value.localFinish === null ? null : local(value.localFinish), status: value.status, timesheetEntryIds: ids(value.timesheetEntryIds, 'Day timesheet entries', 5000), preparedPackId: nullablePack(value.preparedPackId), receipt: value.receipt === null ? null : validateDayReceipt(value.receipt), receiptHistory: [] };
  if (!day.jobIds.length) throw Error('An office day needs at least one saved job.');
  if (!['running', 'finished', 'returned'].includes(day.status)) throw Error('Office day status is invalid.');
  if (!Array.isArray(value.receiptHistory) || value.receiptHistory.length > 100) throw Error('Keep at most 100 earlier office receipts.');
  day.receiptHistory = value.receiptHistory.map(validateDayReceipt);
  if (new Set(day.receiptHistory.map(receipt => receipt.receiptId)).size !== day.receiptHistory.length) throw Error('Office receipt history contains duplicate IDs.');
  for (const receipt of [...day.receiptHistory, ...(day.receipt ? [day.receipt] : [])]) if (receipt.dayId !== day.id || receipt.officeId !== day.officeId || receipt.engineer !== day.engineer) throw Error('Office receipt belongs to a different day or engineer.');
  if (day.status === 'running') {
    if (day.finishedAt !== null || day.localFinish !== null || day.timesheetEntryIds.length || day.preparedPackId !== null || day.receipt !== null || day.receiptHistory.length) throw Error('A running day cannot claim finished time or office delivery.');
  } else {
    if (!day.finishedAt || !day.localFinish || Date.parse(day.finishedAt) < Date.parse(day.startedAt) || minute(day.localFinish) < minute(day.localStart) || minute(day.localFinish) - minute(day.localStart) > 31 * 1440) throw Error('Finish the day after its start, within 31 days.');
    if (day.status === 'returned' && (!day.receipt || day.receipt.packId !== day.preparedPackId)) throw Error('Returned status requires a matching office receipt.');
    if (day.status === 'finished' && day.receipt) throw Error('A pending return cannot claim an office receipt.');
  }
  return day;
}
export function validateOfficeDays(values = []) {
  if (!Array.isArray(values) || values.length > 5000) throw Error('Keep at most 5,000 office days.');
  const days = values.map(validateOfficeDay);
  if (new Set(days.map(day => day.id)).size !== days.length) throw Error('Office day IDs must be unique.');
  if (days.filter(day => day.status === 'running').length > 1) throw Error('Only one office day can run on this device.');
  return days;
}
export function activeOfficeDay(state) { return validateOfficeDays(state.officeDays).find(day => day.status === 'running') || null; }

export function startOfficeDay(state, { packId: selectedPack, parentPackId = null, engineer, date: assignedDate, jobIds, officeId, at = now(), localStart = localText(at) }) {
  const next = clone(state), days = validateOfficeDays(next.officeDays), owner = text(engineer, 'Engineer', true, 200).trim();
  const running = days.find(day => day.status === 'running');
  if (running) {
    if (running.packId === selectedPack && running.engineer === owner && running.officeId === officeId) return { state: next, day: running, duplicate: true };
    throw Error('Finish the current office day before collecting another day pack.');
  }
  if (days.some(day => day.packId === selectedPack && day.engineer === owner)) throw Error('This day pack has already been worked. Reopen its return or prepare a new assignment.');
  const day = validateOfficeDay({ id: uid(), officeId, packId: selectedPack, parentPackId, engineer: owner, date: assignedDate || localStart.slice(0, 10), jobIds, startedAt: at, localStart, finishedAt: null, localFinish: null, status: 'running', timesheetEntryIds: [], preparedPackId: null, receipt: null, receiptHistory: [] });
  if (day.jobIds.some(jobId => !next.jobs?.some(job => job.id === jobId))) throw Error('Save every job in the day pack before starting its timesheet.');
  next.officeDays = validateOfficeDays([...days, day]);
  return { state: next, day: next.officeDays.at(-1), duplicate: false };
}

/** Fill only time not already represented by this engineer's timed job/travel/break entries. */
export function finishOfficeDay(state, dayId, { at = now(), localFinish = localText(at) } = {}) {
  let next = clone(state);
  next.officeDays = validateOfficeDays(next.officeDays);
  const day = next.officeDays.find(day => day.id === dayId);
  if (!day) throw Error('Choose the office day to finish.');
  if (day.status !== 'running') return { state: next, day, duplicate: true };
  const finished = validateOfficeDay({ ...day, finishedAt: at, localFinish, status: 'finished' });
  const from = minute(day.localStart), to = minute(finished.localFinish), coverage = [], includedTimeIds = [], includedJobIds = new Set(day.jobIds);
  for (const row of timesheetEntries(next)) {
    const entry = row.entry;
    if (String(entry.engineer || '').trim().toLocaleLowerCase() !== day.engineer.toLocaleLowerCase()) continue;
    if (!entry.date || entry.date > localFinish.slice(0, 10) || (entry.endDate || entry.date) < day.localStart.slice(0, 10)) continue;
    if (!entry.start || !entry.end) throw Error('Enter start and finish times for this engineer’s hours-only entries before finishing the day, so time is not counted twice.');
    const start = minute(`${entry.date}T${entry.start}`), finish = minute(`${entry.endDate || entry.date}T${entry.end}`);
    if (finish <= from || start >= to) continue;
    if (row.conflict) throw Error('Review conflicting timesheet entries before finishing the day.');
    if (row.jobId === null) includedTimeIds.push(entry.id);
    else includedJobIds.add(row.jobId);
    coverage.push({ from: Math.max(from, start), to: Math.min(to, finish) });
  }
  coverage.sort((a, b) => a.from - b.from || a.to - b.to);
  const gaps = []; let cursor = from;
  for (const range of coverage) { if (range.from > cursor) gaps.push({ from: cursor, to: range.from }); cursor = Math.max(cursor, range.to); }
  if (cursor < to || from === to) gaps.push({ from: cursor, to });
  const entryIds = [...includedTimeIds];
  for (const [index, gap] of gaps.entries()) {
    const start = new Date(gap.from * 60000).toISOString(), end = new Date(gap.to * 60000).toISOString();
    const entry = validateTimesheetEntry({ id: `${day.id}:unallocated:${index + 1}`, date: start.slice(0, 10), start: start.slice(11, 16), endDate: end.slice(0, 10), end: end.slice(11, 16), hours: null, sessionType: 'Work', customType: '', engineer: day.engineer, note: `Unallocated time in office day ${day.date}. Recorded job, travel and break sessions are kept separately.` });
    next = saveTimesheet(next, entry, { jobId: null });
    entryIds.push(entry.id);
  }
  const index = next.officeDays.findIndex(day => day.id === dayId);
  next.officeDays[index] = validateOfficeDay({ ...finished, jobIds: [...includedJobIds], timesheetEntryIds: entryIds });
  return { state: next, day: next.officeDays[index], duplicate: false };
}
export function markOfficeDayPrepared(state, dayId, selectedPack) {
  const next = clone(state); next.officeDays = validateOfficeDays(next.officeDays);
  const day = next.officeDays.find(day => day.id === dayId);
  if (!day || day.status === 'running') throw Error('Finish the day before preparing its return.');
  packId(selectedPack);
  if (day.preparedPackId === selectedPack) return { state: next, day };
  if (day.receipt && !day.receiptHistory.some(value => value.receiptId === day.receipt.receiptId)) day.receiptHistory.push(day.receipt);
  day.preparedPackId = selectedPack; day.status = 'finished'; day.receipt = null;
  validateOfficeDay(day);
  return { state: next, day };
}
export async function acknowledgeOfficeDay(state, dayId, input) {
  const receipt = await inspectDayReceipt(input), next = clone(state);
  next.officeDays = validateOfficeDays(next.officeDays);
  const day = next.officeDays.find(day => day.id === dayId);
  if (!day || day.status === 'running' || !day.preparedPackId || receipt.packId !== day.preparedPackId || receipt.dayId !== day.id || receipt.officeId !== day.officeId || receipt.engineer !== day.engineer) throw Error('This receipt does not acknowledge the day return currently waiting for the office.');
  if (day.receipt?.receiptId === receipt.receiptId) return { state: next, day, duplicate: true };
  if (day.receipt && !day.receiptHistory.some(value => value.receiptId === day.receipt.receiptId)) day.receiptHistory.push(day.receipt);
  day.receipt = receipt; day.status = 'returned'; validateOfficeDay(day);
  return { state: next, day, duplicate: false };
}
