/** Device observations and defects. These records never change a test result. */
import { validateNotesDocument } from './job-notes.js';

export const SEVERITIES = ['Unclassified', 'Observation', 'Minor defect', 'Major defect', 'Critical defect'];
export const REMARK_STATUSES = ['Open', 'Resolved'];
const TEMPLATES = ['Battery backup', 'Critical defect', 'Custom note', 'Customer advice given'];
const ITEM_KEYS = ['id', 'title', 'location', 'description', 'severity', 'internalNote', 'lastVerified', 'recommendation', 'status', 'beforePhotos', 'resolvedPhotos', 'products', 'createdAt', 'updatedAt'];
const clone = value => structuredClone(value);
const record = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)))
    throw Error(`${label} has an invalid structure.`);
};
const text = (value, label, limit = 10000, required = false) => {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim()))
    throw Error(`${label} must be ${required ? 'nonempty ' : ''}text of at most ${limit} characters.`);
  return value.trim();
};
const list = (value, limit, label) => {
  if (!Array.isArray(value) || value.length > limit) throw Error(`${label} must contain at most ${limit} records.`);
  return value;
};
const timestamp = (value, label) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value.slice(0, 10))
    throw Error(`${label} must be a valid UTC timestamp.`);
  return value;
};

/** Strict import boundary. Stable record IDs may recur only in that record's history. */
export function validateDeviceRemarks(value) {
  if (value === undefined) return undefined;
  record(value, ['version', 'items', 'history'], 'Device remarks');
  if (value.version !== 1) throw Error('Device remarks version is unsupported.');
  list(value.items, 100, 'Device remarks');
  list(value.history, 200, 'Device remark history');
  const owners = new Map(), itemIds = new Set(), historyIds = new Set(), images = new Set();
  let imageBytes = 0, characters = 0;
  function identity(value, owner, seen) {
    const id = text(value, 'Remark record ID', 160, true);
    if (seen.has(id) || (owners.has(id) && owners.get(id) !== owner)) throw Error('Remark record IDs must be unique.');
    seen.add(id); owners.set(id, owner);
    return id;
  }
  function item(value) {
    record(value, ITEM_KEYS, 'Device remark');
    const seen = new Set();
    const id = text(value.id, 'Remark ID', 160, true);
    identity(id, `remark:${id}`, seen);
    const result = { id };
    for (const [key, limit, required] of [['title', 200, true], ['location', 1000], ['description', 10000], ['internalNote', 10000], ['recommendation', 10000]]) {
      result[key] = text(value[key], `Remark ${key}`, limit, required);
      characters += result[key].length;
    }
    if (!SEVERITIES.includes(value.severity)) throw Error('Remark severity is unsupported.');
    if (!REMARK_STATUSES.includes(value.status)) throw Error('Remark status is unsupported.');
    result.severity = value.severity;
    result.status = value.status;
    result.lastVerified = text(value.lastVerified, 'Last verified date', 10);
    if (result.lastVerified && (!/^\d{4}-\d{2}-\d{2}$/.test(result.lastVerified) || !Number.isFinite(Date.parse(result.lastVerified)) || new Date(result.lastVerified).toISOString().slice(0, 10) !== result.lastVerified))
      throw Error('Last verified must be a real date in YYYY-MM-DD format.');
    for (const key of ['beforePhotos', 'resolvedPhotos']) {
      list(value[key], 12, `Remark ${key}`);
      // The shared notes validator checks raster signatures, image sizes and safe keys.
      result[key] = validateNotesDocument({ version: 1, blocks: [], photos: value[key] }).photos;
      for (const photo of result[key]) {
        identity(photo.id, `photo:${id}:${photo.id}`, seen);
        characters += photo.caption.length;
        if (!images.has(photo.image)) {
          images.add(photo.image);
          const encoded = photo.image.slice(photo.image.indexOf(',') + 1);
          imageBytes += encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
        }
      }
    }
    result.products = list(value.products, 100, 'Remark products').map(product => {
      record(product, ['id', 'description', 'quantity', 'unit'], 'Remark product');
      const productId = identity(product.id, `product:${id}:${product.id}`, seen);
      const description = text(product.description, 'Product description', 1000, true);
      const unit = text(product.unit, 'Product unit', 80);
      if (typeof product.quantity !== 'number' || !Number.isFinite(product.quantity) || product.quantity < 0 || product.quantity > 1e9)
        throw Error('Product quantity must be a finite number from 0 to 1,000,000,000.');
      characters += description.length + unit.length;
      return { id: productId, description, quantity: product.quantity, unit };
    });
    result.createdAt = timestamp(value.createdAt, 'Remark created date');
    result.updatedAt = timestamp(value.updatedAt, 'Remark updated date');
    if (Date.parse(result.updatedAt) < Date.parse(result.createdAt)) throw Error('A remark update cannot precede its creation.');
    if (characters > 1000000) throw Error('Device remarks and retained history exceed the text limit.');
    if (imageBytes > 40 * 1024 * 1024) throw Error('Device remark photographs exceed 40 MiB.');
    return result;
  }
  const items = value.items.map(value => {
    const result = item(value);
    if (itemIds.has(result.id)) throw Error('Remark IDs must be unique.');
    itemIds.add(result.id);
    return result;
  });
  const history = value.history.map(entry => {
    record(entry, ['id', 'remarkId', 'savedAt', 'item'], 'Remark history entry');
    const historyId = identity(entry.id, `history:${entry.id}`, historyIds);
    const remarkId = text(entry.remarkId, 'Historical remark ID', 160, true);
    if (!itemIds.has(remarkId) || entry.item?.id !== remarkId) throw Error('Remark history must refer to its existing remark.');
    return { id: historyId, remarkId, savedAt: timestamp(entry.savedAt, 'Remark history saved date'), item: item(entry.item) };
  });
  return { version: 1, items, history };
}

/** A selected template supplies only its title and explicit severity choice. */
export function newDeviceRemark(template = 'Custom note') {
  if (!TEMPLATES.includes(template)) throw Error('Remark template is unsupported.');
  const at = new Date().toISOString();
  return {
    id: crypto.randomUUID(), title: template, location: '', description: '',
    severity: template === 'Critical defect' ? 'Critical defect' : 'Unclassified',
    internalNote: '', lastVerified: '', recommendation: '', status: 'Open',
    beforePhotos: [], resolvedPhotos: [], products: [], createdAt: at, updatedAt: at,
  };
}

/** Save one edited remark, retaining the previous version and all other remarks. */
export function saveDeviceRemark(existing, edited) {
  const records = validateDeviceRemarks(existing) || { version: 1, items: [], history: [] };
  const candidate = validateDeviceRemarks({ version: 1, items: [edited], history: [] }).items[0];
  const previous = records.items.find(item => item.id === candidate.id);
  if (previous) candidate.createdAt = previous.createdAt;
  const comparison = value => JSON.stringify({ ...value, updatedAt: '' });
  if (previous && comparison(previous) === comparison(candidate)) return records;
  const at = new Date(Math.max(Date.now(), Date.parse(candidate.createdAt), previous ? Date.parse(previous.updatedAt) : 0)).toISOString();
  candidate.updatedAt = at;
  if (previous) {
    records.history.push({ id: crypto.randomUUID(), remarkId: previous.id, savedAt: at, item: clone(previous) });
    records.items[records.items.findIndex(item => item.id === candidate.id)] = candidate;
  } else records.items.push(candidate);
  return validateDeviceRemarks(records);
}
