import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAssetsWorkspace } from '../src/assets-workspace.js';
import { installToolboxDOM, mountToolbox, field, click, submit, until } from './helpers/toolbox-dom.js';

const source = {
  id: 'source-asset', reference: 'SD-01', type: 'smoke', typeName: 'Smoke detector',
  floorId: 'floor-a', floorName: 'Ground floor', location: 'Lobby',
  manufacturer: 'Synthetic maker', model: 'Training model', description: 'Synthetic equipment',
  x: 0.5, y: 0.2, photos: [{ id: 'not-a-template-photo' }], sourceId: 'original-drawing-id',
};
const drawing = { floors: [{ id: 'floor-a', name: 'Ground floor' }], assets: [source] };
const favourite = { id: 'template-a', name: 'Smoke detector', ...Object.fromEntries(['type', 'typeName', 'manufacturer', 'model', 'description'].map(key => [key, source[key]])) };
const type = (root, name, value) => field(root, `[name="${name}"]`, value, name === 'type' || name === 'floorId' ? 'change' : 'input');

test('standalone asset creation preserves failed drafts and sends only explicit equipment details', async t => {
  installToolboxDOM(t);
  const changes = [], calls = []; let succeed = false;
  const root = mountToolbox(t, renderAssetsWorkspace({
    onDirty: value => changes.push(value),
    onCreate: async values => { calls.push(values); return succeed; },
  }));
  click(root, '[data-assets-action="create"]');
  submit(root, '.assets-create-form');
  assert.match(root.querySelector('.assets-editor-error').textContent, /equipment/);
  assert.equal(calls.length, 0);
  type(root, 'reference', 'PIR-01'); type(root, 'type', 'custom'); type(root, 'customType', 'Training detector');
  type(root, 'location', 'Practice room');
  submit(root, '.assets-create-form');
  await until(() => root.querySelector('.assets-editor-error').textContent.includes('not saved'));
  assert.equal(root.querySelector('[name="reference"]').value, 'PIR-01');
  assert.equal(root.hasUnsavedChanges(), true);
  assert.deepEqual(calls[0], {
    reference: 'PIR-01', type: 'custom', typeName: 'Training detector', floorId: '', location: 'Practice room',
    manufacturer: '', model: '', description: '',
  });
  succeed = true; submit(root, '.assets-create-form');
  await until(() => !root.querySelector('.assets-create-form'));
  assert.equal(root.hasUnsavedChanges(), false);
  assert.equal(changes.at(-1), false);
  assert.match(root.querySelector('.assets-status').textContent, /saved/);
});

test('duplicate is ready to save with the next reference and does not forward old position, photos or source identity', async t => {
  installToolboxDOM(t); let received;
  const root = mountToolbox(t, renderAssetsWorkspace({ drawing, onDuplicate: async (...args) => { received = args; return true; } }));
  click(root, '[data-assets-action="duplicate"]');
  assert.equal(root.querySelector('[name="reference"]').value, 'SD-02');
  assert.equal(root.querySelector('[name="manufacturer"]').value, source.manufacturer);
  assert.equal(root.querySelector('[name="location"]').value, 'Lobby');
  assert.equal(document.activeElement, root.querySelector('[type="submit"]'), 'quick duplicate does not open the keyboard');
  assert.equal(root.hasUnsavedChanges(), false);
  submit(root, '.assets-create-form');
  await until(() => !!received);
  assert.equal(received[0], source.id);
  assert.equal(received[1].reference, 'SD-02');
  assert.equal(received[1].floorId, 'floor-a');
  assert.equal(received[2], 1);
  for (const key of ['id', 'x', 'y', 'photos', 'sourceId', 'results']) assert.equal(Object.hasOwn(received[1], key), false);
});

test('favourite reuse excludes location and suggests a fresh reference', t => {
  installToolboxDOM(t);
  const root = mountToolbox(t, renderAssetsWorkspace({ drawing, templates: [favourite] }));
  root.querySelector('.assets-favourites').open = true;
  click(root, '[data-assets-action="use-template"]');
  assert.equal(root.querySelector('[name="reference"]').value, 'Smoke detector 001');
  assert.equal(root.querySelector('[name="floorId"]').value, '');
  assert.equal(root.querySelector('[name="location"]').value, '');
  assert.equal(root.querySelector('[name="model"]').value, source.model);
  assert.equal(root.querySelector('[name="type"]').value, 'smoke');
  assert.equal(root.querySelector('[data-assets-action="favourite"]').getAttribute('aria-pressed'), 'true');
});

test('template writes ask before discarding asset edits and leave cancelled drafts intact', async t => {
  installToolboxDOM(t); let removals = 0;
  const root = mountToolbox(t, renderAssetsWorkspace({ drawing, templates: [favourite], onRemoveTemplate: async () => { removals++; return true; } }));
  click(root, '[data-assets-action="create"]'); type(root, 'reference', 'New unsaved asset');
  globalThis.confirm = () => false;
  click(root, '[data-assets-action="favourite"]');
  assert.equal(removals, 0);
  assert.equal(root.querySelector('[name="reference"]').value, 'New unsaved asset');
  root.querySelector('.assets-favourites').open = true;
  click(root, '[data-assets-action="remove-template"]');
  assert.equal(removals, 0);
  globalThis.confirm = () => true;
  click(root, '[data-assets-action="remove-template"]');
  await until(() => removals === 1);
  assert.equal(root.querySelector('.assets-create-form'), null);
  assert.equal(root.hasUnsavedChanges(), false);
});

test('search and pagination preserve supplied card handlers and can be restored after parent save', t => {
  installToolboxDOM(t); let cardClicks = 0, browseAllowed = true;
  const many = { floors: [], assets: Array.from({ length: 14 }, (_, index) => ({ ...source, id: `asset-${index}`, reference: `Detector ${index}` })) };
  const make = initialViewState => renderAssetsWorkspace({ drawing: many, initialViewState, onBeforeBrowse: () => browseAllowed, renderAssetCard: asset => {
    const button = document.createElement('button'); button.className = 'supplied-card'; button.textContent = asset.reference; button.onclick = () => cardClicks++; return button;
  } });
  let root = mountToolbox(t, make());
  click(root, '[data-assets-action="next"]');
  assert.match(root.querySelector('.assets-register-count').textContent, /Page 2/);
  click(root, '.supplied-card'); assert.equal(cardClicks, 1);
  const view = root.getViewState(); root.dispose(); root.remove();
  root = mountToolbox(t, make(view));
  assert.match(root.querySelector('.assets-register-count').textContent, /Page 2/);
  browseAllowed = false; field(root, '[aria-label="Search assets"]', 'Detector 13');
  assert.equal(root.querySelector('[aria-label="Search assets"]').value, '');
  browseAllowed = true; field(root, '[aria-label="Search assets"]', 'Detector 13');
  assert.equal(root.querySelectorAll('.assets-register-item').length, 1);
  assert.equal(root.querySelector('.supplied-card').textContent, 'Detector 13');
});

test('quick presets number a whole batch, keep quantity controls in sync and send one save', async t => {
  installToolboxDOM(t); const calls = [];
  const used = { floors: [], assets: [{ ...source, reference: 'Smoke detector 001' }, { ...source, id: 'another', reference: 'Smoke detector 003' }] };
  const root = mountToolbox(t, renderAssetsWorkspace({ drawing: used, onCreate: async (...args) => { calls.push(args); return true; } }));
  click(root, '[aria-label="Quick add Smoke detectors"]');
  assert.equal(root.querySelector('[name="reference"]').value, 'Smoke detector 002');
  assert.equal(root.querySelector('[name="type"]').value, 'smoke');
  assert.equal(document.activeElement, root.querySelector('[type="submit"]'));
  field(root, '[name="quantitySlider"]', 5);
  assert.equal(root.querySelector('[name="quantity"]').value, '5');
  assert.match(root.querySelector('.assets-reference-preview').textContent, /Smoke detector 002 · Smoke detector 004 · Smoke detector 005 … Smoke detector 007/);
  assert.equal(root.querySelector('[type="submit"]').textContent, 'Add 5 assets');
  field(root, '[name="quantity"]', 100);
  assert.equal(root.querySelector('[name="quantitySlider"]').value, '100');
  assert.match(root.querySelector('.assets-reference-preview').textContent, /Smoke detector 102/);
  submit(root, '.assets-create-form');
  await until(() => !root.querySelector('.assets-create-form'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 100);
  assert.equal(calls[0][0].reference, 'Smoke detector 002');
  assert.equal(calls[0][0].typeName, 'Smoke detector');
});

test('invalid quantities never save and failed batch saves retain the entire draft for retry or cancel', async t => {
  installToolboxDOM(t); const calls = []; let succeeds = false;
  const root = mountToolbox(t, renderAssetsWorkspace({ onCreate: async (...args) => { calls.push(args); return succeeds; } }));
  click(root, '[aria-label="Quick add PIR detectors"]');
  type(root, 'location', 'Training room');
  for (const invalid of ['0', '101', '1.5', '']) {
    field(root, '[name="quantity"]', invalid); submit(root, '.assets-create-form');
    assert.match(root.querySelector('.assets-editor-error').textContent, /whole number from 1 to 100/);
    assert.equal(calls.length, 0);
  }
  field(root, '[name="quantity"]', 12); submit(root, '.assets-create-form');
  await until(() => root.querySelector('.assets-editor-error').textContent.includes('not saved'));
  assert.equal(root.querySelector('[name="quantity"]').value, '12');
  assert.equal(root.querySelector('[name="quantitySlider"]').value, '12');
  assert.equal(root.querySelector('[name="location"]').value, 'Training room');
  assert.match(root.querySelector('.assets-reference-preview').textContent, /PIR detector 012/);
  globalThis.confirm = () => false;
  click(root, '[data-assets-action="cancel"]');
  assert.ok(root.querySelector('.assets-create-form'));
  succeeds = true; submit(root, '.assets-create-form');
  await until(() => !root.querySelector('.assets-create-form'));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], calls[0]);
  click(root, '[aria-label="Quick add Cameras"]');
  click(root, '[data-assets-action="cancel"]');
  assert.equal(root.querySelector('.assets-create-form'), null, 'unchanged generated values can be cancelled immediately');
  assert.equal(calls.length, 2);
});

test('duplicate batch preserves the imported equipment label and optional details without copying evidence', async t => {
  installToolboxDOM(t); let received;
  const original = { ...source, typeName: 'Optical smoke detector' };
  const root = mountToolbox(t, renderAssetsWorkspace({ drawing: { ...drawing, assets: [original] }, onDuplicate: async (...args) => { received = args; return true; } }));
  click(root, '[data-assets-action="duplicate"]');
  field(root, '[name="quantity"]', 3);
  assert.equal(root.querySelector('[type="submit"]').textContent, 'Create 3 duplicates');
  assert.match(root.querySelector('.assets-reference-preview').textContent, /SD-02 · SD-03 · SD-04/);
  submit(root, '.assets-create-form');
  await until(() => !!received);
  assert.equal(received[2], 3);
  assert.equal(received[1].typeName, 'Optical smoke detector');
  assert.equal(received[1].location, 'Lobby');
  assert.equal(received[1].floorId, 'floor-a');
  assert.equal(received[1].manufacturer, source.manufacturer);
  assert.equal(received[1].model, source.model);
  assert.equal(received[1].description, source.description);
  assert.equal(Object.hasOwn(received[1], 'photos'), false);
  assert.equal(source.reference, 'SD-01');
});

test('finishing a text edit preserves the submit target through blur so the first tap can save', async t => {
  installToolboxDOM(t); let saves = 0;
  const root = mountToolbox(t, renderAssetsWorkspace({ onCreate: async () => { saves++; return true; } }));
  click(root, '[data-assets-action="create"]');
  type(root, 'reference', 'TRAIN-01'); type(root, 'type', 'custom'); type(root, 'customType', 'Training device');
  const button = root.querySelector('[type="submit"]'), target = button.firstChild;
  type(root, 'description', 'Inspect this device');
  root.querySelector('[name="description"]').dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(button.firstChild, target, 'description blur must not replace the pending tap target');
  root.querySelector('[name="customType"]').dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(button.firstChild, target, 'unchanged preview inputs must also preserve the tap target');
  click(root, '[type="submit"]');
  await until(() => saves === 1);
});
