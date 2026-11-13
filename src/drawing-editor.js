/** Jobs working-drawing editor with separately licensed Zone Sketch geometry helpers. */
import { DEVICE_NAMES, parseZoneSketch } from "./zone-import.js";
import {
  clamp,
  cbBoardToPlan,
  cbEditProjectToSegment,
} from "../vendor/zonesketch/geometry.js";

const clone = (value) => structuredClone(value);
const SYSTEMS = {
  fire: "Fire alarm",
  security: "Intruder alarm",
  cctv: "CCTV",
  access: "Access control",
};
const DEFAULT_TYPES = {
  fire: "smoke",
  security: "secPir",
  cctv: "cctvFixed",
  access: "accessReader",
};
const requireSystem = (value) => {
  if (!Object.hasOwn(SYSTEMS, value))
    throw Error("Choose a Drawing system before saving or exporting.");
  return value;
};
const uid = () => crypto.randomUUID();
const arrays = [
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
  "connections",
  "circuits",
  "existingCables",
  "cableJoints",
];
const floorKeys = [
  ...arrays,
  "additionalSetup",
  "asFit",
  "activeZoneId",
  "pictureOpacity",
  "pictureVisible",
  "pictureBrightness",
  "pictureContrast",
  "pictureGrayscale",
  "isBlank",
  "gridVisible",
  "snapGrid",
  "gridSize",
  "wallWidth",
  "locks",
  "layers",
  "image",
];
const isPoint = (value) =>
  value &&
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  value.x >= 0 &&
  value.x <= 1 &&
  value.y >= 0 &&
  value.y <= 1;
const requirePoint = (value) => {
  if (!isPoint(value))
    throw Error("Positions must be numbers between 0 and 1.");
  return { x: value.x, y: value.y };
};
const coordinate = (value) => {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  )
    throw Error("Enter both X and Y positions.");
  const number = Number(value);
  if (!Number.isFinite(number))
    throw Error("Positions must be finite numbers between 0 and 1.");
  return number;
};
const findFloor = (draft, id) => {
  const floor = draft.floors.find((f) => f.id === id);
  if (!floor) throw Error("Choose an included floor.");
  return floor;
};
const changes = (draft, note) => {
  draft.editChanges.push(note);
};
const flagRoutes = (draft) => {
  if (
    draft.floors.some(
      (f) => f.data.circuits.length || f.data.connections.length,
    )
  )
    draft.editWarnings = [
      "Device or building edits do not automatically reroute circuits. Review the retained circuit and connection routes.",
    ];
};
const symbolFor = (draft, asset) =>
  findFloor(draft, asset.floorId).data.symbols.find(
    (s) => s.id === asset.sourceId,
  );
function normalizeFloor(floor) {
  floor.data ||= {};
  for (const key of arrays) floor.data[key] ||= [];
  return floor;
}

/** Detached editable copy. Issued records can only be viewed, never edited. */
export function createDrawingDraft(drawing, { siteId, siteName } = {}) {
  if (drawing.kind === "issued")
    throw Error(
      "Issued records are read-only. Import or select a working drawing to edit.",
    );
  if (!siteId) throw Error("A stable site ID is required.");
  const draft = clone(drawing);
  draft.systemType =
    drawing.systemType || drawing.source?.project?.systemType || "";
  draft.floors = (draft.floors || []).map(normalizeFloor);
  if (!draft.floors.length)
    draft.floors.push(
      normalizeFloor({ id: uid(), name: "Ground floor", data: {} }),
    );
  draft.assets ||= [];
  draft._editingSiteId = siteId;
  draft._editingSiteName =
    siteName || drawing.source?.project?.site || "Untitled site";
  draft._editingBaseId = drawing.id;
  draft._editingBaseRevision = String(drawing.revision || "Drawing");
  draft.editChanges = [];
  draft.editWarnings = [];
  for (const asset of draft.assets) {
    if (!draft.floors.some((f) => f.id === asset.floorId)) {
      asset.floorId = draft.floors[0].id;
      asset.floorName = draft.floors[0].name;
    }
    const floor = findFloor(draft, asset.floorId);
    asset.sourceId ||= `jobs-${asset.id}`;
    const existingSymbol = floor.data.symbols.find(
      (s) => s.id === asset.sourceId,
    );
    if (existingSymbol && isPoint(existingSymbol)) {
      asset.x = existingSymbol.x;
      asset.y = existingSymbol.y;
    } else if (!existingSymbol && isPoint(asset)) {
      floor.data.symbols.push({
        id: asset.sourceId,
        type: asset.type,
        reference: asset.reference || "",
        x: asset.x,
        y: asset.y,
        photos: clone(asset.photos || []),
      });
    }
  }
  return draft;
}
export function updateDrawingDevice(draft, assetId, values) {
  const asset = draft.assets.find((a) => a.id === assetId);
  if (!asset) throw Error("Device not found.");
  const p = requirePoint({
    x: coordinate(values.x === undefined ? asset.x : values.x),
    y: coordinate(values.y === undefined ? asset.y : values.y),
  });
  const type = String(values.type ?? asset.type);
  if (type !== asset.type && !Object.hasOwn(DEVICE_NAMES, type))
    throw Error("Choose a supported equipment type.");
  const reference = String(values.reference ?? asset.reference ?? "").trim();
  let symbol = symbolFor(draft, asset);
  if (!symbol) {
    symbol = {
      id: asset.sourceId,
      type: asset.type,
      reference: asset.reference || "",
      photos: clone(asset.photos || []),
    };
    findFloor(draft, asset.floorId).data.symbols.push(symbol);
  }
  Object.assign(asset, p, {
    type,
    typeName: DEVICE_NAMES[type] || type,
    reference,
  });
  Object.assign(symbol, p, { type, reference });
  asset.source = clone(symbol);
  changes(draft, `Updated device ${reference || asset.sourceId}.`);
  flagRoutes(draft);
  return asset;
}
export function addDrawingDevice(
  draft,
  floorId,
  { type = "smoke", reference = "", x = 0.5, y = 0.5 } = {},
) {
  if (!Object.hasOwn(DEVICE_NAMES, type))
    throw Error("Choose a supported equipment type.");
  const floor = findFloor(draft, floorId),
    p = requirePoint({ x: coordinate(x), y: coordinate(y) }),
    sourceId = uid();
  const symbol = {
    id: sourceId,
    type,
    reference: String(reference).trim(),
    ...p,
    photos: [],
  };
  const asset = {
    id: `${draft._editingSiteId}/asset/${encodeURIComponent(floorId)}/${encodeURIComponent(sourceId)}`,
    sourceId,
    sourceFloorId: floorId,
    floorId,
    floorName: floor.name,
    type,
    typeName: DEVICE_NAMES[type],
    reference: symbol.reference,
    ...p,
    photos: [],
    drawingStatus: "notRecorded",
    systemData: {},
    source: clone(symbol),
  };
  floor.data.symbols.push(symbol);
  draft.assets.push(asset);
  changes(draft, `Added device ${asset.reference || sourceId}.`);
  flagRoutes(draft);
  return asset;
}
export function removeDrawingDevice(draft, assetId) {
  const asset = draft.assets.find((a) => a.id === assetId);
  if (!asset) throw Error("Device not found.");
  const floor = findFloor(draft, asset.floorId);
  floor.data.symbols = floor.data.symbols.filter(
    (s) => s.id !== asset.sourceId,
  );
  floor.data.connections = floor.data.connections.filter(
    (c) => c.sourceId !== asset.sourceId && c.targetId !== asset.sourceId,
  );
  draft.assets = draft.assets.filter((a) => a.id !== assetId);
  changes(
    draft,
    `Removed device ${asset.reference || asset.sourceId} from the working drawing.`,
  );
  flagRoutes(draft);
}
export function addDrawingWall(draft, floorId, points) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 500)
    throw Error("A wall needs 2–500 points.");
  const wall = { id: uid(), kind: "wall", points: points.map(requirePoint) };
  if (
    wall.points.every(
      (p) => p.x === wall.points[0].x && p.y === wall.points[0].y,
    )
  )
    throw Error("Choose two different wall points.");
  findFloor(draft, floorId).data.walls.push(wall);
  changes(draft, "Added building wall.");
  flagRoutes(draft);
  return wall;
}
export function updateDrawingWall(draft, floorId, wallId, points) {
  const wall = findFloor(draft, floorId).data.walls.find(
    (w) => w.id === wallId,
  );
  if (!wall) throw Error("Wall not found.");
  if (!Array.isArray(points) || points.length < 2 || points.length > 500)
    throw Error("A wall needs 2–500 points.");
  const next = points.map(requirePoint);
  if (next.every((p) => p.x === next[0].x && p.y === next[0].y))
    throw Error("Choose two different wall points.");
  wall.points = next;
  changes(draft, "Edited building wall.");
  flagRoutes(draft);
  return wall;
}
export function addDrawingRoom(draft, floorId, a, b, label = "") {
  requirePoint(a);
  requirePoint(b);
  if (Math.abs(a.x - b.x) < 0.001 || Math.abs(a.y - b.y) < 0.001)
    throw Error("Choose opposite corners of a room.");
  const points = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
  const wall = addDrawingWall(draft, floorId, points);
  if (String(label).trim())
    addDrawingLabel(draft, floorId, {
      text: label,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
  return wall;
}
export function removeDrawingObject(draft, floorId, kind, id) {
  if (!["walls", "labels"].includes(kind))
    throw Error("This drawing object cannot be removed here.");
  const floor = findFloor(draft, floorId);
  if (!floor.data[kind].some((item) => item.id === id))
    throw Error("Drawing object not found.");
  floor.data[kind] = floor.data[kind].filter((item) => item.id !== id);
  changes(draft, `Removed ${kind === "walls" ? "wall" : "label"}.`);
  flagRoutes(draft);
}
export function addDrawingLabel(
  draft,
  floorId,
  { text = "", x = 0.5, y = 0.5 } = {},
) {
  if (!String(text).trim()) throw Error("Enter label text.");
  const label = {
    id: uid(),
    text: String(text).trim().slice(0, 250),
    ...requirePoint({ x: coordinate(x), y: coordinate(y) }),
    scale: 1,
  };
  findFloor(draft, floorId).data.labels.push(label);
  changes(draft, "Added drawing label.");
  return label;
}
export function updateDrawingLabel(draft, floorId, id, { text, x, y }) {
  const label = findFloor(draft, floorId).data.labels.find((l) => l.id === id);
  if (!label) throw Error("Label not found.");
  if (!String(text).trim()) throw Error("Enter label text.");
  Object.assign(label, {
    text: String(text).trim().slice(0, 250),
    ...requirePoint({ x: coordinate(x), y: coordinate(y) }),
  });
  changes(draft, "Edited drawing label.");
  return label;
}
export function renameDrawingFloor(draft, floorId, name) {
  if (!String(name).trim()) throw Error("Enter a floor name.");
  const floor = findFloor(draft, floorId);
  floor.name = String(name).trim().slice(0, 250);
  for (const asset of draft.assets.filter((a) => a.floorId === floorId))
    asset.floorName = floor.name;
  changes(draft, "Renamed floor.");
}
export function addDrawingFloor(draft, name) {
  if (!String(name).trim()) throw Error("Enter a floor name.");
  if (draft.floors.length >= 100)
    throw Error("A drawing supports at most 100 floors.");
  const floor = normalizeFloor({
    id: uid(),
    name: String(name).trim().slice(0, 250),
    data: { isBlank: true },
  });
  draft.floors.push(floor);
  changes(draft, "Added floor.");
  return floor;
}
/** Finalize a new immutable snapshot without mutating the prior source or draft. */
export function createDrawingRevision(
  draft,
  { revision, engineer = "", at = new Date().toISOString() } = {},
) {
  if (draft.kind === "issued") throw Error("Issued records are read-only.");
  requireSystem(draft.systemType);
  const result = clone(draft),
    sequence = (draft.editSequence || 0) + 1;
  result.id = `drawing-${uid()}`;
  result.revision = String(
    revision || `${draft._editingBaseRevision} / Jobs ${sequence}`,
  ).trim();
  result.kind = "working";
  result.basedOnDrawingId = draft._editingBaseId;
  result.editSequence = sequence;
  result.editedAt = at;
  result.editedBy = engineer;
  result.siteName = draft._editingSiteName;
  result.revisions = [
    ...(draft.revisions || []),
    {
      id: uid(),
      at,
      by: engineer,
      note: `Jobs working edit: ${draft.editChanges.join(" ") || "Drawing reviewed."}`,
    },
  ];
  for (const key of Object.keys(result))
    if (key.startsWith("_editing")) delete result[key];
  return result;
}
/** Rebuild the observed current save envelope; .source itself remains untouched. */
export function buildEditableZoneSketch(drawing, { siteName } = {}) {
  if (drawing.kind === "issued")
    throw Error(
      "Issued snapshots cannot be exported as edited working drawings.",
    );
  const project = clone(drawing.source?.project || {});
  project.site =
    siteName || drawing.siteName || project.site || "Untitled site";
  project.systemType = requireSystem(drawing.systemType || project.systemType);
  project.fireWorkType =
    drawing.fireWorkType || project.fireWorkType || "fresh";
  project.systemConfig ||= {};
  const unplaced = (drawing.assets || []).find(
    (asset) =>
      !isPoint(asset) ||
      !drawing.floors.some(
        (floor) =>
          floor.id === asset.floorId &&
          floor.data.symbols?.some((symbol) => symbol.id === asset.sourceId),
      ),
  );
  if (unplaced)
    throw Error(
      `Place equipment “${unplaced.reference || unplaced.type}” on the plan before exporting an editable Zone Sketch file. Unplaced equipment stays in the Jobs asset register.`,
    );
  project.floors = clone(drawing.floors).map(normalizeFloor);
  project.activeFloor = project.floors.some((f) => f.id === project.activeFloor)
    ? project.activeFloor
    : project.floors[0]?.id;
  if (!project.activeFloor)
    throw Error("Include a floor before exporting a drawing.");
  project.meta = {
    ...(project.meta || {}),
    drawingRef: drawing.drawingRef || project.meta?.drawingRef || "",
    revision: String(drawing.revision || ""),
  };
  project.revisions = clone(drawing.revisions || project.revisions || []);
  project.issuedAsFits = drawing.issuedSnapshots
    ? drawing.issuedSnapshots.map((snapshot) => {
        const issue = clone(snapshot);
        delete issue.floors;
        delete issue.assets;
        delete issue.kind;
        return issue;
      })
    : clone(project.issuedAsFits || []);
  for (const floor of project.floors)
    for (const symbol of floor.data.symbols)
      if (symbol.type !== "you" && !Object.hasOwn(DEVICE_NAMES, symbol.type))
        throw Error(
          `Equipment type “${symbol.type}” has no Zone Sketch symbol. Choose a supported type before exporting an editable Zone Sketch file.`,
        );
  const active = project.floors.find((f) => f.id === project.activeFloor);
  for (const key of floorKeys) {
    delete project[key];
    if (active.data[key] !== undefined) project[key] = clone(active.data[key]);
  }
  // Validation is independent and runs before any download; no compatibility assertion for arbitrary data.
  return parseZoneSketch({ format: "ZoneSketchByWill", version: 1, project });
}

const NS = "http://www.w3.org/2000/svg";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const svgNode = (name, attrs = {}, text) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs))
    node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
};
const safeImage = (value) =>
  typeof value === "string" &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
const field = (label, name, value = "", type = "text") =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type === "number" ? 'step="0.001" min="0" max="1"' : ""}></label>`;
const pointFields = (point = { x: 0.5, y: 0.5 }) =>
  field("Position X (0–1)", "x", point.x, "number") +
  field("Position Y (0–1)", "y", point.y, "number");
const typeField = (type) =>
  `<label>Equipment type<select name="type">${!Object.hasOwn(DEVICE_NAMES, type) ? `<option value="${esc(type)}">${esc(type)} (manual type)</option>` : ""}${Object.entries(
    DEVICE_NAMES,
  )
    .map(
      ([value, name]) =>
        `<option value="${value}" ${value === type ? "selected" : ""}>${esc(name)}</option>`,
    )
    .join("")}</select></label>`;
const pointText = (points) => points.map((p) => `${p.x}, ${p.y}`).join("\n");
function readPoints(value) {
  const lines = String(value).trim().split(/\n|;/).filter(Boolean);
  return lines.map((line) => {
    const parts = line
      .trim()
      .split(/\s*,\s*|\s+/)
      .filter(Boolean);
    if (parts.length !== 2) throw Error("Enter one X, Y pair per line.");
    return requirePoint({ x: Number(parts[0]), y: Number(parts[1]) });
  });
}

/** Touch-friendly editor. onSave returns false to keep the draft after a failed save. */
export function renderDrawingEditor(
  drawing,
  {
    siteId,
    siteName,
    onSave = async () => true,
    onCancel = () => {},
    onDirty = () => {},
  } = {},
) {
  const draft = createDrawingDraft(drawing, { siteId, siteName });
  const root = document.createElement("section");
  root.className = "drawing-editor";
  let floorId = draft.floors[0].id,
    tool = "select",
    selected = null,
    pending = [],
    dirty = false,
    saving = false,
    notice = "",
    error = "",
    zoom = 1,
    ratio = 0.625,
    snapToWalls = true,
    formDirty = false,
    revisionLabel = `${draft._editingBaseRevision} / Jobs ${(draft.editSequence || 0) + 1}`;
  const floorNames = new Map();
  const history = [];
  const mark = () => {
    dirty = true;
    onDirty(true);
  };
  const snapshot = () =>
    clone({
      floors: draft.floors,
      assets: draft.assets,
      editChanges: draft.editChanges,
      editWarnings: draft.editWarnings,
    });
  const mutate = (fn) => {
    history.push(snapshot());
    if (history.length > 8) history.shift();
    try {
      const result = fn();
      mark();
      error = "";
      notice = "Drawing changes are not saved yet.";
      return result;
    } catch (e) {
      Object.assign(draft, history.pop());
      throw e;
    }
  };
  const showError = (e) => {
    error = e.message;
    const box = root.querySelector("[role=status]");
    if (box) {
      box.textContent = error;
      box.className = "edit-error";
    }
  };
  const flushInspector = () => {
    if (!formDirty) return;
    const form = root.querySelector(".edit-inspector form");
    if (form) submit(form);
    formDirty = false;
  };
  const run = (fn, { flush = true } = {}) => {
    if (saving) return;
    try {
      if (flush) flushInspector();
      fn();
      paint();
    } catch (e) {
      showError(e);
    }
  };
  function selection() {
    const floor = findFloor(draft, floorId);
    if (selected?.kind === "device")
      return draft.assets.find((a) => a.id === selected.id);
    if (selected)
      return floor.data[selected.kind]?.find((o) => o.id === selected.id);
    return null;
  }
  function inspector() {
    const item = selection();
    if (item && selected.kind === "device")
      return `<h3>Edit device</h3>${!isPoint(item) ? '<p class="muted">This equipment has no recorded position. Use Move selected and tap the plan, or enter both coordinates to place it.</p>' : ""}<form data-editor-form="device">${field("Device reference", "reference", item.reference)}${typeField(item.type)}<div class="edit-form-grid">${pointFields(item)}</div><button type="submit">Apply device changes</button></form><p class="muted">Choose Move selected, then tap the new position; or enter exact coordinates.</p>`;
    if (item && selected.kind === "walls")
      return `<h3>Edit wall</h3><form data-editor-form="wall"><label>Wall points (X, Y per line)<textarea name="points" rows="5">${esc(pointText(item.points))}</textarea></label><button type="submit">Apply wall changes</button></form>`;
    if (item && selected.kind === "labels")
      return `<h3>Edit label</h3><form data-editor-form="label">${field("Label text", "text", item.text)}<div class="edit-form-grid">${pointFields(item)}</div><button type="submit">Apply label changes</button></form>`;
    return `<p class="muted">Select equipment, a wall or a label to edit it. Choose an add tool, then tap the plan. Draw walls point by point and choose Finish wall.</p><form data-editor-form="add-device"><h3>Add equipment with coordinates</h3>${field("New device reference", "reference")}${typeField(DEFAULT_TYPES[draft.systemType] || "smoke")}<div class="edit-form-grid">${pointFields()}</div><button type="submit">Add device at coordinates</button></form>`;
  }
  function paint() {
    const floor = findFloor(draft, floorId);
    root.innerHTML = `
      <div class="section-head"><div><span class="eyebrow">WORKING DRAWING EDITOR</span><h2>Edit drawing</h2></div><span class="badge">${dirty ? "Unsaved drawing" : "New working revision"}</span></div>
      <p class="muted">Original project and issued snapshots remain unchanged. A new working revision is created when saved.</p>
      <div role="status" class="${error ? "edit-error" : "muted"}">${esc(error || notice)}</div>
      <div class="edit-floor-fields"><label>Drawing system<select id="edit-system"><option value="">Choose system</option>${Object.entries(
        SYSTEMS,
      )
        .map(
          ([value, name]) =>
            `<option value="${value}" ${draft.systemType === value ? "selected" : ""}>${name}</option>`,
        )
        .join(
          "",
        )}</select></label><label>Editing floor<select id="editing-floor">${draft.floors.map((f) => `<option value="${esc(f.id)}" ${floorId === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label><form data-editor-form="floor-name">${field("Floor name", "name", floorNames.get(floorId) ?? floor.name)}<button type="submit">Rename floor</button></form></div>
      <div class="edit-toolbar" aria-label="Drawing tools">${[
        ["select", "Select"],
        ["move", "Move selected"],
        ["device", "Add device"],
        ["wall", "Add wall"],
        ["room", "Add room"],
        ["label", "Add label"],
      ]
        .map(
          ([value, label]) =>
            `<button type="button" data-tool="${value}" aria-pressed="${tool === value}">${label}</button>`,
        )
        .join(
          "",
        )}<button type="button" data-edit="finish" ${pending.length < 2 ? "disabled" : ""}>Finish wall</button><button type="button" data-edit="delete" ${!selected ? "disabled" : ""}>Delete selected</button><button type="button" data-edit="undo" ${!history.length ? "disabled" : ""}>Undo</button></div><label class="edit-snap"><input id="edit-snap" type="checkbox" ${snapToWalls ? "checked" : ""}> Snap new points to nearby walls</label>
      <p class="muted" id="edit-tool-hint">${esc(tool === "wall" ? `Tap each wall point (${pending.length} placed), then Finish wall.` : tool === "room" ? `Tap two opposite room corners (${pending.length} placed).` : tool === "move" ? "Tap a new position for the selected device or label." : tool === "device" ? "Tap to place a new device; edit its type and reference below." : tool === "label" ? "Tap to add a label, then edit its text below." : "Tap an object, or choose one below the plan.")}</p>
      <div class="edit-layout"><div><div class="edit-actions"><button type="button" data-edit="zoom-out">Zoom out</button><span>${Math.round(zoom * 100)}%</span><button type="button" data-edit="zoom-in">Zoom in</button><button type="button" data-edit="fit">Fit</button></div><div class="edit-canvas-wrap"></div><label class="edit-object-picker">Choose drawing object<select id="edit-object"><option value="">Select an object</option>${draft.assets
        .filter((a) => a.floorId === floorId)
        .map(
          (a) =>
            `<option value="device:${esc(a.id)}" ${selected?.kind === "device" && selected.id === a.id ? "selected" : ""}>Device · ${esc(a.reference || a.typeName || a.type)}${isPoint(a) ? "" : " (unplaced)"}</option>`,
        )
        .join(
          "",
        )}${floor.data.walls.map((w, i) => `<option value="walls:${esc(w.id)}" ${selected?.kind === "walls" && selected.id === w.id ? "selected" : ""}>Wall ${i + 1}</option>`).join("")}${floor.data.labels.map((l) => `<option value="labels:${esc(l.id)}" ${selected?.kind === "labels" && selected.id === l.id ? "selected" : ""}>Label · ${esc(l.text)}</option>`).join("")}</select></label></div><div class="edit-inspector">${inspector()}</div></div>
      <details><summary>Add another floor</summary><form data-editor-form="add-floor">${field("New floor name", "name")}<button type="submit">Add floor</button></form></details>
      ${draft.editWarnings.map((w) => `<p class="edit-warning">${esc(w)}</p>`).join("")}
      <div class="edit-bottom"><label>Drawing revision label<input id="edit-revision" value="${esc(revisionLabel)}"></label><div class="edit-actions"><button type="button" data-edit="cancel">Cancel drawing edits</button><button type="button" data-edit="save" class="primary" ${saving ? "disabled" : ""}>${saving ? "Saving drawing…" : "Save drawing revision"}</button></div></div>`;
    root.querySelector("#edit-system").onchange = (e) =>
      run(() =>
        mutate(() => {
          draft.systemType = e.target.value;
          changes(
            draft,
            "Changed drawing system selection. Existing equipment types are retained.",
          );
        }),
      );
    root.querySelector("#editing-floor").onchange = (e) =>
      run(() => {
        floorId = e.target.value;
        selected = null;
        pending = [];
        tool = "select";
        ratio = 0.625;
      });
    root.querySelector("#edit-object").onchange = (e) =>
      run(() => {
        const value = e.target.value;
        if (!value) {
          selected = null;
          return;
        }
        const colon = value.indexOf(":");
        selected = { kind: value.slice(0, colon), id: value.slice(colon + 1) };
        tool = "select";
      });
    root.querySelectorAll("[data-tool]").forEach(
      (button) =>
        (button.onclick = () =>
          run(() => {
            tool = button.dataset.tool;
            pending = [];
          })),
    );
    root
      .querySelectorAll("[data-edit]")
      .forEach(
        (button) => (button.onclick = () => handle(button.dataset.edit)),
      );
    root.querySelectorAll("form").forEach((form) => {
      form.addEventListener("input", () => {
        mark();
        if (form.closest(".edit-inspector")) formDirty = true;
        if (form.dataset.editorForm === "floor-name")
          floorNames.set(floorId, form.elements.name.value);
      });
      form.onsubmit = (e) => {
        e.preventDefault();
        run(
          () => {
            submit(form);
            formDirty = false;
          },
          { flush: false },
        );
      };
    });
    const revisionInput = root.querySelector("#edit-revision");
    revisionInput.oninput = () => {
      revisionLabel = revisionInput.value;
      mark();
    };
    root.querySelector("#edit-snap").onchange = (e) => {
      snapToWalls = e.target.checked;
    };
    draw();
  }
  function submit(form) {
    const values = Object.fromEntries(new FormData(form));
    const item = selection();
    mutate(() => {
      if (form.dataset.editorForm === "device")
        updateDrawingDevice(draft, item.id, {
          ...values,
          x: values.x,
          y: values.y,
        });
      if (form.dataset.editorForm === "add-device") {
        const asset = addDrawingDevice(draft, floorId, {
          ...values,
          x: values.x,
          y: values.y,
        });
        selected = { kind: "device", id: asset.id };
      }
      if (form.dataset.editorForm === "wall")
        updateDrawingWall(draft, floorId, item.id, readPoints(values.points));
      if (form.dataset.editorForm === "label")
        updateDrawingLabel(draft, floorId, item.id, {
          ...values,
          x: values.x,
          y: values.y,
        });
      if (form.dataset.editorForm === "floor-name") {
        renameDrawingFloor(draft, floorId, values.name);
        floorNames.delete(floorId);
      }
      if (form.dataset.editorForm === "add-floor") {
        floorId = addDrawingFloor(draft, values.name).id;
        selected = null;
      }
    });
  }
  async function handle(action) {
    if (saving) return;
    if (action === "save") {
      try {
        const revision = root.querySelector("#edit-revision").value.trim();
        if (!revision) throw Error("Enter a revision label.");
        // Apply typed fields and finish a valid pending wall before creating the saved revision.
        flushInspector();
        for (const [id, name] of floorNames) {
          if (findFloor(draft, id).name !== name)
            mutate(() => renameDrawingFloor(draft, id, name));
        }
        floorNames.clear();
        if (pending.length) {
          if (tool === "wall" && pending.length >= 2) {
            mutate(() => addDrawingWall(draft, floorId, pending));
            pending = [];
          } else throw Error("Finish the pending wall or room before saving.");
        }
        const next = createDrawingRevision(draft, { revision });
        saving = true;
        paint();
        const saved = await onSave(next);
        if (saved !== false) {
          dirty = false;
          onDirty(false);
          notice = "Drawing revision saved.";
        } else
          error =
            "Drawing was not saved. Your draft is still open; retry after resolving the save problem.";
      } catch (e) {
        showError(e);
      } finally {
        saving = false;
        if (root.isConnected && !error) paint();
        else if (root.isConnected) {
          const button = root.querySelector("[data-edit=save]");
          if (button) {
            button.disabled = false;
            button.textContent = "Save drawing revision";
          }
        }
      }
      return;
    }
    if (action === "cancel") {
      onCancel();
      return;
    }
    run(() => {
      if (action === "finish") {
        mutate(() => {
          const wall = addDrawingWall(draft, floorId, pending);
          selected = { kind: "walls", id: wall.id };
        });
        pending = [];
        tool = "select";
      }
      if (action === "delete" && selected) {
        mutate(() => {
          if (selected.kind === "device")
            removeDrawingDevice(draft, selected.id);
          else removeDrawingObject(draft, floorId, selected.kind, selected.id);
        });
        selected = null;
        tool = "select";
      }
      if (action === "undo") {
        const previous = history.pop();
        if (previous) {
          Object.assign(draft, previous);
          selected = null;
          pending = [];
          mark();
        }
      }
      if (action === "zoom-in") zoom = Math.min(4, zoom + 0.5);
      if (action === "zoom-out") zoom = Math.max(1, zoom - 0.5);
      if (action === "fit") zoom = 1;
    });
  }
  function draw() {
    const floor = findFloor(draft, floorId),
      data = floor.data,
      width = 1000,
      height = 1000 * ratio;
    const svg = svgNode("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": "Editable floor plan",
      "data-testid": "editable-plan",
    });
    svg.classList.add("edit-canvas");
    svg.style.width = `${zoom * 100}%`;
    svg.append(svgNode("rect", { width, height, fill: "#fff" }));
    const xy = (p) => ({ x: p.x * width, y: p.y * height });
    const coords = (points) =>
      points
        .filter(isPoint)
        .map((p) => `${p.x * width},${p.y * height}`)
        .join(" ");
    if (safeImage(data.image)) {
      svg.append(
        svgNode("image", {
          href: data.image,
          x: 0,
          y: 0,
          width,
          height,
          preserveAspectRatio: "none",
          opacity: 0.65,
        }),
      );
      const image = new Image();
      image.onload = () => {
        const next = image.naturalHeight / image.naturalWidth;
        if (
          Number.isFinite(next) &&
          Math.abs(next - ratio) > 0.001 &&
          root.isConnected &&
          floorId === floor.id
        ) {
          ratio = next;
          const wrap = root.querySelector(".edit-canvas-wrap");
          wrap.replaceChildren();
          draw();
        }
      };
      image.src = data.image;
    }
    for (const shape of data.shapes) {
      const zone = data.zones.find((z) => z.id === shape.zone);
      const fill = /^#[0-9a-f]{3,8}$/i.test(zone?.color || "")
        ? zone.color
        : "#c2b8ac";
      svg.append(
        svgNode("polygon", {
          points: coords(shape.points || []),
          fill,
          opacity: 0.2,
          stroke: fill,
          "stroke-width": 1,
        }),
      );
    }
    const object = (node, kind, id) => {
      node.setAttribute("role", "button");
      node.setAttribute("tabindex", "0");
      node.setAttribute(
        "aria-label",
        kind === "walls"
          ? "Select wall"
          : kind === "labels"
            ? "Select label"
            : "Select device",
      );
      node.onclick = (e) => {
        e.stopPropagation();
        if (
          tool === "move" ||
          tool === "device" ||
          tool === "wall" ||
          tool === "room" ||
          tool === "label"
        ) {
          tap(e, svg);
          return;
        }
        run(() => {
          selected = { kind, id };
          tool = "select";
        });
      };
      node.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          run(() => {
            selected = { kind, id };
            tool = "select";
          });
        }
      };
      return node;
    };
    for (const wall of data.walls) {
      const group = svgNode("g");
      group.append(
        svgNode("polyline", {
          points: coords(wall.points || []),
          fill: "none",
          stroke: "transparent",
          "stroke-width": 24,
        }),
        svgNode("polyline", {
          points: coords(wall.points || []),
          fill: "none",
          stroke: selected?.id === wall.id ? "#b46b38" : "#4f4841",
          "stroke-width": selected?.id === wall.id ? 5 : 3,
          "vector-effect": "non-scaling-stroke",
        }),
      );
      svg.append(object(group, "walls", wall.id));
    }
    for (const key of ["doors", "windows", "shutters", "stairs"])
      for (const item of data[key])
        if (isPoint(item.a) && isPoint(item.b))
          svg.append(
            svgNode("polyline", {
              points: coords([item.a, item.b]),
              stroke: "#7c827f",
              "stroke-width": key === "windows" ? 5 : 3,
              fill: "none",
            }),
          );
    for (const cable of data.existingCables)
      svg.append(
        svgNode("polyline", {
          points: coords(cable.points || []),
          fill: "none",
          stroke: "#888",
          "stroke-width": 2,
          "stroke-dasharray": "6 5",
        }),
      );
    for (const circuit of data.circuits)
      if (circuit.bounds) {
        const b = circuit.bounds;
        for (const leg of circuit.legs || []) {
          const points = (leg.points || []).map((p) => cbBoardToPlan(p, b));
          svg.append(
            svgNode("polyline", {
              points: coords(points),
              stroke: /^#[0-9a-f]{3,8}$/i.test(circuit.color || "")
                ? circuit.color
                : "#999",
              fill: "none",
              "stroke-width": 2,
              "stroke-dasharray": "5 5",
            }),
          );
        }
      }
    for (const label of data.labels) {
      const p = xy(label);
      const group = svgNode("g");
      group.append(
        svgNode("rect", {
          x: p.x - 45,
          y: p.y - 18,
          width: 90,
          height: 28,
          fill: "transparent",
        }),
        svgNode(
          "text",
          {
            x: p.x,
            y: p.y,
            "text-anchor": "middle",
            "font-size": 16,
            fill: selected?.id === label.id ? "#b46b38" : "#332f2b",
          },
          label.text,
        ),
      );
      svg.append(object(group, "labels", label.id));
    }
    for (const asset of draft.assets.filter(
      (a) => a.floorId === floorId && isPoint(a),
    )) {
      const p = xy(asset),
        group = svgNode("g");
      group.append(
        svgNode("circle", { cx: p.x, cy: p.y, r: 24, fill: "transparent" }),
        svgNode("circle", {
          cx: p.x,
          cy: p.y,
          r: 14,
          fill: selected?.id === asset.id ? "#86664c" : "#fff",
          stroke: "#86664c",
          "stroke-width": 3,
        }),
        svgNode(
          "text",
          {
            x: p.x,
            y: p.y + 4,
            "text-anchor": "middle",
            "font-size": 10,
            fill: selected?.id === asset.id ? "#fff" : "#332f2b",
          },
          String(asset.type).slice(0, 3).toUpperCase(),
        ),
        svgNode(
          "text",
          {
            x: p.x,
            y: p.y + 34,
            "text-anchor": "middle",
            "font-size": 13,
            fill: "#332f2b",
            "paint-order": "stroke",
            stroke: "#fff",
            "stroke-width": 3,
          },
          asset.reference || asset.typeName || asset.type,
        ),
      );
      svg.append(object(group, "device", asset.id));
    }
    if (pending.length) {
      svg.append(
        svgNode("polyline", {
          points: coords(pending),
          fill: "none",
          stroke: "#b46b38",
          "stroke-width": 4,
          "stroke-dasharray": "6 4",
        }),
      );
      for (const point of pending) {
        const p = xy(point);
        svg.append(
          svgNode("circle", { cx: p.x, cy: p.y, r: 6, fill: "#b46b38" }),
        );
      }
    }
    svg.onclick = (e) => tap(e, svg);
    root.querySelector(".edit-canvas-wrap").append(svg);
  }
  function tap(event, svg) {
    const bounds = svg.getBoundingClientRect();
    let p = {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
    if (snapToWalls && tool !== "select") {
      let best = null;
      const px = { x: p.x * bounds.width, y: p.y * bounds.height };
      for (const wall of findFloor(draft, floorId).data.walls) {
        for (let i = 1; i < (wall.points || []).length; i++) {
          const a = wall.points[i - 1],
            b = wall.points[i];
          const hit = cbEditProjectToSegment(
            px,
            { x: a.x * bounds.width, y: a.y * bounds.height },
            { x: b.x * bounds.width, y: b.y * bounds.height },
          );
          if (hit.d < 14 && (!best || hit.d < best.d)) best = hit;
        }
      }
      if (best)
        p = {
          x: clamp(best.p.x / bounds.width),
          y: clamp(best.p.y / bounds.height),
        };
    }
    run(() => {
      if (tool === "select") {
        selected = null;
        return;
      }
      if (tool === "device") {
        mutate(() => {
          requireSystem(draft.systemType);
          const asset = addDrawingDevice(draft, floorId, {
            ...p,
            type: DEFAULT_TYPES[draft.systemType],
          });
          selected = { kind: "device", id: asset.id };
        });
        tool = "select";
        return;
      }
      if (tool === "label") {
        mutate(() => {
          const label = addDrawingLabel(draft, floorId, {
            ...p,
            text: "New label",
          });
          selected = { kind: "labels", id: label.id };
        });
        tool = "select";
        return;
      }
      if (tool === "move") {
        const item = selection();
        if (!item || !["device", "labels"].includes(selected.kind))
          throw Error("Select a device or label before moving it.");
        mutate(() => {
          if (selected.kind === "device")
            updateDrawingDevice(draft, item.id, p);
          else
            updateDrawingLabel(draft, floorId, item.id, {
              ...p,
              text: item.text,
            });
        });
        tool = "select";
        return;
      }
      if (tool === "wall") {
        pending.push(p);
        mark();
        return;
      }
      if (tool === "room") {
        pending.push(p);
        mark();
        if (pending.length === 2) {
          mutate(() => {
            const wall = addDrawingRoom(draft, floorId, pending[0], pending[1]);
            selected = { kind: "walls", id: wall.id };
          });
          pending = [];
          tool = "select";
        }
      }
    });
  }
  paint();
  return root;
}
