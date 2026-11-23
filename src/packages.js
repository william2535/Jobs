import { validateWorkflow } from "./job-workflow.js";
import { validateSiteProfile } from "./site-profile.js";
import { validateJobClassification } from "./job-options.js";
import { validateJobChecklist } from "./job-checklist.js";
import { validateNotesDocument } from "./job-notes.js";
import { validateJobSettings } from "./job-settings.js";
import { validateDeviceRemarks } from "./device-remarks.js";
import { validateFireMaintenance } from "./fire-maintenance.js";
import { pngDimensions } from "./plan-preview.js";
const hasClassification = (job) =>
  (typeof job.workType === "string" && job.workType.trim() === "Custom") ||
  ["discipline", "customDiscipline", "customWorkType"].some((key) => job[key] !== undefined);

export const PACKAGE_FORMAT = "JobsPackage";
export const PACKAGE_VERSION = 3;
export const RESULT_STATES = [
  "Not tested",
  "Satisfactory",
  "Unsatisfactory",
  "Inaccessible",
  "Not applicable",
];
export const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;

const clone = (value) => structuredClone(value);
const fail = (message) => {
  throw new Error(`Invalid job package: ${message}`);
};
const object = (value, path) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${path} must be an object.`);
};
const string = (value, path, required = true) => {
  if (
    typeof value !== "string" ||
    (required && !value.trim()) ||
    value.length > 1000000
  )
    fail(`${path} must be ${required ? "a nonempty" : "a"} string.`);
};
const array = (value, path) => {
  if (!Array.isArray(value) || value.length > 50000)
    fail(`${path} must be an array with at most 50,000 entries.`);
};
const unique = (values, path) => {
  const ids = new Set();
  for (const value of values) {
    object(value, path);
    string(value.id, `${path}.id`);
    if (ids.has(value.id)) fail(`${path} has duplicate IDs.`);
    ids.add(value.id);
  }
  return ids;
};

const embeddedImage = (value) =>
  typeof value === "string" &&
  /^data:image\/(?:png|jpe?g|webp|gif|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(
    value,
  );

function drawingImages(value, path) {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (key === "image" && item != null && item !== "" && !embeddedImage(item))
      fail(
        `${path}.image must be an embedded raster image, not an online link.`,
      );
    if (item && typeof item === "object") drawingImages(item, `${path}.${key}`);
  }
}

function photos(values, path) {
  array(values, path);
  unique(values, path);
  for (const photo of values) {
    // Only embedded raster images are rendered. Remote URLs and SVG are not package attachments.
    if (!embeddedImage(photo.image)) {
      fail(`${path} must contain embedded raster images, not online links.`);
    }
  }
}

function drawing(value, path) {
  object(value, path);
  string(value.id, `${path}.id`);
  if (typeof value.revision !== "string" && typeof value.revision !== "number")
    fail(`${path}.revision is required.`);
  if (value.basedOnDrawingId != null)
    string(value.basedOnDrawingId, `${path}.basedOnDrawingId`);
  for (const key of ["editChanges", "editWarnings"]) {
    if (value[key] != null) {
      array(value[key], `${path}.${key}`);
      value[key].forEach((item) => string(item, `${path}.${key} entry`, false));
    }
  }
  array(value.floors, `${path}.floors`);
  const floors = unique(value.floors, `${path}.floors`);
  for (const floor of value.floors) {
    string(floor.name, `${path}.floor.name`);
    object(floor.data, `${path}.floor.data`);
    drawingImages(floor.data, `${path}.floor.data`);
  }
  array(value.assets, `${path}.assets`);
  unique(value.assets, `${path}.assets`);
  for (const asset of value.assets) {
    string(asset.type, `${path}.asset.type`);
    if (asset.floorId && !floors.has(asset.floorId))
      fail(`${path}.asset references a missing floor.`);
    for (const coordinate of ["x", "y"]) {
      if (asset[coordinate] != null && !Number.isFinite(asset[coordinate]))
        fail(`${path}.asset.${coordinate} must be finite.`);
    }
    photos(asset.photos || [], `${path}.asset.photos`);
  }
  const previewRecord = (entry, entryPath) => {
    string(entry.floorId, `${entryPath}.floorId`);
    if (entry.snapshotId != null)
      string(entry.snapshotId, `${entryPath}.snapshotId`);
    const record =
      entry.snapshotId == null
        ? value
        : value.issuedSnapshots?.find(
            (snapshot) => snapshot.id === entry.snapshotId,
          );
    if (
      !record ||
      !Array.isArray(record.floors) ||
      !record.floors.some((floor) => floor.id === entry.floorId)
    )
      fail(`${entryPath} references a missing floor or issued snapshot.`);
  };
  if (value.planPreviews != null) {
    array(value.planPreviews, `${path}.planPreviews`);
    unique(value.planPreviews, `${path}.planPreviews`);
    for (const preview of value.planPreviews) {
      previewRecord(preview, `${path}.planPreview`);
      string(preview.drawingId, `${path}.planPreview.drawingId`);
      if (
        !Number.isSafeInteger(preview.rendererVersion) ||
        preview.rendererVersion < 1
      )
        fail("plan preview renderer version is invalid.");
      if (
        typeof preview.revision !== "string" &&
        typeof preview.revision !== "number"
      )
        fail("plan preview revision is invalid.");
      if (
        typeof preview.image !== "string" ||
        !preview.image.startsWith("data:image/png;base64,") ||
        !embeddedImage(preview.image) ||
        preview.image.slice("data:image/png;base64,".length).length % 4 !== 0
      )
        fail("plan preview must contain an included PNG image.");
      for (const dimension of ["width", "height"])
        if (
          !Number.isSafeInteger(preview[dimension]) ||
          preview[dimension] < 1 ||
          preview[dimension] > 16384
        )
          fail(`plan preview ${dimension} is invalid.`);
      // Imported previews must meet the same actual PNG-header limits as an
      // editor handoff. Declared metadata alone cannot bound image dimensions.
      let dimensions;
      try {
        dimensions = pngDimensions(preview.image);
      } catch (error) {
        fail(`plan preview: ${error.message}`);
      }
      if (preview.width !== dimensions.width || preview.height !== dimensions.height)
        fail("plan preview dimensions do not match its PNG header.");
      string(preview.generatedAt, "plan preview generation date");
      if (!Number.isFinite(Date.parse(preview.generatedAt)))
        fail("plan preview generation date is invalid.");
    }
  }
  if (value.planPreviewErrors != null) {
    array(value.planPreviewErrors, `${path}.planPreviewErrors`);
    for (const error of value.planPreviewErrors) {
      object(error, "plan preview error");
      previewRecord(error, "plan preview error");
      string(error.message, "plan preview error message", false);
    }
  }
  if (value.planPreviewAttemptedFor != null)
    string(value.planPreviewAttemptedFor, `${path}.planPreviewAttemptedFor`);
  if (value.issuedSnapshots != null) {
    array(value.issuedSnapshots, `${path}.issuedSnapshots`);
    unique(value.issuedSnapshots, `${path}.issuedSnapshots`);
    for (const snapshot of value.issuedSnapshots)
      drawing(
        { ...snapshot, revision: snapshot.revision ?? "" },
        `${path}.issuedSnapshot`,
      );
  }
}

function resultRecords(values, selected, path) {
  array(values, path);
  unique(values, path);
  const assetIds = new Set(selected.assets.map((asset) => asset.id));
  const resultsFor = new Set();
  for (const result of values) {
    if (!assetIds.has(result.assetId))
      fail("result references a missing asset.");
    if (resultsFor.has(result.assetId))
      fail("multiple results reference the same asset.");
    resultsFor.add(result.assetId);
    if (!RESULT_STATES.includes(result.state))
      fail("unsupported result state.");
    for (const field of ["observations", "notes", "defects"])
      string(result[field] ?? "", `result.${field}`, false);
    if (
      ["Unsatisfactory", "Inaccessible", "Not applicable"].includes(
        result.state,
      ) &&
      ![result.observations, result.notes, result.defects].some(
        (value) => typeof value === "string" && value.trim(),
      )
    )
      fail(`${result.state} requires an explanation.`);
    array(result.readings, "result.readings");
    for (const reading of result.readings) {
      object(reading, "reading");
      string(reading.name, "reading.name");
      string(reading.unit, "reading.unit");
      if (
        typeof reading.value !== "number" &&
        typeof reading.value !== "string"
      )
        fail("reading.value is required.");
      if (typeof reading.value === "number" && !Number.isFinite(reading.value))
        fail("reading.value must be finite.");
    }
    photos(result.photos || [], "result.photos");
    try {
      validateDeviceRemarks(result.remarks);
    } catch (error) {
      fail(`${path}: ${error.message}`);
    }
  }
  if (resultsFor.size !== assetIds.size)
    fail("each asset must have a result, initially Not tested.");
}

// Bound structure and expanded media without serializing repeated images into one huge string.
function measuredBytes(value, limit) {
  let bytes = 0,
    nodes = 0;
  const lengths = new Map(),
    ancestors = new Set();
  const addString = (text) => {
    let length = lengths.get(text);
    if (length === undefined) {
      length = embeddedImage(text)
        ? text.length + 2
        : new TextEncoder().encode(JSON.stringify(text)).length;
      lengths.set(text, length);
    }
    bytes += length;
  };
  const walk = (item, depth = 0) => {
    if (depth > 80 || ++nodes > 2000000)
      fail("package structure is too complex.");
    if (item === null) bytes += 4;
    else if (typeof item === "string") addString(item);
    else if (typeof item === "number") {
      if (!Number.isFinite(item)) fail("non-finite number.");
      bytes += String(item).length;
    } else if (typeof item === "boolean") bytes += item ? 4 : 5;
    else if (item && typeof item === "object") {
      if (ancestors.has(item)) fail("cyclic object.");
      ancestors.add(item);
      bytes += 2;
      if (Array.isArray(item)) {
        for (const child of item) {
          walk(child, depth + 1);
          bytes++;
        }
      } else
        for (const [key, child] of Object.entries(item)) {
          if (child === undefined) continue;
          addString(key);
          bytes += 2;
          walk(child, depth + 1);
        }
      ancestors.delete(item);
    } else fail("unsupported non-JSON value.");
    if (bytes > limit)
      fail(
        `package exceeds the ${Math.round(limit / 1024 / 1024)} MiB ${limit === MAX_EXPANDED_BYTES ? "expanded" : "file"} limit.`,
      );
  };
  walk(value);
  return bytes;
}

function unpackImages(input) {
  array(input.attachments, "attachments");
  array(input.attachmentRefs, "attachmentRefs");
  unique(input.attachments, "attachments");
  const pool = new Map();
  for (const item of input.attachments) {
    if (!/^image-[a-f0-9]{64}$/.test(item.id) || !embeddedImage(item.image))
      fail("attachment must contain an identified embedded raster image.");
    pool.set(item.id, item.image);
  }
  const expanded = {
    format: PACKAGE_FORMAT,
    version: input.version === 3 && input.site === null ? 3 : 1,
    site: clone(input.site),
    job: clone(input.job),
  };
  if (expanded.version === 3) {
    expanded.attachments = [];
    expanded.attachmentRefs = [];
  }
  if (input.packageId !== undefined) expanded.packageId = input.packageId;
  const seenPaths = new Set(),
    used = new Set();
  let expansionBytes = measuredBytes(expanded, MAX_EXPANDED_BYTES);
  for (const ref of input.attachmentRefs) {
    object(ref, "attachment reference");
    if (
      !Array.isArray(ref.path) ||
      ref.path.length < 2 ||
      ref.path.length > 80 ||
      !["site", "job"].includes(ref.path[0])
    )
      fail("invalid attachment path.");
    if (!pool.has(ref.attachmentId))
      fail("attachment reference points to missing media.");
    const key = JSON.stringify(ref.path);
    if (seenPaths.has(key)) fail("duplicate attachment path.");
    seenPaths.add(key);
    used.add(ref.attachmentId);
    let target = expanded;
    for (let i = 0; i < ref.path.length; i++) {
      const part = ref.path[i];
      if (
        typeof part === "string" &&
        ["__proto__", "prototype", "constructor"].includes(part)
      )
        fail("unsafe attachment path.");
      if (
        !target ||
        typeof target !== "object" ||
        (Array.isArray(target)
          ? !Number.isSafeInteger(part) || part < 0 || part >= target.length
          : typeof part !== "string")
      )
        fail("invalid attachment path segment.");
      if (!Object.hasOwn(target, part)) fail("attachment path is missing.");
      if (i === ref.path.length - 1) {
        if (target[part] !== null)
          fail("attachment path must target a null placeholder.");
        const image = pool.get(ref.attachmentId);
        expansionBytes += image.length - 2;
        if (expansionBytes > MAX_EXPANDED_BYTES)
          fail("package exceeds the 256 MiB expanded limit.");
        target[part] = image;
      } else target = target[part];
    }
  }
  if (used.size !== pool.size)
    fail("package contains unreferenced attachments.");
  return expanded;
}

async function packImages(site, job) {
  const attachments = [],
    attachmentRefs = [],
    byImage = new Map();
  const collect = (value, path) => {
    if (
      typeof value === "string" &&
      value.startsWith("data:image/") &&
      !path.some((part) =>
        ["__proto__", "prototype", "constructor"].includes(part),
      ) &&
      embeddedImage(value)
    ) {
      let entry = byImage.get(value);
      if (!entry) {
        entry = { image: value, id: null };
        byImage.set(value, entry);
        attachments.push(entry);
      }
      attachmentRefs.push({ path, entry });
      return null;
    }
    if (Array.isArray(value))
      return value.map((child, i) => collect(child, [...path, i]));
    if (value && typeof value === "object") {
      const result = {};
      for (const [key, child] of Object.entries(value))
        if (child !== undefined)
          Object.defineProperty(result, key, {
            value: collect(child, [...path, key]),
            enumerable: true,
            writable: true,
            configurable: true,
          });
      return result;
    }
    return value;
  };
  const payload = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    site: collect(site, ["site"]),
    job: collect(job, ["job"]),
  };
  for (const item of attachments) item.id = `image-${await digest(item.image)}`;
  payload.attachments = attachments;
  payload.attachmentRefs = attachmentRefs.map((ref) => ({
    path: ref.path,
    attachmentId: ref.entry.id,
  }));
  return payload;
}

/** Parse and fully validate before any caller changes local state. Unknown fields are retained. */
export function validateJobPackage(input) {
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > MAX_PACKAGE_BYTES)
      fail("file is larger than 100 MiB.");
    try {
      input = JSON.parse(input);
    } catch {
      fail("file is not valid JSON.");
    }
  }
  object(input, "root");
  if (
    input.format !== PACKAGE_FORMAT ||
    ![1, 2, PACKAGE_VERSION].includes(input.version)
  )
    fail("unsupported format or version.");
  const wireVersion = input.version;
  if (input.version >= 2) {
    measuredBytes(input, MAX_PACKAGE_BYTES);
    input = unpackImages(input);
  }
  measuredBytes(input, MAX_EXPANDED_BYTES);
  object(input.job, "job");
  const standalone = input.site === null;
  if (standalone && wireVersion !== 3) fail("standalone jobs require package version 3.");
  if (!standalone) object(input.site, "site");
  const { site, job } = input;
  const checklist = validateJobChecklist(job.checklist);
  const fireMaintenance = validateFireMaintenance(job.fireMaintenance);
  const notesDocument = validateNotesDocument(job.notesDocument);
  const settings = validateJobSettings(job.settings);
  const classification = hasClassification(job) ? validateJobClassification(job) : null;
  if (!standalone) {
    string(site.id, "site.id");
    string(site.name, "site.name");
    if (site.profile !== undefined) validateSiteProfile(site.profile);
    if (site.address != null) string(site.address, "site.address", false);
    if (site.sourceKeys != null) {
      array(site.sourceKeys, "site.sourceKeys");
      site.sourceKeys.forEach((key) => string(key, "site.sourceKeys entry"));
    }
    if (site.importedMetadata != null) {
      array(site.importedMetadata, "site.importedMetadata");
      for (const item of site.importedMetadata) {
        object(item, "site.importedMetadata entry");
        string(item.fingerprint, "site.importedMetadata.fingerprint");
        object(item.site, "site.importedMetadata.site");
        string(item.site.name, "site.importedMetadata.site.name");
        if (item.site.address != null)
          string(item.site.address, "site.importedMetadata.site.address", false);
      }
    }
    array(site.drawings, "site.drawings");
    unique(site.drawings, "site.drawings");
    site.drawings.forEach((value, index) =>
      drawing(value, `site.drawings[${index}]`),
    );
  }
  string(job.id, "job.id");
  if (standalone && (job.siteId !== null || job.drawingId !== null))
    fail("a standalone job must have null site and drawing references.");
  if (!standalone && job.siteId !== site.id) fail("job references another site.");
  if (job.assetRegister !== undefined) {
    if (!standalone) fail("a site job must retain its register in the site's drawing revisions.");
    drawing(job.assetRegister, "job.assetRegister");
    if (job.assetRegister.kind !== 'working' || job.assetRegister.source !== null || job.assetRegister.floors.length || job.assetRegister.issuedSnapshots?.length)
      fail("a standalone asset register must be working, unplaced equipment without source or issued drawings.");
    for (const asset of job.assetRegister.assets) {
      if (asset.floorId != null || asset.x != null || asset.y != null || asset.sourceId != null || asset.sourceFloorId != null || asset.source != null)
        fail("standalone register equipment must be unplaced without source mappings.");
      for (const [field, limit] of [['type', 200], ['reference', 200], ['typeName', 200], ['manufacturer', 200], ['model', 200], ['description', 5000], ['location', 500]]) {
        if (asset[field] === undefined && !['type', 'reference'].includes(field)) continue;
        string(asset[field], `job.assetRegister.asset.${field}`, ['type', 'reference'].includes(field));
        if (asset[field].length > limit) fail(`standalone asset ${field} exceeds ${limit} characters.`);
      }
    }
  }
  const selected = standalone ? job.assetRegister || { assets: [] } : site.drawings.find((value) => value.id === job.drawingId);
  if (!selected) fail("job references a missing drawing.");
  if (!Number.isSafeInteger(job.revision) || job.revision < 1)
    fail("job.revision must be a positive integer.");
  for (const field of [
    "system",
    "workType",
    "scope",
    "instructions",
    "engineer",
    "status",
  ])
    string(job[field], `job.${field}`, false);
  for (const field of ["createdAt", "updatedAt"]) {
    string(job[field], `job.${field}`);
    if (!Number.isFinite(Date.parse(job[field])))
      fail(`job.${field} must be a date.`);
  }
  resultRecords(job.results, selected, "job.results");
  const drawings = new Map((site?.drawings || []).map((value) => [value.id, value]));
  if (job.assetRegister) drawings.set(job.assetRegister.id, job.assetRegister);
  if (checklist) {
    for (const record of [checklist, ...checklist.history]) {
      if (!drawings.has(record.drawingId))
        fail("checklist record references a missing drawing.");
    }
  }
  if (fireMaintenance) {
    for (const record of [fireMaintenance, ...fireMaintenance.history]) {
      if (record.basedOnJobRevision > job.revision)
        fail("fire maintenance references a future job revision.");
      const sourceDrawing = record.drawingId === null ? job.assetRegister || null : drawings.get(record.drawingId);
      if (record.drawingId !== null && !sourceDrawing)
        fail("fire maintenance record references a missing drawing.");
      for (const item of record.equipment)
        if (item.assetId !== null && !sourceDrawing?.assets.some(asset => asset.id === item.assetId))
          fail("fire maintenance equipment references a missing asset.");
    }
  }
  for (const value of site?.drawings || [])
    if (value.basedOnDrawingId && !drawings.has(value.basedOnDrawingId))
      fail("edited drawing references a missing base drawing.");
  if (job.drawingChanges != null) {
    array(job.drawingChanges, "job.drawingChanges");
    unique(job.drawingChanges, "job.drawingChanges");
    for (const change of job.drawingChanges) {
      const from = drawings.get(change.fromDrawingId);
      const to = drawings.get(change.toDrawingId);
      if (!from || !to) fail("drawing change references a missing drawing.");
      string(change.at, "drawing change date");
      if (!Number.isFinite(Date.parse(change.at)))
        fail("drawing change date is invalid.");
      if (
        !Number.isSafeInteger(change.previousJobRevision) ||
        change.previousJobRevision < 1
      )
        fail("drawing change needs its previous job revision.");
      resultRecords(
        change.previousResults,
        from,
        "drawing change previousResults",
      );
      for (const [key, source] of [
        ["addedAssetIds", to],
        ["removedAssetIds", from],
      ]) {
        if (change[key] != null) {
          array(change[key], `drawing change ${key}`);
          if (
            new Set(change[key]).size !== change[key].length ||
            change[key].some(
              (id) => !source.assets.some((asset) => asset.id === id),
            )
          )
            fail(`drawing change ${key} has invalid asset references.`);
        }
      }
    }
  }
  if (job.archivedResults != null) {
    array(job.archivedResults, "job.archivedResults");
    unique(job.archivedResults, "job.archivedResults");
    for (const entry of job.archivedResults) {
      const originalDrawing = drawings.get(entry.drawingId);
      if (!originalDrawing)
        fail("archived result references a missing drawing.");
      object(entry.asset, "archived asset");
      string(entry.asset.id, "archived asset.id");
      if (
        entry.assetId !== entry.asset.id ||
        !originalDrawing.assets.some((asset) => asset.id === entry.assetId)
      )
        fail("archived asset references a missing source asset.");
      string(entry.asset.type, "archived asset.type");
      photos(entry.asset.photos || [], "archived asset photos");
      if (
        entry.changeId != null &&
        !(job.drawingChanges || []).some(
          (change) => change.id === entry.changeId,
        )
      )
        fail("archived result references a missing drawing change.");
      string(entry.removedAt, "archived result date");
      if (!Number.isFinite(Date.parse(entry.removedAt)))
        fail("archived result date is invalid.");
      resultRecords(
        [entry.result],
        { assets: [entry.asset] },
        "archived result",
      );
    }
  }
  let workflow;
  if (job.workflow != null) {
    try {
      workflow = validateWorkflow(job.workflow);
    } catch (error) {
      fail(error.message);
    }
  }
  array(job.aiProposals || [], "job.aiProposals");
  const normalized = clone(input);
  if (checklist !== undefined) normalized.job.checklist = checklist;
  if (fireMaintenance !== undefined) normalized.job.fireMaintenance = fireMaintenance;
  if (notesDocument !== undefined) normalized.job.notesDocument = notesDocument;
  if (settings !== undefined) normalized.job.settings = settings;
  if (classification) Object.assign(normalized.job, classification);
  if (workflow !== undefined) normalized.job.workflow = workflow;
  if (normalized.site) {
    normalized.site.address ??= "";
    normalized.site.sourceKeys ??= [];
  }
  const normalizeDrawing = (value) => {
    value.issuedSnapshots ??= [];
    value.assets.forEach((asset) => {
      asset.photos ??= [];
    });
    value.issuedSnapshots.forEach(normalizeDrawing);
  };
  normalized.site?.drawings.forEach(normalizeDrawing);
  if (normalized.job.assetRegister) normalizeDrawing(normalized.job.assetRegister);
  normalized.job.aiProposals ??= [];
  for (const result of normalized.job.results) {
    result.photos ??= [];
    result.observations ??= "";
    result.notes ??= "";
    result.defects ??= "";
  }
  normalizeDeviceRemarks(normalized.job);
  return normalized;
}

function normalizeDeviceRemarks(job) {
  const results = [
    ...(job.results || []),
    ...(job.drawingChanges || []).flatMap(change => change.previousResults || []),
    ...(job.archivedResults || []).map(entry => entry.result),
  ];
  for (const result of results)
    if (result.remarks !== undefined) result.remarks = validateDeviceRemarks(result.remarks);
}

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

async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function cleanJob(job) {
  const value = clone(job);
  if (value.notesDocument !== undefined) value.notesDocument = validateNotesDocument(value.notesDocument);
  if (value.settings !== undefined) value.settings = validateJobSettings(value.settings);
  if (value.checklist !== undefined) value.checklist = validateJobChecklist(value.checklist);
  if (value.fireMaintenance !== undefined) value.fireMaintenance = validateFireMaintenance(value.fireMaintenance);
  if (hasClassification(value)) Object.assign(value, validateJobClassification(value));
  if (value.workflow !== undefined) value.workflow = validateWorkflow(value.workflow);
  normalizeDeviceRemarks(value);
  delete value.importHistory;
  value.aiProposals ??= [];
  for (const result of value.results || []) {
    result.photos ??= [];
    result.observations ??= "";
    result.notes ??= "";
    result.defects ??= "";
  }
  return value;
}

export async function createJobPackage(site, job) {
  const normalized = validateJobPackage({
    format: PACKAGE_FORMAT,
    version: site == null ? 3 : 1,
    site: site ?? null,
    job: cleanJob(job),
    ...(site == null ? { attachments: [], attachmentRefs: [] } : {}),
  });
  const payload = await packImages(normalized.site, normalized.job);
  payload.packageId = `package-${await digest(payload)}`;
  measuredBytes(payload, MAX_PACKAGE_BYTES);
  return payload;
}

function unusedId(base, records) {
  const ids = new Set(records.map((value) => value.id));
  let candidate = base;
  for (let suffix = 2; ids.has(candidate); suffix++)
    candidate = `${base}:${suffix}`;
  return candidate;
}

function drawingContent(value) {
  const content = clone(value);
  delete content.id;
  delete content.sourceDrawingId;
  if (content.sourceBasedOnDrawingId)
    content.basedOnDrawingId = content.sourceBasedOnDrawingId;
  delete content.sourceBasedOnDrawingId;
  const defaults = (drawing) => {
    // These raster previews are derived cache, not a different drawing revision.
    delete drawing.planPreviews;
    delete drawing.planPreviewErrors;
    delete drawing.planPreviewAttemptedFor;
    drawing.issuedSnapshots ??= [];
    drawing.assets.forEach((asset) => {
      asset.photos ??= [];
    });
    drawing.issuedSnapshots.forEach(defaults);
  };
  defaults(content);
  return canonical(content);
}

function remapPreviewCache(drawing, fromId) {
  for (const preview of drawing.planPreviews || []) {
    if (preview.drawingId === fromId) {
      preview.sourcePreviewId ??= preview.id;
      preview.drawingId = drawing.id;
      preview.id = `${drawing.id}/preview/${encodeURIComponent(preview.id)}`;
    }
  }
  if (drawing.planPreviewAttemptedFor === fromId)
    drawing.planPreviewAttemptedFor = drawing.id;
}
function mergePreviewCache(current, incoming) {
  if (!incoming.planPreviews?.length) return;
  const key = (preview) =>
    JSON.stringify([
      preview.floorId,
      preview.snapshotId || null,
      preview.rendererVersion,
    ]);
  const known = new Set(
    (current.planPreviews || [])
      .filter((preview) => preview.drawingId === current.id)
      .map(key),
  );
  const additions = incoming.planPreviews.filter(
    (preview) => preview.drawingId === incoming.id && !known.has(key(preview)),
  );
  if (additions.length)
    current.planPreviews = [
      ...(current.planPreviews || []),
      ...clone(additions).filter(
        (preview) =>
          !(current.planPreviews || []).some(
            (saved) => saved.id === preview.id,
          ),
      ),
    ];
}

export async function importJobPackage(state, input) {
  const imported = validateJobPackage(input);
  const wire = typeof input === "string" ? JSON.parse(input) : input;
  if (wire.version >= 2) {
    for (const item of wire.attachments)
      if (item.id !== `image-${await digest(item.image)}`)
        fail("attachment content does not match its ID.");
  }
  // Fingerprint the canonical pooled representation to avoid serializing the same
  // large image once per preserved drawing revision. Preserve the v2 fingerprint
  // version for associated jobs so existing import receipts still prevent duplicates.
  const fingerprintPayload = await packImages(imported.site, cleanJob(imported.job));
  if (imported.site) fingerprintPayload.version = 2;
  const fingerprint = `pooled:${await digest(fingerprintPayload)}`;
  let legacyFingerprint;
  if (
    wire.version === 1 &&
    state.jobs.some((job) =>
      job.importHistory?.some((value) => !value.startsWith("pooled:")),
    )
  ) {
    legacyFingerprint = await digest({
      site: imported.site,
      job: cleanJob(imported.job),
    });
  }
  // Receipts remain with a local job even after further edits, so reopening the same
  // package never creates a second copy of that imported version.
  const remembered = state.jobs.find((job) =>
    job.importHistory?.some(
      (value) => value === fingerprint || value === legacyFingerprint,
    ),
  );
  if (remembered)
    return {
      state,
      job: remembered,
      duplicate: true,
      conflict: false,
      message: "This package is already saved. Opened the existing job.",
    };
  const next = clone(state);
  const existing = next.jobs.find((job) => job.id === imported.job.id);
  const localSite = imported.site ? next.sites.find((site) => site.id === imported.site.id) : null;
  const sameJob =
    existing &&
    canonical(cleanJob(existing)) === canonical(cleanJob(imported.job));

  let site = localSite;
  let job = cleanJob(imported.job);
  let siteConflict = false;
  const drawingMap = new Map();
  const copiedDrawings = [];
  if (imported.site && !site) {
    site = clone(imported.site);
    next.sites.push(site);
  } else if (site) {
    const localMetadata = { ...site };
    delete localMetadata.drawings;
    delete localMetadata.importedMetadata;
    delete localMetadata.sourceKeys;
    const incomingMetadata = { ...imported.site };
    delete incomingMetadata.drawings;
    delete incomingMetadata.importedMetadata;
    delete incomingMetadata.sourceKeys;
    if (canonical(localMetadata) !== canonical(incomingMetadata)) {
      siteConflict = true;
      site.importedMetadata = [
        ...(site.importedMetadata || []),
        { fingerprint, site: incomingMetadata },
      ];
    }
    for (const metadata of imported.site.importedMetadata || []) {
      if (
        !(site.importedMetadata || []).some(
          (value) => canonical(value) === canonical(metadata),
        )
      )
        site.importedMetadata = [
          ...(site.importedMetadata || []),
          clone(metadata),
        ];
    }
    site.sourceKeys = [
      ...new Set([
        ...(site.sourceKeys || []),
        ...(imported.site.sourceKeys || []),
      ]),
    ];
    for (const incoming of imported.site.drawings) {
      const current = site.drawings.find((value) => value.id === incoming.id);
      if (!current) {
        const copy = clone(incoming);
        site.drawings.push(copy);
        copiedDrawings.push(copy);
      } else if (drawingContent(current) !== drawingContent(incoming)) {
        siteConflict = true;
        const preserved = site.drawings.find(
          (value) =>
            value.sourceDrawingId === incoming.id &&
            drawingContent(value) === drawingContent(incoming),
        );
        if (preserved) {
          drawingMap.set(incoming.id, preserved.id);
          if (job.drawingId === incoming.id) job.drawingId = preserved.id;
          continue;
        }
        const copy = clone(incoming);
        copy.sourceDrawingId = copy.id;
        copy.id = unusedId(`${copy.id}:import:${fingerprint}`, site.drawings);
        remapPreviewCache(copy, incoming.id);
        site.drawings.push(copy);
        copiedDrawings.push(copy);
        drawingMap.set(incoming.id, copy.id);
        if (job.drawingId === incoming.id) job.drawingId = copy.id;
      } else {
        mergePreviewCache(current, incoming);
      }
    }
  }
  for (const copy of copiedDrawings) {
    if (drawingMap.has(copy.basedOnDrawingId)) {
      copy.sourceBasedOnDrawingId ??= copy.basedOnDrawingId;
      copy.basedOnDrawingId = drawingMap.get(copy.basedOnDrawingId);
    }
  }
  if (job.checklist) {
    for (const record of [job.checklist, ...job.checklist.history]) {
      if (drawingMap.has(record.drawingId))
        record.drawingId = drawingMap.get(record.drawingId);
    }
  }
  if (job.fireMaintenance) {
    for (const record of [job.fireMaintenance, ...job.fireMaintenance.history]) {
      if (drawingMap.has(record.drawingId))
        record.drawingId = drawingMap.get(record.drawingId);
    }
  }
  for (const entry of job.archivedResults || []) {
    if (drawingMap.has(entry.drawingId)) {
      entry.sourceDrawingId ??= entry.drawingId;
      entry.drawingId = drawingMap.get(entry.drawingId);
    }
  }
  for (const change of job.drawingChanges || []) {
    for (const key of ["fromDrawingId", "toDrawingId"]) {
      if (drawingMap.has(change[key])) {
        change[`source${key[0].toUpperCase()}${key.slice(1)}`] ??= change[key];
        change[key] = drawingMap.get(change[key]);
      }
    }
  }
  if (
    sameJob &&
    job.drawingId === existing.drawingId &&
    drawingMap.size === 0
  ) {
    existing.importHistory = [...(existing.importHistory || []), fingerprint];
    return {
      state: next,
      job: existing,
      duplicate: true,
      conflict: siteConflict,
      message: siteConflict
        ? "Existing job opened. Different site details were preserved for review."
        : "Identical job already saved. No duplicate created.",
    };
  }
  if (existing) {
    job.sourceJobId = job.id;
    job.id = unusedId(`${job.id}:import:${fingerprint}`, next.jobs);
    job.importConflict =
      "A different saved version exists. Both versions are retained; review before continuing.";
    job.results = job.results.map((result) => ({
      ...result,
      sourceResultId: result.id,
      id: `${job.id}/result/${encodeURIComponent(result.id)}`,
    }));
  }
  job.importHistory = [fingerprint];
  next.jobs.push(job);
  const conflict = Boolean(existing || siteConflict);
  return {
    state: next,
    job,
    duplicate: false,
    conflict,
    message: conflict
      ? "Imported as a preserved version. Existing job work and site details were kept."
      : "Job and its included drawings and photographs imported.",
  };
}
