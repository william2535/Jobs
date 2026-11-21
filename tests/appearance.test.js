import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';
import { createAppearanceController, createAppearanceControl } from '../src/appearance.js';

const KEY = 'jobs-appearance';

function fixture(t, { saved = null, dark = false, readFails = false, writeFails = false } = {}) {
  const dom = new Window({ url: 'https://jobs.example.test/Jobs/' });
  const document = dom.document;
  document.head.innerHTML = '<meta name="theme-color" content="#123763">';
  const records = new Map([['synthetic-job', 'Existing job records']]);
  if (saved !== null) records.set(KEY, saved);
  const faults = { readFails, writeFails };
  const securityError = () => new dom.DOMException('Storage blocked', 'SecurityError');
  const storage = {
    getItem(key) { if (faults.readFails) throw securityError(); return records.get(key) ?? null; },
    setItem(key, value) { if (faults.writeFails) throw securityError(); records.set(key, value); },
  };
  const mediaListeners = new Set(), storageListeners = new Set();
  const media = {
    matches: dark,
    addEventListener(type, listener) { if (type === 'change') mediaListeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'change') mediaListeners.delete(listener); },
  };
  const window = {
    document, localStorage: storage, matchMedia: () => media,
    addEventListener(type, listener) { if (type === 'storage') storageListeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'storage') storageListeners.delete(listener); },
    get indexedDB() { throw Error('Appearance must not access job storage'); },
  };
  const system = value => {
    media.matches = value;
    for (const listener of mediaListeners) listener({ matches: value });
  };
  const storageEvent = (key, newValue, storageArea = storage) => {
    for (const listener of storageListeners) listener({ key, newValue, storageArea });
  };
  t.after(() => dom.close());
  return { dom, window, document, records, faults, system, storageEvent, mediaListeners, storageListeners };
}

function controllerFor(t, fixture) {
  const controller = createAppearanceController(fixture);
  t.after(() => controller.dispose());
  return controller;
}

test('invalid saved appearance follows the system and an explicit choice survives later system changes', t => {
  const f = fixture(t, { saved: 'invalid-old-value', dark: true });
  const controller = controllerFor(t, f);
  assert.deepEqual(controller.getState(), { preference: 'system', theme: 'dark', persisted: true });
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  f.system(false);
  assert.equal(f.document.documentElement.dataset.theme, 'light');
  assert.equal(controller.setPreference('dark'), true);
  f.system(true);
  f.system(false);
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  assert.equal(f.document.documentElement.style.colorScheme, 'dark');
  assert.equal(f.document.querySelector('meta[name="theme-color"]').content, '#07121f');
  controller.setPreference('system');
  assert.equal(f.document.documentElement.dataset.theme, 'light');
  assert.deepEqual([...f.records], [['synthetic-job', 'Existing job records'], [KEY, 'system']]);
});

test('only matching cross-tab storage events update all mounted appearance controls', t => {
  const f = fixture(t, { saved: 'light', dark: true });
  const controller = controllerFor(t, f);
  const first = createAppearanceControl({ controller, document: f.document });
  const second = createAppearanceControl({ controller, document: f.document, compact: true });
  f.document.body.append(first, second);
  const select = root => root.querySelector('select');
  f.storageEvent('synthetic-job', 'dark');
  f.storageEvent(KEY, 'dark', {});
  assert.equal(controller.getState().preference, 'light');
  f.storageEvent(KEY, 'dark');
  assert.equal(select(first).value, 'dark');
  assert.equal(select(second).value, 'dark');
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  f.storageEvent(KEY, null);
  assert.equal(select(first).value, 'system');
  f.system(false);
  assert.equal(controller.getState().theme, 'light');
  f.storageEvent(KEY, 'dark');
  f.storageEvent(null, null);
  assert.equal(select(second).value, 'system', 'Clearing storage returns to the system setting');
  assert.equal(f.records.get('synthetic-job'), 'Existing job records');
});

test('blocked preference reads and writes leave Jobs usable with an honest session-only control', t => {
  const f = fixture(t, { dark: true, readFails: true, writeFails: true });
  const controller = controllerFor(t, f);
  const control = createAppearanceControl({ controller, document: f.document });
  f.document.body.append(control);
  assert.equal(controller.getState().theme, 'dark');
  assert.equal(controller.getState().persisted, false);
  const select = control.querySelector('select'), status = control.querySelector('[role="status"]');
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /this session.*could not save/i);
  assert.equal(select.getAttribute('aria-describedby'), status.id);
  select.value = 'light';
  assert.doesNotThrow(() => select.dispatchEvent(new f.dom.Event('change', { bubbles: true })));
  assert.equal(f.document.documentElement.dataset.theme, 'light');
  assert.equal(select.value, 'light');
  assert.equal(status.hidden, false);
  assert.deepEqual([...f.records], [['synthetic-job', 'Existing job records']]);
});

test('a failed preference write preserves the previous saved choice and can be retried', t => {
  const f = fixture(t, { saved: 'light', writeFails: true });
  const controller = controllerFor(t, f);
  const control = createAppearanceControl({ controller, document: f.document });
  f.document.body.append(control);
  assert.equal(controller.setPreference('dark'), false);
  assert.equal(f.records.get(KEY), 'light');
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  assert.equal(control.querySelector('[role="status"]').hidden, false);
  f.faults.writeFails = false;
  assert.equal(controller.setPreference('dark'), true);
  assert.equal(f.records.get(KEY), 'dark');
  assert.equal(control.querySelector('[role="status"]').hidden, true);
  assert.equal(control.querySelector('[role="status"]').textContent, '');
});

test('appearance changes preserve an unfinished job, and disposal stops stale listeners and controls', t => {
  const f = fixture(t, { saved: 'light' });
  f.document.body.innerHTML = '<form data-job-id="synthetic" data-dirty="true"><textarea>Saved text</textarea></form>';
  const job = f.document.querySelector('form'), note = job.querySelector('textarea');
  note.value = 'Unsaved engineer observation';
  note.focus();
  note.setSelectionRange(8, 16);
  const controller = controllerFor(t, f);
  const control = createAppearanceControl({ controller, document: f.document });
  f.document.body.append(control);
  const events = [];
  const unsubscribe = controller.subscribe(state => events.push(state.theme));
  controller.setPreference('dark');
  assert.equal(f.document.querySelector('form'), job);
  assert.equal(job.dataset.dirty, 'true');
  assert.equal(note.value, 'Unsaved engineer observation');
  assert.equal(f.document.activeElement, note);
  assert.deepEqual([note.selectionStart, note.selectionEnd], [8, 16]);
  assert.deepEqual(events, ['light', 'dark']);
  unsubscribe();
  control.dispose();
  controller.setPreference('light');
  assert.deepEqual(events, ['light', 'dark']);
  assert.equal(control.querySelector('select').value, 'dark', 'Disposed controls stop receiving updates');
  controller.dispose();
  assert.equal(f.mediaListeners.size, 0);
  assert.equal(f.storageListeners.size, 0);
  f.system(true);
  f.storageEvent(KEY, 'dark');
  assert.equal(controller.setPreference('dark'), false);
  assert.equal(f.document.documentElement.dataset.theme, 'light');
  assert.equal(f.records.get('synthetic-job'), 'Existing job records');
});

const initialScript = readFileSync(new URL('../public/appearance-init.js', import.meta.url), 'utf8');

test('the blocking first-paint script applies the saved choice before the application module', t => {
  const f = fixture(t, { saved: 'dark', dark: false });
  runInNewContext(initialScript, { window: f.window, document: f.document, localStorage: f.window.localStorage });
  assert.equal(f.document.documentElement.dataset.appearance, 'dark');
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  assert.equal(f.document.documentElement.style.colorScheme, 'dark');
  assert.equal(f.document.querySelector('meta[name="theme-color"]').content, '#07121f');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script\b[^>]*src="\/appearance-init\.js"[^>]*>/)?.[0];
  assert.ok(script, 'The static entry page must load the first-paint script');
  assert.doesNotMatch(script, /\s(?:async|defer)(?:\s|=|>)|\stype\s*=/);
  assert.ok(html.indexOf(script) < html.indexOf('<script type="module"'));
  assert.deepEqual([...f.records], [['synthetic-job', 'Existing job records'], [KEY, 'dark']]);
});

test('first paint safely falls back for corrupt or inaccessible preferences and unavailable media queries', t => {
  const f = fixture(t, { saved: '<script>invalid</script>', dark: true });
  const sandbox = { window: f.window, document: f.document, localStorage: f.window.localStorage };
  assert.doesNotThrow(() => runInNewContext(initialScript, sandbox));
  assert.equal(f.document.documentElement.dataset.appearance, 'system');
  assert.equal(f.document.documentElement.dataset.theme, 'dark');
  f.faults.readFails = true;
  f.window.matchMedia = () => { throw Error('Unavailable WebView media query'); };
  assert.doesNotThrow(() => runInNewContext(initialScript, sandbox));
  assert.equal(f.document.documentElement.dataset.theme, 'light');
  assert.equal(f.document.documentElement.style.colorScheme, 'light');
  assert.equal(f.records.get('synthetic-job'), 'Existing job records');
});
