import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importZoneSketch, parseZoneSketch, zoneSourceKeys} from '../src/zone-import.js';
const fixture = JSON.parse(await readFile(new URL('../public/demo.zonesketch.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(fixture);

test('current save maps source IDs, equipment, photos, geometry and immutable issued record', async () => {
  const original = copy(), result = await importZoneSketch(original, {siteId: 'site-test'});
  assert.equal(result.site.id, 'site-test'); assert.equal(result.site.name, 'Westfield Training Centre');
  assert.equal(result.drawing.assets.length, 4); assert.equal(result.summary.floors, 2);
  const panel = result.drawing.assets.find(a => a.reference === 'FAP-01');
  assert.equal(panel.sourceId, 'demo-panel'); assert.equal(panel.sourceFloorId, 'demo-ground');
  assert.equal(panel.photos.length, 1); assert.match(panel.photos[0].image, /^data:image\/png;base64,/);
  assert.equal(panel.drawingStatus, 'existing'); assert.equal(panel.status, undefined);
  assert(!result.drawing.assets.some(a => ['you', 'wall', 'door'].includes(a.type)));
  assert.deepEqual(result.drawing.source, original);
  assert.deepEqual(result.drawing.floors[0].data.circuits, original.project.floors[0].data.circuits);
  assert.equal(result.drawing.revision, 'B02'); assert.equal(result.drawing.issuedSnapshots[0].revision, 'A01');
  assert.notEqual(result.drawing.issuedSnapshots[0].assets.find(a => a.reference === 'SD-01').x, result.drawing.assets.find(a => a.reference === 'SD-01').x);
  result.drawing.floors[0].name = 'Changed'; assert.equal(original.project.floors[0].name, 'Ground floor');
});
test('legacy ZoneSketch marker is supported, identity does not depend on object key order or format marker', async () => {
  const legacy = copy(); legacy.format = 'ZoneSketch';
  const a = await importZoneSketch(fixture, {siteId: 'same-site'}), b = await importZoneSketch(legacy, {siteId: 'same-site'});
  assert.equal(a.drawing.id, b.drawing.id); assert.deepEqual(a.drawing.assets.map(a => a.id), b.drawing.assets.map(a => a.id));
  assert.deepEqual(zoneSourceKeys(legacy), ['zonesketch:floor:demo-ground', 'zonesketch:floor:demo-first']);
});
test('changed revision keeps equipment identity and creates a different drawing ID', async () => {
  const changed = copy(); changed.project.meta.revision = 'C03'; changed.project.floors[0].data.symbols[1].x = .45;
  const a = await importZoneSketch(fixture, {siteId: 'same-site'}), b = await importZoneSketch(changed, {siteId: 'same-site'});
  assert.notEqual(a.drawing.id, b.drawing.id); assert.deepEqual(a.drawing.assets.map(a => a.id), b.drawing.assets.map(a => a.id));
});
test('additional-work layout needs no zones and preserves joints, routes and setup', async () => {
  const file = copy(); file.project.fireWorkType = 'additional'; delete file.project.issuedAsFits;
  const floor = file.project.floors[0].data; floor.zones = []; floor.shapes = []; floor.circuits = [];
  floor.existingCables = [{id: 'cable-1', points: [{x: .1, y: .2}, {x: .9, y: .2}]}];
  floor.cableJoints = [{id: 'joint-1', x: .5, y: .2, attachment: {existingCableId: 'cable-1', segmentIndex: 0, t: .5}}];
  floor.additionalSetup = {startRef: {kind: 'joint', id: 'joint-1'}, returnRef: {kind: 'device', id: 'demo-panel'}, selectedIds: ['demo-smoke']};
  const result = await importZoneSketch(file);
  assert.equal(result.drawing.fireWorkType, 'additional'); assert.equal(result.summary.zones, 0);
  assert.deepEqual(result.drawing.floors[0].data, floor); assert.equal(result.summary.devices, 4);
});
test('standalone issued save is marked issued, and unsupported symbols are retained but excluded', async () => {
  const issued = copy(); issued.project = issued.project.issuedAsFits[0].project;
  issued.issuedAsFit = {id: 'demo-issue-a01', revision: 'A01', at: '2026-11-13T09:00:00Z', by: 'Demo engineer', note: 'Synthetic issue'};
  issued.project.floors[0].data.symbols.push({id: 'future', type: 'futureEquipment', x: .3, y: .3});
  const result = await importZoneSketch(issued);
  assert.equal(result.drawing.kind, 'issued'); assert.equal(result.summary.unknownSymbols, 1);
  assert.equal(result.drawing.assets.length, 4); assert(result.warnings.some(w => w.includes('unrecognised')));
  assert(result.drawing.source.project.floors[0].data.symbols.some(s => s.id === 'future'));
});
test('rejects invalid files before changing the caller input', () => {
  const invalids = [null, {}, '{', {...copy(), version: 2}, {...copy(), format: 'Jobs'}];
  const duplicate = copy(); duplicate.project.floors.push(duplicate.project.floors[0]); invalids.push(duplicate);
  const unsafePhoto = copy(); unsafePhoto.project.floors[0].data.symbols[0].photos[0].image = 'https://example.org/customer.jpg'; invalids.push(unsafePhoto);
  const brokenPhoto = copy(); brokenPhoto.project.floors[0].data.symbols[0].photos[0].image = 'data:image/png;base64,abc'; invalids.push(brokenPhoto);
  const invalidPosition = copy(); invalidPosition.project.floors[0].data.symbols[0].x = 2; invalids.push(invalidPosition);
  const nested = copy(); nested.project.issuedAsFits[0].project.issuedAsFits = structuredClone(nested.project.issuedAsFits); invalids.push(nested);
  const missing = copy(); delete missing.project.floors[0].data.walls; invalids.push(missing);
  for (const input of invalids) { const before = JSON.stringify(input); assert.throws(() => parseZoneSketch(input), /Invalid Zone Sketch save/); assert.equal(JSON.stringify(input), before); }
});

test('drawing reconciliation separates added, removed, moved and changed assets without modifying history', async () => {
  const {compareDrawings} = await import('../src/zone-import.js');
  const original = await importZoneSketch(fixture, {siteId: 'same-site'});
  const changed = copy();
  const symbols = changed.project.floors[0].data.symbols;
  symbols.find(a => a.reference === 'SD-01').x = .44;
  symbols.find(a => a.reference === 'FAP-01').reference = 'FAP-NEW';
  changed.project.floors[0].data.symbols = symbols.filter(a => a.reference !== 'MCP-01');
  changed.project.floors[0].data.symbols.push({id: 'new-smoke', type: 'smoke', reference: 'SD-02', x: .25, y: .25});
  changed.project.floors[1].name = 'Renamed first floor';
  const incoming = await importZoneSketch(changed, {siteId: 'same-site'});
  const oldJson = JSON.stringify(original.drawing), result = compareDrawings(original.drawing, incoming.drawing);
  assert.deepEqual(result.added.map(a => a.reference), ['SD-02']);
  assert.deepEqual(result.removed.map(a => a.reference), ['MCP-01']);
  assert.deepEqual(result.moved.map(a => a.reference), ['SD-01']);
  assert.deepEqual(result.changed.map(a => a.reference), ['FAP-NEW']);
  assert.deepEqual(result.unchanged.map(a => a.reference), ['HD-01']);
  assert.equal(result.floorsRenamed.length, 1); assert.equal(JSON.stringify(original.drawing), oldJson);
  assert.equal(compareDrawings(original.drawing, original.drawing).sameDrawing, true);
});
