import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolboxChest } from '../src/toolbox-chest.js';
import { renderToolbox } from '../src/toolbox.js';
import { installToolboxDOM, field, click, submit, metric, until } from './helpers/toolbox-dom.js';

function overview() {
  const root = document.createElement('main');
  root.innerHTML = '<h1>Overview</h1><input aria-label="Job search" value="Saved search"><button type="button">Toolbox</button>';
  document.body.append(root);
  const trigger = root.querySelector('button');
  trigger.focus();
  return { root, trigger, search: root.querySelector('input') };
}
function fakeRenderer(state = {}) {
  return options => {
    state.options = options;
    state.renders = (state.renders || 0) + 1;
    const view = document.createElement('section');
    view.className = 'jobs-toolbox';
    view.textContent = state.text || 'Synthetic local tools';
    view.confirmLeave = () => { state.guardCalls = (state.guardCalls || 0) + 1; return state.allowLeave !== false; };
    view.hasUnsavedChanges = () => !!state.unsaved;
    view.dispose = () => { state.disposals = (state.disposals || 0) + 1; };
    state.view = view;
    return view;
  };
}
function setup(t) {
  const controllers = [];
  // Dispose the document-level listeners before the DOM helper restores globals.
  t.after(() => controllers.forEach(chest => chest.dispose()));
  installToolboxDOM(t);
  return options => {
    const chest = createToolboxChest(options);
    controllers.push(chest);
    return chest;
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const panel = () => document.querySelector('.toolbox-chest');
const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

test('the chest expands beside the retained overview and closing returns focus to its launcher', async t => {
  const makeChest = setup(t);
  const { root, trigger, search } = overview(), state = {};
  const originalHash = location.hash, originalOverflow = document.body.style.overflow;
  let closes = 0;
  const chest = makeChest({ loadToolbox: async () => ({ renderToolbox: fakeRenderer(state) }), onClose: () => { closes += 1; } });
  chest.open(trigger);
  await until(() => panel()?.contains(state.view));
  assert.equal(chest.isOpen, true);
  assert.equal(document.querySelector('main'), root);
  assert.equal(search.value, 'Saved search');
  assert.equal(root.hidden, false);
  assert.notEqual(root.getAttribute('aria-hidden'), 'true');
  assert.equal(document.body.style.overflow, originalOverflow);
  assert.equal(panel().getAttribute('role'), 'dialog');
  assert.notEqual(panel().getAttribute('aria-modal'), 'true');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(trigger.getAttribute('aria-controls'), panel().id);
  assert.equal(state.options.embedded, true);
  assert.equal(location.hash, originalHash);
  click(panel(), '.toolbox-chest-close');
  assert.equal(chest.isOpen, false);
  assert.equal(panel(), null);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, trigger);
  assert.equal(state.disposals, 1);
  assert.equal(closes, 1);
});

test('failed-save protection blocks the close button, Escape and overview navigation until approved', async t => {
  const makeChest = setup(t);
  const { trigger } = overview(), state = { allowLeave: false, unsaved: true };
  let closes = 0;
  const chest = makeChest({ loadToolbox: async () => ({ renderToolbox: fakeRenderer(state) }), onClose: () => { closes += 1; } });
  chest.open(trigger);
  await until(() => panel()?.contains(state.view));
  assert.equal(chest.hasUnsavedChanges(), true);
  click(panel(), '.toolbox-chest-close');
  escape();
  assert.equal(chest.close({ restoreFocus: false }), false);
  assert.equal(chest.isOpen, true);
  assert.equal(state.disposals || 0, 0);
  assert.equal(closes, 0);
  state.allowLeave = true;
  escape();
  assert.equal(chest.isOpen, false);
  assert.equal(chest.hasUnsavedChanges(), false);
  assert.equal(state.disposals, 1);
  assert.equal(closes, 1);
});

test('a closed lazy load cannot replace a newer chest or reopen the overview', async t => {
  const makeChest = setup(t);
  const { trigger } = overview(), loads = [deferred(), deferred()];
  const oldState = { text: 'Old load' }, newState = { text: 'Current load' };
  let requests = 0;
  const chest = makeChest({ loadToolbox: () => loads[requests++].promise });
  chest.open(trigger);
  assert.equal(chest.close(), true);
  chest.open(trigger);
  loads[1].resolve({ renderToolbox: fakeRenderer(newState) });
  await until(() => panel()?.contains(newState.view));
  loads[0].resolve({ renderToolbox: fakeRenderer(oldState) });
  await loads[0].promise;
  await Promise.resolve();
  assert.equal(oldState.renders || 0, 0);
  assert.ok(panel().contains(newState.view));
  assert.equal(document.querySelectorAll('.toolbox-chest').length, 1);
  chest.close();
  assert.equal(panel(), null);
  assert.equal(newState.disposals, 1);
});

test('a failed lazy import offers retry within the chest without replacing the overview', async t => {
  const makeChest = setup(t);
  const { trigger, root } = overview(), state = {};
  let calls = 0;
  const chest = makeChest({ loadToolbox: async () => {
    if (++calls === 1) throw Error('Synthetic unavailable cached module');
    return { renderToolbox: fakeRenderer(state) };
  } });
  chest.open(trigger);
  await until(() => [...(panel()?.querySelectorAll('button') || [])].some(button => /retry/i.test(button.textContent)));
  assert.equal(document.querySelector('main'), root);
  assert.equal(chest.isOpen, true);
  [...panel().querySelectorAll('button')].find(button => /retry/i.test(button.textContent)).click();
  await until(() => panel()?.contains(state.view));
  assert.equal(calls, 2);
  assert.equal(state.renders, 1);
});

test('disposing a mounted chest releases its tool and removes Escape handling', async t => {
  const makeChest = setup(t);
  const { trigger } = overview(), state = {};
  const chest = makeChest({ loadToolbox: async () => ({ renderToolbox: fakeRenderer(state) }) });
  chest.open(trigger);
  await until(() => panel()?.contains(state.view));
  chest.dispose();
  assert.equal(panel(), null);
  assert.equal(state.disposals, 1);
  const calls = state.guardCalls || 0;
  escape();
  chest.dispose();
  assert.equal(state.guardCalls || 0, calls);
  assert.equal(state.disposals, 1);
});

test('real calculator selection, results and saved reopen stay inside the overview chest', async t => {
  const makeChest = setup(t);
  const { trigger, root } = overview();
  const chest = makeChest({ loadToolbox: async () => ({ renderToolbox }) });
  chest.open(trigger);
  await until(() => panel()?.querySelector('[data-toolbox-open="battery"]'));
  const tray = panel().querySelector('.toolbox-chest-tray');
  tray.scrollTop = 600;
  click(panel(), '[data-toolbox-open="battery"]');
  assert.equal(tray.scrollTop, 0, 'Opening a tool reveals its heading, not the old grid scroll position');
  assert.equal(document.activeElement, panel().querySelector('.jobs-toolbox h1'));
  field(panel(), '[name="standbyCurrent"]', 500);
  field(panel(), '[name="alarmCurrent"]', 1000);
  submit(panel(), '#toolbox-form');
  assert.equal(metric(panel(), 'Required capacity'), '12.5 Ah');
  assert.equal(document.querySelector('main'), root);
  assert.ok(panel().contains(document.querySelector('#toolbox-form')));
  tray.scrollTop = 600;
  click(panel(), '[data-toolbox-action="back"]');
  assert.equal(tray.scrollTop, 0, 'Returning to the grid starts at the tool choices');
  assert.equal(document.activeElement, panel().querySelector('[data-toolbox-open]'));
  assert.ok(panel().querySelector('[data-toolbox-open="battery"]'));
  assert.equal(chest.isOpen, true);
  chest.close();
  chest.open(trigger);
  await until(() => panel()?.querySelector('[data-toolbox-open="battery"]'));
  click(panel(), '[data-toolbox-open="battery"]');
  assert.equal(panel().querySelector('[name="standbyCurrent"]').value, '500');
  assert.equal(panel().querySelector('[name="alarmCurrent"]').value, '1000');
  assert.equal(document.querySelector('main'), root);
});
