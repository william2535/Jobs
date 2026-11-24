import { validateQuickDefects } from "./quick-defects.js";
import { validateTimesheetEntries } from "./timesheets.js";
import { validateAssetTemplates } from "./asset-library.js";
import { validateJobCertificates } from "./certificates.js";

const DATABASE = "jobs-local";
const VERSION = 2;
let connection;
let lastSeenRevision;

const certificateIdentity = value => Array.isArray(value)
  ? `[${value.map(certificateIdentity).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${certificateIdentity(value[key])}`).join(",")}}`
    : JSON.stringify(value);

function retainIssuedCertificates(previous, incoming) {
  const byId = new Map(incoming.map(job => [job.id, job]));
  for (const saved of previous) {
    const current = byId.get(saved.id);
    // Deleting a whole job remains an explicit workspace operation. Editing a
    // retained job cannot silently rewrite or remove its issued documents.
    if (!current) continue;
    const issued = new Map((current.certificates?.issued || []).map(record => [record.id, record]));
    for (const record of saved.certificates?.issued || []) {
      if (!issued.has(record.id) || certificateIdentity(issued.get(record.id)) !== certificateIdentity(record))
        throw new Error("Issued certificates cannot be changed or removed. Create a revised certificate instead.");
    }
  }
}

export function openDB() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(
        new Error(
          "Local storage is unavailable in this browser. Export your work before closing.",
        ),
      );
      return;
    }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sites"))
        db.createObjectStore("sites", { keyPath: "id" });
      if (!db.objectStoreNames.contains("jobs"))
        db.createObjectStore("jobs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("metadata"))
        db.createObjectStore("metadata", { keyPath: "key" });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(
        new Error(
          "Local storage is blocked by another Jobs tab. Close that tab and retry.",
        ),
      );
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export async function loadState() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      ["sites", "jobs", "metadata"],
      "readonly",
    );
    const sites = transaction.objectStore("sites").getAll();
    const jobs = transaction.objectStore("jobs").getAll();
    const revision = transaction.objectStore("metadata").get("revision");
    const quickDefects = transaction.objectStore("metadata").get("quick-defects");
    const unassignedTimesheets = transaction.objectStore("metadata").get("unassigned-timesheets");
    const assetTemplates = transaction.objectStore("metadata").get("asset-templates");
    transaction.oncomplete = () => {
      try {
        const library = validateQuickDefects(quickDefects.result?.value);
        const sessions = validateTimesheetEntries(unassignedTimesheets.result?.value);
        const templates = validateAssetTemplates(assetTemplates.result?.value);
        for (const job of jobs.result) validateJobCertificates(job.certificates);
        lastSeenRevision = revision.result?.value || 0;
        resolve({ sites: sites.result, jobs: jobs.result, quickDefects: library, unassignedTimesheets: sessions, assetTemplates: templates });
      } catch (error) {
        reject(error);
      }
    };
    transaction.onerror = () =>
      reject(transaction.error || new Error("Could not read local jobs."));
    transaction.onabort = () =>
      reject(transaction.error || new Error("Local read was interrupted."));
  });
}

/** Replace the application snapshot atomically: a failed write keeps the previous snapshot. */
export async function saveState(state) {
  if (!state || !Array.isArray(state.sites) || !Array.isArray(state.jobs))
    throw new Error("Invalid local state.");
  // Older callers omit this key. Omission must preserve the stored library;
  // an explicitly supplied empty array is the deliberate clear operation.
  const quickDefects = state.quickDefects === undefined ? undefined : validateQuickDefects(state.quickDefects);
  const unassignedTimesheets = state.unassignedTimesheets === undefined ? undefined : validateTimesheetEntries(state.unassignedTimesheets);
  const assetTemplates = state.assetTemplates === undefined ? undefined : validateAssetTemplates(state.assetTemplates);
  for (const job of state.jobs) validateJobCertificates(job?.certificates);
  for (const collection of [state.sites, state.jobs]) {
    if (
      collection.some(
        (record) => !record || typeof record.id !== "string" || !record.id,
      )
    )
      throw new Error("Every local record needs a stable ID.");
    if (
      new Set(collection.map((record) => record.id)).size !== collection.length
    )
      throw new Error("Duplicate local record IDs.");
  }
  const db = await openDB();
  if (lastSeenRevision === undefined) await loadState();
  const expectedRevision = lastSeenRevision;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      ["sites", "jobs", "metadata"],
      "readwrite",
    );
    let failure;
    transaction.oncomplete = () => {
      lastSeenRevision = expectedRevision + 1;
      resolve();
    };
    transaction.onerror = () =>
      reject(
        failure || transaction.error ||
          new Error(
            "Could not save locally. Export your work and free browser storage.",
          ),
      );
    transaction.onabort = () =>
      reject(
        failure ||
          transaction.error ||
          new Error("Local save failed. Your previous saved copy is intact."),
      );
    const previousJobs = transaction.objectStore("jobs").getAll();
    const revision = transaction.objectStore("metadata").get("revision");
    revision.onsuccess = () => {
      if ((revision.result?.value || 0) !== expectedRevision) {
        failure = new Error(
          "Another Jobs tab changed these records. Your changes were not saved. Keep a copy of this form, then reload before retrying.",
        );
        transaction.abort();
        return;
      }
      try {
        retainIssuedCertificates(previousJobs.result, state.jobs);
        for (const name of ["sites", "jobs"]) {
          const store = transaction.objectStore(name);
          store.clear();
          for (const record of state[name]) store.put(record);
        }
        if (quickDefects !== undefined)
          transaction.objectStore("metadata").put({ key: "quick-defects", value: quickDefects });
        if (unassignedTimesheets !== undefined)
          transaction.objectStore("metadata").put({ key: "unassigned-timesheets", value: unassignedTimesheets });
        if (assetTemplates !== undefined)
          transaction.objectStore("metadata").put({ key: "asset-templates", value: assetTemplates });
        transaction
          .objectStore("metadata")
          .put({ key: "revision", value: expectedRevision + 1 });
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
  });
}
