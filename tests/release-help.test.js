import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReleaseHelp } from '../src/release-help.js';
import { installToolboxDOM, mountToolbox, until } from './helpers/toolbox-dom.js';

const control = (root, action) => root.querySelector(`[data-help-action="${action}"]`);

test('help routes explicit data and offline actions without changing local records', async t => {
  installToolboxDOM(t);
  localStorage.setItem('synthetic-job', 'Saved customer record sentinel');
  const calls = [];
  const root = mountToolbox(t, renderReleaseHelp({
    version: '1.0.0', buildId: 'synthetic-release', hasRecovery: true,
    onAction: action => calls.push(action),
  }));
  root.setStatus({ updateAvailable: true });
  const actions = ['backup-workspace', 'restore-workspace', 'recovery-download', 'persist', 'offline-retry', 'update-check', 'update-apply'];
  for (const action of actions) {
    control(root, action).click();
    await until(() => root.getAttribute('aria-busy') === 'false');
  }
  assert.deepEqual(calls, actions);
  assert.equal(localStorage.getItem('synthetic-job'), 'Saved customer record sentinel');
  assert.equal(localStorage.length, 1);
  assert.equal(root.querySelector('.release-help-error').hidden, true);
});

test('recovery and update controls follow capability changes without losing other status', async t => {
  installToolboxDOM(t);
  const calls = [];
  const root = mountToolbox(t, renderReleaseHelp({
    offlineStatus: 'Ready offline', storageStatus: 'Saved on this device',
    onAction: action => calls.push(action),
  }));
  assert.equal(control(root, 'recovery-download').hidden, true);
  assert.equal(control(root, 'update-apply').hidden, true);
  control(root, 'recovery-download').click();
  control(root, 'update-apply').click();
  assert.deepEqual(calls, []);
  root.setStatus({ hasRecovery: true, updateAvailable: true });
  assert.equal(control(root, 'recovery-download').hidden, false);
  assert.equal(control(root, 'update-apply').hidden, false);
  assert.deepEqual([...root.querySelectorAll('.release-help-status dd')].map(node => node.textContent), ['Ready offline', 'Saved on this device']);
  root.setStatus({ offlineStatus: 'Offline preparation failed', hasRecovery: false });
  assert.equal(control(root, 'recovery-download').hidden, true);
  assert.equal(control(root, 'update-apply').hidden, false);
  assert.equal(root.querySelectorAll('.release-help-status dd')[1].textContent, 'Saved on this device');
  root.setStatus({ updateAvailable: false });
  assert.equal(control(root, 'update-apply').hidden, true);
});

test('release identity, status and action failures remain plain text', async t => {
  installToolboxDOM(t);
  const payload = '<img src=x onerror="alert(1)"><script>malicious()</script>';
  const root = mountToolbox(t, renderReleaseHelp({
    version: payload, buildId: payload, offlineStatus: payload, storageStatus: payload,
    onAction: () => { throw Error(payload); },
  }));
  root.setStatus({ offlineStatus: payload, storageStatus: payload });
  control(root, 'backup-workspace').click();
  await until(() => root.getAttribute('aria-busy') === 'false');
  assert.equal(root.querySelector('script,img'), null);
  assert.equal(root.querySelector('code').textContent, payload);
  assert.equal(root.querySelector('.release-help-error').textContent, payload);
  assert.equal(root.querySelector('.release-help-error').hidden, false);
  assert.ok([...root.querySelectorAll('.release-help-status dd')].every(node => node.textContent === payload));
});

test('pending actions cannot be duplicated and failed actions can be retried', async t => {
  installToolboxDOM(t);
  let rejectAction, calls = 0;
  const root = mountToolbox(t, renderReleaseHelp({
    onAction: () => { calls += 1; return calls === 1 ? new Promise((_, reject) => { rejectAction = reject; }) : undefined; },
  }));
  const backup = control(root, 'backup-workspace');
  backup.click();
  backup.click();
  control(root, 'persist').click();
  root.setStatus({ hasRecovery: true });
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.ok([...root.querySelectorAll('button')].every(button => button.disabled));
  assert.equal(calls, 1);
  rejectAction(Error('Synthetic storage error; original records retained.'));
  await until(() => !backup.disabled);
  assert.equal(root.querySelector('.release-help-error').hidden, false);
  backup.click();
  await until(() => root.getAttribute('aria-busy') === 'false');
  assert.equal(calls, 2);
  assert.equal(root.querySelector('.release-help-error').hidden, true);
});

test('disposing help removes actions and ignores late operation updates', async t => {
  installToolboxDOM(t);
  let finish, calls = 0;
  const root = mountToolbox(t, renderReleaseHelp({
    onAction: () => { calls += 1; return new Promise(resolve => { finish = resolve; }); },
  }));
  control(root, 'backup-workspace').click();
  const original = root.innerHTML;
  root.dispose();
  root.setStatus({ hasRecovery: true, updateAvailable: true, offlineStatus: 'Should not render' });
  finish();
  await Promise.resolve();
  control(root, 'backup-workspace').disabled = false;
  control(root, 'backup-workspace').click();
  assert.equal(calls, 1);
  // Re-enable the button only for the event-listener check above.
  control(root, 'backup-workspace').disabled = true;
  assert.equal(root.innerHTML, original);
});
