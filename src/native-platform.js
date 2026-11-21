/** Android-only transport. Browser builds keep their normal web behaviour. */
export const ANDROID_APP_ORIGIN = 'https://appassets.androidplatform.net';
export const EXPORT_CHUNK_BYTES = 192 * 1024;
const clients = new WeakMap();

export function isNativePlatform(host = globalThis) {
  return host.location?.origin === ANDROID_APP_ORIGIN
    && host.location?.pathname?.startsWith('/assets/') === true
    && typeof host.JobsNative?.postMessage === 'function';
}

/** The bridge is injected only into the Android application's trusted origin. */
export function createNativePlatform({ host = globalThis, requestTimeoutMs = 30000 } = {}) {
  if (!isNativePlatform(host)) return null;
  const bridge = host.JobsNative, pending = new Map();
  let sequence = 0, disposed = false, activeExport = false, information = null;
  const previousListener = bridge.onmessage;
  const listener = event => {
    let reply;
    try { reply = JSON.parse(event.data); } catch { return; }
    if (!reply || typeof reply.id !== 'string' || typeof reply.ok !== 'boolean') return;
    const task = pending.get(reply.id);
    if (!task) return;
    pending.delete(reply.id);
    clearTimeout(task.timer);
    if (reply.ok) task.resolve(reply.result);
    else task.reject(Error(typeof reply.error === 'string' ? reply.error : 'The Android action could not be completed.'));
  };
  bridge.onmessage = listener;

  function request(type, payload = {}, timeout = requestTimeoutMs) {
    if (disposed) return Promise.reject(Error('The Android connection has closed. Reopen Jobs and try again.'));
    const id = `jobs-${Date.now().toString(36)}-${++sequence}`;
    return new Promise((resolve, reject) => {
      const task = { resolve, reject, timer: null };
      if (timeout > 0) task.timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('The Android action did not respond. Your saved records are unchanged.'));
      }, timeout);
      pending.set(id, task);
      try { bridge.postMessage(JSON.stringify({ ...payload, id, type })); }
      catch (error) { pending.delete(id); clearTimeout(task.timer); reject(error); }
    });
  }

  async function info() {
    if (!information) information = request('info').then(value => {
      if (!value || typeof value.buildId !== 'string' || !value.buildId
          || typeof value.applicationId !== 'string' || !/^[a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+$/.test(value.applicationId)
          || typeof value.versionName !== 'string' || !Number.isInteger(value.versionCode) || value.versionCode < 1) {
        throw Error('The installed Jobs version could not be verified. Reopen the app and try again.');
      }
      return Object.freeze({ ...value });
    }).catch(error => { information = null; throw error; });
    return information;
  }

  async function exportJson(data, name) {
    if (activeExport) throw Error('A file is already being exported. Finish or cancel that save first.');
    if (typeof name !== 'string' || !name || /[\x00-\x1f/\\]/.test(name)) throw Error('The export file name is invalid.');
    const json = JSON.stringify(data);
    if (typeof json !== 'string') throw Error('The export contains no JSON data.');
    const blob = new Blob([json], { type: 'application/json' });
    let token = null;
    activeExport = true;
    try {
      const start = await request('exportStart', { name, mime: 'application/json', bytes: blob.size });
      if (!start || typeof start.token !== 'string' || !start.token) throw Error('Android could not prepare the export.');
      token = start.token;
      for (let offset = 0; offset < blob.size; offset += EXPORT_CHUNK_BYTES) {
        const bytes = new Uint8Array(await blob.slice(offset, offset + EXPORT_CHUNK_BYTES).arrayBuffer());
        let binary = '';
        for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
        const encoded = (host.btoa || globalThis.btoa)(binary);
        const acknowledgement = await request('exportChunk', { token, data: encoded });
        if (acknowledgement?.bytesWritten !== offset + bytes.length) throw Error('The export was not transferred completely. Try saving it again.');
      }
      // A user may spend time choosing a document provider/folder. Only Android's
      // actual picker/write result can finish this action; do not time it out.
      const result = await request('exportFinish', { token }, 0);
      if (!['saved', 'cancelled'].includes(result?.status)) throw Error('Android did not confirm whether the file was saved. Check the selected folder before retrying.');
      token = null;
      return result;
    } finally {
      if (token) await request('exportCancel', { token }).catch(() => {});
      activeExport = false;
    }
  }

  async function print(jobName = 'Jobs report') {
    const result = await request('print', { jobName }, 0);
    if (!['finished', 'cancelled'].includes(result?.status)) throw Error('The Android print dialog did not confirm that it closed.');
    return result;
  }

  async function openUpdates() {
    const value = await info();
    // Native navigation opens this HTTPS address in the external browser/Play.
    // Do not navigate the privileged application WebView to external content.
    host.open?.(`https://play.google.com/store/apps/details?id=${encodeURIComponent(value.applicationId)}`, '_blank', 'noopener,noreferrer');
    return false;
  }

  return {
    info, exportJson, print, openUpdates,
    get isBusy() { return activeExport || pending.size > 0; },
    dispose() {
      disposed = true;
      if (bridge.onmessage === listener) bridge.onmessage = previousListener;
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(Error('The Android connection has closed.')); }
      pending.clear();
    },
  };
}

export function getNativePlatform(host = globalThis) {
  if (!isNativePlatform(host)) return null;
  if (!clients.has(host.JobsNative)) clients.set(host.JobsNative, createNativePlatform({ host }));
  return clients.get(host.JobsNative);
}
