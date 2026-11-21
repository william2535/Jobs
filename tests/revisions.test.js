import test from "node:test";
import assert from "node:assert/strict";
import { newSite, newJob } from "../src/model.js";
import {
  applyDrawingToJob,
  alignDrawingAssetsToSite,
} from "../src/revisions.js";

function fixture() {
  const site = newSite("Synthetic revision site");
  const drawing = site.drawings[0];
  drawing.assets = ["A", "B"].map((reference) => ({
    id: reference,
    reference,
    type: "smoke",
    floorId: drawing.floors[0].id,
    photos: [],
  }));
  const visit = newJob(site);
  visit.results[0].state = "Satisfactory";
  visit.results[0].observations = "Engineer recorded observation.";
  visit.results[1].notes = "Keep removed-device evidence.";
  visit.results[1].photos = [
    { id: "evidence", image: "data:image/png;base64,eA==" },
  ];
  const earlier = newJob(site);
  return {
    state: { sites: [site], jobs: [visit, earlier] },
    site,
    drawing,
    visit,
    earlier,
  };
}

test("drawing update retains visit evidence, archives removed devices, and starts added devices Not tested", () => {
  const { state, drawing, visit, earlier } = fixture();
  const before = structuredClone(state);
  const edited = structuredClone(drawing);
  edited.id = "updated-drawing";
  edited.revision = "Jobs 2";
  edited.assets = [
    { ...edited.assets[0], x: 0.4, y: 0.6 },
    {
      id: "C",
      reference: "C",
      type: "heat",
      floorId: edited.floors[0].id,
      photos: [],
    },
  ];
  const result = applyDrawingToJob(state, visit.id, edited);
  assert.deepEqual(state, before);
  assert.deepEqual(result.jobs[1], earlier);
  const changed = result.jobs[0];
  assert.equal(changed.drawingId, edited.id);
  assert.equal(changed.revision, visit.revision + 1);
  assert.deepEqual(changed.results[0], visit.results[0]);
  assert.equal(changed.results[1].state, "Not tested");
  assert.equal(changed.results[1].assetId, "C");
  assert.notEqual(changed.results[1].id, visit.results[1].id);
  assert.deepEqual(changed.archivedResults[0].asset, drawing.assets[1]);
  assert.deepEqual(changed.archivedResults[0].result, visit.results[1]);
  assert.deepEqual(changed.drawingChanges[0].previousResults, visit.results);
  assert.deepEqual(result.sites[0].drawings[0], drawing);
  assert.equal(result.sites[0].drawings.length, 2);
  assert.ok(
    result.sites[0].sourceKeys.includes(
      `zonesketch:floor:${edited.floors[0].id}`,
    ),
    "manual floor lineage matches later Zone Sketch reimports",
  );
  assert.deepEqual(
    applyDrawingToJob(result, visit.id, edited),
    result,
    "same revision is a no-op",
  );
});

test("reintroduced equipment gets fresh results while old work remains archived", () => {
  const { state, drawing, visit } = fixture();
  const removed = {
    ...structuredClone(drawing),
    id: "without-b",
    assets: [structuredClone(drawing.assets[0])],
  };
  const updated = applyDrawingToJob(state, visit.id, removed);
  const restored = { ...structuredClone(drawing), id: "restored-b" };
  const result = applyDrawingToJob(updated, visit.id, restored);
  const job = result.jobs[0];
  assert.equal(job.results[1].state, "Not tested");
  assert.equal(job.results[1].notes, "");
  assert.equal(
    job.archivedResults[0].result.notes,
    "Keep removed-device evidence.",
  );
  assert.equal(job.drawingChanges.length, 2);
});

test("drawing-ID collisions reject rather than altering a saved revision", () => {
  const { state, drawing, visit } = fixture();
  const conflict = structuredClone(drawing);
  conflict.revision = "Different content";
  assert.throws(
    () => applyDrawingToJob(state, visit.id, conflict),
    /already used/,
  );
  assert.equal(state.sites[0].drawings.length, 1);
  assert.throws(
    () => applyDrawingToJob(state, "missing", drawing),
    /could not be found/,
  );
});

test("manual equipment retains permanent identity and visit results through edited Zone Sketch export and reimport", async () => {
  const {
    createDrawingDraft,
    updateDrawingDevice,
    createDrawingRevision,
    buildEditableZoneSketch,
  } = await import("../src/drawing-editor.js");
  const { importZoneSketch } = await import("../src/zone-import.js");
  const site = newSite("Synthetic manual equipment");
  const original = site.drawings[0];
  original.assets = [
    {
      id: "permanent-manual-uuid",
      reference: "SD-MANUAL",
      type: "smoke",
      floorId: original.floors[0].id,
      photos: [],
    },
  ];
  const job = newJob(site);
  job.results[0].state = "Satisfactory";
  job.results[0].notes = "Engineer-confirmed finding remains attached.";
  let state = { sites: [site], jobs: [job] };
  const draft = createDrawingDraft(original, {
    siteId: site.id,
    siteName: site.name,
  });
  draft.systemType = "fire";
  updateDrawingDevice(draft, "permanent-manual-uuid", {
    reference: "SD-MANUAL",
    type: "smoke",
    x: 0.25,
    y: 0.4,
  });
  const edited = createDrawingRevision(draft);
  state = applyDrawingToJob(state, job.id, edited);
  const source = buildEditableZoneSketch(edited, { siteName: site.name });
  const incoming = await importZoneSketch(source, { siteId: site.id });
  assert.notEqual(
    incoming.drawing.assets[0].id,
    "permanent-manual-uuid",
    "generic importer derives a source-key ID",
  );
  const before = structuredClone(incoming.drawing);
  const aligned = alignDrawingAssetsToSite(incoming.drawing, state.sites[0]);
  assert.equal(aligned.assets[0].id, "permanent-manual-uuid");
  assert.deepEqual(incoming.drawing, before, "input is not mutated");
  assert.deepEqual(
    aligned.source,
    before.source,
    "original source is untouched",
  );
  const restored = applyDrawingToJob(state, job.id, aligned);
  assert.deepEqual(restored.jobs[0].results[0], job.results[0]);
  assert.equal(restored.jobs[0].archivedResults.length, 0);
});

test("asset alignment uses newest source-floor mapping, maps issued assets, and keeps unmatched equipment new", () => {
  const older = {
    id: "old",
    assets: [
      { id: "older-id", sourceFloorId: "floor-a", sourceId: "symbol-a" },
    ],
  };
  const latest = {
    id: "latest",
    assets: [{ id: "permanent-id", floorId: "floor-a", sourceId: "symbol-a" }],
  };
  const incoming = {
    id: "incoming",
    source: { unchanged: true },
    assets: [
      { id: "generated-id", sourceFloorId: "floor-a", sourceId: "symbol-a" },
      { id: "new-id", floorId: "floor-a", sourceId: "symbol-new" },
    ],
    issuedSnapshots: [
      {
        id: "issue",
        assets: [
          { id: "issued-generated", floorId: "floor-a", sourceId: "symbol-a" },
        ],
        project: { untouched: true },
      },
    ],
  };
  const result = alignDrawingAssetsToSite(incoming, {
    drawings: [older, latest],
  });
  assert.equal(result.assets[0].id, "permanent-id");
  assert.equal(result.assets[1].id, "new-id");
  assert.equal(result.issuedSnapshots[0].assets[0].id, "permanent-id");
  assert.deepEqual(
    result.issuedSnapshots[0].project,
    incoming.issuedSnapshots[0].project,
  );
  assert.equal(incoming.issuedSnapshots[0].assets[0].id, "issued-generated");
});

test("same drawing reimport ignores derived PNG cache differences without changing saved previews or visit results", () => {
  const { state, drawing, visit } = fixture();
  const incoming = structuredClone(drawing);
  drawing.planPreviews = [
    { id: "preview-cache", image: "included PNG cache", drawingId: drawing.id },
  ];
  drawing.planPreviewErrors = [];
  drawing.planPreviewAttemptedFor = drawing.id;
  const before = structuredClone(state);
  const result = applyDrawingToJob(state, visit.id, incoming);
  assert.deepEqual(result, before);
  assert.deepEqual(state, before);
});
