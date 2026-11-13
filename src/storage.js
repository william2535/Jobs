const DATABASE = "jobs-local";
const VERSION = 2;
let connection;
let lastSeenRevision;

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
    transaction.oncomplete = () => {
      lastSeenRevision = revision.result?.value || 0;
      resolve({ sites: sites.result, jobs: jobs.result });
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
        transaction.error ||
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
        for (const name of ["sites", "jobs"]) {
          const store = transaction.objectStore(name);
          store.clear();
          for (const record of state[name]) store.put(record);
        }
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
