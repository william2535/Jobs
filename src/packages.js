export const PACKAGE_FORMAT = "JobsPackage";
export const PACKAGE_VERSION = 1;
export const RESULT_STATES = [
  "Not tested",
  "Satisfactory",
  "Unsatisfactory",
  "Inaccessible",
  "Not applicable",
];
export const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;

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
  if (input.format !== PACKAGE_FORMAT || input.version !== PACKAGE_VERSION)
    fail("unsupported format or version.");
  object(input.site, "site");
  object(input.job, "job");
  const { site, job } = input;
  string(site.id, "site.id");
  string(site.name, "site.name");
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
      if (item.site.address != null) string(item.site.address, "site.importedMetadata.site.address", false);
    }
  }
  array(site.drawings, "site.drawings");
  unique(site.drawings, "site.drawings");
  site.drawings.forEach((value, index) =>
    drawing(value, `site.drawings[${index}]`),
  );
  string(job.id, "job.id");
  if (job.siteId !== site.id) fail("job references another site.");
  const selected = site.drawings.find((value) => value.id === job.drawingId);
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
  array(job.results, "job.results");
  unique(job.results, "job.results");
  const assetIds = new Set(selected.assets.map((asset) => asset.id));
  const resultsFor = new Set();
  for (const result of job.results) {
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
  }
  if (resultsFor.size !== assetIds.size)
    fail("each asset must have a result, initially Not tested.");
  array(job.aiProposals || [], "job.aiProposals");
  const normalized = clone(input);
  normalized.site.address ??= "";
  normalized.site.sourceKeys ??= [];
  const normalizeDrawing = (value) => {
    value.issuedSnapshots ??= [];
    value.assets.forEach((asset) => {
      asset.photos ??= [];
    });
    value.issuedSnapshots.forEach(normalizeDrawing);
  };
  normalized.site.drawings.forEach(normalizeDrawing);
  normalized.job.aiProposals ??= [];
  for (const result of normalized.job.results) {
    result.photos ??= [];
    result.observations ??= "";
    result.notes ??= "";
    result.defects ??= "";
  }
  return normalized;
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
  const payload = validateJobPackage({
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    site: clone(site),
    job: cleanJob(job),
  });
  payload.packageId = `package-${await digest(payload)}`;
  if (
    new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PACKAGE_BYTES
  )
    throw new Error(
      "Job package is larger than the 100 MiB import limit. Export fewer drawing revisions in a future version; keep this local record.",
    );
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
  const defaults = (drawing) => {
    drawing.issuedSnapshots ??= [];
    drawing.assets.forEach((asset) => {
      asset.photos ??= [];
    });
    drawing.issuedSnapshots.forEach(defaults);
  };
  defaults(content);
  return canonical(content);
}

export async function importJobPackage(state, input) {
  const imported = validateJobPackage(input);
  const fingerprint = await digest({
    site: imported.site,
    job: cleanJob(imported.job),
  });
  // Receipts remain with a local job even after further edits, so reopening the same
  // package never creates a second copy of that imported version.
  const remembered = state.jobs.find((job) =>
    job.importHistory?.includes(fingerprint),
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
  const localSite = next.sites.find((site) => site.id === imported.site.id);
  const sameJob =
    existing &&
    canonical(cleanJob(existing)) === canonical(cleanJob(imported.job));

  let site = localSite;
  let job = cleanJob(imported.job);
  let siteConflict = false;
  if (!site) {
    site = clone(imported.site);
    next.sites.push(site);
  } else {
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
      if (!current) site.drawings.push(clone(incoming));
      else if (drawingContent(current) !== drawingContent(incoming)) {
        siteConflict = true;
        const preserved = site.drawings.find(
          (value) =>
            value.sourceDrawingId === incoming.id &&
            drawingContent(value) === drawingContent(incoming),
        );
        if (preserved) {
          if (job.drawingId === incoming.id) job.drawingId = preserved.id;
          continue;
        }
        const copy = clone(incoming);
        copy.sourceDrawingId = copy.id;
        copy.id = unusedId(`${copy.id}:import:${fingerprint}`, site.drawings);
        site.drawings.push(copy);
        if (job.drawingId === incoming.id) job.drawingId = copy.id;
      }
    }
  }
  if (sameJob && job.drawingId === existing.drawingId) {
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
