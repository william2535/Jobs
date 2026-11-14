import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateJobPackage } from '../src/packages.js';
import { clickExportJob, openJobSection } from './helpers/job-creation.js';

const fixture = resolve('public/demo.zonesketch.json');
const sample = JSON.parse(await readFile(fixture, 'utf8'));
const photo = sample.project.floors[0].data.symbols.find(symbol => symbol.photos?.length).photos[0].image;
const upload = { name: 'synthetic-quick-defect.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') };
const reusableTitle = 'Synthetic loose detector cover';

async function stored(page, name) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(name, 'readonly'), records = tx.objectStore(name).getAll();
      tx.oncomplete = () => { db.close(); resolve(records.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), name);
}
async function library(page) { return (await stored(page, 'metadata')).find(record => record.key === 'quick-defects')?.value || []; }
async function createVisit(page, title = 'Synthetic inline result visit') {
  await page.goto('/');
  await page.locator('#zone-file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await createFromSite(page, title);
}
async function createFromSite(page, title) {
  await page.locator('[data-action="create"]:visible').last().click();
  await page.locator('.job-notes').getByRole('textbox', { name: 'Job title', exact: true }).fill(title);
  await page.locator('.job-notes').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await openJobSection(page, 'Devices');
}
async function exportData(page) {
  const download = await clickExportJob(page, { restore: false });
  const input = await readFile(await download.path(), 'utf8');
  return { input, data: validateJobPackage(input) };
}
async function addCustomRemark(page) {
  await page.getByRole('button', { name: 'Add remark', exact: true }).click();
  await page.getByRole('button', { name: 'Custom note', exact: true }).click();
  return page.locator('[data-remark-form]');
}
async function saveRemark(page) {
  await page.locator('[data-remark-form]').getByRole('button', { name: 'Save remark', exact: true }).click();
  await expect(page.locator('[data-remark-form]')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}

// Inline outcomes are still engineer decisions. An incomplete or failed save cannot change evidence.
test('device cards save Pass directly and require explanations for Fail and N/A without losing pending work', async ({ page, context }, testInfo) => {
  await createVisit(page);
  const rows = page.locator('.device-browser-grid > .device-row');
  const first = rows.nth(0), second = rows.nth(1), third = rows.nth(2);
  const ids = await rows.evaluateAll(nodes => nodes.slice(0, 3).map(node => node.dataset.assetId));
  for (const label of ['Pass', 'Fail', 'N/A']) await expect(first.getByRole('button', { name: label, exact: true })).toBeEnabled();
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') { IDBDatabase.prototype.transaction = original; throw new DOMException('Synthetic result save failure', 'QuotaExceededError'); }
      return original.call(this, stores, mode, options);
    };
  });
  await first.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  expect((await stored(page, 'jobs'))[0].results.find(result => result.assetId === ids[0]).state).toBe('Not tested');
  await expect(first.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await first.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(first.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await second.getByRole('button', { name: 'Fail', exact: true }).click();
  let form = second.locator('.device-quick-explanation');
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Save result', exact: true }).click();
  expect((await stored(page, 'jobs'))[0].results.find(result => result.assetId === ids[1]).state).toBe('Not tested');
  await form.getByRole('textbox', { name: 'Explanation', exact: true }).fill('Unfinished inspection note.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('combobox', { name: 'Result filter', exact: true }).selectOption('Unsatisfactory');
  await expect(page.getByRole('combobox', { name: 'Result filter', exact: true })).toHaveValue('');
  await expect(form.getByRole('textbox', { name: 'Explanation', exact: true })).toHaveValue('Unfinished inspection note.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('navigation', { name: 'Job workflow', exact: true }).getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(form.getByRole('textbox', { name: 'Explanation', exact: true })).toHaveValue('Unfinished inspection note.');
  const acceptDiscard = dialog => dialog.accept();
  page.on('dialog', acceptDiscard);
  try { await form.getByRole('button', { name: 'Cancel', exact: true }).click(); }
  finally { page.off('dialog', acceptDiscard); }
  await expect(form).toHaveCount(0);
  expect((await stored(page, 'jobs'))[0].results.find(result => result.assetId === ids[1]).state).toBe('Not tested');
  await second.getByRole('button', { name: 'N/A', exact: true }).click();
  form = second.locator('.device-quick-explanation');
  await form.getByRole('textbox', { name: 'Explanation', exact: true }).fill('This device is outside the agreed synthetic visit scope.');
  await form.getByRole('button', { name: 'Save result', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(second.getByRole('button', { name: 'N/A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await third.getByRole('button', { name: 'Fail', exact: true }).click();
  form = third.locator('.device-quick-explanation');
  await form.getByRole('textbox', { name: 'Explanation', exact: true }).fill('Engineer observed no response during the synthetic functional check.');
  await form.getByRole('button', { name: 'Save result', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(third.getByRole('button', { name: 'Fail', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await third.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(third.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await third.getByRole('button', { name: 'Fail', exact: true }).click();
  await expect(third.getByRole('button', { name: 'Fail', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(third.locator('.device-quick-explanation')).toHaveCount(0);
  expect((await stored(page, 'jobs'))[0].results.find(result => result.assetId === ids[2]).observations).toBe('Engineer observed no response during the synthetic functional check.');
  const before = (await stored(page, 'jobs'))[0];
  expect(ids.map(id => before.results.find(result => result.assetId === id).state)).toEqual(['Satisfactory', 'Not applicable', 'Unsatisfactory']);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await openJobSection(page, 'Devices');
  await expect(first.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(second.getByRole('button', { name: 'N/A', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(third.getByRole('button', { name: 'Fail', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await mkdir('docs/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve('docs/screenshots', testInfo.project.name === 'mobile-chromium' ? 'mobile-inline-device-results.png' : 'desktop-inline-device-results.png'), fullPage: true });
  const exported = await exportData(page);
  expect(exported.data.job.results).toEqual(before.results);
});

test('starred quick defects reopen offline and create fresh findings without reusing previous visit evidence', async ({ page, context, browser }, testInfo) => {
  await createVisit(page, 'Original synthetic defect visit');
  await page.locator('.device-row').first().locator('.device-edit').click();
  await expect(page.locator('.device-editor')).toHaveAttribute('data-section', 'Defects');
  let form = await addCustomRemark(page);
  await form.getByRole('textbox', { name: 'Remark title', exact: true }).fill(reusableTitle);
  await form.getByRole('textbox', { name: 'Location', exact: true }).fill('Original visit room');
  await form.getByRole('textbox', { name: 'Description', exact: true }).fill('Check and secure the loose detector cover.');
  await form.getByRole('combobox', { name: 'Severity', exact: true }).selectOption('Minor defect');
  await form.getByRole('textbox', { name: 'Internal note', exact: true }).fill('Original internal cost note');
  await form.getByLabel('Last verified', { exact: true }).fill('2026-11-14');
  await form.getByRole('textbox', { name: 'Recommendation', exact: true }).fill('Inspect the retaining clip and replace if damaged.');
  await form.getByRole('combobox', { name: 'Remark status', exact: true }).selectOption('Resolved');
  await form.locator('[data-remark-file="beforePhotos"]').setInputFiles(upload);
  await form.getByRole('textbox', { name: 'Before photo caption', exact: true }).fill('Original before evidence');
  await form.locator('[data-remark-file="resolvedPhotos"]').setInputFiles(upload);
  await form.getByRole('textbox', { name: 'Resolution photo caption', exact: true }).fill('Original resolution evidence');
  await form.getByRole('button', { name: 'Add product', exact: true }).click();
  await form.getByRole('textbox', { name: 'Product description', exact: true }).fill('Original recorded replacement cover');
  await form.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('1');
  await form.getByRole('textbox', { name: 'Unit', exact: true }).fill('each');
  await saveRemark(page);
  const card = page.locator('.remark-card').first();
  const beforeStar = (await stored(page, 'jobs'))[0];
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') { IDBDatabase.prototype.transaction = original; throw new DOMException('Synthetic quick defect save failure', 'QuotaExceededError'); }
      return original.call(this, stores, mode, options);
    };
  });
  await card.getByRole('button', { name: 'Save as quick defect', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(card.getByRole('button', { name: 'Save as quick defect', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await library(page)).toEqual([]);
  expect((await stored(page, 'jobs'))[0].results).toEqual(beforeStar.results);
  await card.getByRole('button', { name: 'Save as quick defect', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Remove quick defect', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByRole('button', { name: 'Remove quick defect', exact: true })).toBeFocused();
  const savedTemplates = await library(page);
  expect(savedTemplates).toHaveLength(1);
  expect(Object.keys(savedTemplates[0]).sort()).toEqual(['createdAt', 'description', 'id', 'recommendation', 'severity', 'title']);
  const original = await exportData(page);
  const originalResult = original.data.job.results.find(result => result.remarks?.items.length);
  expect(originalResult.state).toBe('Not tested');
  const originalRemark = originalResult.remarks.items[0];
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await page.locator('header .job-site-link').click();
  await createFromSite(page, 'Fresh synthetic defect visit');
  await page.locator('.device-row').first().locator('.device-edit').click();
  await page.getByRole('button', { name: 'Add remark', exact: true }).click();
  await expect(page.locator('.quick-defect-choice')).toHaveCount(1);
  const viewport = page.viewportSize();
  if (viewport.width > 700) {
    await page.setViewportSize({ width: 680, height: viewport.height });
    await expect(page.locator('.quick-defect-choice')).toHaveCount(1);
    await page.setViewportSize(viewport);
    await expect(page.locator('.quick-defect-choice')).toHaveCount(1);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await mkdir('docs/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve('docs/screenshots', testInfo.project.name === 'mobile-chromium' ? 'mobile-quick-defects.png' : 'desktop-quick-defects.png'), fullPage: true });
  await page.getByRole('button', { name: `Add quick defect: ${reusableTitle}`, exact: true }).click();
  form = page.locator('[data-remark-form]');
  await expect(form.getByRole('textbox', { name: 'Remark title', exact: true })).toHaveValue(reusableTitle);
  await expect(form.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(originalRemark.description);
  await expect(form.getByRole('combobox', { name: 'Severity', exact: true })).toHaveValue('Minor defect');
  await expect(form.getByRole('textbox', { name: 'Recommendation', exact: true })).toHaveValue(originalRemark.recommendation);
  await expect(form.getByRole('textbox', { name: 'Location', exact: true })).toHaveValue('');
  await expect(form.getByRole('textbox', { name: 'Internal note', exact: true })).toHaveValue('');
  await expect(form.getByLabel('Last verified', { exact: true })).toHaveValue('');
  await expect(form.getByRole('combobox', { name: 'Remark status', exact: true })).toHaveValue('Open');
  await expect(form.locator('img,[data-remark-product]')).toHaveCount(0);
  const unsavedVisit = (await stored(page, 'jobs')).find(job => job.id !== original.data.job.id);
  expect(unsavedVisit.results.every(result => result.state === 'Not tested' && !result.remarks?.items.length)).toBe(true);
  await saveRemark(page);
  await expect(card.getByRole('button', { name: 'Remove quick defect', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await library(page)).toEqual(savedTemplates);
  let jobs = await stored(page, 'jobs');
  const freshJob = jobs.find(job => job.id !== original.data.job.id);
  const freshResult = freshJob.results.find(result => result.remarks?.items.length);
  expect(freshJob.results.every(result => result.state === 'Not tested')).toBe(true);
  const freshRemark = freshResult.remarks.items[0];
  expect(freshRemark.id).not.toBe(originalRemark.id);
  expect(freshRemark).toMatchObject({ title: reusableTitle, location: '', internalNote: '', lastVerified: '', status: 'Open', beforePhotos: [], resolvedPhotos: [], products: [] });
  await card.getByRole('button', { name: 'Remove quick defect', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Save as quick defect', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(card.getByRole('button', { name: 'Save as quick defect', exact: true })).toBeFocused();
  expect(await library(page)).toEqual([]);
  await page.reload();
  await page.getByTestId('job-card').filter({ hasText: 'Fresh synthetic defect visit' }).click();
  await openJobSection(page, 'Devices');
  await page.locator('.device-row').first().locator('.device-edit').click();
  await page.getByRole('button', { name: 'Add remark', exact: true }).click();
  await expect(page.locator('.quick-defect-choice')).toHaveCount(0);
  expect(await library(page)).toEqual([]);
  jobs = await stored(page, 'jobs');
  expect(jobs.find(job => job.id === original.data.job.id).results).toEqual(original.data.job.results);
  expect(jobs.find(job => job.id === freshJob.id).results).toEqual(freshJob.results);
  const exported = await exportData(page);
  const receiving = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await receiving.newPage();
    await reopened.goto('/');
    for (const [name, value] of [['source', original], ['fresh', exported]]) {
      await reopened.locator('#job-file').setInputFiles({ name: `${name}.jobs.json`, mimeType: 'application/json', buffer: Buffer.from(value.input) });
      await expect(reopened.locator('.job-notes')).toBeVisible();
      expect((await exportData(reopened)).data.job.results).toEqual(value.data.job.results);
    }
    await reopened.locator('#job-file').setInputFiles({ name: 'fresh-again.jobs.json', mimeType: 'application/json', buffer: Buffer.from(exported.input) });
    await expect(reopened.locator('#notice')).toContainText('already saved');
    expect(await stored(reopened, 'jobs')).toHaveLength(2);
  } finally { await receiving.close(); }
});
