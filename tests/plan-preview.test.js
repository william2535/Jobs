import test from "node:test";
import assert from "node:assert/strict";
import {
  pngDimensions,
  acceptZoneSketchPreviews,
  hasPlanPreviews,
  ensurePlanPreviews,
} from "../src/plan-preview.js";
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=";
const drawing = () => ({
  id: "drawing-test",
  revision: "A",
  floors: [
    {
      id: "floor-1",
      name: "Ground",
      data: {
        walls: [
          {
            id: "wall-1",
            points: [
              { x: 0.1, y: 0.1 },
              { x: 0.9, y: 0.1 },
            ],
          },
        ],
      },
    },
  ],
  assets: [],
  issuedSnapshots: [],
  source: { project: { site: "Synthetic" } },
});
const receipt = () => ({
  renderer: "ZoneSketch",
  mode: "survey",
  kind: "working",
  floorId: "floor-1",
  revision: "A",
  image,
  width: 1,
  height: 1,
  generatedAt: "2026-11-13T00:00:00Z",
});

test("actual Zone Sketch PNG sheets keep exact bytes and explicitly disable normalized overlays", () => {
  const original = drawing(),
    before = structuredClone(original),
    result = acceptZoneSketchPreviews(original, [receipt()]);
  assert.deepEqual(original, before);
  assert.equal(result.planPreviews[0].image, image);
  assert.equal(result.planPreviews[0].overlayMode, "none");
  assert.equal(result.planPreviews[0].drawingId, original.id);
  assert.equal(result.planPreviews[0].snapshotId, null);
  assert.deepEqual(pngDimensions(image), { width: 1, height: 1 });
  assert.deepEqual(result.source, original.source);
  assert(hasPlanPreviews(result));
});
test("invalid, duplicated, unrelated and mismatched PNG sheets reject without changing drawings", () => {
  const original = drawing(),
    before = structuredClone(original);
  for (const previews of [
    [{ ...receipt(), floorId: "missing" }],
    [receipt(), receipt()],
    [{ ...receipt(), width: 2 }],
    [{ ...receipt(), renderer: "Other" }],
    [{ ...receipt(), image: "https://example.invalid/plan.png" }],
    [{ ...receipt(), kind: "issued" }],
  ])
    assert.throws(() => acceptZoneSketchPreviews(original, previews));
  assert.deepEqual(original, before);
  assert.throws(
    () => pngDimensions("data:image/png;base64,YWJjZA=="),
    /not a PNG/,
  );
});
test("complete cached previews avoid cloning or browser rendering on every result save", async () => {
  const cached = acceptZoneSketchPreviews(drawing(), [receipt()]);
  assert.strictEqual(await ensurePlanPreviews(cached), cached);
  assert(!hasPlanPreviews({ ...cached, id: "changed-drawing" }));
  const empty = {
    id: "manual",
    floors: [{ id: "floor-empty", data: {} }],
    assets: [],
  };
  assert.strictEqual(await ensurePlanPreviews(empty), empty);
});
test("working receipts retain immutable issued-preview cache entries", () => {
  const original = drawing();
  original.planPreviews = [
    { id: "issued-preview", snapshotId: "issue-A", image },
  ];
  const result = acceptZoneSketchPreviews(original, [receipt()]);
  assert.equal(result.planPreviews.length, 2);
  assert.deepEqual(result.planPreviews[0], original.planPreviews[0]);
});
