import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateJobPackage } from '../src/packages.js';
import { fillJobCreation, saveJobCreation, openJobSection, clickExportJob } from './helpers/job-creation.js';

async function savedJobs(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('jobs', 'readonly'), records = tx.objectStore('jobs').getAll();
      tx.oncomplete = () => { db.close(); resolve(records.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}
async function openMaintenance(page) {
  await openJobSection(page, 'Finalisation');
  await page.getByRole('button', { name: 'Maintenance questions', exact: true }).click();
  await expect(page.locator('.fire-maintenance')).toBeVisible();
}
async function saveMaintenance(page) {
  await page.getByRole('button', { name: 'Save maintenance', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function exportedJob(page) {
  const download = await clickExportJob(page, { restore: false });
  const input = await readFile(await download.path(), 'utf8');
  return { input, data: validateJobPackage(input) };
}
const check = (scope, id) => scope.locator(`[data-check-id="${id}"]`);
async function choice(scope, id, value) {
  await check(scope, id).getByRole('button', { name: new RegExp(`: ${value}$`) }).click();
}
async function explanation(scope, id, value) {
  await check(scope, id).getByRole('textbox', { name: /^Notes for / }).fill(value);
}

test('fire maintenance saves incomplete answers and zero readings offline without passing devices, and round trips safely', async ({ page, context, browser }, testInfo) => {
  await page.goto('/');
  await page.locator('#zone-file').setInputFiles(resolve('public/demo.zonesketch.json'));
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
  await page.locator('[data-action="create"]:visible').last().click();
  await fillJobCreation(page, { discipline: 'Fire', jobType: 'Maintenance', description: 'Synthetic maintenance questionnaire visit' });
  await saveJobCreation(page, { openDetails: false });
  await openMaintenance(page);
  const site = page.locator('[data-check-kind="site"]');
  await expect(check(site, 'false-alarms-12-months').getByRole('spinbutton')).toHaveValue('');
  await expect(check(site, 'system-category').locator('input')).toHaveValue('');
  expect((await savedJobs(page))[0].fireMaintenance).toBeUndefined();
  await check(site, 'system-category').locator('input').fill('Synthetic engineer-entered category');
  await check(site, 'logbook-location').locator('input').fill('Training reception drawer');
  await check(site, 'areas-devices-tested').getByRole('textbox').first().fill('Ground-floor synthetic equipment; upper-floor checks still outstanding.');
  await check(site, 'false-alarms-12-months').getByRole('spinbutton').fill('0');
  await choice(site, 'mcp-siting', 'Pass');
  await choice(site, 'logbook-updated', 'Fail');
  await page.getByRole('button', { name: 'Save maintenance', exact: true }).click();
  await expect(page.locator('.fire-maintenance-error')).toBeVisible();
  expect((await savedJobs(page))[0].fireMaintenance).toBeUndefined();
  await explanation(site, 'logbook-updated', 'Synthetic logbook entries need updating.');
  await choice(site, 'alarm-outputs', 'Not applicable');
  await page.getByRole('button', { name: 'Save maintenance', exact: true }).click();
  await expect(page.locator('.fire-maintenance-error')).toBeVisible();
  await explanation(site, 'alarm-outputs', 'Alarm output checks were outside this partial synthetic visit.');
  await saveMaintenance(page);
  const partial = (await savedJobs(page))[0];
  expect(partial.fireMaintenance.systemAnswers['false-alarms-12-months'].value).toBe(0);
  expect(partial.fireMaintenance.systemAnswers['layout-changes'].value).toBeNull();
  expect(partial.fireMaintenance.systemAnswers['mcp-siting'].value).toBe('Pass');
  expect(partial.fireMaintenance.systemAnswers['logbook-updated']).toMatchObject({ value: 'Fail', notes: 'Synthetic logbook entries need updating.' });
  expect(partial.fireMaintenance.systemAnswers['alarm-outputs'].value).toBe('N/A');
  expect(partial.fireMaintenance.equipment).toEqual([]);
  expect(partial.results.every(result => result.state === 'Not tested')).toBe(true);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await openMaintenance(page);
  await expect(check(site, 'false-alarms-12-months').getByRole('spinbutton')).toHaveValue('0');
  await expect(check(site, 'system-category').locator('input')).toHaveValue('Synthetic engineer-entered category');
  await page.getByRole('button', { name: 'Add panel checks', exact: true }).click();
  const equipment = page.getByRole('combobox', { name: 'Equipment', exact: true });
  const panelAsset = await equipment.locator('option').evaluateAll(options => options.find(option => option.textContent.includes('FAP-01'))?.value);
  expect(panelAsset).toBeTruthy();
  await equipment.selectOption(panelAsset);
  await page.getByRole('button', { name: 'Add checks', exact: true }).click();
  const panel = page.locator('[data-equipment-id][data-check-kind="panel"]');
  await expect(panel).toHaveCount(1);
  await check(panel, 'panel-quiescent-current').getByRole('spinbutton').fill('0');
  await check(panel, 'panel-alarm-current').getByRole('spinbutton').fill('175');
  await page.getByRole('button', { name: 'Add battery checks', exact: true }).click();
  await equipment.selectOption('__manual__');
  await page.locator('.fire-maintenance-equipment-picker').getByRole('textbox', { name: 'Equipment label', exact: true }).fill('Synthetic standby battery');
  await page.getByRole('button', { name: 'Add checks', exact: true }).click();
  const battery = page.locator('[data-equipment-id][data-check-kind="battery"]');
  await check(battery, 'battery-charge-voltage').getByRole('spinbutton').fill('27.4');
  await check(battery, 'battery-load-voltage').getByRole('spinbutton').fill('24.8');
  await check(battery, 'battery-capacity').getByRole('spinbutton').fill('7');
  await check(battery, 'battery-quiescent-current').getByRole('spinbutton').fill('0');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') { IDBDatabase.prototype.transaction = original; throw new DOMException('Synthetic maintenance save failure', 'QuotaExceededError'); }
      return original.call(this, stores, mode, options);
    };
  });
  await page.getByRole('button', { name: 'Save maintenance', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(check(panel, 'panel-quiescent-current').getByRole('spinbutton')).toHaveValue('0');
  await expect(check(battery, 'battery-charge-voltage').getByRole('spinbutton')).toHaveValue('27.4');
  expect((await savedJobs(page))[0].fireMaintenance).toEqual(partial.fireMaintenance);
  await saveMaintenance(page);
  const completed = (await savedJobs(page))[0];
  expect(completed.results).toEqual(partial.results);
  expect(completed.fireMaintenance.id).toBe(partial.fireMaintenance.id);
  expect(completed.fireMaintenance.equipment).toHaveLength(2);
  const panelRecord = completed.fireMaintenance.equipment.find(item => item.templateId === 'fire-panel');
  const batteryRecord = completed.fireMaintenance.equipment.find(item => item.templateId === 'battery');
  expect(panelRecord.assetId).toBe(panelAsset);
  expect(panelRecord.answers['panel-quiescent-current'].value).toBe(0);
  expect(panelRecord.answers['panel-alarm-current'].value).toBe(175);
  expect(batteryRecord.assetId).toBeNull();
  expect(batteryRecord.label).toBe('Synthetic standby battery');
  expect(batteryRecord.answers['battery-charge-voltage'].value).toBe(27.4);
  expect(batteryRecord.answers['battery-quiescent-current'].value).toBe(0);
  expect(Object.values(batteryRecord.answers).some(answer => answer.value === null)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 850 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  const controlsFit = await page.locator('.fire-check-choice button').evaluateAll(buttons => buttons.every(button => {
    const rect = button.getBoundingClientRect();
    return rect.width >= 43.99 && rect.height >= 43.99;
  }));
  expect(controlsFit).toBe(true);
  expect(await page.locator('[data-check-id="logbook-location"] input').evaluate(input => input.getBoundingClientRect().width)).toBeGreaterThan(180);
  await page.setViewportSize(viewport);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const screenshot = testInfo.outputPath('synthetic-fire-maintenance-form.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('Synthetic maintenance form', { path: screenshot, contentType: 'image/png' });
  await page.screenshot({ path: testInfo.outputPath('synthetic-fire-maintenance-screen.png') });
  const exported = await exportedJob(page);
  expect(exported.data.job.fireMaintenance).toEqual(completed.fireMaintenance);
  await expect(page.locator('.service-report-maintenance .service-report-system-questions')).toContainText('Training reception drawer');
  await expect(page.locator('.service-report-maintenance .service-report-system-questions')).toContainText('Synthetic logbook entries need updating.');
  await expect(page.locator('.service-report-maintenance .service-report-equipment-questions').filter({ hasText: 'Synthetic standby battery' })).toContainText('Synthetic standby battery');
  await expect(page.locator('.service-report-maintenance .service-report-equipment-questions').filter({ hasText: 'Synthetic standby battery' })).toContainText('27.4');
  const receiving = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await receiving.newPage();
    await reopened.goto('/');
    const file = { name: 'fire-maintenance.jobs.json', mimeType: 'application/json', buffer: Buffer.from(exported.input) };
    await reopened.locator('#job-file').setInputFiles(file);
    await expect(reopened.locator('.job-notes')).toBeVisible();
    expect((await exportedJob(reopened)).data.job.fireMaintenance).toEqual(completed.fireMaintenance);
    await reopened.locator('#job-file').setInputFiles(file);
    await expect(reopened.locator('#notice')).toContainText('already saved');
    const beforeInvalid = await savedJobs(reopened);
    expect(beforeInvalid).toHaveLength(1);
    const invalid = JSON.parse(exported.input);
    invalid.job.fireMaintenance.systemAnswers['false-alarms-12-months'].value = -1;
    await reopened.locator('#job-file').setInputFiles({ name: 'invalid-fire-maintenance.jobs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
    await expect(reopened.locator('#notice')).toContainText('Job import rejected');
    expect(await savedJobs(reopened)).toEqual(beforeInvalid);
  } finally { await receiving.close(); }
});
