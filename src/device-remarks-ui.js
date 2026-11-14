/** Device findings are engineer records, separate from the device's test result. */
import { validateDeviceRemarks, newDeviceRemark, saveDeviceRemark, SEVERITIES, REMARK_STATUSES } from './device-remarks.js';
import { validateNotesDocument } from './job-notes.js';

const templates = ['Battery backup', 'Critical defect', 'Custom note', 'Customer advice given'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const emptyRecords = () => ({ version: 1, items: [], history: [] });
const recordsOf = result => validateDeviceRemarks(result?.remarks) || emptyRecords();
const camera = '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';
const field = (label, name, value, { area = false, type = 'text', required = false, max = 10000, hint = '' } = {}) => `<label class="remark-field"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>${area ? `<textarea name="${name}" aria-label="${esc(label)}" rows="3" maxlength="${max}"${required ? ' required' : ''}>${esc(value)}</textarea>` : `<input name="${name}" aria-label="${esc(label)}" type="${type}" value="${esc(value)}" maxlength="${max}"${required ? ' required' : ''}>`}</label>`;
const choice = (label, name, value, options) => `<label class="remark-field"><span>${esc(label)}</span><select name="${name}">${options.map(option => `<option value="${esc(option)}"${option === value ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select></label>`;

function imagesMarkup(photos, kind, editable = false, eager = false) {
  return `<div class="remark-photo-strip">${photos.map(photo => `<figure class="remark-photo" data-photo-id="${esc(photo.id)}"><img src="${esc(photo.image)}" alt="${esc(photo.caption || (kind === 'beforePhotos' ? 'Before photograph' : 'Resolution photograph'))}" loading="${eager ? "eager" : "lazy"}">${editable ? `<label><span class="sr-only">${kind === 'beforePhotos' ? 'Before photo caption' : 'Resolution photo caption'}</span><input value="${esc(photo.caption)}" data-photo-caption="${esc(photo.id)}" maxlength="2000" aria-label="${kind === 'beforePhotos' ? 'Before photo caption' : 'Resolution photo caption'}" placeholder="Add caption"></label><button type="button" data-remove-photo="${esc(photo.id)}" data-photo-kind="${kind}" aria-label="Remove ${kind === 'beforePhotos' ? 'before' : 'resolution'} photo">Remove</button>` : photo.caption ? `<figcaption>${esc(photo.caption)}</figcaption>` : ''}</figure>`).join('')}${editable ? `<button type="button" class="remark-add-photo" data-add-photos="${kind}" aria-label="${kind === 'beforePhotos' ? 'Add before photos' : 'Add resolution photos'}">${camera}<span>Add photo</span></button><input type="file" data-remark-file="${kind}" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" multiple hidden>` : ''}</div>`;
}
function productMarkup(products) {
  return products.length ? `<ul class="remark-product-summary">${products.map(product => `<li><strong>${esc(product.description)}</strong><span>${esc(product.quantity)}${product.unit ? ` ${esc(product.unit)}` : ''}</span></li>`).join('')}</ul>` : '';
}
function detailMarkup(item, { internal = false, photos = true, eager = false } = {}) {
  const fields = [['Location', item.location], ['Description', item.description], ['Severity', item.severity], ['Last verified', item.lastVerified], ['Recommendation', item.recommendation], ['Remark status', item.status]];
  if (internal) fields.splice(3, 0, ['Internal note', item.internalNote]);
  return `<dl class="remark-readout">${fields.filter(([, value]) => value !== undefined && value !== '').map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${photos && item.beforePhotos.length ? `<h4>Before photos</h4>${imagesMarkup(item.beforePhotos, 'beforePhotos', false, eager)}` : ''}${photos && item.resolvedPhotos.length ? `<h4>Resolution photos</h4>${imagesMarkup(item.resolvedPhotos, 'resolvedPhotos', false, eager)}` : ''}${item.products.length ? `<h4>Products recorded</h4>${productMarkup(item.products)}` : ''}`;
}
function readPhoto(file) {
  if (!/^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.type)) throw Error('Choose a PNG, JPEG, WebP, GIF, BMP or AVIF picture.');
  if (file.size > 8 * 1024 * 1024) throw Error(`${file.name || 'This photo'} is larger than 8 MiB.`);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(Error('The photo could not be read. Try choosing it again.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => image.naturalWidth ? resolve({ id: crypto.randomUUID(), image: String(reader.result), caption: '' }) : reject(Error('This photo could not be opened.'));
      image.onerror = () => reject(Error('This photo could not be opened. Choose another image format.'));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function renderDeviceRemarks({ result, asset, onSave, onDirty = () => {}, onBeforeEdit = () => true, onEdit = () => {} }) {
  const root = document.createElement('section'); root.className = 'device-remarks';
  let records = recordsOf(result), draft = null, choosing = false, dirty = false, saving = false, loadingPhotos = false, disposed = false;
  function changed() {
    dirty = true;
    const form = root.querySelector('form'); if (form) form.dataset.dirty = 'true';
    const status = root.querySelector('.remark-save-state'); if (status) status.textContent = 'Unsaved remark changes';
    onDirty(true);
  }
  function showError(cause) {
    const box = root.querySelector('.remark-error');
    if (box) { box.textContent = cause.message || String(cause); box.hidden = false; }
  }
  function readDraft() {
    const form = root.querySelector('form[data-remark-form]');
    if (!form || !draft) return draft;
    const data = new FormData(form);
    for (const key of ['title', 'location', 'description', 'severity', 'internalNote', 'lastVerified', 'recommendation', 'status']) draft[key] = String(data.get(key) || '');
    for (const kind of ['beforePhotos', 'resolvedPhotos']) for (const photo of draft[kind]) {
      const input = [...form.querySelectorAll('[data-photo-caption]')].find(node => node.dataset.photoCaption === photo.id);
      if (input) photo.caption = input.value;
    }
    for (const product of draft.products) {
      const row = [...form.querySelectorAll('[data-remark-product]')].find(node => node.dataset.remarkProduct === product.id);
      if (row) {
        product.description = row.querySelector('[data-product-field="description"]').value;
        const quantity = row.querySelector('[data-product-field="quantity"]').value;
        product.quantity = quantity === '' ? '' : Number(quantity);
        product.unit = row.querySelector('[data-product-field="unit"]').value;
      }
    }
    return draft;
  }
  function lock(value) {
    root.querySelectorAll('button,input,textarea,select').forEach(control => { control.disabled = value; });
    root.setAttribute('aria-busy', String(value));
  }
  function begin(item) {
    if (saving || loadingPhotos || disposed || onBeforeEdit() === false) return;
    draft = structuredClone(item); choosing = false; dirty = false;
    onEdit(true); render();
  }
  function cancel() {
    if (saving || loadingPhotos || disposed) return;
    if (dirty && !confirm('Leave this form and discard unsaved changes?')) return;
    draft = null; choosing = false; dirty = false; onDirty(false); onEdit(false); render();
  }
  async function addPhotos(kind, files) {
    if (!draft || !files.length || saving || loadingPhotos || disposed) return;
    readDraft(); changed(); loadingPhotos = true; lock(true);
    try {
      if (draft[kind].length + files.length > 12) throw Error('Add at most 12 photos in each section.');
      const additions = await Promise.all(files.map(readPhoto));
      if (disposed) return;
      validateNotesDocument({ version: 1, blocks: [], photos: [...draft.beforePhotos, ...draft.resolvedPhotos, ...additions] });
      draft[kind].push(...additions); render();
    } catch (cause) { if (!disposed) showError(cause); }
    finally { loadingPhotos = false; if (!disposed) lock(false); }
  }
  function renderList() {
    return `<div class="remark-section-head"><div><h3>Device remarks</h3><p class="muted">${records.items.length} recorded for ${esc(asset?.reference || asset?.type || 'this device')}</p></div><button type="button" data-remark-action="add" aria-label="Add remark">＋ Add remark</button></div>${choosing ? `<section class="remark-template-picker" aria-label="Remark type"><div class="remark-template-head"><strong>Choose a remark</strong><button type="button" data-remark-action="close-picker">Cancel</button></div><div class="remark-template-grid">${templates.map(template => `<button type="button" data-remark-template="${esc(template)}">${esc(template)}</button>`).join('')}</div></section>` : ''}<div class="remark-card-grid">${records.items.map(item => `<article class="remark-card" data-remark-id="${esc(item.id)}"><div class="remark-card-head"><h3>${esc(item.title)}</h3><span class="remark-status ${item.status === 'Resolved' ? 'resolved' : ''}">${esc(item.status)}</span></div>${item.description ? `<p class="remark-summary-text">${esc(item.description)}</p>` : ""}<p class="remark-summary-meta">${[item.location, item.severity].filter(Boolean).map(esc).join(" · ")}</p>${item.beforePhotos.length || item.resolvedPhotos.length || item.products.length ? `<p class="remark-evidence-count">${[[item.beforePhotos.length, "before photos"], [item.resolvedPhotos.length, "resolved photos"], [item.products.length, "products"]].filter(([count]) => count).map(([count, label]) => `${count} ${label}`).join(" · ")}</p>` : ""}<button type="button" data-edit-remark="${esc(item.id)}">Edit remark</button></article>`).join('') || '<p class="remark-empty">Add a finding, advice or supporting photos for this device.</p>'}</div>`;
  }
  function renderEditor() {
    return `<form data-remark-form data-dirty="${dirty}"><div class="remark-editor-head"><div><h3>Edit remark</h3><small>${esc(asset?.reference || asset?.type || 'Device')}</small></div><button type="button" data-remark-action="cancel">Cancel</button></div><div class="remark-editor-columns"><section class="remark-section"><h4>Remark details</h4><div class="remark-section-body"><h5 class="remark-photo-heading">Before photos</h5>${imagesMarkup(draft.beforePhotos, 'beforePhotos', true)}${field('Remark title', 'title', draft.title, { required: true, max: 200 })}${field('Location', 'location', draft.location, { max: 1000 })}${field('Description', 'description', draft.description, { area: true })}${choice('Severity', 'severity', draft.severity, SEVERITIES)}${field('Internal note', 'internalNote', draft.internalNote, { area: true, hint: 'Kept out of the service report' })}${field('Last verified', 'lastVerified', draft.lastVerified, { type: 'date' })}</div></section><section class="remark-section"><h4>Resolution</h4><div class="remark-section-body"><h5 class="remark-photo-heading">Resolved photos</h5>${imagesMarkup(draft.resolvedPhotos, 'resolvedPhotos', true)}${field('Recommendation', 'recommendation', draft.recommendation, { area: true })}${choice('Remark status', 'status', draft.status, REMARK_STATUSES)}<div class="remark-products-head"><h4>Products</h4><button type="button" data-remark-action="add-product" aria-label="Add product">＋ Add product</button></div><div class="remark-products">${draft.products.map(product => `<div class="remark-product-row" data-remark-product="${esc(product.id)}"><label class="remark-product-description">Product description<input data-product-field="description" aria-label="Product description" maxlength="1000" value="${esc(product.description)}" required></label><label>Quantity<input data-product-field="quantity" aria-label="Quantity" type="number" min="0" max="1000000000" step="any" value="${esc(product.quantity)}" required></label><label>Unit<input data-product-field="unit" aria-label="Unit" maxlength="80" value="${esc(product.unit)}"></label><button type="button" data-remove-product="${esc(product.id)}">Remove product</button></div>`).join('')}</div></div></section></div><div class="remark-save-bar"><span class="remark-save-state" role="status">${dirty ? 'Unsaved remark changes' : 'Save when ready'}</span><button type="submit" class="primary">Save remark</button></div></form>`;
  }
  function render() {
    if (disposed) return;
    root.innerHTML = `<div class="remark-error notice error" role="alert" hidden></div>${draft ? renderEditor() : renderList()}`;
    root.querySelector('[data-remark-action="add"]')?.addEventListener('click', () => { choosing = !choosing; render(); });
    root.querySelector('[data-remark-action="close-picker"]')?.addEventListener('click', () => { choosing = false; render(); });
    root.querySelector('[data-remark-action="cancel"]')?.addEventListener('click', cancel);
    root.querySelectorAll('[data-remark-template]').forEach(button => { button.onclick = () => begin(newDeviceRemark(button.dataset.remarkTemplate)); });
    root.querySelectorAll('[data-edit-remark]').forEach(button => { button.onclick = () => begin(records.items.find(item => item.id === button.dataset.editRemark)); });
    const form = root.querySelector('form');
    if (!form) return;
    form.addEventListener('input', changed);
    form.addEventListener('change', changed);
    root.querySelectorAll('[data-add-photos]').forEach(button => { button.onclick = () => root.querySelector(`[data-remark-file="${button.dataset.addPhotos}"]`).click(); });
    root.querySelectorAll('[data-remark-file]').forEach(input => { input.onchange = event => { const files = [...event.target.files]; event.target.value = ''; addPhotos(input.dataset.remarkFile, files); }; });
    root.querySelectorAll('[data-remove-photo]').forEach(button => { button.onclick = () => { readDraft(); draft[button.dataset.photoKind] = draft[button.dataset.photoKind].filter(photo => photo.id !== button.dataset.removePhoto); changed(); render(); }; });
    root.querySelector('[data-remark-action="add-product"]').onclick = () => {
      readDraft(); draft.products.push({ id: crypto.randomUUID(), description: '', quantity: 1, unit: '' }); changed(); render();
      root.querySelector('.remark-product-row:last-child [data-product-field="description"]')?.focus();
    };
    root.querySelectorAll('[data-remove-product]').forEach(button => { button.onclick = () => { readDraft(); draft.products = draft.products.filter(product => product.id !== button.dataset.removeProduct); changed(); render(); }; });
    form.onsubmit = async event => {
      event.preventDefault();
      if (saving || loadingPhotos || disposed) return;
      root.querySelector('.remark-error').hidden = true;
      changed();
      try {
        readDraft();
        const next = saveDeviceRemark(records, draft);
        saving = true; lock(true);
        root.querySelector('.remark-save-state').textContent = 'Saving remark…';
        const saved = await onSave(next);
        if (saved !== true) throw Error('Remark was not saved. Your entries are still here; try again.');
        records = next; draft = null; dirty = false; onDirty(false);
        if (!disposed) { onEdit(false); render(); }
      } catch (cause) {
        if (!disposed) { showError(cause); root.querySelector('.remark-save-state').textContent = 'Not saved — retry'; }
      } finally { saving = false; if (!disposed) lock(false); }
    };
    if (saving || loadingPhotos) lock(true);
  }
  root.dispose = () => { disposed = true; };
  render();
  return root;
}

export function renderDeviceRemarkReport(result) {
  const root = document.createElement('section'); root.className = 'device-remarks-report';
  const records = recordsOf(result);
  if (!records.items.length) return root;
  root.innerHTML = `<h3>Device remarks</h3>${records.items.map(item => `<article class="remark-report-entry"><h4>${esc(item.title)}</h4>${detailMarkup(item, { eager: true })}</article>`).join('')}`;
  return root;
}
export function renderRemarkProducts(result) {
  const root = document.createElement('section'); root.className = 'device-remark-products';
  const items = recordsOf(result).items.filter(item => item.products.length);
  root.innerHTML = `<h3>Products recorded</h3>${items.map(item => `<article><h4>${esc(item.title)}</h4>${productMarkup(item.products)}</article>`).join('') || '<p class="muted">No products have been recorded in device remarks.</p>'}`;
  return root;
}
export function renderRemarkPhotos(result) {
  const root = document.createElement('section'); root.className = 'device-remark-photos';
  const items = recordsOf(result).items.filter(item => item.beforePhotos.length || item.resolvedPhotos.length);
  root.innerHTML = `<h3>Remark photos</h3>${items.map(item => `<article><h4>${esc(item.title)}</h4>${item.beforePhotos.length ? `<p>Before</p>${imagesMarkup(item.beforePhotos, 'beforePhotos')}` : ''}${item.resolvedPhotos.length ? `<p>Resolution</p>${imagesMarkup(item.resolvedPhotos, 'resolvedPhotos')}` : ''}</article>`).join('') || '<p class="muted">No photos have been added to device remarks.</p>'}`;
  return root;
}
export function renderRemarkHistory(result) {
  const root = document.createElement('section'); root.className = 'device-remark-history';
  const records = recordsOf(result);
  root.innerHTML = `<h3>Remark history</h3>${records.items.length ? `<div class="remark-history-current">${records.items.map(item => `<p><strong>${esc(item.title)}</strong> · ${esc(item.status)}<br><small>Created ${esc(item.createdAt)} · Last saved ${esc(item.updatedAt)}</small></p>`).join('')}</div>` : ''}${records.history.slice().reverse().map(entry => `<details class="remark-history-entry"><summary>${esc(entry.item.title)} · earlier record · ${esc(entry.savedAt)}</summary>${detailMarkup(entry.item, { internal: true })}</details>`).join('') || '<p class="muted">No earlier remark versions recorded.</p>'}`;
  return root;
}
