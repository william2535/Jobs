import test from 'node:test';
import assert from 'node:assert/strict';
import { attachHoldToEdit } from '../src/hold-to-edit.js';

// A small event/DOM harness keeps these timing tests deterministic without a browser.
class Node {
  constructor(tag, doc) {
    this.tag = tag;
    this.ownerDocument = doc;
    this.nodeType = 1;
    this.attributes = new Map();
    this.children = [];
    this.listeners = [];
    this.style = { setProperty() {}, removeProperty() {} };
  }
  get isConnected() { return this.tag === '#document' || Boolean(this.parentElement?.isConnected); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  append(child) { child.remove(); child.parentElement = this; this.children.push(child); }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
  }
  contains(node) {
    for (let current = node; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (selector.split(',').some(part => current.matches(part.trim()))) return current;
    }
    return null;
  }
  matches(selector) {
    if (selector.startsWith('[contenteditable]')) return this.hasAttribute('contenteditable') && this.attributes.get('contenteditable') !== 'false';
    const attribute = selector.match(/^(\w+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) return (!attribute[1] || this.tag === attribute[1]) && this.hasAttribute(attribute[2]) && (attribute[3] === undefined || this.attributes.get(attribute[2]) === attribute[3]);
    return selector === this.tag;
  }
  addEventListener(name, callback, options) { this.listeners.push({ name, callback, capture: options === true || options?.capture === true }); }
  removeEventListener(name, callback, options) {
    const capture = options === true || options?.capture === true;
    this.listeners = this.listeners.filter(listener => listener.name !== name || listener.callback !== callback || listener.capture !== capture);
  }
}

function fixture() {
  const doc = new Node('#document');
  doc.ownerDocument = doc;
  doc.hidden = false;
  doc.defaultView = new Node('#window', doc);
  doc.createElement = tag => new Node(tag, doc);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  doc.append(doc.documentElement);
  doc.documentElement.append(doc.body);
  const root = doc.createElement('main');
  const target = doc.createElement('div');
  const label = doc.createElement('span');
  target.setAttribute('data-hold-edit', 'overview');
  target.setAttribute('role', 'button');
  root.append(target);
  target.append(label);
  doc.body.append(root);
  let now = 0;
  let id = 0;
  const pending = new Map();
  const timers = {
    setTimeout(callback, delay) { pending.set(++id, { callback, at: now + delay }); return id; },
    clearTimeout(timer) { pending.delete(timer); },
  };
  function tick(amount) {
    now += amount;
    for (const [key, timer] of [...pending]) {
      if (timer.at <= now) { pending.delete(key); timer.callback(); }
    }
  }
  const edits = [];
  const dispose = attachHoldToEdit(root, { onEdit: value => edits.push(value), timers });
  function dispatch(type, element = label, overrides = {}) {
    const event = {
      type, target: element, isPrimary: true, pointerId: 1, button: 0, buttons: 1,
      clientX: 50, clientY: 50, detail: 1, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      ...overrides,
    };
    const path = [];
    for (let node = element; node; node = node.parentElement) path.push(node);
    const invoke = (node, capture) => {
      for (const listener of [...node.listeners]) {
        if (event.stopped) return;
        if (listener.name === type && listener.capture === capture) listener.callback(event);
      }
    };
    [...path].reverse().forEach(node => invoke(node, true));
    path.forEach(node => invoke(node, false));
    return event;
  }
  return { doc, root, target, label, edits, dispose, dispatch, tick, pending };
}

test('a primary pointer opens the matching editor once, after three full seconds', () => {
  const f = fixture();
  const down = f.dispatch('pointerdown');
  assert.equal(down.defaultPrevented, false, 'normal touch scrolling remains available');
  assert.ok(f.target.hasAttribute('data-hold-active'));
  assert.equal(f.doc.body.children.length, 2, 'a holding hint is shown');
  f.tick(2999);
  assert.equal(f.edits.length, 0);
  f.tick(1);
  assert.deepEqual(f.edits, [f.target]);
  assert.equal(f.target.hasAttribute('data-hold-active'), false);
  assert.equal(f.doc.body.children.length, 1, 'the hint is removed');
  f.tick(6000);
  assert.equal(f.edits.length, 1);
  assert.equal(f.dispatch('click').defaultPrevented, true, 'the release click cannot navigate away from the editor');
});

test('a short tap remains a normal click and never edits', () => {
  const f = fixture();
  f.dispatch('pointerdown');
  f.tick(2999);
  f.dispatch('pointerup', f.label, { buttons: 0 });
  f.tick(1000);
  assert.equal(f.edits.length, 0);
  assert.equal(f.dispatch('click').defaultPrevented, false);
  assert.equal(f.pending.size, 0);
});

for (const interruption of ['pointercancel', 'lostpointercapture', 'scroll', 'blur', 'visibilitychange']) {
  test(`${interruption} cancels the pending editor`, () => {
    const f = fixture();
    f.dispatch('pointerdown');
    f.tick(1500);
    if (interruption === 'visibilitychange') f.doc.hidden = true;
    f.dispatch(interruption, interruption === 'blur' ? f.doc.defaultView : f.label);
    f.tick(3000);
    assert.deepEqual(f.edits, []);
    assert.equal(f.pending.size, 0);
    assert.equal(f.target.hasAttribute('data-hold-active'), false);
  });
}

test('small finger jitter is tolerated, but deliberate movement cancels', () => {
  const f = fixture();
  f.dispatch('pointerdown');
  f.dispatch('pointermove', f.label, { clientX: 55, clientY: 54 });
  f.tick(3000);
  assert.equal(f.edits.length, 1);
  f.dispatch('pointerdown');
  f.dispatch('pointermove', f.label, { clientX: 58, clientY: 58 });
  f.tick(3000);
  assert.equal(f.edits.length, 1);
});

test('a second pointer cancels the hold and nonprimary/right-button presses never start one', () => {
  const f = fixture();
  f.dispatch('pointerdown', f.label, { isPrimary: false, pointerId: 2 });
  f.tick(3000);
  f.dispatch('pointerup', f.label, { isPrimary: false, pointerId: 2, buttons: 0 });
  f.dispatch('pointerdown', f.label, { button: 2, buttons: 2 });
  f.tick(3000);
  f.dispatch('pointerup', f.label, { button: 2, buttons: 0 });
  assert.equal(f.edits.length, 0);
  f.dispatch('pointerdown');
  f.tick(2000);
  f.dispatch('pointerdown', f.label, { isPrimary: false, pointerId: 2 });
  f.tick(3000);
  assert.equal(f.edits.length, 0);
});

test('simultaneous primary pointers from different device types cannot start a new hold', () => {
  const f = fixture();
  f.dispatch('pointerdown', f.label, { pointerType: 'touch' });
  f.tick(1000);
  f.dispatch('pointerdown', f.label, { pointerType: 'pen', pointerId: 2 });
  f.tick(3000);
  assert.equal(f.edits.length, 0);
});

test('nested controls keep their native interactions and context menus', () => {
  for (const tag of ['button', 'input', 'textarea', 'select', 'label', 'a']) {
    const f = fixture();
    const control = f.doc.createElement(tag);
    if (tag === 'a') control.setAttribute('href', '#edit');
    f.target.append(control);
    f.dispatch('pointerdown', control);
    f.tick(3000);
    assert.equal(f.edits.length, 0, tag);
    assert.equal(f.dispatch('contextmenu', control).defaultPrevented, false, tag);
  }
  const f = fixture();
  assert.equal(f.dispatch('contextmenu').defaultPrevented, true);
  assert.equal(f.dispatch('contextmenu', f.root).defaultPrevented, false);
});

test('disconnected, replaced and inert targets cannot open stale editors', () => {
  for (const change of [f => f.target.remove(), f => f.root.remove(), f => f.root.setAttribute('inert', '')]) {
    const f = fixture();
    f.dispatch('pointerdown');
    change(f);
    f.tick(3000);
    assert.equal(f.edits.length, 0);
    assert.equal(f.doc.body.children.filter(node => node.className === 'hold-edit-feedback').length, 0);
  }
});

test('keyboard Enter and Space edit focused readouts without intercepting nested buttons', () => {
  const f = fixture();
  f.doc.activeElement = f.target;
  assert.equal(f.dispatch('keydown', f.target, { key: 'Enter', detail: 0 }).defaultPrevented, true);
  assert.equal(f.dispatch('keydown', f.target, { key: ' ', detail: 0 }).defaultPrevented, true);
  f.dispatch('keydown', f.target, { key: 'Enter', repeat: true });
  const button = f.doc.createElement('button');
  f.target.append(button);
  f.doc.activeElement = button;
  assert.equal(f.dispatch('keydown', button, { key: 'Enter' }).defaultPrevented, false);
  assert.equal(f.edits.length, 2);
});

test('disposing removes pending feedback, timers and listeners', () => {
  const f = fixture();
  f.dispatch('pointerdown');
  f.dispose();
  f.dispose();
  f.tick(3000);
  f.dispatch('pointerdown');
  f.tick(3000);
  assert.equal(f.edits.length, 0);
  assert.equal(f.pending.size, 0);
  assert.equal(f.target.hasAttribute('data-hold-active'), false);
  assert.equal(f.doc.body.children.length, 1);
  assert.equal(f.root.listeners.length + f.doc.listeners.length + f.doc.defaultView.listeners.length, 0);
});
