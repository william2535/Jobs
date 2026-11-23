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
  assert.match(root.querySelector('.assets-editor-error').textContent, /reference/);
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

test('duplicate asks for a unique reference and does not forward old position, photos or source identity', async t => {
  installToolboxDOM(t); let received;
  const root = mountToolbox(t, renderAssetsWorkspace({ drawing, onDuplicate: async (...args) => { received = args; return true; } }));
  click(root, '[data-assets-action="duplicate"]');
  assert.equal(root.querySelector('[name="reference"]').value, '');
  assert.equal(root.querySelector('[name="manufacturer"]').value, source.manufacturer);
  assert.equal(root.querySelector('[name="location"]').value, 'Lobby');
  type(root, 'reference', ' sd-01 '); submit(root, '.assets-create-form');
  assert.match(root.querySelector('.assets-editor-error').textContent, /already used/);
  assert.equal(received, undefined);
  type(root, 'reference', 'SD-02'); submit(root, '.assets-create-form');
  await until(() => !!received);
  assert.equal(received[0], source.id);
  assert.equal(received[1].reference, 'SD-02');
  assert.equal(received[1].floorId, 'floor-a');
  for (const key of ['id', 'x', 'y', 'photos', 'sourceId', 'results']) assert.equal(Object.hasOwn(received[1], key), false);
});

test('favourite reuse excludes location and requires a fresh reference', t => {
  installToolboxDOM(t);
  const root = mountToolbox(t, renderAssetsWorkspace({ drawing, templates: [favourite] }));
  root.querySelector('.assets-favourites').open = true;
  click(root, '[data-assets-action="use-template"]');
  assert.equal(root.querySelector('[name="reference"]').value, '');
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
