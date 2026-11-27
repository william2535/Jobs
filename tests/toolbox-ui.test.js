import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderToolbox } from '../src/toolbox.js';
import { renderMobileWorkspace } from '../src/mobile-shell.js';
import pack from '../vendor/findr-tools/onsite-v1/pack.json' with { type: 'json' };
import { installToolboxDOM, mountToolbox, field, click, submit, metric } from './helpers/toolbox-dom.js';

const storeKey = 'jobs:toolbox:v1';
const open = (root, name) => click(root, `[data-toolbox-open="${name}"]`);
const input = (root, name, value) => field(root, `[name="${name}"]`, value);
const select = (root, name, value) => field(root, `[name="${name}"]`, value, 'change');
const calculate = root => submit(root, '#toolbox-form');
const back = root => click(root, '[data-toolbox-action="back"]');

test('battery form distinguishes missing and invalid inputs from explicit 24/72-hour calculations', t => {
  installToolboxDOM(t);
  const root = mountToolbox(t, renderToolbox());
  open(root, 'battery');
  calculate(root);
  assert.equal(root.querySelector('#toolbox-error-summary').hidden, false);
  assert.equal(root.querySelector('#toolbox-result').hidden, true);
  assert.equal(root.querySelector('[name="standbyCurrent"]').getAttribute('aria-invalid'), 'true');
  input(root, 'standbyCurrent', 500);
  input(root, 'alarmCurrent', 1000);
  calculate(root);
  assert.equal(metric(root, 'Required capacity'), '12.5 Ah');
  assert.equal(metric(root, 'Standby demand'), '12 Ah');
  assert.equal(metric(root, 'Alarm demand'), '0.5 Ah');
  assert.match(root.textContent, /does not establish compliance/);
  click(root, '[data-hours="72"]');
  calculate(root);
  assert.equal(metric(root, 'Required capacity'), '36.5 Ah');
  input(root, 'standbyHours', 30);
  input(root, 'capacityFactor', 1.25);
  select(root, 'alarmCurrentMode', 'additional');
  calculate(root);
  assert.equal(metric(root, 'Required capacity'), '19.6875 Ah');
  input(root, 'capacityFactor', 0.5);
  calculate(root);
  assert.equal(root.querySelector('#toolbox-result').hidden, true);
  assert.equal(root.querySelector('[name="capacityFactor"]').getAttribute('aria-invalid'), 'true');
  click(root, '[data-toolbox-action="reset"]');
  assert.equal(root.querySelector('[name="standbyCurrent"]').value, '');
  assert.equal(root.querySelector('[name="standbyHours"]').value, '24');
});

test('voltage-drop and conductor forms calculate documented values and clear stale results on edits', t => {
  installToolboxDOM(t);
  const root = mountToolbox(t, renderToolbox());
  open(root, 'voltage-drop');
  input(root, 'current', 2);
  input(root, 'lengthM', 50);
  select(root, 'resistanceMode', 'manufacturer');
  input(root, 'resistanceOhmPerKm', 10);
  calculate(root);
  assert.equal(metric(root, 'Outgoing + return resistance'), '1 Ω');
  assert.equal(metric(root, 'Voltage drop'), '2 V');
  assert.equal(metric(root, 'Voltage at load'), '22 V DC');
  input(root, 'current', 0);
  assert.equal(root.querySelector('#toolbox-result').hidden, true);
  calculate(root);
  assert.equal(metric(root, 'Voltage drop'), '0 V');
  assert.equal(metric(root, 'Voltage at load'), '24 V DC');
  input(root, 'supplyVoltage', 0);
  calculate(root);
  assert.equal(root.querySelector('#toolbox-error-summary').hidden, false);
  back(root);
  open(root, 'resistance');
  input(root, 'lengthM', 100);
  select(root, 'resistanceMode', 'manufacturer');
  input(root, 'lineOhmPerKm', 7);
  input(root, 'cpcOhmPerKm', 12);
  calculate(root);
  assert.equal(metric(root, 'R1 · line conductor'), '0.7 Ω');
  assert.equal(metric(root, 'R2 · protective conductor'), '1.2 Ω');
  assert.equal(metric(root, 'R1 + R2'), '1.9 Ω');
  input(root, 'lineOhmPerKm', '');
  calculate(root);
  assert.equal(root.querySelector('#toolbox-result').hidden, true);
  assert.equal(root.querySelector('[name="lineOhmPerKm"]').getAttribute('aria-invalid'), 'true');
});

test('resistor controls support four, five and six bands with explicit tolerance and temperature coefficient', t => {
  installToolboxDOM(t);
  const root = mountToolbox(t, renderToolbox());
  open(root, 'resistor');
  for (const [index, colour] of ['brown', 'black', 'red', 'gold'].entries()) field(root, `[data-toolbox-band="${index}"]`, colour, 'change');
  calculate(root);
  assert.equal(metric(root, 'Nominal resistance'), '1,000 Ω');
  assert.equal(metric(root, 'Tolerance'), '± 5 %');
  for (const [bands, colours, ohms] of [
    [5, ['red', 'violet', 'black', 'orange', 'silver'], '270,000 Ω'],
    [6, ['blue', 'grey', 'black', 'green', 'gold', 'black'], '68,000,000 Ω'],
  ]) {
    select(root, 'bands', bands);
    assert.equal(root.querySelectorAll('[data-toolbox-band]').length, bands);
    // Happy DOM reparses selected options inconsistently; preserve the user's
    // selected band count after the form redraw, as a browser select does.
    root.querySelector('[name="bands"]').value = String(bands);
    for (const [index, colour] of colours.entries()) field(root, `[data-toolbox-band="${index}"]`, colour, 'change');
    calculate(root);
    assert.equal(metric(root, 'Nominal resistance'), ohms);
  }
  assert.equal(metric(root, 'Temperature coefficient'), '250 ppm/°C');
  const firstBand = root.querySelector('[data-toolbox-band="0"]');
  assert.equal([...firstBand.options].some(option => option.value === 'black'), false);
  assert.match(root.querySelector('.toolbox-resistor-preview').getAttribute('aria-label'), /Blue, Grey, Black/);
});

test('all six bundled pack calculators render results and reject invalid edited input', t => {
  installToolboxDOM(t);
  const root = mountToolbox(t, renderToolbox());
  const cases = [
    ['dc-ohms', { volts: 24, ohms: 120 }, [['Current', '0.2 A'], ['Power', '4.8 W']]],
    ['resistors', { r1: 1000, r2: 1000 }, [['Series total', '2,000 Ω'], ['Parallel total', '500 Ω']]],
    ['cctv-storage', { cameras: 4, mbps: 2, hours: 24, days: 7 }, [['Video payload', '604.8 GB'], ['Aggregate active bitrate', '8 Mbit/s']]],
    ['bandwidth', { cameras: 8, mbps: 4, streams: 2, capacity: 100 }, [['Payload bitrate', '64 Mbit/s'], ['Nominal spare capacity', '36 Mbit/s']]],
    ['poe-budget', { devices: 6, watts: 12, budget: 90, limit: 15 }, [['Required switch allocation', '72 W'], ['Total budget remaining', '18 W']]],
    ['dc-load', { devices: 8, milliamps: 50, volts: 24 }, [['Total current', '0.4 A'], ['Steady DC power', '9.6 W']]],
  ];
  for (const [name, values, results] of cases) {
    open(root, `pack:${name}`);
    for (const [key, value] of Object.entries(values)) input(root, key, value);
    submit(root, '#toolbox-pack-form');
    assert.equal(root.querySelector('#toolbox-pack-result').hidden, false, name);
    for (const [label, expected] of results) assert.equal(metric(root, label), expected, name);
    input(root, Object.keys(values)[0], -1);
    assert.equal(root.querySelector('#toolbox-pack-result').hidden, true, name);
    submit(root, '#toolbox-pack-form');
    assert.equal(root.querySelector('#toolbox-error-summary').hidden, false, name);
    assert.ok(root.querySelector('[aria-invalid="true"]'), name);
    back(root);
  }
});

test('core and pack drafts reopen locally while a failed save preserves stored inputs and visible calculations', t => {
  const window = installToolboxDOM(t);
  localStorage.setItem('findr:original-settings', 'unchanged FINDR settings');
  localStorage.setItem('jobs:synthetic-result', 'Not tested');
  let root = mountToolbox(t, renderToolbox());
  open(root, 'battery');
  input(root, 'standbyCurrent', 500);
  input(root, 'alarmCurrent', 1000);
  back(root);
  open(root, 'pack:dc-ohms');
  input(root, 'volts', 48);
  input(root, 'ohms', 240);
  root.dispose(); root.remove();
  root = mountToolbox(t, renderToolbox());
  open(root, 'pack:dc-ohms');
  assert.equal(root.querySelector('[name="volts"]').value, '48');
  assert.equal(root.querySelector('[name="ohms"]').value, '240');
  back(root); open(root, 'battery');
  assert.equal(root.querySelector('[name="standbyCurrent"]').value, '500');
  const previous = localStorage.getItem(storeKey), storage = window.localStorage;
  const failedStorage = { getItem: storage.getItem.bind(storage), setItem() { throw new DOMException('Synthetic full storage', 'QuotaExceededError'); } };
  const restore = () => { if (globalThis.localStorage === failedStorage) globalThis.localStorage = storage; };
  t.after(restore);
  globalThis.localStorage = failedStorage;
  input(root, 'standbyCurrent', 600);
  calculate(root);
  assert.match(root.querySelector('#toolbox-save-status').textContent, /could not be saved/);
  assert.equal(metric(root, 'Required capacity'), '14.9 Ah');
  assert.equal(localStorage.getItem(storeKey), previous);
  restore();
  input(root, 'standbyCurrent', 600);
  assert.equal(JSON.parse(localStorage.getItem(storeKey)).drafts.battery.standbyCurrent, '600');
  assert.equal(localStorage.getItem('findr:original-settings'), 'unchanged FINDR settings');
  assert.equal(localStorage.getItem('jobs:synthetic-result'), 'Not tested');
});

test('six guide illustrations are bundled, navigable and zoomable without a remote image request', async t => {
  installToolboxDOM(t);
  let homeCalls = 0;
  const root = mountToolbox(t, renderToolbox({ onHome: () => { homeCalls += 1; } }));
  assert.equal(root.querySelectorAll('[data-toolbox-open^="guide:"]').length, 6);
  assert.equal(root.querySelectorAll('[data-toolbox-open^="extra:"]').length, 2);
  for (const guide of pack.guides) {
    open(root, `guide:${guide.id}`);
    const picture = root.querySelector('.toolbox-picture-scroll img');
    assert.ok(picture?.alt);
    assert.equal(new URL(picture.src).protocol, 'file:');
    assert.match(await readFile(new URL(picture.src), 'utf8'), /<svg[\s>]/);
    click(root, '[data-toolbox-action="picture-zoom"]');
    assert.equal(root.querySelector('[data-toolbox-action="picture-zoom"]').getAttribute('aria-pressed'), 'true');
    back(root);
  }
  click(root, '[data-toolbox-action="home"]');
  assert.equal(homeCalls, 1);
  root.dispose();
  click(root, '[data-toolbox-action="home"]');
  assert.equal(homeCalls, 1, 'Disposed toolbox must stop handling navigation');
});

test('mobile Toolbox opens the internal workspace while FINDR and Zone Sketch remain separate launchers', t => {
  installToolboxDOM(t);
  const actions = [], originalHash = location.hash;
  const root = mountToolbox(t, renderMobileWorkspace({ state: { jobs: [], sites: [] }, onAction: action => actions.push(action) }));
  const toolbox = [...root.querySelectorAll('button')].find(button => button.textContent.trim() === 'Toolbox');
  assert.ok(toolbox);
  toolbox.click();
  assert.deepEqual(actions, ['toolbox']);
  assert.equal(location.hash, originalHash);
  const findr = root.querySelector('a[aria-label="Open FINDR"]');
  assert.equal(findr.href, 'https://findr-fault-finder.floodyyy21.chatgpt.site/app/');
  assert.equal(findr.target, '_blank');
  const zoneSketch = [...root.querySelectorAll('a')].find(link => link.textContent.trim() === 'Zone Sketch');
  assert.equal(zoneSketch.href, 'https://william2535.github.io/ZoneSketch-Unstable/');
  assert.equal(zoneSketch.target, '_blank');
});
