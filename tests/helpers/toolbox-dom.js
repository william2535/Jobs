import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

/** Event-driven DOM coverage, deliberately without a browser or a Jobs database. */
export function installToolboxDOM(t) {
  const window = new Window({ url: 'https://jobs.example.test/#workspace' });
  const networkCalls = [];
  const saved = new Map();
  for (const key of ['window', 'document', 'navigator', 'localStorage', 'location', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'FormData', 'AbortController', 'AbortSignal', 'CSS', 'confirm', 'fetch', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const value = key === 'fetch' ? async request => { networkCalls.push(String(request)); throw Error('Network unavailable in local Toolbox test'); } : key === 'confirm' ? () => false : ['requestAnimationFrame', 'cancelAnimationFrame'].includes(key) ? window[key].bind(window) : key === 'window' ? window : window[key];
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(async () => {
    for (const root of window.document.body.children) root.dispose?.();
    await window.happyDOM.abort();
    window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    assert.deepEqual(networkCalls, [], 'Included Toolbox tools must not request a network resource');
  });
  return window;
}

export function mountToolbox(t, root) {
  document.body.append(root);
  t.after(() => { root.dispose?.(); root.remove(); });
  return root;
}

export function field(root, selector, value, event = 'input') {
  const input = root.querySelector(selector);
  assert.ok(input, `Missing input: ${selector}`);
  input.value = String(value);
  input.dispatchEvent(new Event(event, { bubbles: true }));
  return input;
}

export function click(root, selector) {
  const button = root.querySelector(selector);
  assert.ok(button, `Missing control: ${selector}`);
  assert.notEqual(button.disabled, true, `Disabled control: ${selector}`);
  button.click();
  return button;
}

export function submit(root, selector) {
  const form = root.querySelector(selector);
  assert.ok(form, `Missing form: ${selector}`);
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

export async function until(predicate, message = 'Expected DOM update') {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(await predicate(), message);
}

export function metric(root, label) {
  const term = [...root.querySelectorAll('dt')].find(element => element.textContent.trim() === label);
  assert.ok(term, `Missing result: ${label}`);
  return term.nextElementSibling.textContent.trim();
}
