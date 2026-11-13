/** Independent, data-only Zone Sketch reader. No Zone Sketch application code is included. */
export const ZONE_SKETCH_SOURCE_COMMIT =
  "dca2eff063f52a9980c2aed255879a65cc579379";
const REQUIRED_ARRAYS = [
  "zones",
  "shapes",
  "notes",
  "walls",
  "doors",
  "windows",
  "shutters",
  "stairs",
  "labels",
  "symbols",
  "pins",
];
const OPTIONAL_ARRAYS = [
  "connections",
  "circuits",
  "existingCables",
  "cableJoints",
];
export const DEVICE_NAMES = Object.freeze({
  panel: "Fire panel",
  repeater: "Repeater",
  mcp: "Manual call point",
  smoke: "Smoke detector",
  heat: "Heat detector",
  sounder: "Sounder",
  beacon: "Beacon",
  beam: "Beam detector",
  io: "Input / output unit",
  secPir: "PIR",
  secDualTech: "Dual technology detector",
  sec360: "360° detector",
  secDoorContact: "Door contact",
  secPanic: "Panic button",
  secBell: "External siren",
  secKeypad: "Keypad",
  secExpander: "Expander",
  secPsu: "Security power supply",
  secPanel: "Intruder panel",
  cctvFixed: "Fixed camera",
  cctvDome: "Dome camera",
  cctvTurret: "Turret camera",
  cctvPtz: "PTZ camera",
  cctvAnpr: "ANPR camera",
  cctvNvr: "Network recorder",
  cctvPoe: "PoE switch",
  cctvSwitch: "Network switch",
  accessReader: "Card reader",
  accessKeypad: "Keypad reader",
  accessDoorContact: "Door contact",
  accessMaglock: "Magnetic lock",
  accessStrike: "Electric strike",
  accessRte: "Request to exit",
  accessBreakGlass: "Emergency door release",
  accessAcu: "Access controller",
  accessPsu: "Access power supply",
});
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (text) => {
  throw new Error(`Invalid Zone Sketch save: ${text}`);
};
const text = (value, field, max = 10000) => {
  if (typeof value !== "string" || value.length > max) fail(field);
};
const point = (value, field) => {
  if (
    !isObject(value) ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    value.x < 0 ||
    value.x > 1 ||
    value.y < 0 ||
    value.y > 1
  )
    fail(`${field} position`);
};
const imagePattern =
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
function validateImage(value, field) {
  if (
    typeof value !== "string" ||
    !imagePattern.test(value) ||
    value.split(",")[1].length % 4 !== 0
  )
    fail(`${field} must contain an embedded PNG, JPEG or WebP image`);
}
function inspectTree(value, depth = 0, counter = { count: 0 }) {
  if (depth > 40 || ++counter.count > 500000) fail("drawing is too complex");
  if (value && typeof value === "object")
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        fail("unsafe object key");
      if (key === "image" && child) validateImage(child, "Image");
      inspectTree(child, depth + 1, counter);
    }
}
function checkedArray(value, field, required = false, limit = 20000) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > limit) fail(field);
  return value;
}
function checkPhotos(photos) {
  const ids = new Set();
  for (const photo of checkedArray(photos, "device photos", false, 6)) {
    if (
      !isObject(photo) ||
      typeof photo.id !== "string" ||
      !photo.id ||
      ids.has(photo.id)
    )
      fail("device photo ID");
    ids.add(photo.id);
    text(photo.caption, "photo caption", 160);
    text(photo.createdAt, "photo date");
    validateImage(photo.image, "Device photo");
    if (photo.image.length > 4000000) fail("device photo is too large");
  }
}
function checkProject(project, depth = 0) {
  if (!isObject(project)) fail("missing project");
  text(project.site, "site name", 500);
  if (project.meta !== undefined && !isObject(project.meta))
    fail("drawing metadata");
  for (const key of ["drawingRef", "revision", "surveyedBy", "surveyDate"])
    if (project.meta?.[key] !== undefined) text(project.meta[key], key);
  if (
    project.fireWorkType !== undefined &&
    !["fresh", "additional"].includes(project.fireWorkType)
  )
    fail("fire work type");
  const floors = checkedArray(project.floors, "floors", true, 100);
  if (!floors.length) fail("no floors");
  const floorIds = new Set();
  for (const floor of floors) {
    if (
      !isObject(floor) ||
      typeof floor.id !== "string" ||
      !floor.id ||
      floorIds.has(floor.id)
    )
      fail("floor ID is missing or duplicated");
    floorIds.add(floor.id);
    text(floor.name, "floor name");
    if (!isObject(floor.data)) fail("floor data");
    for (const key of [...REQUIRED_ARRAYS, ...OPTIONAL_ARRAYS]) {
      const items = checkedArray(
        floor.data[key],
        `${floor.name}: ${key}`,
        REQUIRED_ARRAYS.includes(key),
      );
      const ids = new Set();
      for (const item of items) {
        if (
          !isObject(item) ||
          typeof item.id !== "string" ||
          !item.id ||
          ids.has(item.id)
        )
          fail(`${floor.name}: invalid or duplicate ${key} ID`);
        ids.add(item.id);
        for (const field of ["text", "name", "reference", "color"])
          if (item[field] !== undefined) text(item[field], field);
        if (key === "zones") {
          text(item.number, "zone number");
          text(item.color, "zone colour");
        }
        if (["symbols", "notes", "labels", "pins", "cableJoints"].includes(key))
          point(item, key);
        if (["doors", "windows", "shutters", "stairs"].includes(key)) {
          point(item.a, key);
          point(item.b, key);
        }
        if (["shapes", "walls", "existingCables"].includes(key)) {
          for (const p of checkedArray(item.points, `${key} points`, true))
            point(p, key);
        }
        if (key === "symbols") {
          text(item.type, "symbol type");
          checkPhotos(item.photos);
        }
        if (key === "connections") {
          text(item.sourceId, "connection source");
          text(item.targetId, "connection target");
          text(item.connectionType, "connection type");
          for (const p of checkedArray(
            item.route,
            "connection route",
            false,
            100,
          ))
            point(p, "connection");
        }
        if (key === "circuits") {
          for (const leg of checkedArray(item.legs, "circuit legs")) {
            if (!isObject(leg)) fail("circuit leg");
            for (const p of checkedArray(leg.points, "circuit route", true))
              point(p, "circuit");
          }
        }
      }
    }
  }
  if (!floorIds.has(project.activeFloor)) fail("active floor is missing");
  for (const revision of checkedArray(project.revisions, "revisions")) {
    if (!isObject(revision)) fail("revision");
    text(revision.note, "revision note");
    text(revision.at, "revision date");
  }
  const issueIds = new Set();
  for (const issue of checkedArray(
    project.issuedAsFits,
    "issued records",
    false,
    1000,
  )) {
    if (depth > 0) fail("nested issued snapshots");
    if (
      !isObject(issue) ||
      typeof issue.id !== "string" ||
      !issue.id ||
      issueIds.has(issue.id)
    )
      fail("issued snapshot ID");
    issueIds.add(issue.id);
    for (const key of ["revision", "note", "by", "at"])
      text(issue[key], `issued ${key}`);
    checkProject(issue.project, depth + 1);
  }
}
/** Validation has no side effects. The returned value is detached from the input. */
export function parseZoneSketch(input) {
  let raw;
  try {
    const serialized =
      typeof input === "string" ? input : JSON.stringify(input);
    if (
      !serialized ||
      new TextEncoder().encode(serialized).length > 32 * 1024 * 1024
    )
      fail("file must be under 32 MiB");
    raw = JSON.parse(serialized);
  } catch (error) {
    if (error.message.startsWith("Invalid Zone Sketch")) throw error;
    fail("file is not valid JSON");
  }
  if (
    !isObject(raw) ||
    !["ZoneSketchByWill", "ZoneSketch"].includes(raw.format) ||
    raw.version !== 1
  )
    fail(
      "unsupported format or version (expected ZoneSketchByWill or ZoneSketch, version 1)",
    );
  inspectTree(raw);
  checkProject(raw.project);
  if (raw.issuedAsFit !== undefined) {
    if (!isObject(raw.issuedAsFit)) fail("issued record metadata");
    for (const key of ["id", "revision", "note", "by", "at"])
      text(raw.issuedAsFit[key], `issued ${key}`);
  }
  return raw;
}
export function zoneSourceKeys(input) {
  const raw = typeof input === "string" ? parseZoneSketch(input) : input;
  return (raw.project?.floors || []).map(
    (floor) => `zonesketch:floor:${floor.id}`,
  );
}
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : isObject(value)
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
async function digest(value) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(value)),
  );
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
function assetsFor(project, siteId) {
  return project.floors.flatMap((floor) =>
    floor.data.symbols
      .filter((item) => Object.hasOwn(DEVICE_NAMES, item.type))
      .map((item) => ({
        id: `${siteId}/asset/${encodeURIComponent(floor.id)}/${encodeURIComponent(item.id)}`,
        sourceId: item.id,
        sourceFloorId: floor.id,
        floorId: floor.id,
        floorName: floor.name,
        type: item.type,
        typeName: DEVICE_NAMES[item.type],
        reference: item.reference || item.systemData?.name || "",
        x: item.x,
        y: item.y,
        photos: structuredClone(item.photos || []),
        drawingStatus: item.recordState?.state || "notRecorded",
        systemData: structuredClone(item.systemData || {}),
        source: structuredClone(item),
      })),
  );
}
export async function importZoneSketch(
  input,
  { siteId = `site-${crypto.randomUUID()}` } = {},
) {
  const source = parseZoneSketch(input),
    project = source.project;
  const warnings = [];
  if (!project.site.trim())
    warnings.push("Site name is missing. Enter a name before creating a job.");
  if (!project.meta?.revision)
    warnings.push("Drawing revision is not recorded.");
  if (!project.meta?.drawingRef)
    warnings.push("Drawing reference is not recorded.");
  warnings.push(
    "Manufacturer, model, loop and address are not inferred from symbols or references. Check equipment onsite.",
  );
  if (!project.systemType)
    warnings.push(
      "System type is missing; confirm the system before starting work.",
    );
  if (
    project.systemType &&
    !["fire", "security", "cctv", "access"].includes(project.systemType)
  )
    warnings.push(
      `Unsupported system type “${project.systemType}” retained as supplied.`,
    );
  const assets = assetsFor(project, siteId);
  let excludedObjects = 0,
    unknownSymbols = 0;
  for (const floor of project.floors) {
    excludedObjects += REQUIRED_ARRAYS.filter(
      (key) => key !== "symbols",
    ).reduce((sum, key) => sum + floor.data[key].length, 0);
    for (const item of floor.data.symbols)
      if (!Object.hasOwn(DEVICE_NAMES, item.type)) {
        excludedObjects++;
        if (item.type !== "you") unknownSymbols++;
      }
    if (
      !floor.data.image &&
      !floor.data.walls.length &&
      !floor.data.shapes.length
    )
      warnings.push(
        `${floor.name}: no background image or building outline is recorded.`,
      );
  }
  if (unknownSymbols)
    warnings.push(
      `${unknownSymbols} unrecognised symbol(s) retained in the drawing data and excluded from equipment. Review these in Zone Sketch.`,
    );
  if (assets.some((asset) => !asset.reference))
    warnings.push(
      "Some equipment has no device reference; its source ID is retained.",
    );
  warnings.push(
    "The plan is a simplified read-only view. Detailed symbol artwork, relationship overlays and drawing filters are retained in the original data but are not reproduced exactly.",
  );
  const id = `drawing-${await digest({ project, issuedAsFit: source.issuedAsFit || null })}`;
  const issuedSnapshots = (project.issuedAsFits || []).map((issue) => ({
    ...structuredClone(issue),
    kind: "issued",
    floors: structuredClone(issue.project.floors),
    assets: assetsFor(issue.project, siteId),
  }));
  const drawing = {
    id,
    revision: project.meta?.revision || "",
    drawingRef: project.meta?.drawingRef || "",
    systemType: project.systemType || "",
    fireWorkType: project.fireWorkType || "",
    kind: source.issuedAsFit ? "issued" : "working",
    issuedMetadata: source.issuedAsFit || null,
    floors: structuredClone(project.floors),
    assets,
    revisions: structuredClone(project.revisions || []),
    issuedSnapshots,
    source,
    sourceKeys: zoneSourceKeys(source),
    warnings,
  };
  const site = {
    id: siteId,
    name: project.site,
    address: "",
    sourceKeys: zoneSourceKeys(source),
    drawings: [drawing],
    createdAt: new Date().toISOString(),
  };
  const photos = assets.reduce(
    (count, asset) => count + asset.photos.length,
    0,
  );
  const summary = {
    siteName: project.site,
    floors: project.floors.length,
    devices: assets.length,
    photos,
    zones: project.floors.reduce((n, floor) => n + floor.data.zones.length, 0),
    circuits: project.floors.reduce(
      (n, floor) => n + (floor.data.circuits || []).length,
      0,
    ),
    issuedSnapshots: issuedSnapshots.length,
    revisions: drawing.revisions.length,
    excludedObjects,
    unknownSymbols,
    format: source.format,
    version: source.version,
  };
  return { site, drawing, summary, warnings };
}

/** Review-only reconciliation: this never edits a site, drawing, asset or visit. */
export function compareDrawings(previous, incoming) {
  const before = new Map(
    (previous?.assets || []).map((asset) => [asset.id, asset]),
  );
  const after = new Map(
    (incoming?.assets || []).map((asset) => [asset.id, asset]),
  );
  const summary = {
    sameDrawing: Boolean(previous && previous.id === incoming?.id),
    added: [],
    removed: [],
    moved: [],
    changed: [],
    unchanged: [],
    floorsAdded: [],
    floorsRemoved: [],
    floorsRenamed: [],
  };
  const describe = (asset) => ({
    id: asset.id,
    reference: asset.reference || "",
    type: asset.type,
    floorId: asset.floorId,
    floorName: asset.floorName || "",
  });
  const details = (asset) => {
    // Coordinate-only changes are listed as moved, not counted twice as changed.
    const source = { ...(asset.source || {}) };
    delete source.x;
    delete source.y;
    return {
      type: asset.type,
      reference: asset.reference || "",
      photos: asset.photos || [],
      drawingStatus: asset.drawingStatus || "",
      systemData: asset.systemData || {},
      source,
    };
  };
  for (const [assetId, asset] of after) {
    const old = before.get(assetId);
    if (!old) {
      summary.added.push(describe(asset));
      continue;
    }
    let changed = false;
    if (
      old.x !== asset.x ||
      old.y !== asset.y ||
      old.floorId !== asset.floorId
    ) {
      summary.moved.push({
        ...describe(asset),
        from: { x: old.x, y: old.y, floorId: old.floorId },
        to: { x: asset.x, y: asset.y, floorId: asset.floorId },
      });
      changed = true;
    }
    if (canonical(details(old)) !== canonical(details(asset))) {
      summary.changed.push(describe(asset));
      changed = true;
    }
    if (!changed) summary.unchanged.push(describe(asset));
  }
  for (const [assetId, asset] of before)
    if (!after.has(assetId)) summary.removed.push(describe(asset));
  const floorsBefore = new Map(
    (previous?.floors || []).map((floor) => [floor.id, floor]),
  );
  const floorsAfter = new Map(
    (incoming?.floors || []).map((floor) => [floor.id, floor]),
  );
  for (const [floorId, floor] of floorsAfter) {
    const old = floorsBefore.get(floorId);
    if (!old) summary.floorsAdded.push({ id: floorId, name: floor.name });
    else if (old.name !== floor.name)
      summary.floorsRenamed.push({
        id: floorId,
        from: old.name,
        to: floor.name,
      });
  }
  for (const [floorId, floor] of floorsBefore)
    if (!floorsAfter.has(floorId))
      summary.floorsRemoved.push({ id: floorId, name: floor.name });
  return summary;
}
