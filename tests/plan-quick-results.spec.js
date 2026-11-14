import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateJobPackage } from '../src/packages.js';
import { clickExportJob, openJobSection } from './helpers/job-creation.js';

const fixture = resolve('public/demo.zonesketch.json');
const source = JSON.parse(await readFile(fixture, 'utf8'));

async function savedJob(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('jobs', 'readonly'), jobs = tx.objectStore('jobs').getAll();
      tx.oncomplete = () => { db.close(); resolve(jobs.result[0]); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}
async function importSite(page, project = source) {
  await page.goto('/');
  await page.locator('#zone-file').setInputFiles({ name: 'synthetic-plan.zonesketch.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function createVisit(page) {
  await page.locator('[data-action="create"]:visible').last().click();
  await page.locator('.job-notes').getByRole('textbox', { name: 'Job title', exact: true }).fill('Synthetic plan result visit');
  await page.locator('.job-notes').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await openJobSection(page, 'Plan');
  await expect(page.getByTestId('plan-png')).toBeVisible();
}
async function noVisitControls(page) {
  await expect(page.locator('.plan-inline-results,.plan-asset-edit')).toHaveCount(0);
}
async function sameRow(row) {
  await row.scrollIntoViewIfNeeded();
  const name = await row.locator('.plan-asset-name').boundingBox();
  const edit = await row.locator('.plan-asset-edit').boundingBox();
  const controls = [];
  for (const label of ['Pass', 'Fail', 'N/A']) controls.push(await row.getByRole('button', { name: label, exact: true }).boundingBox());
  for (const control of [...controls, edit]) {
    expect(Math.round(control.width * 100) / 100).toBeGreaterThanOrEqual(44);
    expect(Math.round(control.height * 100) / 100).toBeGreaterThanOrEqual(44);
    expect(Math.abs(control.y + control.height / 2 - (edit.y + edit.height / 2))).toBeLessThan(3);
  }
  expect(name.width).toBeGreaterThan(20);
  expect(name.x + name.width).toBeLessThanOrEqual(controls[0].x + 1);
  for (let index = 1; index < controls.length; index++) expect(controls[index].x).toBeGreaterThanOrEqual(controls[index - 1].x + controls[index - 1].width - 1);
  expect(edit.x).toBeGreaterThanOrEqual(controls.at(-1).x + controls.at(-1).width - 1);
  const bounds = await row.boundingBox();
  expect(bounds.x + bounds.width - edit.x - edit.width).toBeLessThan(18);
}

// The Plan list is an entry point to today's work; historical and site-only drawings stay read-only.
test('Plan assets keep their outcome controls and right-hand pencil on one row and reopen offline with saved results', async ({ page, context }, testInfo) => {
  await importSite(page);
  await noVisitControls(page);
  await createVisit(page);
  const row = page.locator('.plan-asset-work-row').first();
  await expect(row).toBeVisible();
  await sameRow(row);
  if (testInfo.project.name === 'mobile-chromium') {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await sameRow(row);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  const assetId = await row.getAttribute('data-asset-id');
  await row.locator('.plan-asset-name').click();
  await expect(page.locator('.device-editor')).toHaveAttribute('data-section', 'Record');
  await openJobSection(page, 'Plan');
  await row.locator('.plan-asset-edit').click();
  await expect(page.locator('.device-editor')).toHaveAttribute('data-section', 'Defects');
  await expect(page.getByRole('button', { name: 'Add remark', exact: true })).toBeVisible();
  await openJobSection(page, 'Plan');
  const issuedId = await page.getByLabel('Drawing record', { exact: true }).locator('option').nth(1).getAttribute('value');
  await page.getByLabel('Drawing record', { exact: true }).selectOption(issuedId);
  await expect(page.locator('.plan-status')).toContainText('Issued');
  await noVisitControls(page);
  await page.getByRole('button', { name: 'FAP-01', exact: true }).click();
  await expect(page.locator('.plan-details')).toContainText('Historical drawing evidence');
  await page.getByLabel('Drawing record', { exact: true }).selectOption('');
  await row.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(row.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const saved = await savedJob(page);
  expect(saved.results.find(result => result.assetId === assetId).state).toBe('Satisfactory');
  await page.locator('header .job-site-link').click();
  await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
  await noVisitControls(page);
  await page.getByTestId('site-job-card').click();
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await openJobSection(page, 'Plan');
  await expect(row.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.getByTestId('plan-png').evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy();
  await mkdir('docs/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve('docs/screenshots', testInfo.project.name === 'mobile-chromium' ? 'mobile-plan-inline-results.png' : 'desktop-plan-inline-results.png'), fullPage: true });
  const download = await clickExportJob(page, { restore: false });
  const exported = validateJobPackage(await readFile(await download.path(), 'utf8'));
  expect(exported.job.results).toEqual(saved.results);
  const drawing = exported.site.drawings.find(drawing => drawing.id === exported.job.drawingId);
  expect(drawing.source).toEqual(source);
  expect(drawing.planPreviews.some(preview => /^data:image\/png;base64,/.test(preview.image))).toBe(true);
});

test('Plan result saves retain the selected floor, asset page and zoom while pending reasons guard drawing navigation', async ({ page }) => {
  const expanded = structuredClone(source);
  const upper = expanded.project.floors[1];
  const seed = structuredClone(upper.data.symbols.find(symbol => symbol.type === 'heat'));
  upper.data.symbols = Array.from({ length: 18 }, (_, index) => ({
    ...structuredClone(seed), id: `synthetic-upper-${index + 1}`, reference: `HD-${String(index + 1).padStart(2, '0')}`,
    x: 0.15 + (index % 6) * 0.12, y: 0.2 + Math.floor(index / 6) * 0.2, photos: [],
  }));
  await importSite(page, expanded);
  await createVisit(page);
  await page.getByLabel('Plan floor', { exact: true }).selectOption({ index: 1 });
  const floorId = await page.getByLabel('Plan floor', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Next assets', exact: true }).click();
  const viewport = page.locator('.plan-preview-viewport');
  await viewport.evaluate(node => node.scrollTo(55, 44));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const pan = await viewport.evaluate(node => ({ left: node.scrollLeft, top: node.scrollTop }));
  expect(pan.left + pan.top).toBeGreaterThan(0);
  const rows = page.locator('.plan-asset-work-row');
  const firstId = await rows.first().getAttribute('data-asset-id');
  const secondId = await rows.nth(1).getAttribute('data-asset-id');
  const thirdId = await rows.nth(2).getAttribute('data-asset-id');
  const pageText = await page.getByRole('navigation', { name: 'Floor asset pages', exact: true }).textContent();
  const sameView = async () => {
    await expect(page.getByLabel('Plan floor', { exact: true })).toHaveValue(floorId);
    await expect(page.locator('.plan-preview-zoom output')).toHaveText('150%');
    await expect.poll(() => viewport.evaluate(node => ({ left: node.scrollLeft, top: node.scrollTop }))).toEqual(pan);
    await expect(rows.first()).toHaveAttribute('data-asset-id', firstId);
    await expect(page.getByRole('navigation', { name: 'Floor asset pages', exact: true })).toHaveText(pageText);
  };
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') { IDBDatabase.prototype.transaction = original; throw new DOMException('Synthetic Plan result save failure', 'QuotaExceededError'); }
      return original.call(this, stores, mode, options);
    };
  });
  await rows.first().getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await sameView();
  expect((await savedJob(page)).results.find(result => result.assetId === firstId).state).toBe('Not tested');
  await rows.first().getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await sameView();
  await rows.nth(1).getByRole('button', { name: 'Fail', exact: true }).click();
  const form = page.locator('.device-quick-explanation');
  await form.getByRole('textbox', { name: 'Explanation', exact: true }).fill('Upper floor device did not respond during the synthetic test.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByLabel('Plan floor', { exact: true }).selectOption({ index: 0 });
  await sameView();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Next assets', exact: true }).click();
  await sameView();
  const issuedId = await page.getByLabel('Drawing record', { exact: true }).locator('option').nth(1).getAttribute('value');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByLabel('Drawing record', { exact: true }).selectOption(issuedId);
  await expect(page.getByLabel('Drawing record', { exact: true })).toHaveValue('');
  await sameView();
  await expect(form.getByRole('textbox', { name: 'Explanation', exact: true })).toHaveValue('Upper floor device did not respond during the synthetic test.');
  expect((await savedJob(page)).results.find(result => result.assetId === secondId).state).toBe('Not tested');
  await form.getByRole('button', { name: 'Save result', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await sameView();
  await expect(rows.nth(1).getByRole('button', { name: 'Fail', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await rows.nth(2).getByRole('button', { name: 'N/A', exact: true }).click();
  await form.getByRole('textbox', { name: 'Explanation', exact: true }).fill('This draft will be discarded.');
  page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('Drawing record', { exact: true }).selectOption(issuedId);
  await expect(page.getByLabel('Drawing record', { exact: true })).toHaveValue(issuedId);
  await noVisitControls(page);
  await expect(form).toHaveCount(0);
  const saved = await savedJob(page);
  expect(saved.results.find(result => result.assetId === firstId).state).toBe('Satisfactory');
  expect(saved.results.find(result => result.assetId === secondId)).toMatchObject({ state: 'Unsatisfactory', observations: 'Upper floor device did not respond during the synthetic test.' });
  expect(saved.results.find(result => result.assetId === thirdId).state).toBe('Not tested');
});
