/** Explicit, origin-bound connection to the separately deployed Zone Sketch receiver. */
export const ZONE_HANDOFF_PROTOCOL = "jobs-zonesketch";
export const ZONE_HANDOFF_VERSION = 1;
export const DEFAULT_ZONE_SKETCH_URL =
  "https://william2535.github.io/FIRE-ZONE-PLAN-APP/";
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const ownObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const validId = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 1000;

export function parseZoneHandoffConfig(value = DEFAULT_ZONE_SKETCH_URL) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Zone Sketch address must be a complete HTTPS URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && local))
  ) {
    throw new Error(
      "Use HTTPS for Zone Sketch, or HTTP on localhost for development.",
    );
  }
  return { url: url.href, origin: url.origin };
}

function actualProject(project) {
  if (
    !ownObject(project) ||
    !["ZoneSketchByWill", "ZoneSketch"].includes(project.format) ||
    project.version !== 1 ||
    !ownObject(project.project)
  ) {
    throw new Error(
      "The handoff needs an actual supported Zone Sketch save envelope.",
    );
  }
  // Schema validation belongs to the real receiver and the caller's independent importer.
  const text = JSON.stringify(project);
  if (new TextEncoder().encode(text).length > MAX_SOURCE_BYTES)
    throw new Error("Zone Sketch save exceeds the 32 MiB handoff limit.");
  return text;
}
async function contentHash(text, cryptoApi) {
  const value = await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Call directly inside a user gesture: this function opens the editor synchronously.
 * onSave is responsible for schema validation, conflict checks and transactional local saving.
 */
export function createZoneHandoff({
  url = DEFAULT_ZONE_SKETCH_URL,
  payload,
  onSave,
  onStatus = () => {},
  onError = () => {},
  timeoutMs = 15000,
  hostWindow = globalThis.window,
} = {}) {
  if (!hostWindow?.open || !hostWindow?.addEventListener)
    throw new Error("A browser window is required to open Zone Sketch.");
  const target = parseZoneHandoffConfig(url);
  const opener = parseZoneHandoffConfig(hostWindow.location.origin);
  if (typeof onSave !== "function")
    throw new Error("A local save handler is required.");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 10)
    throw new Error("Handoff timeout must be at least 10 milliseconds.");
  let context = null;
  const cryptoApi = hostWindow.crypto || globalThis.crypto;
  const requests = new Map();
  let popup = null,
    session = "",
    state = "idle",
    disposed = false,
    active = false,
    loadSent = false,
    loadDelivered = false,
    loaded = false,
    pending = null,
    timeout = null,
    poll = null;
  const notify = (name, message) => {
    state = name;
    try {
      onStatus({ state: name, message, connected: loaded, session });
    } catch {
      /* Consumer reporting must not break transport. */
    }
  };
  const report = (error, name = "error") => {
    notify(name, error.message);
    try {
      onError(error);
    } catch {
      /* Preserve connection cleanup. */
    }
  };
  const stopTimers = () => {
    if (timeout !== null) hostWindow.clearTimeout(timeout);
    if (poll !== null) hostWindow.clearInterval(poll);
    timeout = poll = null;
  };
  const packet = (type, fields = {}) => ({
    protocol: ZONE_HANDOFF_PROTOCOL,
    version: ZONE_HANDOFF_VERSION,
    session,
    type,
    ...fields,
  });
  const send = (message, expectedSession = session) => {
    if (
      !disposed &&
      active &&
      expectedSession === session &&
      popup &&
      !popup.closed
    )
      popup.postMessage(message, target.origin);
  };
  const responseError = (requestId, message) =>
    send(
      packet("error", { ...(requestId ? { requestId } : {}), error: message }),
    );

  async function receive(event) {
    const data = event.data;
    if (
      disposed ||
      !active ||
      event.source !== popup ||
      event.origin !== target.origin ||
      !ownObject(data) ||
      data.protocol !== ZONE_HANDOFF_PROTOCOL ||
      data.version !== ZONE_HANDOFF_VERSION ||
      data.session !== session
    )
      return;
    if (data.type === "ready") {
      if (loadSent) return;
      loadSent = true;
      const loadedContext = await payloadReady;
      if (!loadedContext || disposed || !active || data.session !== session)
        return;
      loadDelivered = true;
      send(packet("load", { payload: loadedContext }));
      notify(
        "loading",
        "Zone Sketch connected. Loading this job’s working drawing…",
      );
      return;
    }
    if (data.type === "loaded") {
      if (!loadDelivered || loaded) return;
      loaded = true;
      if (timeout !== null) hostWindow.clearTimeout(timeout);
      timeout = null;
      notify(
        "connected",
        "Drawing loaded in Zone Sketch. Save to Jobs there to return the revision.",
      );
      return;
    }
    if (data.type === "error") {
      if (!loaded) {
        stopTimers();
        active = false;
      }
      report(
        new Error(
          typeof data.error === "string"
            ? data.error.slice(0, 2000)
            : "Zone Sketch could not complete the handoff.",
        ),
      );
      return;
    }
    if (data.type === "cancel") {
      active = false;
      loaded = false;
      stopTimers();
      notify("cancelled", "Returned from Zone Sketch without a new save.");
      return;
    }
    if (data.type !== "save") return;
    const requestId = data.requestId;
    if (!validId(requestId) || requestId.length > 128) {
      responseError(null, "A valid save request ID is required.");
      return;
    }
    if (!loaded) {
      responseError(
        requestId,
        "The drawing must finish loading before it can be saved to Jobs.",
      );
      return;
    }
    if (!ownObject(data.payload)) {
      responseError(requestId, "A save payload is required.");
      return;
    }
    if (pending && pending !== requestId) {
      responseError(
        requestId,
        "Another save is still in progress. Retry after its acknowledgement.",
      );
      return;
    }
    const requestSession = session;
    let text;
    try {
      text = actualProject(data.payload.project);
    } catch (error) {
      responseError(requestId, error.message);
      return;
    }
    let entry = requests.get(requestId);
    if (entry) {
      const incomingHash = await contentHash(text, cryptoApi);
      await entry.finished;
      if (disposed || requestSession !== session) return;
      if (incomingHash !== entry.hash) {
        responseError(
          requestId,
          "This save request ID was already used for different drawing content.",
        );
        return;
      }
      send(
        packet(
          entry.error ? "error" : "saved",
          entry.error
            ? { requestId, error: entry.error }
            : { requestId, payload: { result: entry.result } },
        ),
        requestSession,
      );
      return;
    }
    if (requests.size >= 100) {
      responseError(
        requestId,
        "This editing session reached its save limit. Reopen the latest saved job in a new editor session.",
      );
      return;
    }
    pending = requestId;
    let finish;
    entry = {
      hash: null,
      error: null,
      result: null,
      finished: new Promise((resolve) => {
        finish = resolve;
      }),
    };
    requests.set(requestId, entry);
    notify(
      "saving",
      "Saving the returned drawing and device changes on this device…",
    );
    try {
      entry.hash = await contentHash(text, cryptoApi);
      if (disposed || !active || requestSession !== session)
        throw new Error("This editor session is no longer active.");
      const result = await onSave(structuredClone(data.payload.project), {
        requestId,
        session: requestSession,
        siteId: context.siteId,
        jobId: context.jobId,
        drawingId: context.drawingId,
        jobRevision: context.jobRevision,
        ...(data.payload.previews === undefined
          ? {}
          : { previews: structuredClone(data.payload.previews) }),
      });
      if (result === false)
        throw new Error(
          "Jobs could not save the returned drawing. Your existing saved records are unchanged.",
        );
      entry.result = result === undefined ? null : structuredClone(result);
      if (requestSession === session && !disposed && active) {
        send(packet("saved", { requestId, payload: { result: entry.result } }));
        notify("saved", "Drawing revision saved in Jobs.");
      }
    } catch (error) {
      entry.error =
        error.message || "Jobs could not save the returned drawing.";
      if (requestSession === session && !disposed && active) {
        send(packet("error", { requestId, error: entry.error }));
        report(new Error(entry.error));
      }
      // A failed save may be explicitly retried with the same request and payload.
      requests.delete(requestId);
    } finally {
      if (pending === requestId) pending = null;
      finish();
    }
  }
  const listener = (event) => {
    receive(event).catch((error) => report(error));
  };
  hostWindow.addEventListener("message", listener);
  function start() {
    if (disposed) throw new Error("This handoff has been disposed.");
    if (pending)
      throw new Error("Wait for the pending local save before reconnecting.");
    stopTimers();
    active = true;
    loaded = false;
    loadSent = false;
    loadDelivered = false;
    session = cryptoApi.randomUUID();
    const address = new URL(target.url),
      fragment = new URLSearchParams(address.hash.slice(1));
    fragment.set("jobsOrigin", opener.origin);
    fragment.set("session", session);
    address.hash = fragment.toString();
    notify("opening", "Opening Zone Sketch…");
    try {
      popup = hostWindow.open(address.href, `jobs-zonesketch-${session}`);
    } catch (error) {
      active = false;
      report(
        new Error(`Zone Sketch could not be opened: ${error.message}`),
        "blocked",
      );
      return;
    }
    if (!popup) {
      active = false;
      report(
        new Error(
          "The browser blocked Zone Sketch. Allow this popup and try again.",
        ),
        "blocked",
      );
      return;
    }
    notify("waiting", "Waiting for the Zone Sketch handoff receiver…");
    timeout = hostWindow.setTimeout(() => {
      timeout = null;
      if (!loaded)
        report(
          new Error(
            "This Zone Sketch deployment did not finish the connection. It needs the Jobs handoff receiver; no returned changes have been saved. Keep this job open and reconnect after the receiver is available.",
          ),
          "unavailable",
        );
    }, timeoutMs);
    poll = hostWindow.setInterval(() => {
      if (popup?.closed) {
        stopTimers();
        active = false;
        loaded = false;
        notify(
          "closed",
          "Zone Sketch was closed. Your saved Jobs records remain available.",
        );
      }
    }, 500);
  }
  const payloadReady = Promise.resolve(payload)
    .then((value) => {
      if (
        !ownObject(value) ||
        !["siteId", "drawingId"].every((key) => validId(value[key])) ||
        !(
          (value.jobId === null && value.jobRevision === null) ||
          (validId(value.jobId) &&
            Number.isSafeInteger(value.jobRevision) &&
            value.jobRevision >= 1)
        )
      )
        throw new Error(
          "The handoff needs stable site and drawing IDs, plus a valid job/revision pair or two null values for site-only editing.",
        );
      actualProject(value.project);
      context = structuredClone(value);
      return context;
    })
    .catch((error) => {
      if (!disposed) {
        report(error);
        stopTimers();
        active = false;
        loaded = false;
        disposed = true;
        hostWindow.removeEventListener("message", listener);
      }
      return null;
    });
  start();
  return {
    get session() {
      return session;
    },
    get status() {
      return state;
    },
    get popup() {
      return popup;
    },
    get active() {
      return active && !disposed;
    },
    get connected() {
      return loaded && active && !disposed;
    },
    reconnect() {
      start();
    },
    close() {
      if (disposed) return;
      stopTimers();
      active = false;
      popup?.close();
      loaded = false;
      notify("closed", "Zone Sketch was closed.");
    },
    dispose() {
      if (disposed) return;
      stopTimers();
      disposed = true;
      active = false;
      loaded = false;
      hostWindow.removeEventListener("message", listener);
      notify("disposed", "Zone Sketch handoff ended.");
    },
  };
}
