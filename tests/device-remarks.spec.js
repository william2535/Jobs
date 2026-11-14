import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateJobPackage } from '../src/packages.js';
import { clickExportJob, openJobSection } from './helpers/job-creation.js';

const fixture = resolve('public/demo.zonesketch.json');
const sample = JSON.parse(await readFile(fixture, 'utf8'));
const photo = sample.project.floors[0].data.symbols.find(symbol => symbol.photos?.length).photos[0].image;
const photoBuffer = Buffer.from(photo.split(',')[1], 'base64');
const upload = { name: 'synthetic-device-evidence.png', mimeType: 'image/png', buffer: photoBuffer };

async function createVisit(page) {
  await page.goto('/');
  await page.locator('#zone-file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.locator('[data-action="create"]:visible').last().click();
  await page.locator('.job-notes').getByRole('textbox', { name: 'Job title', exact: true }).fill('Synthetic device remark visit');
  await page.locator('.job-notes').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await openDevice(page);
}
async function openDevice(page) {
  await openJobSection(page, 'Devices');
  await page.locator('.device-browser-grid .device-open').first().click();
  await expect(page.getByRole('combobox', { name: 'Result', exact: true })).toHaveValue('Not tested');
  await page.getByRole('button', { name: 'Defects', exact: true }).click();
}
async function addRemark(page, preset = 'Custom note') {
  await page.getByRole('button', { name: 'Add remark', exact: true }).click();
  await page.getByRole('button', { name: preset, exact: true }).click();
  return page.locator('[data-remark-form]');
}
async function saveRemark(page) {
  await page.locator('[data-remark-form]').getByRole('button', { name: 'Save remark', exact: true }).click();
  await expect(page.locator('[data-remark-form]')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function exportData(page) {
  const download = await clickExportJob(page, { restore: false });
  const input = await readFile(await download.path(), 'utf8');
  return { input, data: validateJobPackage(input) };
}
async function savedJobs(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('jobs', 'readonly');
      const records = transaction.objectStore('jobs').getAll();
      transaction.oncomplete = () => { db.close(); resolve(records.result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
}

test('device remarks, products and before/resolution evidence save offline and round trip without changing test results', async ({ page, context, browser }, testInfo) => {
  await createVisit(page);
  let form = await addRemark(page);
  await form.getByRole('textbox', { name: 'Remark title', exact: true }).fill('Synthetic detector housing defect');
  await form.getByRole('textbox', { name: 'Location', exact: true }).fill('Training corridor');
  await form.getByRole('textbox', { name: 'Description', exact: true }).fill('Training example: housing requires replacement.');
  await form.getByRole('combobox', { name: 'Severity', exact: true }).selectOption('Major defect');
  await form.getByRole('textbox', { name: 'Internal note', exact: true }).fill('Internal cost review only — do not include in the client report.');
  await form.getByLabel('Last verified', { exact: true }).fill('2026-11-14');
  await form.getByRole('textbox', { name: 'Recommendation', exact: true }).fill('Replace the damaged housing.');
  await form.locator('[data-remark-file="beforePhotos"]').setInputFiles(upload);
  await form.getByRole('textbox', { name: 'Before photo caption', exact: true }).fill('Synthetic before photograph');
  await form.getByRole('button', { name: 'Add product', exact: true }).click();
  await form.getByRole('textbox', { name: 'Product description', exact: true }).fill('Synthetic replacement cover');
  await form.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('2');
  await form.getByRole('textbox', { name: 'Unit', exact: true }).fill('each');
  await mkdir('docs/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve('docs/screenshots', testInfo.project.name === 'mobile-chromium' ? 'mobile-remark-editor.png' : 'desktop-remark-editor.png'), fullPage: true });
  await saveRemark(page);
  const first = await exportData(page);
  const initialResult = first.data.job.results.find(result => result.remarks?.items.length);
  expect(initialResult.state).toBe('Not tested');
  expect(initialResult.remarks.items).toHaveLength(1);
  expect(initialResult.remarks.items[0]).toMatchObject({
    title: 'Synthetic detector housing defect', location: 'Training corridor',
    description: 'Training example: housing requires replacement.', severity: 'Major defect',
    internalNote: 'Internal cost review only — do not include in the client report.',
    lastVerified: '2026-11-14', recommendation: 'Replace the damaged housing.', status: 'Open',
  });
  expect(initialResult.remarks.items[0].beforePhotos[0]).toMatchObject({ image: photo, caption: 'Synthetic before photograph' });
  expect(initialResult.remarks.items[0].products[0]).toMatchObject({ description: 'Synthetic replacement cover', quantity: 2, unit: 'each' });
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await openDevice(page);
  await page.getByRole('button', { name: 'Edit remark', exact: true }).click();
  form = page.locator('[data-remark-form]');
  await expect(form.getByRole('textbox', { name: 'Location', exact: true })).toHaveValue('Training corridor');
  await expect(form.getByRole('textbox', { name: 'Before photo caption', exact: true })).toHaveValue('Synthetic before photograph');
  await expect.poll(() => form.locator('img').first().evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy();
  await form.getByRole('textbox', { name: 'Recommendation', exact: true }).fill('Housing replaced during this offline visit; device testing remains unrecorded.');
  await form.getByRole('combobox', { name: 'Remark status', exact: true }).selectOption('Resolved');
  await form.locator('[data-remark-file="resolvedPhotos"]').setInputFiles(upload);
  await form.getByRole('textbox', { name: 'Resolution photo caption', exact: true }).fill('Synthetic completed repair photograph');
  await saveRemark(page);
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Result', exact: true })).toHaveValue('Not tested');
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(page.getByText('Synthetic replacement cover', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Photos', exact: true }).click();
  await expect(page.getByAltText('Synthetic before photograph', { exact: true })).toHaveAttribute('src', photo);
  await expect(page.getByAltText('Synthetic completed repair photograph', { exact: true })).toHaveAttribute('src', photo);
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.remark-history-entry').filter({ hasText: 'Replace the damaged housing.' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Defects', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: resolve('docs/screenshots', testInfo.project.name === 'mobile-chromium' ? 'mobile-device-remarks.png' : 'desktop-device-remarks.png'), fullPage: true });
  await openJobSection(page, 'Finalisation');
  const report = page.locator('.job-report-preview');
  await expect(report).toContainText('Synthetic detector housing defect');
  await expect(report).toContainText('Training corridor');
  await expect(report).toContainText('Housing replaced during this offline visit; device testing remains unrecorded.');
  await expect(report).toContainText('Synthetic replacement cover');
  await expect(report).toContainText('Synthetic before photograph');
  await expect(report).toContainText('Synthetic completed repair photograph');
  await expect(report).not.toContainText('Internal cost review only');
  await expect(report).toContainText('Not tested');
  const exported = await exportData(page);
  const updated = exported.data.job.results.find(result => result.id === initialResult.id);
  expect(updated.state).toBe('Not tested');
  expect(updated.remarks.items[0].id).toBe(initialResult.remarks.items[0].id);
  expect(updated.remarks.items[0].status).toBe('Resolved');
  expect(updated.remarks.items[0].internalNote).toBe(initialResult.remarks.items[0].internalNote);
  expect(updated.remarks.items[0].beforePhotos).toEqual(initialResult.remarks.items[0].beforePhotos);
  expect(updated.remarks.items[0].resolvedPhotos[0]).toMatchObject({ image: photo, caption: 'Synthetic completed repair photograph' });
  expect(updated.remarks.items[0].products).toEqual(initialResult.remarks.items[0].products);
  expect(updated.remarks.history.some(entry => entry.item.recommendation === 'Replace the damaged housing.')).toBe(true);
  const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await fresh.newPage();
    await reopened.goto('/');
    const file = { name: 'device-remarks.jobs.json', mimeType: 'application/json', buffer: Buffer.from(exported.input) };
    await reopened.locator('#job-file').setInputFiles(file);
    await expect(reopened.locator('.job-notes')).toBeVisible();
    const returned = await exportData(reopened);
    expect(returned.data.job.results).toEqual(exported.data.job.results);
    expect(returned.data.site.drawings).toEqual(exported.data.site.drawings);
    await reopened.locator('#job-file').setInputFiles(file);
    await expect(reopened.locator('#notice')).toContainText('already saved');
    const beforeInvalid = await savedJobs(reopened);
    expect(beforeInvalid).toHaveLength(1);
    const invalid = JSON.parse(exported.input);
    invalid.job.results.find(result => result.id === initialResult.id).remarks.items[0].severity = 'Automatically passed';
    await reopened.locator('#job-file').setInputFiles({ name: 'invalid-remark.jobs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
    await expect(reopened.locator('#notice')).toContainText('Job import rejected');
    expect(await savedJobs(reopened)).toEqual(beforeInvalid);
  } finally { await fresh.close(); }
});

test('an unsaved device remark survives cancelled navigation and a failed local save', async ({ page }) => {
  await createVisit(page);
  const quickBefore = page.locator('[data-form="quick-result"]');
  await quickBefore.getByRole('button', { name: 'Fail', exact: true }).click();
  const discarded = [];
  const acceptDiscard = async dialog => { discarded.push(dialog.message()); await dialog.accept(); };
  page.on('dialog', acceptDiscard);
  try {
    const untouched = await addRemark(page);
    await untouched.getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally { page.off('dialog', acceptDiscard); }
  expect(discarded.some(message => message.includes('unsaved result change'))).toBe(true);
  await expect(page.locator('[data-remark-form]')).toHaveCount(0);
  await expect(quickBefore.getByRole('button', { name: 'Not tested', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(quickBefore.locator('input[name="state"]')).toHaveValue('Not tested');
  await quickBefore.getByRole('button', { name: 'Save result', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  expect((await savedJobs(page))[0].results.every(result => result.state === 'Not tested')).toBe(true);
  const form = await addRemark(page, 'Critical defect');
  await form.getByRole('textbox', { name: 'Description', exact: true }).fill('Synthetic critical defect needing engineer review.');
  await form.locator('[data-remark-file="beforePhotos"]').setInputFiles(upload);
  await form.getByRole('textbox', { name: 'Before photo caption', exact: true }).fill('Retain this unsaved evidence');
  await expect(form.getByRole('combobox', { name: 'Severity', exact: true })).toHaveValue('Critical defect');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '‹ Home', exact: true }).click();
  await expect(form.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Synthetic critical defect needing engineer review.');
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') { IDBDatabase.prototype.transaction = original; throw new DOMException('Synthetic failed remark save', 'QuotaExceededError'); }
      return original.call(this, stores, mode, options);
    };
  });
  await form.getByRole('button', { name: 'Save remark', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(form.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Synthetic critical defect needing engineer review.');
  await expect(form.getByRole('textbox', { name: 'Before photo caption', exact: true })).toHaveValue('Retain this unsaved evidence');
  await expect(form.locator('img')).toHaveAttribute('src', photo);
  await expect(form.getByRole('button', { name: 'Save remark', exact: true })).toBeEnabled();
  await saveRemark(page);
  await page.reload();
  await page.getByTestId('job-card').click();
  await openDevice(page);
  await expect(page.locator('.device-remarks')).toContainText('Synthetic critical defect needing engineer review.');
  const jobs = await savedJobs(page);
  const result = jobs[0].results.find(record => record.remarks?.items.length);
  expect(result.state).toBe('Not tested');
  expect(result.remarks.items[0].severity).toBe('Critical defect');
  expect(result.remarks.items[0].beforePhotos[0]).toMatchObject({ image: photo, caption: 'Retain this unsaved evidence' });
  const quickResult = page.locator('[data-form="quick-result"]');
  await quickResult.getByRole('button', { name: 'Fail', exact: true }).click();
  await quickResult.getByRole('button', { name: 'Save result', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Add an explanation');
  expect((await savedJobs(page))[0].results.find(record => record.id === result.id).state).toBe('Not tested');
  await quickResult.getByRole('textbox', { name: 'Explanation', exact: true }).fill('Engineer confirms the device failed the recorded functional check.');
  await quickResult.getByRole('button', { name: 'Save result', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  const confirmed = (await savedJobs(page))[0].results.find(record => record.id === result.id);
  expect(confirmed.state).toBe('Unsatisfactory');
  expect(confirmed.observations).toBe('Engineer confirms the device failed the recorded functional check.');
  expect(confirmed.remarks).toEqual(result.remarks);
});
