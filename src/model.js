import { jobDefaultsFromSite } from "./site-profile.js";
import { validateJobClassification } from "./job-options.js";

export const states = [
  "Not tested",
  "Satisfactory",
  "Unsatisfactory",
  "Inaccessible",
  "Not applicable",
];
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const siteLabel = (site) => site?.name?.trim() || "Site";
export function newSite(name, address = "") {
  const siteId = id(),
    drawingId = id(),
    floorId = id();
  return {
    id: siteId,
    name,
    address,
    sourceKeys: [],
    drawings: [
      {
        id: drawingId,
        revision: "Manual 1",
        kind: "working",
        floors: [
          {
            id: floorId,
            name: "Ground floor",
            data: { symbols: [], building: [], zones: [] },
          },
        ],
        assets: [],
        source: null,
        issuedSnapshots: [],
      },
    ],
  };
}
export function newJob(site, values = {}) {
  if (!site?.id || !site.name?.trim())
    throw Error("Create a named site before creating a job.");
  const drawing = site.drawings.at(-1);
  return {
    id: id(),
    siteId: site.id,
    drawingId: drawing.id,
    revision: 1,
    system: "",
    workType: "",
    scope: "",
    instructions: "",
    engineer: "",
    status: "Open",
    createdAt: now(),
    updatedAt: now(),
    ...jobDefaultsFromSite(site),
    ...values,
    results: drawing.assets.map((a) => ({
      id: id(),
      assetId: a.id,
      state: "Not tested",
      observations: "",
      readings: [],
      notes: "",
      defects: "",
      photos: [],
    })),
    aiProposals: [],
  };
}

/** Explicit creation flow: a site, discipline, type and description are all required. */
export function createVisitJob(site, values) {
  const classification = validateJobClassification(values, { required: true, allowLegacy: false });
  if (typeof values.description !== "string" || !values.description.trim() || values.description.length > 10000)
    throw Error("Add a description of up to 10,000 characters.");
  const job = newJob(site, classification);
  job.workflow = {
    ...job.workflow,
    version: 1,
    details: { ...job.workflow?.details, description: values.description.trim() },
  };
  return job;
}

/** A notes-first draft. Creating it does not write storage or invent a site. */
export function createQuickJob(site = null, values = {}) {
  const job = site ? newJob(site) : {
    id: id(), siteId: null, drawingId: null, revision: 1,
    system: "", workType: "", scope: "", instructions: "", engineer: "",
    status: "Open", createdAt: now(), updatedAt: now(), results: [], aiProposals: [],
  };
  Object.assign(job, validateJobClassification({ ...job, ...values }));
  for (const key of ["system", "scope", "instructions", "engineer"]) {
    if (values[key] === undefined) continue;
    if (typeof values[key] !== "string" || values[key].length > 10000)
      throw Error(`${key} must be text of at most 10,000 characters.`);
    job[key] = values[key].trim();
  }
  for (const key of ["title", "description"]) {
    if (values[key] === undefined) continue;
    if (typeof values[key] !== "string" || values[key].length > 10000)
      throw Error(`${key} must be text of at most 10,000 characters.`);
    job.workflow = { ...job.workflow, version: 1, details: { ...job.workflow?.details, [key]: values[key].trim() } };
  }
  const overrides = {};
  for (const key of ["system", "scope", "instructions", "engineer"])
    if (Object.hasOwn(values, key)) overrides[key] = job[key];
  for (const pair of [["discipline", "customDiscipline"], ["workType", "customWorkType"]]) {
    if (pair.some((key) => Object.hasOwn(values, key)))
      for (const key of pair) overrides[key] = job[key];
  }
  job.settings = { version: 1, overrides };
  return job;
}

/** Attach an unassigned visit without replacing any existing drawing evidence. */
export function attachJobToSite(job, site) {
  if (!job?.id) throw Error("Choose a saved or draft job.");
  if (!site?.id || !site.name?.trim()) throw Error("Choose a named site.");
  if (job.siteId === site.id) return structuredClone(job);
  if (job.siteId != null || job.drawingId != null || job.results?.length || job.archivedResults?.length || job.drawingChanges?.length || job.checklist)
    throw Error("This job already has site or drawing evidence. Keep it with its site or create another job.");
  const attached = newJob(site);
  return {
    ...attached,
    ...structuredClone(job),
    siteId: site.id,
    drawingId: attached.drawingId,
    results: attached.results,
  };
}
