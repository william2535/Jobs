import test from "node:test";
import assert from "node:assert/strict";
import {
  createJobPackage,
  importJobPackage,
  validateJobPackage,
} from "../src/packages.js";
import {
  createChecklistDraft,
  validateJobChecklist,
  checklistProgress,
} from "../src/job-checklist.js";

function fixture() {
  const photo = {
    id: "photo-1",
    caption: "Synthetic pixel",
    image:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=",
  };
  const site = {
    id: "site-1",
    name: "Synthetic site",
    address: "",
    sourceKeys: ["floor-source"],
    drawings: [
      {
        id: "drawing-1",
        revision: "A",
        floors: [{ id: "floor-1", name: "Ground", data: { polygons: [] } }],
        assets: [
          { id: "asset-1", type: "smoke", floorId: "floor-1", photos: [photo] },
        ],
        source: { original: true },
        issuedSnapshots: [],
      },
    ],
  };
  const job = {
    id: "job-1",
    siteId: site.id,
    drawingId: "drawing-1",
    revision: 1,
    system: "Fire alarm",
    workType: "Fire alarm maintenance",
    scope: "",
    instructions: "",
    engineer: "",
    status: "Open",
    createdAt: "2026-01-01T12:00:00Z",
    updatedAt: "2026-01-01T12:00:00Z",
    results: [
      {
        id: "result-1",
        assetId: "asset-1",
        state: "Not tested",
        observations: "",
        notes: "",
        defects: "",
        readings: [],
        photos: [photo],
      },
    ],
    aiProposals: [],
  };
  return { site, job };
}

function fixtureWithChecklistHistory() {
  const { site, job } = fixture();
  job.discipline = "Fire";
  job.workType = "Maintenance";
  const first = createChecklistDraft(job);
  first.revision = 1;
  first.drawingRevision = "A";
  first.savedAt = "2026-01-01T12:00:00Z";
  first.entries[0].state = "Recorded";
  first.entries[0].notes = "Recorded against original drawing A.";
  job.checklist = validateJobChecklist(first);
  site.drawings.push({
    ...structuredClone(site.drawings[0]),
    id: "drawing-2",
    revision: "B",
    basedOnDrawingId: "drawing-1",
  });
  job.drawingId = "drawing-2";
  job.revision = 2;
  const second = createChecklistDraft(job);
  second.revision = 2;
  second.drawingRevision = "B";
  second.savedAt = "2026-01-01T13:00:00Z";
  second.entries[0].state = "Recorded";
  second.entries[0].notes = "Reviewed against revised drawing B.";
  job.checklist = validateJobChecklist(second);
  return { site, job };
}

test("drawing conflicts keep current and historical checklist evidence linked to their preserved drawings", async () => {
  const { site, job } = fixtureWithChecklistHistory();
  const exported = await createJobPackage(site, job);
  site.drawings[0].revision = "Different local A";
  site.drawings[1].revision = "Different local B";
  job.results[0].notes = "Keep local device evidence.";
  const state = { sites: [site], jobs: [job] };
  const before = structuredClone(state);
  const imported = await importJobPackage(state, exported);
  assert.equal(imported.conflict, true);
  assert.equal(imported.state.jobs.length, 2);
  assert.deepEqual(state, before);
  assert.deepEqual(imported.state.jobs[0], before.jobs[0]);
  assert.equal(imported.job.checklist.drawingId, imported.job.drawingId);
  assert.equal(checklistProgress(imported.job).needsReview, false);
  const drawings = imported.state.sites[0].drawings;
  for (const [record, originalId, revision] of [
    [imported.job.checklist, "drawing-2", "B"],
    [imported.job.checklist.history[0], "drawing-1", "A"],
  ]) {
    const preserved = drawings.find((drawing) => drawing.id === record.drawingId);
    assert.ok(preserved);
    assert.notEqual(record.drawingId, originalId);
    assert.equal(preserved.sourceDrawingId, originalId);
    assert.equal(preserved.revision, revision);
    assert.equal(record.drawingRevision, revision);
  }
  assert.equal(imported.job.checklist.entries[0].notes, job.checklist.entries[0].notes);
  assert.equal(imported.job.checklist.history[0].entries[0].notes, job.checklist.history[0].entries[0].notes);
  const reexported = await createJobPackage(imported.state.sites[0], imported.job);
  const reopened = await importJobPackage({ sites: [], jobs: [] }, reexported);
  assert.deepEqual(reopened.job.checklist, imported.job.checklist);
  const repeated = await importJobPackage(imported.state, exported);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.state.jobs.length, 2);
});

test("missing current or historical checklist drawings reject without changing existing work", async () => {
  const { site, job } = fixtureWithChecklistHistory();
  const exported = await createJobPackage(site, job);
  const state = { sites: [site], jobs: [job] };
  const before = structuredClone(state);
  for (const historical of [false, true]) {
    const invalid = structuredClone(exported);
    const record = historical ? invalid.job.checklist.history[0] : invalid.job.checklist;
    record.drawingId = "missing-drawing";
    await assert.rejects(importJobPackage(state, invalid), /checklist record references a missing drawing/);
    assert.deepEqual(state, before);
  }
});

test("round trip retains all embedded photos, original drawing, stable IDs and revisions", async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  const imported = await importJobPackage(
    { sites: [], jobs: [] },
    JSON.stringify(exported),
  );
  assert.equal(
    imported.state.sites[0].drawings[0].assets[0].photos[0].image,
    site.drawings[0].assets[0].photos[0].image,
  );
  assert.deepEqual(imported.state.sites[0], site);
  const reexport = await createJobPackage(
    imported.state.sites[0],
    imported.job,
  );
  assert.deepEqual(reexport, exported);
});

test("same package and same local snapshot never duplicate a job", async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  let result = await importJobPackage({ sites: [site], jobs: [job] }, exported);
  assert.equal(result.duplicate, true);
  result.job.results[0].notes = "Further local work";
  result = await importJobPackage(result.state, exported);
  assert.equal(result.duplicate, true);
  assert.equal(result.state.jobs.length, 1);
  assert.equal(result.job.results[0].notes, "Further local work");
});

test("conflicting package preserves local work, remaps imported IDs and remembers its receipt", async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  job.results[0].notes = "Keep this local observation";
  const state = { sites: [site], jobs: [job] };
  const imported = await importJobPackage(state, exported);
  assert.equal(imported.conflict, true);
  assert.equal(imported.state.jobs.length, 2);
  assert.equal(
    imported.state.jobs[0].results[0].notes,
    "Keep this local observation",
  );
  assert.notEqual(imported.job.id, job.id);
  assert.equal(imported.job.sourceJobId, job.id);
  assert.equal(imported.job.results[0].sourceResultId, "result-1");
  assert.equal(state.jobs.length, 1, "input state is never mutated");
  const repeated = await importJobPackage(imported.state, exported);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.state.jobs.length, 2);
});

test("drawing ID collision retains both drawing versions and local site metadata", async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  site.drawings[0].revision = "B";
  site.name = "Local edited site name";
  const imported = await importJobPackage(
    { sites: [site], jobs: [] },
    exported,
  );
  assert.equal(imported.conflict, true);
  assert.equal(imported.state.sites.length, 1);
  assert.equal(imported.state.sites[0].name, "Local edited site name");
  assert.equal(imported.state.sites[0].drawings.length, 2);
  assert.equal(
    imported.state.sites[0].importedMetadata[0].site.name,
    "Synthetic site",
  );
  assert.notEqual(imported.job.drawingId, "drawing-1");
  validateJobPackage(
    await createJobPackage(imported.state.sites[0], imported.job),
  );
});

test("same job remains one visit after a site gains revisions or changes its name", async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  site.name = "Updated site name";
  site.drawings.push({
    ...structuredClone(site.drawings[0]),
    id: "drawing-2",
    revision: "B",
  });
  const imported = await importJobPackage(
    { sites: [site], jobs: [job] },
    exported,
  );
  assert.equal(imported.duplicate, true);
  assert.equal(imported.state.jobs.length, 1);
  assert.equal(imported.state.sites.length, 1);
  assert.equal(imported.state.sites[0].drawings.length, 2);
  assert.equal(imported.state.sites[0].name, "Updated site name");
});

test("missing optional collections normalize safely without losing original source data", async () => {
  const { site, job } = fixture();
  delete site.sourceKeys;
  delete site.address;
  delete site.drawings[0].issuedSnapshots;
  delete site.drawings[0].assets[0].photos;
  delete job.aiProposals;
  delete job.results[0].photos;
  delete job.results[0].notes;
  delete job.results[0].observations;
  delete job.results[0].defects;
  const exported = await createJobPackage(site, job);
  const imported = await importJobPackage({ sites: [], jobs: [] }, exported);
  assert.deepEqual(imported.state.sites[0].sourceKeys, []);
  assert.deepEqual(imported.job.results[0].photos, []);
  assert.equal(imported.job.results[0].observations, "");
  assert.deepEqual(imported.state.sites[0].drawings[0].source, {
    original: true,
  });
  assert.equal(
    (await importJobPackage(imported.state, exported)).duplicate,
    true,
  );
});

test("occupied conflict IDs never overwrite records or create duplicate primary keys", async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  job.results[0].notes = "Local changed work";
  const first = await importJobPackage(
    { sites: [site], jobs: [job] },
    exported,
  );
  const occupied = { ...structuredClone(job), id: first.job.id };
  const result = await importJobPackage(
    { sites: [site], jobs: [job, occupied] },
    exported,
  );
  assert.equal(new Set(result.state.jobs.map((value) => value.id)).size, 3);
  assert.equal(result.state.jobs[1].id, occupied.id);
  assert.equal(result.state.jobs[1].results[0].notes, "Local changed work");
  assert.notEqual(result.job.id, occupied.id);
});

test("different visits importing the same colliding drawing reuse its preserved version", async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  site.drawings[0].revision = "Local revision";
  let imported = await importJobPackage({ sites: [site], jobs: [] }, exported);
  const selectedDrawingId = imported.job.drawingId;
  exported.job.id = "second-visit";
  exported.job.results[0].id = "second-result";
  imported = await importJobPackage(imported.state, exported);
  assert.equal(imported.state.sites[0].drawings.length, 2);
  assert.equal(imported.job.drawingId, selectedDrawingId);
});

test("invalid JSON, versions, references, duplicate IDs and linked-only photographs are rejected", async () => {
  const { site, job } = fixture();
  const valid = await createJobPackage(site, job);
  assert.throws(() => validateJobPackage("{"), /JSON/);
  for (const change of [
    (p) => {
      p.version = 999;
    },
    (p) => {
      p.site.sourceKeys = "invalid";
    },
    (p) => {
      p.job.siteId = "missing";
    },
    (p) => {
      p.job.drawingId = "missing";
    },
    (p) => {
      p.job.results[0].assetId = "missing";
    },
    (p) => {
      p.job.results.push(p.job.results[0]);
    },
    (p) => {
      p.job.results[0].photos[0].image = "https://example.com/photo.jpg";
    },
    (p) => {
      p.site.drawings[0].floors[0].data.image = "https://example.com/plan.png";
    },
    (p) => {
      p.site.drawings[0].assets[0].photos[0].image =
        "data:image/svg+xml;base64,PHN2Zz4=";
    },
    (p) => {
      p.job.results[0].state = "Passed";
    },
    (p) => {
      p.job.results[0].state = "Inaccessible";
    },
    (p) => {
      p.job.results = [];
    },
  ]) {
    const invalid = structuredClone(valid);
    change(invalid);
    const state = { sites: [site], jobs: [job] };
    const before = JSON.stringify(state);
    await assert.rejects(
      importJobPackage(state, invalid),
      /Invalid job package/,
    );
    assert.equal(JSON.stringify(state), before);
  }
});

test("malformed retained site metadata rejects before it can break site review", async () => {
  const { site, job } = fixture();
  const pack = await createJobPackage(site, job);
  pack.site.importedMetadata = [null];
  assert.throws(() => validateJobPackage(pack), /importedMetadata/);
  pack.site.importedMetadata = [{ fingerprint: 12, site: { name: "Example" } }];
  assert.throws(() => validateJobPackage(pack), /fingerprint/);
});

test("edited drawing history, removed evidence and workflow survive complete package round trips", async () => {
  const { applyDrawingToJob } = await import("../src/revisions.js");
  const { updateWorkflow } = await import("../src/job-workflow.js");
  const { site, job } = fixture();
  job.results[0].notes = "Removed equipment evidence stays available.";
  const edited = structuredClone(site.drawings[0]);
  edited.id = "drawing-new";
  edited.basedOnDrawingId = "drawing-1";
  edited.assets = [
    { id: "new-asset", type: "heat", floorId: "floor-1", photos: [] },
  ];
  const next = applyDrawingToJob(
    { sites: [site], jobs: [job] },
    job.id,
    edited,
  );
  next.jobs[0] = updateWorkflow(next.jobs[0], "products", {
    id: "product-1",
    description: "Synthetic cable",
    quantity: 5,
    unit: "m",
    unitCost: 1.2,
    currency: "GBP",
    complete: true,
  });
  next.jobs[0] = updateWorkflow(next.jobs[0], "purchaseOrders", {
    id: "po-1",
    reference: "PO-DEMO",
    supplier: "Synthetic supplier",
    status: "Draft",
    amount: 6,
    currency: "GBP",
  });
  const exported = await createJobPackage(next.sites[0], next.jobs[0]);
  const imported = await importJobPackage(
    { sites: [], jobs: [] },
    JSON.stringify(exported),
  );
  assert.deepEqual(imported.job.archivedResults, next.jobs[0].archivedResults);
  assert.deepEqual(imported.job.drawingChanges, next.jobs[0].drawingChanges);
  assert.deepEqual(imported.job.workflow, next.jobs[0].workflow);
  assert.deepEqual(
    await createJobPackage(imported.state.sites[0], imported.job),
    exported,
  );
  assert.equal(imported.job.results[0].state, "Not tested");
  assert.equal(
    (await importJobPackage(imported.state, exported)).duplicate,
    true,
  );

  for (const mutate of [
    (p) => {
      p.job.archivedResults[0].drawingId = "missing";
    },
    (p) => {
      p.job.archivedResults[0].result.photos[0].image =
        "https://example.com/photo.png";
    },
    (p) => {
      p.job.drawingChanges[0].fromDrawingId = "missing";
    },
    (p) => {
      p.job.drawingChanges[0].previousResults[0].assetId = "missing";
    },
    (p) => {
      p.job.workflow.products[0].id = "";
    },
    (p) => {
      p.job.workflow.purchaseOrders[0].amount = -5;
    },
  ]) {
    const invalid = structuredClone(exported);
    mutate(invalid);
    await assert.rejects(
      importJobPackage(imported.state, invalid),
      /Invalid job package/,
    );
  }
});

test("drawing conflicts remap historical references and edited-drawing ancestry without altering local records", async () => {
  const { applyDrawingToJob } = await import("../src/revisions.js");
  const { site, job } = fixture();
  const edited = {
    ...structuredClone(site.drawings[0]),
    id: "new-revision",
    basedOnDrawingId: "drawing-1",
    assets: [],
  };
  const changed = applyDrawingToJob(
    { sites: [site], jobs: [job] },
    job.id,
    edited,
  );
  const exported = await createJobPackage(changed.sites[0], changed.jobs[0]);
  site.drawings[0].revision = "Local conflicting original";
  const imported = await importJobPackage(
    { sites: [site], jobs: [] },
    exported,
  );
  const archived = imported.job.archivedResults[0];
  assert.notEqual(archived.drawingId, "drawing-1");
  assert.equal(archived.sourceDrawingId, "drawing-1");
  assert.equal(
    imported.job.drawingChanges[0].fromDrawingId,
    archived.drawingId,
  );
  const importedEdited = imported.state.sites[0].drawings.find(
    (d) => d.id === imported.job.drawingId,
  );
  assert.equal(importedEdited.basedOnDrawingId, archived.drawingId);
  assert.equal(importedEdited.sourceBasedOnDrawingId, "drawing-1");
  validateJobPackage(
    await createJobPackage(imported.state.sites[0], imported.job),
  );
  assert.equal(site.drawings.length, 1, "caller records unchanged");
  // A different visit carrying the same drawings reuses both preserved revisions.
  exported.job.id = "second-visit";
  const second = await importJobPackage(imported.state, exported);
  assert.equal(second.state.sites[0].drawings.length, 3);
  assert.equal(second.job.drawingId, imported.job.drawingId);
});

test("current image pool deduplicates attachments and expands the original project exactly; legacy v1 remains accepted", async () => {
  const { site, job } = fixture();
  const image = site.drawings[0].assets[0].photos[0].image;
  site.drawings[0].source = {
    project: {
      image,
      floors: [{ data: { image } }],
      unchanged: { custom: "kept" },
    },
  };
  for (let i = 2; i <= 5; i++)
    site.drawings.push({
      ...structuredClone(site.drawings[0]),
      id: `drawing-${i}`,
    });
  const v2 = await createJobPackage(site, job);
  assert.equal(v2.version, 3);
  assert.equal(v2.attachments.length, 1);
  assert.equal(v2.attachments[0].image, image);
  assert.equal(v2.attachmentRefs.length, 16);
  assert.equal(v2.site.drawings[0].source.project.image, null);
  const full = validateJobPackage(v2);
  assert.equal(
    full.version,
    1,
    "expanded projection is an ordinary compatible v1 envelope",
  );
  assert.deepEqual(full.site, site);
  assert.deepEqual(full.job, job);
  const imported = await importJobPackage({ sites: [], jobs: [] }, full);
  imported.job.results[0].notes = "Work after receipt";
  assert.equal(
    (await importJobPackage(imported.state, v2)).duplicate,
    true,
    "same content deduplicates across wire versions after local edits",
  );
});

test("v2 rejects unsafe, repeated, missing, non-null and unused attachment references before saving", async () => {
  const { site, job } = fixture();
  const valid = await createJobPackage(site, job);
  const state = { sites: [site], jobs: [job] };
  const before = structuredClone(state);
  for (const mutate of [
    (p) => {
      p.attachmentRefs[0].path = ["site", "__proto__", "polluted"];
    },
    (p) => {
      p.attachmentRefs.push(structuredClone(p.attachmentRefs[0]));
    },
    (p) => {
      p.attachmentRefs[0].path = ["site", "missing"];
    },
    (p) => {
      p.attachmentRefs[0].path = ["site", "name"];
    },
    (p) => {
      p.attachmentRefs[0].attachmentId = "missing";
    },
    (p) => {
      p.attachmentRefs = [];
    },
    (p) => {
      p.attachments[0].image = "https://example.com/image.png";
    },
    (p) => {
      p.attachments[0].image = "data:image/png;base64,eA==";
    },
  ]) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    await assert.rejects(
      importJobPackage(state, invalid),
      /Invalid job package/,
    );
    assert.deepEqual(state, before);
  }
  assert.equal(Object.prototype.polluted, undefined);
});

test("optional PNG plan previews round-trip through the image pool and malformed cache metadata is rejected", async () => {
  const { site, job } = fixture();
  const drawing = site.drawings[0],
    image = drawing.assets[0].photos[0].image;
  drawing.planPreviews = [
    {
      id: "preview-1",
      drawingId: drawing.id,
      floorId: "floor-1",
      snapshotId: null,
      rendererVersion: 1,
      renderer: "JobsPreview",
      revision: "A",
      image,
      width: 1,
      height: 1,
      generatedAt: "2026-11-13T12:00:00Z",
    },
  ];
  drawing.planPreviewErrors = [];
  drawing.planPreviewAttemptedFor = drawing.id;
  const packed = await createJobPackage(site, job);
  const restored = await importJobPackage({ sites: [], jobs: [] }, packed);
  assert.deepEqual(
    restored.state.sites[0].drawings[0].planPreviews,
    drawing.planPreviews,
  );
  assert.equal(
    packed.attachments.length,
    1,
    "preview and evidence share one included image",
  );
  for (const mutate of [
    (preview) => {
      preview.floorId = "missing";
    },
    (preview) => {
      preview.snapshotId = "missing";
    },
    (preview) => {
      preview.width = -1;
    },
    (preview) => {
      preview.height = 20000;
    },
    (preview) => {
      preview.generatedAt = "bad date";
    },
    (preview) => {
      preview.image = "https://example.com/preview.png";
    },
  ]) {
    const invalid = validateJobPackage(packed);
    mutate(invalid.site.drawings[0].planPreviews[0]);
    assert.throws(() => validateJobPackage(invalid), /Invalid job package/);
  }
});

test("PNG preview imports check actual headers and dimensions without changing existing jobs", async () => {
  const { site, job } = fixture();
  const image = site.drawings[0].assets[0].photos[0].image;
  site.drawings[0].planPreviews = [{
    id: "preview-safe", drawingId: "drawing-1", floorId: "floor-1",
    snapshotId: null, rendererVersion: 1, revision: "A", image,
    width: 1, height: 1, generatedAt: "2026-11-16T00:00:00Z",
  }];
  const packed = await createJobPackage(site, job);
  const existing = { sites: [structuredClone(site)], jobs: [structuredClone(job)] };
  existing.jobs[0].results[0].notes = "Keep the engineer's existing evidence.";
  const before = structuredClone(existing);
  const headerImage = (width, height) => {
    const bytes = Buffer.from(image.split(",")[1], "base64");
    bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
    return "data:image/png;base64," + bytes.toString("base64");
  };
  for (const [label, mutate] of [
    ["non-PNG bytes", preview => { preview.image = "data:image/png;base64,bm90IGEgcG5n"; }],
    ["malformed base64", preview => { preview.image = image.slice(0, -1); }],
    ["declared width mismatch", preview => { preview.width = 2; }],
    ["declared height mismatch", preview => { preview.height = 2; }],
    ["oversized true width", preview => { preview.image = headerImage(20000, 1); }],
    ["oversized pixel area", preview => {
      preview.image = headerImage(8192, 8192); preview.width = preview.height = 8192;
    }],
  ]) {
    const invalid = validateJobPackage(packed);
    mutate(invalid.site.drawings[0].planPreviews[0]);
    await assert.rejects(importJobPackage(existing, invalid), /Invalid job package: plan preview/, label);
    assert.deepEqual(existing, before, label + " must leave saved records unchanged");
  }
});

test("generated preview caches do not create drawing conflicts and imported source-engine PNGs remain usable after true conflicts", async () => {
  const { site, job } = fixture();
  const base = structuredClone(site);
  const drawing = site.drawings[0];
  drawing.planPreviews = [
    {
      id: "engine-preview",
      drawingId: drawing.id,
      floorId: "floor-1",
      snapshotId: null,
      rendererVersion: 1,
      renderer: "ZoneSketch",
      revision: "A",
      image: drawing.assets[0].photos[0].image,
      width: 1,
      height: 1,
      generatedAt: "2026-11-13T12:00:00Z",
    },
  ];
  drawing.planPreviewErrors = [];
  drawing.planPreviewAttemptedFor = drawing.id;
  const pack = await createJobPackage(site, job);
  const same = await importJobPackage({ sites: [base], jobs: [job] }, pack);
  assert.equal(same.conflict, false);
  assert.equal(same.duplicate, true);
  assert.equal(same.state.sites[0].drawings.length, 1);
  assert.deepEqual(
    same.state.sites[0].drawings[0].planPreviews,
    drawing.planPreviews,
  );
  base.drawings[0].revision = "Real local drawing change";
  const conflict = await importJobPackage({ sites: [base], jobs: [] }, pack);
  const restored = conflict.state.sites[0].drawings.find(
    (value) => value.id === conflict.job.drawingId,
  );
  assert.notEqual(restored.id, drawing.id);
  assert.equal(restored.planPreviews[0].drawingId, restored.id);
  assert.equal(restored.planPreviews[0].image, drawing.planPreviews[0].image);
  assert.equal(restored.planPreviews[0].renderer, "ZoneSketch");
  validateJobPackage(
    await createJobPackage(conflict.state.sites[0], conflict.job),
  );
});
