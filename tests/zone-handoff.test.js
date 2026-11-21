import test from "node:test";
import assert from "node:assert/strict";
import {
  createZoneHandoff,
  parseZoneHandoffConfig,
  DEFAULT_ZONE_SKETCH_URL,
} from "../src/zone-handoff.js";

function fakeWindow({ blocked = false } = {}) {
  const listeners = new Set(),
    timeouts = new Map(),
    intervals = new Map(),
    opened = [];
  let timerId = 0;
  return {
    location: { origin: "https://jobs.example" },
    crypto: globalThis.crypto,
    opened,
    listeners,
    addEventListener(type, handler) {
      if (type === "message") listeners.add(handler);
    },
    removeEventListener(type, handler) {
      listeners.delete(handler);
    },
    open(url, name) {
      if (blocked) return null;
      const popup = {
        closed: false,
        sent: [],
        postMessage(data, origin) {
          this.sent.push({ data: structuredClone(data), origin });
        },
        close() {
          this.closed = true;
        },
      };
      opened.push({ url, name, popup });
      return popup;
    },
    setTimeout(fn) {
      timeouts.set(++timerId, fn);
      return timerId;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(fn) {
      intervals.set(++timerId, fn);
      return timerId;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    expire() {
      for (const [id, fn] of [...timeouts]) {
        timeouts.delete(id);
        fn();
      }
    },
    poll() {
      for (const fn of [...intervals.values()]) fn();
    },
    emit(event) {
      for (const listener of listeners) listener(event);
    },
  };
}
const source = () => ({
  format: "ZoneSketchByWill",
  version: 1,
  project: { site: "Synthetic handoff", floors: [] },
});
const payload = () => ({
  siteId: "site-1",
  jobId: "job-1",
  drawingId: "drawing-1",
  jobRevision: 1,
  project: source(),
});
function emit(host, controller, type, fields = {}, event = {}) {
  host.emit({
    source: controller.popup,
    origin: "https://zones.example",
    data: {
      protocol: "jobs-zonesketch",
      version: 1,
      session: controller.session,
      type,
      ...fields,
    },
    ...event,
  });
}
async function eventually(assertion) {
  let last;
  for (let i = 0; i < 100; i++) {
    try {
      return assertion();
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw last;
}
async function connect(host, controller) {
  emit(host, controller, "ready");
  await eventually(() =>
    assert.equal(
      controller.popup.sent.filter((m) => m.data.type === "load").length,
      1,
    ),
  );
  emit(host, controller, "loaded");
  assert.equal(controller.status, "connected");
}

test("configuration permits HTTPS and local development only", () => {
  assert.equal(parseZoneHandoffConfig().url, DEFAULT_ZONE_SKETCH_URL);
  for (const url of [
    "http://localhost:4173/editor",
    "http://127.0.0.1:4173/",
    "http://[::1]:4173/",
  ])
    assert.ok(parseZoneHandoffConfig(url));
  for (const url of [
    "http://zones.example",
    "https://user:password@zones.example",
    "javascript:alert(1)",
    "file:///editor",
    "/relative",
  ])
    assert.throws(() => parseZoneHandoffConfig(url));
});

test("popup opens synchronously while an async payload prepares; URL contains only session routing", async () => {
  const host = fakeWindow();
  let resolve;
  const waiting = new Promise((done) => {
    resolve = done;
  });
  const controller = createZoneHandoff({
    url: "https://zones.example/editor",
    payload: waiting,
    onSave: async () => true,
    hostWindow: host,
  });
  assert.equal(
    host.opened.length,
    1,
    "opening happens before the payload promise resolves",
  );
  const address = new URL(host.opened[0].url),
    fragment = new URLSearchParams(address.hash.slice(1));
  assert.equal(fragment.get("jobsOrigin"), "https://jobs.example");
  assert.equal(fragment.get("session"), controller.session);
  assert.ok(
    !address.href.includes("site-1") && !address.href.includes("Synthetic"),
  );
  emit(host, controller, "ready");
  emit(host, controller, "loaded");
  assert.notEqual(
    controller.status,
    "connected",
    "cannot claim connected before a load was sent",
  );
  assert.equal(controller.popup.sent.length, 0);
  resolve(payload());
  await eventually(() => assert.equal(controller.popup.sent.length, 1));
  assert.deepEqual(controller.popup.sent[0].data.payload, payload());
  assert.equal(controller.popup.sent[0].origin, "https://zones.example");
  emit(host, controller, "ready");
  assert.equal(
    controller.popup.sent.length,
    1,
    "repeated ready never reloads working edits",
  );
  emit(host, controller, "loaded");
  assert.equal(controller.status, "connected");
  controller.dispose();
  assert.equal(host.listeners.size, 0);
});

test("wrong origins, windows, sessions and protocol versions cannot load or save", async () => {
  const host = fakeWindow();
  let saves = 0;
  const controller = createZoneHandoff({
    url: "https://zones.example",
    payload: payload(),
    onSave: async () => {
      saves++;
      return true;
    },
    hostWindow: host,
  });
  emit(host, controller, "ready", {}, { origin: "https://attacker.example" });
  emit(host, controller, "ready", {}, { source: {} });
  emit(host, controller, "ready", { session: "wrong" });
  emit(host, controller, "ready", { version: 2 });
  assert.equal(controller.popup.sent.length, 0);
  emit(host, controller, "save", {
    requestId: "early",
    payload: { project: source() },
  });
  assert.equal(controller.popup.sent.at(-1).data.type, "error");
  await connect(host, controller);
  emit(
    host,
    controller,
    "save",
    { requestId: "spoof", payload: { project: source() } },
    { source: {} },
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saves, 0);
  controller.close();
  host.poll();
  assert.equal(controller.status, "closed");
  emit(host, controller, "loaded");
  assert.equal(controller.status, "closed");
  controller.dispose();
});

test("save acknowledgements are serialized, retried idempotently, and conflicting request IDs rejected", async () => {
  const host = fakeWindow();
  let saves = 0,
    release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const controller = createZoneHandoff({
    url: "https://zones.example",
    payload: payload(),
    hostWindow: host,
    onSave: async (project, context) => {
      saves++;
      assert.equal(context.jobRevision, 1);
      assert.deepEqual(project, source());
      await pending;
      return { drawingId: "revision-2", jobRevision: 2 };
    },
  });
  await connect(host, controller);
  emit(host, controller, "save", {
    requestId: "save-1",
    payload: { project: source() },
  });
  await eventually(() => assert.equal(saves, 1));
  emit(host, controller, "save", {
    requestId: "save-2",
    payload: { project: source() },
  });
  assert.match(controller.popup.sent.at(-1).data.error, /in progress/);
  emit(host, controller, "save", {
    requestId: "save-1",
    payload: { project: source() },
  });
  release();
  await eventually(() =>
    assert.equal(
      controller.popup.sent.filter((x) => x.data.type === "saved").length,
      2,
    ),
  );
  assert.equal(saves, 1);
  emit(host, controller, "save", {
    requestId: "save-1",
    payload: { project: source() },
  });
  await eventually(() =>
    assert.equal(
      controller.popup.sent.filter((x) => x.data.type === "saved").length,
      3,
    ),
  );
  const changed = source();
  changed.project.site = "Different synthetic project";
  emit(host, controller, "save", {
    requestId: "save-1",
    payload: { project: changed },
  });
  await eventually(() =>
    assert.match(
      controller.popup.sent.at(-1).data.error || "",
      /different drawing content/,
    ),
  );
  assert.equal(saves, 1);
  controller.dispose();
});

test("a failed local save can retry the same request without reporting a false success", async () => {
  const host = fakeWindow(),
    errors = [];
  let saves = 0;
  const controller = createZoneHandoff({
    url: "https://zones.example",
    payload: payload(),
    hostWindow: host,
    onError: (e) => errors.push(e.message),
    onSave: async () => {
      saves++;
      if (saves === 1) throw Error("Storage quota unavailable");
      return true;
    },
  });
  await connect(host, controller);
  emit(host, controller, "save", {
    requestId: "retry",
    payload: { project: source() },
  });
  await eventually(() => assert.equal(errors.length, 1));
  assert.equal(
    controller.popup.sent.filter((x) => x.data.type === "saved").length,
    0,
  );
  emit(host, controller, "save", {
    requestId: "retry",
    payload: { project: source() },
  });
  await eventually(() =>
    assert.equal(controller.popup.sent.at(-1).data.type, "saved"),
  );
  assert.equal(saves, 2);
  controller.dispose();
});

test("missing receiver, blocked popup, closed window and failed preparation have explicit failure states", async () => {
  const host = fakeWindow(),
    statuses = [],
    errors = [];
  const controller = createZoneHandoff({
    url: "https://zones.example",
    payload: payload(),
    hostWindow: host,
    onSave: async () => true,
    onStatus: (s) => statuses.push(s),
    onError: (e) => errors.push(e.message),
    timeoutMs: 20,
  });
  host.expire();
  assert.equal(controller.status, "unavailable");
  assert.match(errors[0], /needs the Jobs handoff receiver/);
  assert.equal(statuses.at(-1).connected, false);
  const old = controller.popup,
    oldSession = controller.session;
  controller.reconnect();
  assert.notEqual(controller.session, oldSession);
  assert.equal(
    old.closed,
    false,
    "reconnecting never closes a potentially edited old window",
  );
  emit(host, controller, "ready", {}, { source: old });
  assert.equal(controller.popup.sent.length, 0);
  controller.popup.closed = true;
  host.poll();
  assert.equal(controller.status, "closed");
  controller.dispose();
  const blocked = createZoneHandoff({
    url: "https://zones.example",
    payload: payload(),
    hostWindow: fakeWindow({ blocked: true }),
    onSave: async () => true,
  });
  assert.equal(blocked.status, "blocked");
  blocked.dispose();
  const failedHost = fakeWindow();
  const failed = createZoneHandoff({
    url: "https://zones.example",
    payload: Promise.reject(Error("Cannot prepare drawing")),
    hostWindow: failedHost,
    onSave: async () => true,
  });
  await eventually(() => assert.equal(failed.status, "error"));
  assert.equal(failedHost.listeners.size, 0);
  assert.equal(failed.popup.closed, false);
});

test("site-only handoff accepts a null job pair and rejects a half-null identity", async () => {
  const host = fakeWindow(),
    sitePayload = { ...payload(), jobId: null, jobRevision: null };
  const controller = createZoneHandoff({
    url: "https://zones.example",
    payload: sitePayload,
    hostWindow: host,
    onSave: async () => true,
  });
  await connect(host, controller);
  assert.equal(controller.popup.sent[0].data.payload.jobId, null);
  controller.dispose();
  const invalid = createZoneHandoff({
    url: "https://zones.example",
    payload: { ...sitePayload, jobRevision: 1 },
    hostWindow: fakeWindow(),
    onSave: async () => true,
  });
  await eventually(() => assert.equal(invalid.status, "error"));
  assert.equal(invalid.active, false);
});
