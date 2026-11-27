/** Asset creation and reusable equipment templates. Test results remain with the caller. */
import { previewAssetReferences, nextAssetReference } from './asset-library.js';

const TYPES = [
  ['panel', 'Fire alarm panel'], ['smoke', 'Smoke detector'], ['heat', 'Heat detector'],
  ['mcp', 'Manual call point'], ['sounder', 'Sounder'], ['vad', 'Visual alarm device'], ['interface', 'Interface module'],
  ['intruder-panel', 'Intruder alarm panel'], ['pir', 'PIR detector'], ['contact', 'Door contact'],
  ['shock', 'Shock detector'], ['glassbreak', 'Glass-break detector'], ['keypad', 'Keypad'],
  ['camera', 'CCTV camera'], ['nvr', 'Recorder / NVR'], ['network-switch', 'Network switch'],
  ['access-panel', 'Access control panel'], ['reader', 'Access reader'], ['lock', 'Door lock'], ['exit-button', 'Exit button'],
];
const QUICK_TYPES = [
  ['smoke', 'Smoke detectors'], ['heat', 'Heat detectors'], ['mcp', 'Call points'],
  ['sounder', 'Sounders'], ['pir', 'PIR detectors'], ['camera', 'Cameras'],
];
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const star = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9z"/></svg>';
const copy = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
const templateFields = ['type', 'typeName', 'manufacturer', 'model', 'description'];
const matchesTemplate = (asset, template) => templateFields.every(key => String(asset[key] ?? '') === String(template[key] ?? ''));
const blank = () => ({ reference: '', type: '', typeName: '', floorId: '', location: '', manufacturer: '', model: '', description: '' });
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };

export function renderAssetsWorkspace({
  drawing = null, templates = [], renderAssetCard,
  onCreate = async () => false, onDuplicate = async () => false,
  onSaveTemplate = async () => false, onRemoveTemplate = async () => false,
  onViewPlan, onImport, importLabel = 'Import plan', onDirty = () => {}, onBeforeBrowse = () => true,
  initialViewState = {},
} = {}) {
  const root = document.createElement('section');
  root.className = 'assets-workspace';
  const assets = drawing?.assets || [], floors = drawing?.floors || [];
  const availableTemplates = templates.slice();
  let query = String(initialViewState.query || ''), page = Math.max(0, Number(initialViewState.page) || 0);
  let favouritesOpen = !!initialViewState.favouritesOpen, editor = null, edited = false, pending = false, disposed = false;
  const pageSize = 6;
  root.innerHTML = `<div class="assets-workspace-heading"><h2>Assets <span class="assets-total">${assets.length}</span></h2>${onViewPlan ? '<button type="button" class="assets-plan-button" data-assets-action="plan">View plan</button>' : ''}</div><div class="assets-workspace-actions"><button type="button" class="primary assets-create-button" data-assets-action="create">+ Create asset</button>${onImport ? `<button type="button" data-assets-action="import">${escape(importLabel)}</button>` : ''}</div><section class="assets-quick-add" aria-label="Quick add assets"><div class="assets-quick-heading"><h3>Quick add</h3><span>Choose equipment · add up to 100</span></div><div class="assets-quick-presets">${QUICK_TYPES.map(([type, label]) => `<button type="button" data-assets-action="preset" data-equipment-type="${type}" aria-label="Quick add ${label}"><span aria-hidden="true">+</span>${label}</button>`).join('')}</div></section><p class="assets-status" role="status" hidden></p><div class="assets-editor-slot"></div><details class="assets-favourites"${favouritesOpen ? ' open' : ''}><summary>Favourite assets <span>${availableTemplates.length}</span></summary><div class="assets-template-grid"></div></details><div class="assets-search"><label>Search assets<input type="search" aria-label="Search assets" placeholder="Reference, equipment or location" value="${escape(query)}"></label></div><div class="assets-register"></div>`;
  const status = root.querySelector('.assets-status'), editorSlot = root.querySelector('.assets-editor-slot');
  const favouriteList = root.querySelector('.assets-template-grid'), register = root.querySelector('.assets-register');

  function announce(message, error = false) {
    if (disposed) return;
    status.hidden = !message;
    status.textContent = message;
    status.classList.toggle('is-error', error);
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  function setBusy(value) {
    pending = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button, input, select, textarea').forEach(control => {
      if (value) { control.dataset.assetsPreviouslyDisabled = String(control.disabled); control.disabled = true; }
      else if (control.dataset.assetsPreviouslyDisabled !== undefined) { control.disabled = control.dataset.assetsPreviouslyDisabled === 'true'; delete control.dataset.assetsPreviouslyDisabled; }
    });
  }
  function canLeave() {
    if (disposed) return true;
    if (pending) { announce('Saving this asset change. Please wait.', true); return false; }
    if (edited && !confirm('Discard the unsaved asset details?')) return false;
    return true;
  }
  function beforeBrowse() { return !disposed && !pending && onBeforeBrowse() !== false; }
  function discardEditor() { editor = null; edited = false; onDirty(false); renderEditor(); }
  function beforeWrite() {
    if (!beforeBrowse() || !canLeave()) return false;
    if (editor) discardEditor();
    return true;
  }
  function input(name, label, { required = false, max = 200 } = {}) {
    return `<label>${escape(label)}<input name="${name}" value="${escape(editor.values[name])}" maxlength="${max}"${required ? ' required' : ''}></label>`;
  }
  function quantity() { return Number(editor?.quantity); }
  function updatePreview() {
    if (!editor) return;
    const form = editorSlot.querySelector('form'), count = quantity();
    const validCount = Number.isInteger(count) && count >= 1 && count <= 100;
    const plural = QUICK_TYPES.find(([type]) => type === editor.values.type)?.[1];
    const equipment = count === 1 ? editor.values.typeName || 'asset' : plural || `${editor.values.typeName || 'Asset'} assets`;
    setText(form.querySelector('.assets-quantity-title'), `+ ${validCount ? count : '–'} ${equipment}`);
    setText(form.querySelector('[type="submit"]'), editor.assetId
      ? count === 1 ? 'Create duplicate' : `Create ${validCount ? count : ''} duplicates`.replace('  ', ' ')
      : count === 1 ? 'Add asset' : `Add ${validCount ? count : ''} assets`.replace('  ', ' '));
    const preview = form.querySelector('.assets-reference-preview');
    try {
      if (!validCount) throw Error('Choose a whole number from 1 to 100.');
      if (!editor.values.type) throw Error('Choose equipment to generate its references.');
      if (!editor.values.reference.trim()) throw Error('Enter the first asset reference.');
      const references = previewAssetReferences(assets, editor.values.reference, count);
      setText(preview, `References: ${references.slice(0, 3).join(' · ')}${references.length > 3 ? ` … ${references.at(-1)}` : ''}`);
    } catch (error) { setText(preview, error.message); }
  }
  function suggestReference() {
    if (!editor.autoReference || !editor.values.type) return;
    const seed = `${(editor.values.typeName || editor.values.type).slice(0, 196)} 001`;
    editor.values.reference = previewAssetReferences(assets, seed, 1)[0];
    editorSlot.querySelector('[name="reference"]').value = editor.values.reference;
  }
  function renderEditor() {
    if (!editor) { editorSlot.replaceChildren(); return; }
    const values = editor.values, choices = [...TYPES];
    if (values.type && values.type !== 'custom' && !choices.some(([type]) => type === values.type)) choices.push([values.type, values.typeName || values.type]);
    const extraFields = !editor.quick && ['manufacturer', 'model', 'description'].some(key => values[key]);
    editorSlot.innerHTML = `<form class="assets-create-form" novalidate><div class="assets-editor-heading"><h3>${editor.assetId ? 'Duplicate asset' : 'Create assets'}</h3><button type="button" data-assets-action="cancel">Cancel</button></div><div class="assets-quantity"><div class="assets-quantity-heading"><strong class="assets-quantity-title"></strong><label>Quantity<input type="number" name="quantity" aria-label="Quantity" min="1" max="100" step="1" inputmode="numeric" value="${escape(editor.quantity)}" required></label></div><input type="range" name="quantitySlider" aria-label="Quantity slider" min="1" max="100" step="1" value="${escape(editor.quantity)}"><div class="assets-quantity-scale" aria-hidden="true"><span>1 asset</span><span>100 assets</span></div></div><details class="assets-placement-fields"${editor.quick ? '' : ' open'}><summary>Asset details</summary><div class="assets-editor-fields">${input('reference', 'Asset reference', { required: true })}<label>Equipment type<select name="type" required><option value="">Choose equipment type</option>${choices.map(([type, name]) => `<option value="${escape(type)}"${type === values.type ? ' selected' : ''}>${escape(name)}</option>`).join('')}<option value="custom"${values.type === 'custom' ? ' selected' : ''}>Custom equipment</option></select></label><label class="assets-custom-type"${values.type === 'custom' ? '' : ' hidden'}>Custom equipment type<input name="customType" maxlength="200" value="${escape(values.typeName)}"${values.type === 'custom' ? ' required' : ''}></label><label>Floor (optional)<select name="floorId"><option value="">Not assigned</option>${floors.map(floor => `<option value="${escape(floor.id)}"${floor.id === values.floorId ? ' selected' : ''}>${escape(floor.name)}</option>`).join('')}</select></label>${input('location', 'Location (optional)', { max: 500 })}</div></details><p class="assets-reference-preview" role="status" aria-live="polite"></p><details class="assets-extra-fields"${extraFields ? ' open' : ''}><summary>Equipment details (optional)</summary><div class="assets-editor-fields">${input('manufacturer', 'Manufacturer')}${input('model', 'Model')}<label class="assets-description">Description<textarea name="description" maxlength="5000" rows="3">${escape(values.description)}</textarea></label></div></details><p class="assets-editor-error" role="alert" hidden></p><div class="assets-editor-footer"><span>Each new asset starts as Not tested.</span><button type="submit" class="primary"></button></div></form>`;
    const form = editorSlot.querySelector('form');
    form.elements.type.value = values.type;
    form.elements.floorId.value = values.floorId;
    const changed = event => {
      if (disposed || pending) return;
      const name = event.target.name;
      if (name === 'quantitySlider') form.elements.quantity.value = event.target.value;
      if (name === 'quantity' && Number.isInteger(Number(event.target.value)) && Number(event.target.value) >= 1 && Number(event.target.value) <= 100)
        form.elements.quantitySlider.value = event.target.value;
      if (name === 'reference') editor.autoReference = false;
      if (name === 'type') {
        const custom = form.querySelector('.assets-custom-type');
        custom.hidden = event.target.value !== 'custom';
        custom.querySelector('input').required = !custom.hidden;
        if (event.target.value !== editor.values.type && event.target.value === 'custom') form.elements.customType.value = '';
      }
      collect();
      if (name === 'type' || name === 'customType') suggestReference();
      // Safari can cancel a tap if blur replaces its target text node. Only update
      // the preview when its inputs change, and retain unchanged button text.
      if (['quantity', 'quantitySlider', 'reference', 'type', 'customType'].includes(name)) updatePreview();
      edited = true; onDirty(true);
    };
    form.addEventListener('input', changed);
    form.addEventListener('change', changed);
    form.addEventListener('submit', save);
    updatePreview();
    // Focus a button for quick creation so opening a preset does not raise a phone keyboard.
    (values.type ? form.querySelector('[type="submit"]') : form.elements.type).focus({ preventScroll: true });
    form.scrollIntoView?.({ block: 'nearest' });
  }
  function collect() {
    if (!editor) return;
    const form = editorSlot.querySelector('form');
    const type = form.elements.type.value;
    for (const name of ['reference', 'floorId', 'location', 'manufacturer', 'model', 'description']) editor.values[name] = form.elements[name].value;
    const known = TYPES.find(([code]) => code === type);
    editor.values.typeName = type === 'custom' ? form.elements.customType.value
      : type === editor.values.type && editor.values.typeName ? editor.values.typeName : known?.[1] || type;
    editor.values.type = type;
    editor.quantity = form.elements.quantity.value;
  }
  function begin(source = {}, assetId = null, fromTemplate = false) {
    if (!beforeBrowse() || !canLeave()) return;
    const values = blank();
    for (const key of templateFields) values[key] = String(source[key] || '');
    if (!fromTemplate) { values.floorId = source.floorId || ''; values.location = source.location || ''; }
    let referenceError = '';
    try {
      if (assetId) values.reference = nextAssetReference(assets, source.reference || source.typeName || source.type);
      else if (values.type) values.reference = previewAssetReferences(assets, `${(values.typeName || values.type).slice(0, 196)} 001`, 1)[0];
    } catch (error) { values.reference = source.reference || ''; referenceError = error.message; }
    editor = { assetId, values, quantity: '1', autoReference: !assetId, quick: !!values.type }; edited = false; onDirty(false); announce(''); renderEditor();
    if (referenceError) {
      editorSlot.querySelector('.assets-placement-fields').open = true;
      const problem = editorSlot.querySelector('.assets-editor-error'); problem.hidden = false; problem.textContent = referenceError;
    }
  }
  async function save(event) {
    event.preventDefault(); event.stopPropagation();
    if (disposed || pending || !editor) return;
    collect();
    const form = event.currentTarget, problem = form.querySelector('.assets-editor-error'), count = quantity();
    const values = Object.fromEntries(Object.entries(editor.values).map(([key, value]) => [key, value.trim()]));
    let failure = !Number.isInteger(count) || count < 1 || count > 100 ? 'Choose a whole number from 1 to 100.'
      : !values.type ? 'Choose an equipment type.' : !values.reference ? 'Enter an asset reference.'
      : values.type === 'custom' && !values.typeName ? 'Enter the custom equipment type.' : '';
    if (!failure) {
      try { previewAssetReferences(assets, values.reference, count); }
      catch (error) { failure = error.message; }
    }
    if (!failure && !form.checkValidity()) failure = 'Check the asset details before saving.';
    if (failure) {
      problem.hidden = false; problem.textContent = failure;
      const field = !Number.isInteger(count) || count < 1 || count > 100 ? form.elements.quantity
        : !values.type ? form.elements.type : !values.reference || /reference/i.test(failure) ? form.elements.reference
          : values.type === 'custom' && !values.typeName ? form.elements.customType : form.querySelector(':invalid') || form.elements.reference;
      for (let ancestor = field.parentElement; ancestor && ancestor !== form; ancestor = ancestor.parentElement)
        if (ancestor.tagName === 'DETAILS') ancestor.open = true;
      field.focus();
      return;
    }
    problem.hidden = true;
    setBusy(true);
    try {
      const success = editor.assetId ? await onDuplicate(editor.assetId, values, count) : await onCreate(values, count);
      if (disposed) return;
      if (success !== true) throw Error('The assets were not saved. Your details are still here; try again.');
      editor = null; edited = false; onDirty(false); renderEditor(); announce(count === 1 ? 'Asset saved.' : `${count} assets saved.`);
    } catch (error) {
      if (!disposed) { problem.hidden = false; problem.textContent = error?.message || 'The assets could not be saved. Try again.'; edited = true; onDirty(true); }
    } finally { if (!disposed) setBusy(false); }
  }
  async function favourite(asset) {
    if (!beforeWrite()) return;
    const match = availableTemplates.find(template => matchesTemplate(asset, template));
    setBusy(true); announce('');
    try {
      const success = match ? await onRemoveTemplate(match.id) : await onSaveTemplate(asset);
      if (disposed) return;
      if (success !== true) throw Error('The favourite was not saved. Try again.');
      announce(match ? 'Favourite removed. Existing assets are unchanged.' : 'Favourite saved for another asset.');
    } catch (error) { announce(error?.message || 'The favourite could not be saved.', true); }
    finally { if (!disposed) setBusy(false); }
  }
  function renderTemplates() {
    if (!availableTemplates.length) { favouriteList.innerHTML = '<p class="assets-template-empty">Star an asset to reuse its equipment details in another job.</p>'; return; }
    favouriteList.replaceChildren();
    for (const template of availableTemplates) {
      const card = document.createElement('article'); card.className = 'assets-template-card'; card.dataset.templateId = template.id;
      const name = template.name || template.typeName || template.type;
      card.innerHTML = `<div><strong>${escape(name)}</strong>${[template.manufacturer, template.model].filter(Boolean).length ? `<small>${escape([template.manufacturer, template.model].filter(Boolean).join(' · '))}</small>` : ''}</div><div class="assets-template-actions"><button type="button" data-assets-action="use-template" aria-label="Use ${escape(name)}">Use</button><button type="button" data-assets-action="remove-template" aria-label="Remove favourite ${escape(name)}">${star}</button></div>`;
      favouriteList.append(card);
    }
  }
  function renderRegister() {
    const normalized = query.trim().toLocaleLowerCase();
    const visible = assets.filter(asset => !normalized || [asset.reference, asset.type, asset.typeName, asset.floorName, asset.location, asset.manufacturer, asset.model].some(value => String(value || '').toLocaleLowerCase().includes(normalized)));
    const pages = Math.max(1, Math.ceil(visible.length / pageSize)); page = Math.min(page, pages - 1);
    register.replaceChildren();
    const count = document.createElement('p'); count.className = 'assets-register-count'; count.setAttribute('role', 'status');
    count.textContent = `${visible.length} of ${assets.length} assets${pages > 1 ? ` · Page ${page + 1} of ${pages}` : ''}`; register.append(count);
    if (!visible.length) {
      const empty = document.createElement('div'); empty.className = 'assets-empty';
      empty.innerHTML = assets.length ? '<strong>No matching assets</strong><p>Try another reference, equipment type or location.</p>' : '<strong>Ready for your first asset</strong><p>Create equipment for this job, reuse a favourite or import a plan.</p>';
      register.append(empty); return;
    }
    const list = document.createElement('div'); list.className = 'assets-register-list';
    for (const asset of visible.slice(page * pageSize, (page + 1) * pageSize)) {
      const wrapper = document.createElement('div'); wrapper.className = 'assets-register-item'; wrapper.dataset.assetId = asset.id;
      const card = renderAssetCard?.(asset);
      if (card) wrapper.append(card);
      else { const fallback = document.createElement('div'); fallback.className = 'assets-basic-card'; fallback.innerHTML = `<strong>${escape(asset.reference || asset.typeName || asset.type)}</strong><small>${escape(asset.typeName || asset.type)}${asset.location ? ` · ${escape(asset.location)}` : ''}</small>`; wrapper.append(fallback); }
      const match = availableTemplates.find(template => matchesTemplate(asset, template));
      const actions = document.createElement('div'); actions.className = 'assets-item-actions';
      actions.innerHTML = `<button type="button" data-assets-action="favourite" aria-pressed="${!!match}" aria-label="${match ? 'Remove' : 'Save'} ${escape(asset.reference || asset.type)} ${match ? 'from favourite assets' : 'as favourite asset'}">${star}<span>Favourite</span></button><button type="button" data-assets-action="duplicate" aria-label="Duplicate ${escape(asset.reference || asset.type)}">${copy}<span>Duplicate</span></button>`;
      wrapper.append(actions); list.append(wrapper);
    }
    register.append(list);
    if (pages > 1) {
      const pager = document.createElement('div'); pager.className = 'assets-pagination';
      pager.innerHTML = `<button type="button" data-assets-action="previous"${page === 0 ? ' disabled' : ''}>Previous assets</button><span>${page * pageSize + 1}–${Math.min((page + 1) * pageSize, visible.length)} of ${visible.length}</span><button type="button" data-assets-action="next"${page + 1 === pages ? ' disabled' : ''}>Next assets</button>`; register.append(pager);
    }
  }
  root.querySelector('.assets-favourites').addEventListener('toggle', event => { favouritesOpen = event.currentTarget.open; });
  root.querySelector('[aria-label="Search assets"]').addEventListener('input', event => {
    if (!beforeBrowse()) { event.target.value = query; return; }
    query = event.target.value; page = 0; renderRegister();
  });
  root.addEventListener('click', async event => {
    const control = event.target.closest('[data-assets-action]');
    if (!control || pending || disposed) return;
    const action = control.dataset.assetsAction;
    if (action === 'create') { begin(); return; }
    if (action === 'preset') { const type = TYPES.find(([code]) => code === control.dataset.equipmentType); if (type) begin({ type: type[0], typeName: type[1] }); return; }
    if (action === 'cancel') { if (!canLeave()) return; discardEditor(); root.querySelector('[data-assets-action="create"]').focus(); return; }
    if (action === 'plan' || action === 'import') { if (!beforeWrite()) return; (action === 'plan' ? onViewPlan : onImport)?.(); return; }
    if (action === 'previous' || action === 'next') { if (!beforeBrowse()) return; page += action === 'next' ? 1 : -1; renderRegister(); return; }
    const assetId = control.closest('.assets-register-item')?.dataset.assetId;
    const asset = assets.find(value => value.id === assetId);
    if (action === 'duplicate' && asset) { begin(asset, asset.id); return; }
    if (action === 'favourite' && asset) { await favourite(asset); return; }
    const templateId = control.closest('[data-template-id]')?.dataset.templateId;
    const template = availableTemplates.find(value => value.id === templateId);
    if (action === 'use-template' && template) { begin(template, null, true); return; }
    if (action === 'remove-template' && template && beforeWrite()) {
      setBusy(true);
      try { if (await onRemoveTemplate(template.id) !== true) throw Error('The favourite could not be removed. Try again.'); announce('Favourite removed. Existing assets are unchanged.'); }
      catch (error) { announce(error?.message || 'The favourite could not be removed.', true); }
      finally { if (!disposed) setBusy(false); }
    }
  });
  renderTemplates(); renderRegister();
  root.getViewState = () => ({ query, page, favouritesOpen: root.querySelector('.assets-favourites').open });
  root.hasUnsavedChanges = () => !disposed && (edited || pending);
  root.confirmLeave = canLeave;
  root.dispose = () => { disposed = true; };
  return root;
}
