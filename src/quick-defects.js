/** This browser's reusable wording, kept separate from site and visit evidence. */
import { newDeviceRemark, SEVERITIES } from './device-remarks.js';

const FIELDS = ['title', 'description', 'severity', 'recommendation'];
const KEYS = ['id', ...FIELDS, 'createdAt'];
const text = (value, label, limit, required = false) => {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim()))
    throw Error(`${label} must be ${required ? 'nonempty ' : ''}text of at most ${limit} characters.`);
  return value.trim();
};
const reusableFields = remark => {
  if (!remark || typeof remark !== 'object' || Array.isArray(remark)) throw Error('Choose a saved remark.');
  if (!SEVERITIES.includes(remark.severity)) throw Error('Quick defect severity is unsupported.');
  return {
    title: text(remark.title, 'Quick defect title', 200, true),
    description: text(remark.description, 'Quick defect description', 10000),
    severity: remark.severity,
    recommendation: text(remark.recommendation, 'Quick defect recommendation', 10000),
  };
};

/** Content identity never includes a location, photo, result or private note. */
export const quickDefectSignature = remark => JSON.stringify(reusableFields(remark));

export function validateQuickDefects(items = []) {
  if (!Array.isArray(items) || items.length > 200) throw Error('Keep at most 200 quick defects.');
  const ids = new Set(), signatures = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !KEYS.includes(key)))
      throw Error('Quick defect has an invalid structure.');
    const id = text(item.id, 'Quick defect ID', 160, true);
    if (ids.has(id)) throw Error('Quick defect IDs must be unique.');
    ids.add(id);
    const fields = reusableFields(item), signature = JSON.stringify(fields);
    if (signatures.has(signature)) throw Error('Quick defects must not repeat the same wording.');
    signatures.add(signature);
    const createdAt = item.createdAt;
    if (typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(createdAt) || !Number.isFinite(Date.parse(createdAt)) || new Date(createdAt).toISOString().slice(0, 10) !== createdAt.slice(0, 10))
      throw Error('Quick defect created date must be a valid UTC timestamp.');
    return { id, ...fields, createdAt };
  });
}

export function quickDefectFromRemark(remark) {
  return validateQuickDefects([{
    id: crypto.randomUUID(), ...reusableFields(remark), createdAt: new Date().toISOString(),
  }])[0];
}

export function findQuickDefect(items, remark) {
  const signature = quickDefectSignature(remark);
  return validateQuickDefects(items).find(item => quickDefectSignature(item) === signature);
}

export function addQuickDefect(items, remark) {
  const next = validateQuickDefects(items);
  if (findQuickDefect(next, remark)) return next;
  return validateQuickDefects([...next, quickDefectFromRemark(remark)]);
}

export function removeQuickDefect(items, id) {
  const target = text(id, 'Quick defect ID', 160, true);
  return validateQuickDefects(items).filter(item => item.id !== target);
}

/** Applying reusable wording creates new, open evidence for this device only. */
export function instantiateQuickDefect(template) {
  const [checked] = validateQuickDefects([template]);
  return { ...newDeviceRemark(), ...reusableFields(checked) };
}
