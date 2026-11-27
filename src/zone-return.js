/** Pure coordinators for a trusted Jobs → Zone Sketch → Jobs edit session.
 * Transport must bind the launch context to its window/origin; returned files never select a site.
 */
import {
  buildEditableZoneSketch,
  createDrawingDraft,
} from "./drawing-editor.js";
import {
  DEVICE_NAMES,
  importZoneSketch,
  parseZoneSketch,
} from "./zone-import.js";
import { alignDrawingAssetsToSite, applyDrawingToJob } from "./revisions.js";

const clone = (value) => structuredClone(value);
const validPoint = (value) =>
  value &&
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  value.x >= 0 &&
  value.x <= 1 &&
  value.y >= 0 &&
  value.y <= 1;
const sourceKey = (floorId, sourceId) => JSON.stringify([floorId, sourceId]);
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value)
          .filter((k) => value[k] !== undefined)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
          .join(",")}}`
      : JSON.stringify(value);
async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
// Only the genuine drawing envelope's source data determines a save. Host PNG caches are separate.
const sourceDigest = (source) =>
  digest({ project: source.project, issuedAsFit: source.issuedAsFit || null });
const mappings = (assets) =>
  (assets || [])
    .filter(
      (a) =>
        typeof a.sourceId === "string" &&
        a.sourceId &&
        typeof (a.sourceFloorId || a.floorId) === "string",
    )
    .map((a) => ({
      assetId: a.id,
      floorId: a.sourceFloorId || a.floorId,
      sourceId: a.sourceId,
    }));
function validateContext(context) {
  if (!context || context.version !== 1)
    throw Error(
      "This Zone Sketch edit session is not supported. Reopen Edit site from Jobs.",
    );
  for (const key of [
    "launchId",
    "siteId",
    "drawingId",
    "siteDrawingId",
    "sourceDigest",
  ])
    if (typeof context[key] !== "string" || !context[key])
      throw Error(
        `The Zone Sketch session has no pinned ${key}. Reopen Edit site from Jobs.`,
      );
  for (const key of ["siteName", "sourceSiteName"])
    if (typeof context[key] !== "string")
      throw Error("The Zone Sketch session site-name mapping is missing. Reopen Edit site from Jobs.");
  if (
    context.jobId !== null &&
    (typeof context.jobId !== "string" || !context.jobId)
  )
    throw Error("The Zone Sketch session has an invalid pinned job.");
  if (
    !Array.isArray(context.assetMappings) ||
    !Array.isArray(context.unplacedAssets)
  )
    throw Error(
      "The Zone Sketch session asset mappings are missing. Reopen Edit site from Jobs.",
    );
  const keys = new Set(),
    ids = new Set();
  for (const mapping of context.assetMappings) {
    for (const key of ["assetId", "floorId", "sourceId"])
      if (typeof mapping?.[key] !== "string" || !mapping[key])
        throw Error("The Zone Sketch session has an invalid device mapping.");
    const key = sourceKey(mapping.floorId, mapping.sourceId);
    if (keys.has(key) || ids.has(mapping.assetId))
      throw Error("The Zone Sketch session has ambiguous device mappings.");
    keys.add(key);
    ids.add(mapping.assetId);
  }
  const unplaced = new Set();
  for (const asset of context.unplacedAssets) {
    if (typeof asset?.id !== "string" || !asset.id || unplaced.has(asset.id))
      throw Error("The Zone Sketch session has invalid unplaced equipment.");
    unplaced.add(asset.id);
  }
}

/** Prepare the genuine current Zone Sketch envelope, without inventing locations for manual assets. */
export async function prepareZoneLaunch(site, job = null, { systemType } = {}) {
  if (!site?.id || !Array.isArray(site.drawings) || !site.drawings.length)
    throw Error("Save a site and drawing before opening Zone Sketch.");
  if (job && job.siteId !== site.id)
    throw Error("This job does not belong to the selected site.");
  const drawing = job
    ? site.drawings.find((d) => d.id === job.drawingId)
    : site.drawings.at(-1);
  if (!drawing) throw Error("The pinned job drawing could not be found.");
  if (drawing.kind === "issued")
    throw Error(
      "Issued records are read-only. Open a working drawing to edit the site.",
    );
  const draft = createDrawingDraft(drawing, {
    siteId: site.id,
    siteName: site.name,
  });
  if (systemType !== undefined) draft.systemType = systemType;
  if (!["fire", "security", "cctv", "access"].includes(draft.systemType))
    throw Error(
      "Choose a drawing system before opening this manual site in Zone Sketch.",
    );
  const originalById = new Map((drawing.assets || []).map((a) => [a.id, a]));
  const unplaced = [];
  draft.assets = draft.assets.filter((asset) => {
    const floor = draft.floors.find((f) => f.id === asset.floorId);
    const symbol = floor?.data.symbols.find((s) => s.id === asset.sourceId);
    const included =
      Object.hasOwn(DEVICE_NAMES, asset.type) &&
      validPoint(asset) &&
      validPoint(symbol);
    if (!included) {
      unplaced.push(clone(originalById.get(asset.id) || asset));
      if (floor)
        floor.data.symbols = floor.data.symbols.filter(
          (s) => s.id !== asset.sourceId,
        );
    }
    return included;
  });
  const envelope = buildEditableZoneSketch(draft, { siteName: site.name });
  const context = {
    version: 1,
    launchId: crypto.randomUUID(),
    siteId: site.id,
    siteName: site.name,
    sourceSiteName: envelope.project.site,
    jobId: job?.id || null,
    drawingId: drawing.id,
    siteDrawingId: site.drawings.at(-1).id,
    jobRevision: job?.revision ?? null,
    sourceDigest: await sourceDigest(envelope),
    assetMappings: mappings(draft.assets),
    unplacedAssets: unplaced,
  };
  validateContext(context);
  const warnings = unplaced.length
    ? [
        `${unplaced.length} unplaced or unsupported manual equipment record(s) stay in Jobs. No position or substitute equipment type was invented for Zone Sketch.`,
      ]
    : [];
  return { envelope, context, warnings };
}
function immutableIssue(value) {
  const copy = clone(value);
  delete copy.floors;
  delete copy.assets;
  delete copy.kind;
  return canonical(copy);
}
function keepIssued(previous, incoming) {
  const combined = clone(incoming.issuedSnapshots || []);
  for (const old of previous.issuedSnapshots || []) {
    const returned = combined.find((item) => item.id === old.id);
    if (returned && immutableIssue(returned) !== immutableIssue(old))
      throw Error(
        "An issued as-fit snapshot was changed in the returned file. Issued records are read-only; restore the original issued record before saving.",
      );
    if (!returned) combined.push(clone(old));
  }
  return combined;
}
function alignSession(drawing, context) {
  const map = new Map(
    context.assetMappings.map((m) => [
      sourceKey(m.floorId, m.sourceId),
      m.assetId,
    ]),
  );
  const apply = (record) => {
    const ids = new Set();
    for (const asset of record.assets || []) {
      const known = map.get(
        sourceKey(asset.sourceFloorId || asset.floorId, asset.sourceId),
      );
      if (known) asset.id = known;
      if (ids.has(asset.id))
        throw Error("Returned drawing has ambiguous equipment identities.");
      ids.add(asset.id);
    }
    for (const issue of record.issuedSnapshots || []) apply(issue);
  };
  apply(drawing);
  return drawing;
}
function liveTarget(state, context) {
  validateContext(context);
  const site = state.sites.find((s) => s.id === context.siteId);
  if (!site)
    throw Error(
      "The pinned site no longer exists. The returned drawing was not saved.",
    );
  const job =
    context.jobId === null
      ? null
      : state.jobs.find((j) => j.id === context.jobId);
  if (context.jobId !== null && (!job || job.siteId !== context.siteId))
    throw Error(
      "The pinned job no longer belongs to this site. The returned drawing was not saved.",
    );
  const drawing = site.drawings.find(
    (d) => d.id === (job?.drawingId || site.drawings.at(-1)?.id),
  );
  if (!drawing)
    throw Error(
      "The pinned drawing no longer exists. The returned drawing was not saved.",
    );
  return { site, job, drawing };
}
function refreshedContext(context, site, job, drawing, newDigest) {
  const unplacedIds = new Set(context.unplacedAssets.map((a) => a.id));
  return {
    ...clone(context),
    drawingId: drawing.id,
    siteDrawingId: site.drawings.at(-1).id,
    jobRevision: job?.revision ?? null,
    siteName: site.name,
    sourceSiteName: drawing.source?.project?.site ?? context.sourceSiteName,
    sourceDigest: newDigest,
    assetMappings: mappings(
      drawing.assets.filter((a) => !unplacedIds.has(a.id)),
    ),
    unplacedAssets: drawing.assets
      .filter((a) => unplacedIds.has(a.id))
      .map(clone),
  };
}

/** Apply only to the trusted pinned site/visit, reconciling the newest recorded visit results. */
export async function applyZoneReturn(state, context, envelope) {
  const { site, job, drawing: previous } = liveTarget(state, context);
  const source = parseZoneSketch(envelope);
  if (source.issuedAsFit)
    throw Error(
      "An issued record cannot replace the working drawing in this edit session.",
    );
  const renameRequested =
    Boolean(source.project.site.trim()) &&
    source.project.site !== context.sourceSiteName;
  if (
    renameRequested &&
    site.name !== context.siteName &&
    site.name !== source.project.site
  )
    throw Error(
      "The site name changed in both Jobs and Zone Sketch. The current site name and drawing were kept. Reopen Edit site to review the latest name.",
    );
  const returnedDigest = await sourceDigest(source);
  const stale =
    previous.id !== context.drawingId ||
    site.drawings.at(-1).id !== context.siteDrawingId;
  if (stale) {
    // A retried identical message from this same launch is safe; any different drawing stays protected.
    if (
      previous.zoneSaveBack?.launchId === context.launchId &&
      previous.zoneSaveBack.sourceDigest === returnedDigest &&
      site.drawings.at(-1).id === previous.id
    )
      return {
        state,
        site,
        job,
        drawing: previous,
        unchanged: true,
        context: refreshedContext(context, site, job, previous, returnedDigest),
      };
    throw Error(
      "The site or job drawing changed while Zone Sketch was open. Your newer drawing and work were kept. Reopen Edit site before applying another change.",
    );
  }
  if (returnedDigest === context.sourceDigest)
    return {
      state,
      site,
      job,
      drawing: previous,
      unchanged: true,
      context: clone(context),
    };
  const imported = await importZoneSketch(source, { siteId: site.id });
  let drawing = alignSession(
    alignDrawingAssetsToSite(imported.drawing, site),
    context,
  );
  const retainedIds = new Set();
  for (const held of context.unplacedAssets) {
    const current = previous.assets.find((a) => a.id === held.id);
    if (!current)
      throw Error(
        "An unplaced equipment record changed during this edit session. Reopen Edit site before saving.",
      );
    if (drawing.assets.some((a) => a.id === current.id)) continue;
    const retained = clone(current);
    if (
      retained.floorId &&
      !drawing.floors.some((f) => f.id === retained.floorId)
    ) {
      retained.unplacedFloorId = retained.floorId;
      retained.sourceFloorId ||= retained.floorId;
      retained.floorId = null;
    }
    drawing.assets.push(retained);
    retainedIds.add(retained.id);
  }
  drawing.issuedSnapshots = keepIssued(previous, drawing);
  drawing.basedOnDrawingId = previous.id;
  drawing.zoneSaveBack = {
    launchId: context.launchId,
    sourceDigest: returnedDigest,
    fromDrawingId: previous.id,
    savedAt: new Date().toISOString(),
    unplacedAssetIds: [...retainedIds],
  };
  drawing.id = `drawing-${await digest({ parent: previous.id, sourceDigest: returnedDigest, unplaced: drawing.assets.filter((a) => retainedIds.has(a.id)) })}`;
  // Preserve newer engineer results by rebasing the latest supplied state, not the launch snapshot.
  let next;
  if (job) next = applyDrawingToJob(state, job.id, drawing);
  else {
    next = clone(state);
    const target = next.sites.find((s) => s.id === site.id);
    if (target.drawings.some((d) => d.id === drawing.id))
      throw Error(
        "This drawing revision already exists with a different edit context. Reopen Edit site.",
      );
    target.drawings.push(clone(drawing));
  }
  const savedSite = next.sites.find((s) => s.id === site.id);
  if (renameRequested) savedSite.name = source.project.site;
  savedSite.sourceKeys = [
    ...new Set([
      ...(savedSite.sourceKeys || []),
      ...drawing.floors.map((f) => `zonesketch:floor:${f.id}`),
    ]),
  ];
  const savedJob = job ? next.jobs.find((j) => j.id === job.id) : null;
  const savedDrawing = savedSite.drawings.find((d) => d.id === drawing.id);
  return {
    state: next,
    site: savedSite,
    job: savedJob,
    drawing: savedDrawing,
    unchanged: false,
    context: refreshedContext(
      context,
      savedSite,
      savedJob,
      savedDrawing,
      returnedDigest,
    ),
  };
}
