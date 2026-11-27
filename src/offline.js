import { getNativePlatform } from './native-platform.js';

/** Offline preparation and deliberate updates. Never reloads or changes job data. */
export function startOffline({
  onStatus = () => {}, onUpdate = () => {},
  serviceWorker = globalThis.navigator?.serviceWorker,
  createChannel = () => new MessageChannel(),
  timeoutMs = 12000, messageTimeoutMs = 4000,
  expectedBuildId = typeof __JOBS_BUILD_ID__ === 'undefined' ? null : __JOBS_BUILD_ID__,
  nativePlatform = getNativePlatform(),
} = {}) {
  if (nativePlatform) {
    let disposed = false, inFlight = null, prepared = false;
    const status = value => { if (!disposed) onStatus(value); };
    async function prepare() {
      prepared = false;
      status('Checking installed app…');
      try {
        const installed = await nativePlatform.info();
        if (!installed?.buildId || (expectedBuildId && installed.buildId !== expectedBuildId)) throw Error('The installed app files do not match this version. Update Jobs through Google Play.');
        if (disposed) return false;
        prepared = true;
        status('Ready offline · included in this app');
        onUpdate({ available: false, blocked: false, message: 'App updates are managed in Google Play.' });
        return true;
      } catch (error) { status(error.message || 'The installed app could not be verified.'); return false; }
    }
    const retry = () => {
      if (disposed) return Promise.resolve(false);
      if (!inFlight) inFlight = prepare().finally(() => { inFlight = null; });
      return inFlight;
    };
    const checkForUpdates = async () => {
      if (disposed) return false;
      if (!prepared && !await retry()) return false;
      status('Ready offline · check Google Play for app updates');
      await nativePlatform.openUpdates();
      return false;
    };
    // Bundled Android assets need no service worker and are updated atomically
    // with the package. Avoid caching an older web shell over a newer AAB.
    queueMicrotask(() => { if (!disposed) retry(); });
    return { retry, checkForUpdates, applyUpdate: checkForUpdates, dispose() { disposed = true; } };
  }
  let disposed = false, registration = null, inFlight = null, prepared = false;
  let registrationAttempt = null, recoverOnRegistration = false, recoveryQueued = false, applyingUpdate = false;
  let registrationGeneration = 0, controllerGeneration = 0;
  let watchers = [];
  const lifecycle = [];
  const pending = new Set();
  const status = message => { if (!disposed) onStatus(message); };
  const update = value => { if (!disposed) onUpdate(value); };
  const listen = (target, type, handler, list) => {
    target?.addEventListener(type, handler);
    list.push(() => target?.removeEventListener(type, handler));
  };
  function bounded(promise, message, ms = timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (method, value) => { if (settled) return; settled = true; clearTimeout(task.timer); pending.delete(task); method(value); };
      const task = { cancel: () => finish(reject, Error('Offline preparation stopped.')) };
      task.timer = setTimeout(() => finish(reject, Error(message)), ms);
      pending.add(task);
      Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    });
  }
  async function request(worker, type, ms = messageTimeoutMs) {
    if (!worker) throw Error('The offline worker is not available.');
    const channel = createChannel();
    try {
      const answer = new Promise((resolve, reject) => {
        channel.port1.onmessage = event => resolve(event.data);
        channel.port1.onmessageerror = () => reject(Error('The offline worker response could not be read.'));
        channel.port1.start?.();
        worker.postMessage({ type }, [channel.port2]);
      });
      return await bounded(answer, 'Offline readiness could not be verified. Close other Jobs windows and reopen Jobs online to finish updating.', ms);
    } finally { channel.port1.close(); channel.port2.close(); }
  }
  function announceUpdate() {
    update({ available: !!registration?.waiting, blocked: false, message: registration?.waiting ? 'An update is ready. Save your work before applying it.' : '' });
  }
  function recover() {
    if (disposed || prepared || applyingUpdate || recoveryQueued) return;
    recoveryQueued = true;
    queueMicrotask(async () => {
      if (inFlight) await inFlight;
      recoveryQueued = false;
      if (!disposed && !prepared && !applyingUpdate) void beginPreparation(false);
    });
  }
  function observe() {
    for (const remove of watchers) remove(); watchers = [];
    const seen = new Set();
    const inspect = () => {
      for (const worker of [registration?.installing, registration?.active]) if (worker && !seen.has(worker)) {
        seen.add(worker);
        let previousState = worker.state;
        listen(worker, 'statechange', () => {
          const failedInstallation = worker.state === 'redundant' && ['installing', 'activating'].includes(previousState);
          previousState = worker.state;
          announceUpdate();
          if (worker.state === 'activated') recover();
          if (failedInstallation && prepared) status('Ready offline · update download failed; try checking again.');
        }, watchers);
      }
      announceUpdate();
    };
    listen(registration, 'updatefound', inspect, watchers);
    inspect();
  }
  function retainRegistration(value) {
    if (disposed || !value) return value;
    if (registration !== value) { registration = value; observe(); }
    else announceUpdate();
    if (recoverOnRegistration) { recoverOnRegistration = false; recover(); }
    return value;
  }
  function registerInBackground(fresh = false) {
    if (registrationAttempt && !fresh) return registrationAttempt;
    // Registration can perform a network update check even when an installed
    // worker already controls this page. It must not gate verified offline use.
    const attempt = { generation: ++registrationGeneration };
    attempt.promise = Promise.resolve().then(() => serviceWorker.register('./sw.js', { updateViaCache: 'none' }));
    registrationAttempt = attempt;
    attempt.promise.then(value => {
      if (attempt.generation !== registrationGeneration) return;
      registrationAttempt = null;
      retainRegistration(value);
    }, () => { if (registrationAttempt === attempt) registrationAttempt = null; });
    return attempt;
  }
  async function findRegistration(attempt) {
    if (registration) return registration;
    const existing = typeof serviceWorker.getRegistration === 'function'
      ? Promise.resolve().then(() => serviceWorker.getRegistration()).then(value => {
        if (!value) throw Error('No installed offline worker was found.');
        if (attempt.generation !== registrationGeneration) throw Error('Offline preparation was superseded by a retry.');
        return retainRegistration(value);
      }) : null;
    try {
      const value = await bounded(existing ? Promise.any([attempt.promise, existing]) : attempt.promise, 'Offline registration timed out. Retry online.');
      if (attempt.generation !== registrationGeneration) throw Error('Offline preparation was superseded by a retry.');
      return retainRegistration(value);
    } catch (error) {
      // A slow browser registration can still complete after our UI timeout.
      // Recheck its cache then, rather than retaining a stale failure forever.
      recoverOnRegistration = true;
      throw error instanceof AggregateError ? error.errors[0] : error;
    }
  }
  async function waitForActive() {
    if (registration.active?.state === 'activated') return registration.active;
    const removes = [], seen = new Set();
    try {
      return await bounded(new Promise((resolve, reject) => {
        const inspect = () => {
          if (registration.active?.state === 'activated') { resolve(registration.active); return; }
          const worker = registration.installing || registration.active;
          if (worker?.state === 'redundant') { reject(Error('Offline preparation failed while saving the app files. Retry online with available storage.')); return; }
          if (worker && !seen.has(worker)) {
            seen.add(worker);
            listen(worker, 'statechange', () => {
              // registration.installing may already be cleared before this event.
              if (worker.state === 'redundant') reject(Error('Offline preparation failed while saving the app files. Retry online with available storage.'));
              else inspect();
            }, removes);
          }
        };
        listen(registration, 'updatefound', inspect, removes);
        serviceWorker.ready?.then(value => { if (value.active?.state === 'activated') resolve(value.active); }).catch(reject);
        inspect();
      }), 'Offline preparation timed out. Retry online and check available device storage.');
    } finally { for (const remove of removes) remove(); }
  }
  function controllerChange(previous) {
    let remove = () => {}, cancel = () => {};
    const promise = new Promise(resolve => {
      const check = () => { if (serviceWorker.controller && serviceWorker.controller !== previous) { remove(); resolve(true); } };
      remove = () => serviceWorker.removeEventListener('controllerchange', check);
      cancel = () => { remove(); resolve(false); };
      serviceWorker.addEventListener('controllerchange', check);
      check();
    });
    const waiting = bounded(promise, 'The updated app could not take control. Close Jobs windows and reopen online.').finally(remove);
    // A simultaneous request failure/disposal may happen before the caller awaits it.
    waiting.catch(() => {});
    return { promise: waiting, cancel };
  }
  async function prepare(freshRegistration = false) {
    if (disposed) return false;
    if (!serviceWorker) { status('Offline use requires HTTPS and a browser that supports installation.'); return false; }
    prepared = false;
    status('Preparing offline use…');
    const attempt = registerInBackground(freshRegistration);
    try {
      // The controller serves this open app, so it is the authoritative cache
      // to verify. A registration result is unnecessary on an offline reopen.
      let active = serviceWorker.controller;
      if (!active) {
        await findRegistration(attempt);
        if (disposed) return false;
        active = await waitForActive();
      }
      if (!serviceWorker.controller) {
        const change = controllerChange(null);
        active.postMessage({ type: 'JOBS_CLAIM_CLIENT' });
        if (!await change.promise) return false;
      }
      active = serviceWorker.controller;
      const generation = controllerGeneration;
      const checkController = () => {
        if (serviceWorker.controller !== active || controllerGeneration !== generation)
          throw Error('The offline worker changed. Rechecking offline readiness…');
      };
      let result = await request(active, 'JOBS_CACHE_STATUS');
      checkController();
      if (expectedBuildId && result?.buildId && result.buildId !== expectedBuildId) throw Error('This app version is not prepared offline. Apply the available update, or close Jobs windows and reopen online.');
      if (!result?.ready) result = await request(active, 'JOBS_PREPARE_OFFLINE', timeoutMs);
      checkController();
      if (!result?.ready) throw Error(result?.error || 'Required offline files are missing. Retry online to prepare them.');
      if (expectedBuildId && result.buildId !== expectedBuildId) throw Error('This app version is not prepared offline. Apply the available update, or close Jobs windows and reopen online.');
      prepared = true;
      status('Ready offline');
      announceUpdate();
      return true;
    } catch (error) { status(error.message || 'Offline preparation failed. Retry online.'); return false; }
  }
  function beginPreparation(freshRegistration) {
    if (disposed) return Promise.resolve(false);
    if (!inFlight) inFlight = prepare(freshRegistration).finally(() => { inFlight = null; });
    return inFlight;
  }
  // Explicit retries can replace a browser registration promise that never
  // settles. Generation checks prevent its eventual result replacing the retry.
  function retry() { return beginPreparation(true); }
  async function checkForUpdates() {
    if (disposed) return false;
    try {
      if (!registration) await findRegistration(registerInBackground());
      if (disposed) return false;
      await bounded(registration.update(), 'The update check timed out. Try again online.');
      announceUpdate();
      return !!registration.waiting;
    } catch { status(prepared ? 'Ready offline · update check unavailable; try again online.' : 'Update check unavailable. Retry online.'); return false; }
  }
  async function applyUpdate() {
    if (disposed || !registration?.waiting) return false;
    const worker = registration.waiting;
    const change = controllerChange(serviceWorker.controller);
    applyingUpdate = true;
    try {
      const result = await request(worker, 'JOBS_ACTIVATE_UPDATE');
      if (!result?.activated) {
        change.cancel();
        update({ available: true, blocked: !!result?.blocked, message: result?.message || 'The update could not be applied. Try again.' });
        return false;
      }
      const changed = await change.promise;
      if (changed) { update({ available: false, blocked: false, message: '' }); status('Update applied. Reopening Jobs…'); }
      return changed;
    } catch (error) { change.cancel(); status(error.message); return false; }
    finally { applyingUpdate = false; }
  }
  const api = {
    retry, checkForUpdates, applyUpdate,
    dispose() {
      disposed = true;
      for (const remove of watchers) remove(); watchers = [];
      for (const remove of lifecycle) remove();
      for (const task of [...pending]) task.cancel();
    },
  };
  listen(serviceWorker, 'controllerchange', () => {
    controllerGeneration++;
    if (applyingUpdate) return;
    prepared = false;
    recover();
  }, lifecycle);
  // Let the caller retain the controller before callbacks run.
  queueMicrotask(() => { if (!disposed) beginPreparation(false); });
  return api;
}
