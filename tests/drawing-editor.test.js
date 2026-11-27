import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importZoneSketch } from "../src/zone-import.js";
import { newSite } from "../src/model.js";
import {
  createDrawingDraft,
  updateDrawingDevice,
  addDrawingDevice,
  removeDrawingDevice,
  addDrawingWall,
  updateDrawingWall,
  addDrawingRoom,
  addDrawingLabel,
  updateDrawingLabel,
  removeDrawingObject,
  renameDrawingFloor,
  addDrawingFloor,
  createDrawingRevision,
  buildEditableZoneSketch,
} from "../src/drawing-editor.js";
const source = JSON.parse(
  await readFile(
    new URL("../public/demo.zonesketch.json", import.meta.url),
    "utf8",
  ),
);
const initial = async () =>
  (await importZoneSketch(source, { siteId: "editor-site" })).drawing;

test("working edits preserve stable assets, original source, earlier drawing and issued snapshots", async () => {
  const original = await initial(),
    before = structuredClone(original);
  const draft = createDrawingDraft(original, { siteId: "editor-site" }),
    asset = draft.assets[0];
  updateDrawingDevice(draft, asset.id, {
    reference: "FAP-EDITED",
    x: 0.33,
    y: 0.44,
  });
  const revised = createDrawingRevision(draft, {
    revision: "Jobs B03",
    engineer: "Synthetic Engineer",
    at: "2026-11-13T12:00:00Z",
  });
  assert.notEqual(revised.id, original.id);
  assert.equal(revised.basedOnDrawingId, original.id);
  assert.equal(revised.assets[0].id, original.assets[0].id);
  assert.equal(revised.assets[0].x, 0.33);
  assert.equal(
    revised.floors[0].data.symbols.find((s) => s.id === asset.sourceId)
      .reference,
    "FAP-EDITED",
  );
  assert.deepEqual(revised.source, source);
  assert.deepEqual(revised.issuedSnapshots, original.issuedSnapshots);
  assert.deepEqual(original, before);
  assert.equal(revised.editedBy, "Synthetic Engineer");
  assert.equal(revised._editingSiteId, undefined);
  assert.equal(revised.revisions.at(-1).at, "2026-11-13T12:00:00Z");
});

test("equipment and geometry edits export the real current schema and reimport correctly", async () => {
  const original = await initial(),
    draft = createDrawingDraft(original, { siteId: "editor-site" }),
    floorId = draft.floors[0].id;
  const added = addDrawingDevice(draft, floorId, {
    type: "heat",
    reference: "HD-NEW",
    x: 0.6,
    y: 0.7,
  });
  const removed = draft.assets.find((a) => a.reference === "SD-01");
  removeDrawingDevice(draft, removed.id);
  const wall = addDrawingWall(draft, floorId, [
    { x: 0.12, y: 0.2 },
    { x: 0.8, y: 0.2 },
  ]);
  updateDrawingWall(draft, floorId, wall.id, [
    { x: 0.12, y: 0.21 },
    { x: 0.8, y: 0.21 },
    { x: 0.8, y: 0.7 },
  ]);
  addDrawingRoom(
    draft,
    floorId,
    { x: 0.1, y: 0.1 },
    { x: 0.3, y: 0.3 },
    "New store",
  );
  const label = addDrawingLabel(draft, floorId, {
    text: "New label",
    x: 0.4,
    y: 0.5,
  });
  updateDrawingLabel(draft, floorId, label.id, {
    text: "Updated label",
    x: 0.45,
    y: 0.55,
  });
  renameDrawingFloor(draft, floorId, "Renamed ground floor");
  const revised = createDrawingRevision(draft, { revision: "EDIT-2" }),
    exported = buildEditableZoneSketch(revised);
  assert.equal(exported.format, "ZoneSketchByWill");
  assert.equal(exported.version, 1);
  assert.equal(exported.project.meta.revision, "EDIT-2");
  assert.deepEqual(
    exported.project.floors[0].data.walls,
    revised.floors[0].data.walls,
  );
  assert.deepEqual(
    exported.project.symbols,
    exported.project.floors.find((f) => f.id === exported.project.activeFloor)
      .data.symbols,
  );
  assert.deepEqual(exported.project.issuedAsFits, source.project.issuedAsFits);
  const reimported = await importZoneSketch(exported, {
    siteId: "editor-site",
  });
  assert(
    reimported.drawing.assets.some(
      (a) => a.id === added.id && a.reference === "HD-NEW",
    ),
  );
  assert(!reimported.drawing.assets.some((a) => a.id === removed.id));
  assert.equal(reimported.drawing.floors[0].name, "Renamed ground floor");
  assert(
    reimported.drawing.floors[0].data.labels.some(
      (l) => l.text === "Updated label",
    ),
  );
});

test("manual drawings gain editable floors and geometry without invented equipment types", () => {
  const site = newSite("Synthetic manual site"),
    draft = createDrawingDraft(site.drawings[0], {
      siteId: site.id,
      siteName: site.name,
    });
  draft.systemType = "cctv";
  const floor = addDrawingFloor(draft, "Upper floor");
  const wall = addDrawingWall(draft, floor.id, [
    { x: 0, y: 0.5 },
    { x: 1, y: 0.5 },
  ]);
  removeDrawingObject(draft, floor.id, "walls", wall.id);
  addDrawingDevice(draft, floor.id, {
    type: "cctvFixed",
    reference: "CAM-01",
    x: 0.2,
    y: 0.3,
  });
  const revised = createDrawingRevision(draft),
    exported = buildEditableZoneSketch(revised);
  assert.equal(exported.project.site, site.name);
  assert.equal(exported.project.floors.length, 2);
  assert.equal(exported.project.floors[1].data.symbols[0].type, "cctvFixed");
  assert.equal(exported.project.floors[1].data.walls.length, 0);
  assert.throws(
    () => addDrawingDevice(draft, floor.id, { type: "Invented panel" }),
    /supported/,
  );
});

test("issued edits and invalid geometry are rejected without modifying prior evidence", async () => {
  const original = await initial(),
    draft = createDrawingDraft(original, { siteId: "editor-site" });
  const before = structuredClone(draft);
  assert.throws(
    () =>
      createDrawingDraft(
        { ...original, kind: "issued" },
        { siteId: "editor-site" },
      ),
    /read-only/,
  );
  assert.throws(
    () => updateDrawingDevice(draft, draft.assets[0].id, { x: -1, y: 2 }),
    /between 0 and 1/,
  );
  assert.throws(
    () => addDrawingWall(draft, draft.floors[0].id, [{ x: 0.2, y: 0.2 }]),
    /2–500/,
  );
  assert.throws(
    () =>
      addDrawingRoom(
        draft,
        draft.floors[0].id,
        { x: 0.2, y: 0.2 },
        { x: 0.2, y: 0.2 },
      ),
    /opposite/,
  );
  assert.throws(
    () => updateDrawingDevice(draft, draft.assets[0].id, { x: "", y: 0.5 }),
    /Enter both X and Y/,
  );
  assert.throws(
    () =>
      updateDrawingDevice(draft, draft.assets[0].id, { x: 0.2, y: Infinity }),
    /finite/,
  );
  assert.throws(
    () =>
      addDrawingDevice(draft, draft.floors[0].id, {
        type: "smoke",
        x: " ",
        y: 0.3,
      }),
    /Enter both X and Y/,
  );
  assert.deepEqual(draft, before);
});

test("one drawing model and editor support fire, intruder, CCTV and access without changing the selected discipline", async () => {
  for (const [systemType, type] of [
    ["fire", "smoke"],
    ["security", "secPir"],
    ["cctv", "cctvFixed"],
    ["access", "accessReader"],
  ]) {
    const original = await initial();
    original.systemType = systemType;
    original.source.project.systemType = systemType;
    const draft = createDrawingDraft(original, { siteId: "editor-site" });
    updateDrawingDevice(draft, draft.assets[0].id, {
      type,
      reference: "EDIT-" + systemType,
      x: 0.41,
      y: 0.52,
    });
    const revised = createDrawingRevision(draft),
      exported = buildEditableZoneSketch(revised);
    assert.equal(exported.project.systemType, systemType);
    assert.equal(exported.project.floors[0].data.symbols[0].type, type);
    assert.deepEqual(
      exported.project.floors[0].data.circuits,
      original.floors[0].data.circuits,
    );
    const reimported = await importZoneSketch(exported, {
      siteId: "editor-site",
    });
    assert.equal(reimported.drawing.systemType, systemType);
    assert(
      reimported.drawing.assets.some(
        (asset) =>
          asset.reference === "EDIT-" + systemType && asset.type === type,
      ),
    );
  }
});

test("manual drawings require a deliberate discipline selection rather than silently becoming fire drawings", () => {
  const site = newSite("Manual system"),
    draft = createDrawingDraft(site.drawings[0], { siteId: site.id });
  assert.equal(draft.systemType, "");
  assert.throws(() => createDrawingRevision(draft), /Choose a Drawing system/);
  assert.throws(
    () => buildEditableZoneSketch(site.drawings[0]),
    /Choose a Drawing system/,
  );
});

test("existing manual equipment stays unplaced until an engineer supplies its position", () => {
  const site = newSite("Unplaced manual equipment");
  site.drawings[0].systemType = "fire";
  site.drawings[0].assets.push({
    id: "manual-smoke",
    floorId: site.drawings[0].floors[0].id,
    floorName: "Ground floor",
    type: "smoke",
    reference: "UNPLACED-01",
    photos: [],
  });
  const draft = createDrawingDraft(site.drawings[0], {
    siteId: site.id,
    siteName: site.name,
  });
  assert.equal(draft.assets[0].x, undefined);
  assert.equal(draft.assets[0].y, undefined);
  assert.equal(draft.floors[0].data.symbols.length, 0);
  const unplacedRevision = createDrawingRevision(draft);
  assert.equal(unplacedRevision.assets[0].x, undefined);
  assert.throws(
    () => buildEditableZoneSketch(unplacedRevision),
    /Place equipment/,
  );
  updateDrawingDevice(draft, "manual-smoke", { x: 0.27, y: 0.63 });
  const placed = createDrawingRevision(draft),
    exported = buildEditableZoneSketch(placed);
  assert.equal(placed.assets[0].id, "manual-smoke");
  assert.equal(exported.project.floors[0].data.symbols[0].x, 0.27);
  assert.equal(exported.project.floors[0].data.symbols[0].y, 0.63);
  assert.equal(site.drawings[0].assets[0].x, undefined);
});
