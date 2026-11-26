import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {STATUS_BANNER_SESSION_KEY, canDismissStatusBanner, createStatusBannerController} from '../src/status-banner.js';

const ready = {storageReady: true, hasRecovery: false, busy: false, dirty: false, saveLabel: 'Saved on this device', offlineLabel: 'Ready offline'};
function setup(t, {storage, touchOnly = false} = {}) {
  const window = new Window({url: 'https://jobs.example.test/'}), doc = window.document;
  if (touchOnly) Object.defineProperty(window, 'PointerEvent', {value: undefined, configurable: true});
  doc.body.innerHTML = '<header><div class="connection"><span data-testid="save-status">Saved on this device</span><small id="offline-status">Ready offline</small></div></header><main><button id="help">Help &amp; data</button></main>';
  const root = doc.querySelector('.connection');
  let focusReturns = 0;
  const controller = createStatusBannerController({getSessionStorage: storage || (() => window.sessionStorage), focusAfterDismiss: () => { focusReturns++; doc.querySelector('#help').focus(); }});
  controller.mount(root, ready);
  t.after(async () => { controller.dispose(); await window.happyDOM.abort(); window.close(); });
  const pointer = (type, x, y, extra = {}, target = root.querySelector('span')) => {
    const event = new window.PointerEvent(type, {bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: x, clientY: y, ...extra});
    target.dispatchEvent(event); return event;
  };
  const touch = (type, touches, changedTouches = touches, target = root.querySelector('span')) => {
    const event = new window.Event(type, {bubbles: true, cancelable: true});
    Object.defineProperties(event, {touches: {value: touches}, changedTouches: {value: changedTouches}});
    target.dispatchEvent(event); return event;
  };
  return {window, doc, root, controller, pointer, touch, focusReturns: () => focusReturns};
}

test('only informational statuses can hide; unsaved work, offline failures and recovery stay visible', () => {
  for (const offlineLabel of ['Ready offline', 'Ready offline · included in this app', 'Preparing offline use…', 'Checking installed app…', 'Development mode · offline cache unavailable']) assert.equal(canDismissStatusBanner({...ready, offlineLabel}), true, offlineLabel);
  for (const patch of [{storageReady: false}, {hasRecovery: true}, {busy: true}, {dirty: true}, {saveLabel: 'Save failed — retry this form'}, {saveLabel: 'Not saved yet'}, {offlineLabel: 'Ready offline · update download failed; try checking again.'}, {offlineLabel: 'Required offline files are missing. Retry online to prepare them.'}, {offlineLabel: 'Offline use requires HTTPS and a browser that supports installation.'}, {offlineLabel: 'Something unexpected happened'}, {offlineLabel: 'Ready offline · unknown warning'}, {offlineLabel: ''}]) assert.equal(canDismissStatusBanner({...ready, ...patch}), false, JSON.stringify(patch));
});

test('visible close control dismisses just the presentation and survives re-render and tab reload', t => {
  const {window, doc, root, controller} = setup(t);
  const button = root.querySelector('.connection-dismiss');
  assert.equal(button.type, 'button'); assert.equal(button.hidden, false);
  assert.equal(button.getAttribute('aria-label'), 'Hide saved and offline status');
  button.click();
  assert.equal(root.hidden, true); assert.equal(root.style.getPropertyPriority('display'), 'important');
  assert.equal(root.querySelector('[data-testid="save-status"]').textContent, 'Saved on this device');
  assert.equal(root.querySelector('#offline-status').textContent, 'Ready offline');
  assert.equal(window.sessionStorage.getItem(STATUS_BANNER_SESSION_KEY), '1');
  const replacement = root.cloneNode(true); root.replaceWith(replacement);
  controller.mount(replacement, ready); assert.equal(replacement.hidden, true);
  controller.dispose();
  const reopened = createStatusBannerController({getSessionStorage: () => window.sessionStorage});
  reopened.mount(replacement, ready); assert.equal(replacement.hidden, true);
  reopened.show(); assert.equal(replacement.hidden, false);
  assert.equal(window.sessionStorage.getItem(STATUS_BANNER_SESSION_KEY), null);
  reopened.dispose(); assert.ok(doc.querySelector('#help'));
});

test('new failed saves or offline errors always reappear and cannot be dismissed', t => {
  const {root, controller} = setup(t);
  controller.dismiss(); assert.equal(root.hidden, true);
  for (const patch of [{hasRecovery: true, saveLabel: 'Save failed — retry this form'}, {offlineLabel: 'Offline readiness could not be verified.'}, {dirty: true, saveLabel: 'Unsaved changes'}]) {
    controller.update({...ready, ...patch});
    assert.equal(root.hidden, false); assert.equal(root.querySelector('.connection-dismiss').hidden, true);
    assert.equal(controller.dismiss(), false);
    controller.update(ready); assert.equal(root.hidden, true, 'normal status still respects the session preference');
  }
});

test('left or right horizontal touch-pointer swipe dismisses without preventing native events', t => {
  const {root, controller, pointer} = setup(t);
  assert.equal(root.style.touchAction, 'pan-y');
  for (const endX of [80, 260]) {
    controller.show();
    const down = pointer('pointerdown', 160, 100);
    const move = pointer('pointermove', endX, 106);
    const up = pointer('pointerup', endX, 106);
    assert.equal(root.hidden, true);
    assert.equal(down.defaultPrevented || move.defaultPrevented || up.defaultPrevented, false);
  }
});

test('vertical scrolling remains a scroll even if the finger later moves horizontally', t => {
  const {root, pointer} = setup(t);
  pointer('pointerdown', 100, 100);
  const vertical = pointer('pointermove', 102, 155);
  pointer('pointermove', 290, 170); pointer('pointerup', 290, 170);
  assert.equal(root.hidden, false); assert.equal(vertical.defaultPrevented, false);
});

test('small movement, diagonal drags, mouse selection, cancellation and multitouch do not hide status', t => {
  const {root, doc, pointer} = setup(t);
  for (const [x, y] of [[130, 102], [160, 150]]) {
    pointer('pointerdown', 100, 100); pointer('pointerup', x, y);
    assert.equal(root.hidden, false);
  }
  pointer('pointerdown', 100, 100, {pointerType: 'mouse'}); pointer('pointerup', 300, 100, {pointerType: 'mouse'});
  assert.equal(root.hidden, false);
  pointer('pointerdown', 100, 100); pointer('pointercancel', 110, 100); pointer('pointerup', 300, 100);
  assert.equal(root.hidden, false);
  pointer('pointerdown', 100, 100); pointer('pointerdown', 200, 100, {pointerId: 2, isPrimary: false}, doc.body); pointer('pointerup', 300, 100);
  assert.equal(root.hidden, false);
  const close = root.querySelector('.connection-dismiss');
  pointer('pointerdown', 100, 100, {}, close); pointer('pointerup', 300, 100, {}, close);
  assert.equal(root.hidden, false, 'a control gesture is left to the control');
});

test('Escape from the close control hides status and returns keyboard focus to a visible control', t => {
  const {window, doc, root, focusReturns} = setup(t);
  const close = root.querySelector('.connection-dismiss'); close.focus();
  const escape = new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
  close.dispatchEvent(escape);
  assert.equal(root.hidden, true); assert.equal(escape.defaultPrevented, true);
  assert.equal(focusReturns(), 1); assert.equal(doc.activeElement.id, 'help');
});

test('touch-only WebViews support swipe and preserve vertical/multi-finger gestures', t => {
  const {root, controller, touch} = setup(t, {touchOnly: true});
  const point = (x, y, identifier = 1) => ({clientX: x, clientY: y, identifier});
  touch('touchstart', [point(100, 100)]);
  touch('touchmove', [point(101, 170)]);
  touch('touchend', [], [point(300, 170)]);
  assert.equal(root.hidden, false);
  touch('touchstart', [point(100, 100)]);
  touch('touchstart', [point(100, 100), point(110, 100, 2)]);
  touch('touchend', [], [point(300, 100)]);
  assert.equal(root.hidden, false);
  touch('touchstart', [point(200, 100)]);
  const end = touch('touchend', [], [point(100, 103)]);
  assert.equal(root.hidden, true); assert.equal(end.defaultPrevented, false);
  controller.show(); touch('touchstart', [point(200, 100)]); touch('touchcancel', []); touch('touchend', [], [point(100, 100)]);
  assert.equal(root.hidden, false);
});

test('blocked sessionStorage retains an in-memory preference without affecting records', t => {
  const {root, controller} = setup(t, {storage: () => { throw new DOMException('Blocked', 'SecurityError'); }});
  assert.doesNotThrow(() => controller.dismiss()); assert.equal(root.hidden, true);
  controller.mount(root, ready); assert.equal(root.hidden, true);
  controller.update({...ready, hasRecovery: true}); assert.equal(root.hidden, false);
});

test('disposing and re-mounting cannot leave an old gesture attached to the new screen', t => {
  const {root, doc, controller, pointer} = setup(t);
  pointer('pointerdown', 100, 100);
  const replacement = doc.createElement('div'); replacement.className = 'connection'; replacement.innerHTML = '<span>Saved on this device</span><small>Ready offline</small>';
  root.replaceWith(replacement); controller.mount(replacement, ready);
  pointer('pointerup', 300, 100, {}, doc.body);
  assert.equal(replacement.hidden, false);
  assert.equal(replacement.querySelectorAll('.connection-dismiss').length, 1);
});
