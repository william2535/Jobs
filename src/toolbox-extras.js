/** Owner-authorised FINDR tools, isolated from Jobs sites, visits and test results. */
import { createResistorLabController } from '../vendor/findr-extras/resistor-lab.mjs';
import { createFessMocksController } from '../vendor/findr-extras/fess-mocks.mjs';
import fessBank from '../vendor/findr-extras/data/fess-mocks.json' with { type: 'json' };

export const TOOLBOX_EXTRAS_DATABASE = 'jobs-toolbox-extras';

/** Each write commits atomically. Storage errors leave the controller draft available to retry. */
export function createToolboxExtraStorage({ indexedDB = globalThis.indexedDB } = {}) {
  async function transaction(mode, key, value) {
    if (!indexedDB) throw Error('Local tool storage is unavailable in this browser.');
    const database = await new Promise((resolve, reject) => {
      let failed = false;
      const request = indexedDB.open(TOOLBOX_EXTRAS_DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => { if (failed) request.result.close(); else resolve(request.result); };
      request.onerror = () => reject(request.error || Error('Local tool storage could not be opened.'));
      request.onblocked = () => { failed = true; reject(Error('Close another Jobs tool window and retry opening storage.')); };
    });
    return new Promise((resolve, reject) => {
      let result, operation;
      try {
        operation = database.transaction('settings', mode);
        const store = operation.objectStore('settings');
        const request = mode === 'readonly' ? store.get(key) : store.put(structuredClone(value), key);
        request.onsuccess = () => { result = request.result; };
        operation.oncomplete = () => { database.close(); resolve(mode === 'readonly' ? result : undefined); };
        operation.onerror = () => { database.close(); reject(operation.error || request.error || Error('The tool change was not saved.')); };
        operation.onabort = () => { database.close(); reject(operation.error || request.error || Error('The tool change was not saved.')); };
      } catch (error) { database.close(); reject(error); }
    });
  }
  return {
    read: key => transaction('readonly', key),
    write: (key, value) => transaction('readwrite', key, value),
  };
}

/** Local routes retain the original controller flow without changing the app URL or hash. */
export function renderToolboxExtra(kind, { onBack = () => {}, read, write, audio } = {}) {
  if (!['resistor-lab', 'fess'].includes(kind)) throw Error('This extra tool is not available.');
  const root = document.createElement('section');
  root.className = 'toolbox-extra'; root.dataset.toolboxExtra = kind;
  root.setAttribute('aria-label', kind === 'fess' ? 'FESS revision' : 'Resistor lab');
  const notice = document.createElement('p');
  notice.className = 'toolbox-extra-notice'; notice.hidden = true; notice.setAttribute('role', 'alert');
  const app = document.createElement('div'); app.className = 'toolbox-extra-content';
  root.append(notice, app);
  const storage = createToolboxExtraStorage();
  let disposed = false, controller, currentRoute = kind === 'fess' ? '#quizzes' : '#resistor-lab';
  const yields = new Map();
  const yieldControl = () => new Promise(resolve => {
    const timer = setTimeout(() => { yields.delete(timer); resolve(); }, 0);
    yields.set(timer, resolve);
  });
  const showError = error => {
    if (disposed) return;
    notice.textContent = error?.message || String(error); notice.hidden = false;
  };
  const canLeave = () => {
    if (disposed) return true;
    const allowed = controller?.canLeave?.() !== false;
    if (!allowed && controller?.hasUnsavedChanges?.()) showError(Error('Your latest tool changes have not been saved. Wait for saving to finish, or use Retry save before leaving.'));
    return allowed;
  };
  function renderRoute() {
    if (disposed) return;
    notice.hidden = true;
    const id = currentRoute.includes('/') ? currentRoute.slice(currentRoute.indexOf('/') + 1) : '';
    root.ready = Promise.resolve(controller.render(id)).catch(showError);
  }
  function navigate(destination, fromSavedAction = false) {
    if (disposed || (!fromSavedAction && !canLeave())) return;
    if (destination === '#home' || destination === '#toolbox') { onBack(); return; }
    if (!(kind === 'fess' ? /^#(?:quizzes|fess-mocks|fess-papers)(?:\/[^#]*)?$/.test(destination) : destination === '#resistor-lab')) return;
    currentRoute = destination;
    renderRoute();
  }
  const route = { get hash() { return currentRoute; }, set hash(value) { navigate(String(value), true); } };
  const common = { app, read: read || storage.read, write: write || storage.write, route };
  controller = kind === 'resistor-lab'
    ? createResistorLabController({ ...common, yieldControl })
    : createFessMocksController({
      ...common,
      ...(audio ? { audio } : {}),
      // The full source question pack is in the built app and service-worker cache.
      fetcher: async () => ({ ok: true, json: async () => structuredClone(fessBank) }),
      toast: value => showError(value),
    });
  const interceptLink = event => {
    const link = event.target.closest?.('a[href^="#"]');
    if (!link || !root.contains(link)) return;
    event.preventDefault(); event.stopPropagation();
    navigate(link.getAttribute('href'));
  };
  root.addEventListener('click', interceptLink, true);
  root.confirmLeave = canLeave;
  root.hasUnsavedChanges = () => !disposed && !!controller.hasUnsavedChanges?.();
  root.dispose = () => {
    if (disposed) return;
    disposed = true;
    root.removeEventListener('click', interceptLink, true);
    controller.dispose?.();
    for (const [timer, resolve] of yields) { clearTimeout(timer); resolve(); }
    yields.clear();
  };
  renderRoute();
  return root;
}
