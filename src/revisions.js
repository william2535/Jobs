import { id, now } from "./model.js";

const clone = (value) => structuredClone(value);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function newResult(assetId) {
  return {
    id: id(),
    assetId,
    state: "Not tested",
    observations: "",
    readings: [],
    notes: "",
    defects: "",
    photos: [],
  };
}

/** Reconcile source identities with the permanent site after a compatible export/reimport.
 * The original source and all drawing geometry remain untouched. Latest site mappings win.
 */
export function alignDrawingAssetsToSite(drawing, site) {
  const aligned = clone(drawing);
  const mapping = new Map();
  const sourceKey = (asset) => {
    const floorId = asset.sourceFloorId || asset.floorId;
    return typeof floorId === "string" &&
      floorId &&
      typeof asset.sourceId === "string" &&
      asset.sourceId
      ? JSON.stringify([floorId, asset.sourceId])
      : null;
  };
  for (const saved of [...(site.drawings || [])].reverse()) {
    for (const asset of saved.assets || []) {
      const key = sourceKey(asset);
      if (key && !mapping.has(key)) mapping.set(key, asset.id);
    }
  }
  const align = (record) => {
    const used = new Set();
    for (const asset of record.assets || []) {
      const key = sourceKey(asset);
      if (key && mapping.has(key)) asset.id = mapping.get(key);
      if (used.has(asset.id))
        throw new Error(
          "Source device mappings are ambiguous. Review the drawing identities before applying this plan.",
        );
      used.add(asset.id);
    }
    for (const snapshot of record.issuedSnapshots || []) align(snapshot);
  };
  align(aligned);
  return aligned;
}

/** Apply an explicitly reviewed drawing revision to one visit. Never mutates its inputs. */
export function applyDrawingToJob(state, jobId, newDrawing) {
  const next = clone(state);
  const job = next.jobs.find((value) => value.id === jobId);
  if (!job) throw new Error("The job could not be found.");
  const site = next.sites.find((value) => value.id === job.siteId);
  const previous = site?.drawings.find((value) => value.id === job.drawingId);
  if (!site || !previous)
    throw new Error("The job’s saved drawing could not be found.");
  if (
    !newDrawing ||
    typeof newDrawing.id !== "string" ||
    !newDrawing.id ||
    !Array.isArray(newDrawing.assets) ||
    !Array.isArray(newDrawing.floors)
  )
    throw new Error("A complete drawing revision is required.");
  if (
    new Set(newDrawing.assets.map((asset) => asset.id)).size !==
      newDrawing.assets.length ||
    newDrawing.assets.some((asset) => !asset.id)
  )
    throw new Error("Drawing asset IDs must be present and unique.");
  const saved = site.drawings.find((value) => value.id === newDrawing.id);
  if (saved && canonical(saved) !== canonical(newDrawing))
    throw new Error(
      "This drawing ID is already used by a different saved revision. Save the edit as a new revision.",
    );
  if (job.drawingId === newDrawing.id) return next;
  const currentResults = new Map(
    job.results.map((result) => [result.assetId, result]),
  );
  if (
    currentResults.size !== job.results.length ||
    job.results.some(
      (result) => !previous.assets.some((asset) => asset.id === result.assetId),
    )
  )
    throw new Error("Current visit results do not match the saved drawing.");
  const assetIds = new Set(newDrawing.assets.map((asset) => asset.id));
  const previousIds = new Set(previous.assets.map((asset) => asset.id));
  const changeId = id();
  const at = now();
  const removed = previous.assets.filter((asset) => !assetIds.has(asset.id));
  const added = newDrawing.assets.filter((asset) => !previousIds.has(asset.id));
  if (!saved) site.drawings.push(clone(newDrawing));
  // Imported source-floor lineage remains available even if a revision removes a floor.
  site.sourceKeys = [
    ...new Set([
      ...(site.sourceKeys || []),
      ...newDrawing.floors.map((floor) => `zonesketch:floor:${floor.id}`),
    ]),
  ];
  job.archivedResults = [
    ...(job.archivedResults || []),
    ...removed
      .filter((asset) => currentResults.has(asset.id))
      .map((asset) => ({
        id: id(),
        assetId: asset.id,
        drawingId: previous.id,
        changeId,
        removedAt: at,
        asset: clone(asset),
        result: clone(currentResults.get(asset.id)),
      })),
  ];
  job.drawingChanges = [
    ...(job.drawingChanges || []),
    {
      id: changeId,
      fromDrawingId: previous.id,
      toDrawingId: newDrawing.id,
      at,
      engineer: job.engineer || "",
      previousJobRevision: job.revision,
      previousResults: clone(job.results),
      addedAssetIds: added.map((asset) => asset.id),
      removedAssetIds: removed.map((asset) => asset.id),
    },
  ];
  job.results = newDrawing.assets.map(
    (asset) => currentResults.get(asset.id) || newResult(asset.id),
  );
  job.drawingId = newDrawing.id;
  job.revision++;
  job.updatedAt = at;
  return next;
}
