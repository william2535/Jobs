import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateJobPackage } from '../src/packages.js';
import { clickExportJob, openJobSection } from './helpers/job-creation.js';

async function stored(page, store) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(name, 'readonly'), records = tx.objectStore(name).getAll();
      tx.oncomplete = () => { db.close(); resolve(records.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), store);
}
async function newStandaloneJob(page, title) {
  await page.locator('[data-action="create"]:visible').first().click();
  const notes = page.locator('.job-notes');
  await notes.getByRole('textbox', { name: 'Job title', exact: true }).fill(title);
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await openJobSection(page, 'Assets');
  await expect(page.locator('.assets-workspace')).toBeVisible();
}
async function saveAsset(page, label = 'Add asset') {
  await page.locator('.assets-create-form').getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('.assets-create-form')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function exportData(page) {
  const download = await clickExportJob(page, { restore: false });
  const input = await readFile(await download.path(), 'utf8');
  return { input, data: validateJobPackage(input) };
}
const assetRow = (page, reference) => page.locator('.assets-register-item').filter({ has: page.getByRole('button', { name: reference, exact: true }) });

// Specifications can be reused, but every physical asset and every visit result remains distinct.
test('standalone assets duplicate with fresh results and favourites can be reused offline in another job', async ({ page, context, browser }, testInfo) => {
  await page.goto('/');
  await newStandaloneJob(page, 'Original synthetic asset visit');
  await expect(page.getByRole('navigation', { name: 'Job workflow', exact: true }).getByRole('button')).toHaveText(['Notes', 'Assets', 'Finalisation']);
  await page.getByRole('button', { name: 'View plan', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No plan added', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to assets', exact: true }).click();
  await page.getByRole('button', { name: '+ Create asset', exact: true }).click();
  let form = page.locator('.assets-create-form');
  await form.getByRole('textbox', { name: 'Asset reference', exact: true }).fill('SYN-SD-01');
  await form.getByRole('combobox', { name: 'Equipment type', exact: true }).selectOption('custom');
  await form.getByRole('textbox', { name: 'Custom equipment type', exact: true }).fill('Synthetic optical detector');
  await form.getByRole('textbox', { name: 'Location (optional)', exact: true }).fill('Original training room');
  await form.locator('.assets-extra-fields > summary').click();
  await form.getByRole('textbox', { name: 'Manufacturer', exact: true }).fill('Synthetic manufacturer');
  await form.getByRole('textbox', { name: 'Model', exact: true }).fill('Training model');
  await form.getByRole('textbox', { name: 'Description', exact: true }).fill('Reusable equipment specification only.');
  await saveAsset(page);
  const original = assetRow(page, 'SYN-SD-01');
  await expect(original).toBeVisible();
  await original.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(original.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await original.getByRole('button', { name: 'Save SYN-SD-01 as favourite asset', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(original.getByRole('button', { name: 'Remove SYN-SD-01 from favourite assets', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await original.getByRole('button', { name: 'Duplicate SYN-SD-01', exact: true }).click();
  form = page.locator('.assets-create-form');
  await expect(form.getByLabel('Asset reference', { exact: true })).toHaveValue('SYN-SD-02');
  await expect(form.getByLabel('Manufacturer', { exact: true })).toHaveValue('Synthetic manufacturer');
  await saveAsset(page, 'Create duplicate');
  const duplicate = assetRow(page, 'SYN-SD-02');
  await expect(duplicate.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const firstJob = (await stored(page, 'jobs'))[0];
  expect(firstJob.siteId).toBeNull();
  expect(firstJob.drawingId).toBeNull();
  expect(await stored(page, 'sites')).toHaveLength(0);
  expect(firstJob.assetRegister.assets.map(asset => asset.reference)).toEqual(['SYN-SD-01', 'SYN-SD-02']);
  expect(new Set(firstJob.assetRegister.assets.map(asset => asset.id)).size).toBe(2);
  expect(new Set(firstJob.results.map(result => result.id)).size).toBe(2);
  expect(firstJob.results.map(result => result.state)).toEqual(['Satisfactory', 'Not tested']);
  expect(firstJob.assetRegister.assets.every(asset => asset.x === null && asset.y === null && !asset.sourceId)).toBe(true);

  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await openJobSection(page, 'Assets');
  await expect(original.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(duplicate.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '‹ Home', exact: true }).click();
  await newStandaloneJob(page, 'Second synthetic asset visit');
  await page.locator('.assets-favourites > summary').click();
  await page.getByRole('button', { name: 'Use Synthetic optical detector', exact: true }).click();
  form = page.locator('.assets-create-form');
  await expect(form.getByLabel('Asset reference', { exact: true })).toHaveValue('Synthetic optical detector 001');
  await expect(form.getByLabel('Location (optional)', { exact: true })).toHaveValue('');
  await expect(form.getByLabel('Model', { exact: true })).toHaveValue('Training model');
  await form.locator('.assets-placement-fields > summary').click();
  await form.getByRole('textbox', { name: 'Asset reference', exact: true }).fill('SYN-SD-03');
  await saveAsset(page);
  await expect(assetRow(page, 'SYN-SD-03').getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await expect(page.locator('#jobs-startup')).toBeHidden();
  if (await page.locator('.assets-favourites').evaluate(node => node.open))
    await page.locator('.assets-favourites > summary').click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('assets-workspace.png'), fullPage: true });
  if (testInfo.project.name === 'mobile-chromium') {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.appearance-control')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`assets-375-${theme}.png`) });
    }
  }
  const exported = await exportData(page);
  const report = page.locator('.job-report-preview');
  for (const detail of ['SYN-SD-03', 'Synthetic optical detector', 'Synthetic manufacturer', 'Training model', 'Reusable equipment specification only.'])
    await expect(report).toContainText(detail);
  await expect(report).not.toContainText('Original training room');
  expect(exported.data.site).toBeNull();
  expect(exported.data.job.assetRegister.assets).toHaveLength(1);
  const reused = exported.data.job.assetRegister.assets[0];
  expect(firstJob.assetRegister.assets.map(asset => asset.id)).not.toContain(reused.id);
  expect(reused).toMatchObject({ reference: 'SYN-SD-03', typeName: 'Synthetic optical detector', manufacturer: 'Synthetic manufacturer', model: 'Training model', location: '', x: null, y: null, photos: [] });
  expect(exported.data.job.results).toHaveLength(1);
  expect(exported.data.job.results[0]).toMatchObject({ assetId: reused.id, state: 'Not tested', observations: '', readings: [], notes: '', defects: '', photos: [] });
  expect(firstJob.results.map(result => result.id)).not.toContain(exported.data.job.results[0].id);
  expect(await stored(page, 'sites')).toHaveLength(0);

  const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await fresh.newPage();
    await reopened.goto('/');
    const file = { name: 'standalone-assets.jobs.json', mimeType: 'application/json', buffer: Buffer.from(exported.input) };
    await reopened.locator('#job-file').setInputFiles(file);
    await expect(reopened.locator('.job-notes')).toBeVisible();
    await openJobSection(reopened, 'Assets');
    await expect(assetRow(reopened, 'SYN-SD-03')).toBeVisible();
    const returned = await exportData(reopened);
    expect(returned.data.job.assetRegister).toEqual(exported.data.job.assetRegister);
    expect(returned.data.job.results).toEqual(exported.data.job.results);
    await reopened.locator('#job-file').setInputFiles(file);
    await expect(reopened.locator('#notice')).toContainText('already saved');
    expect(await stored(reopened, 'jobs')).toHaveLength(1);
    expect(await stored(reopened, 'sites')).toHaveLength(0);
  } finally { await fresh.close(); }
});

test('quick equipment presets create numbered batches offline and duplicates keep specifications without copying evidence', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.locator('#offline-status')).toHaveText('Ready offline');
  await newStandaloneJob(page, 'Synthetic quick equipment batch');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Quick add Smoke detectors', exact: true }).click();
  let form = page.locator('.assets-create-form');
  const quantity = form.getByRole('spinbutton', { name: 'Quantity', exact: true });
  const slider = form.getByRole('slider', { name: 'Quantity slider', exact: true });
  await expect(form.getByLabel('Asset reference', { exact: true })).toHaveValue('Smoke detector 001');
  await expect(form.locator('select[name="type"]')).toHaveValue('smoke');
  await expect(form.getByRole('button', { name: 'Add asset', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('quick-assets-preset.png') });
  await expect(slider).toHaveAttribute('min', '1');
  await expect(slider).toHaveAttribute('max', '100');
  await quantity.fill('101');
  await form.locator('button[type="submit"]').click();
  await expect(form.locator('.assets-editor-error')).toContainText(/1.*100/);
  expect((await stored(page, 'jobs'))[0].results).toHaveLength(0);
  await slider.focus();
  await slider.press('Home');
  for (let index = 0; index < 4; index++) await slider.press('ArrowRight');
  await expect(quantity).toHaveValue('5');
  await expect(form.locator('.assets-reference-preview')).toContainText('Smoke detector 005');
  await form.locator('.assets-placement-fields > summary').click();
  await form.getByRole('textbox', { name: 'Location (optional)', exact: true }).fill('Synthetic training wing');
  await form.locator('.assets-extra-fields > summary').click();
  await form.getByRole('textbox', { name: 'Manufacturer', exact: true }).fill('Synthetic manufacturer');
  await form.getByRole('textbox', { name: 'Model', exact: true }).fill('Training model');
  await form.getByRole('textbox', { name: 'Description', exact: true }).fill('Reusable synthetic detector specification.');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('quick-assets-quantity.png'), fullPage: true });
  await slider.press('End');
  await expect(quantity).toHaveValue('100');
  await expect(form.locator('.assets-reference-preview')).toContainText('Smoke detector 100');
  await saveAsset(page, 'Add 100 assets');
  const original = assetRow(page, 'Smoke detector 001');
  const firstJob = (await stored(page, 'jobs'))[0];
  expect(firstJob.assetRegister.assets.map(asset => asset.reference)).toEqual(Array.from({ length: 100 }, (_, index) => `Smoke detector ${String(index + 1).padStart(3, '0')}`));
  expect(firstJob.results.every(result => result.state === 'Not tested')).toBe(true);
  await original.getByRole('button', { name: 'Smoke detector 001', exact: true }).click();
  const record = page.locator('form[data-form="result"]');
  await record.getByRole('combobox', { name: 'Result', exact: true }).selectOption('Satisfactory');
  await record.getByRole('textbox', { name: 'Notes', exact: true }).fill('Evidence belongs to the first physical detector only.');
  const demo = JSON.parse(await readFile(new URL('../public/demo.zonesketch.json', import.meta.url), 'utf8'));
  const photo = demo.project.floors[0].data.symbols.find(symbol => symbol.photos?.length).photos[0].image;
  await record.getByLabel('Add photographs', { exact: true }).setInputFiles({ name: 'synthetic-original-evidence.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
  await record.getByRole('button', { name: 'Save device result', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await openJobSection(page, 'Assets');
  await original.getByRole('button', { name: 'Duplicate Smoke detector 001', exact: true }).click();
  form = page.locator('.assets-create-form');
  for (const [name, value] of [['Asset reference', 'Smoke detector 101'], ['Location (optional)', 'Synthetic training wing'], ['Manufacturer', 'Synthetic manufacturer'], ['Model', 'Training model']])
    await expect(form.getByLabel(name, { exact: true })).toHaveValue(value);
  await expect(form.locator('textarea[name="description"]')).toHaveValue('Reusable synthetic detector specification.');
  await saveAsset(page, 'Create duplicate');
  let saved = (await stored(page, 'jobs'))[0];
  const duplicate = saved.assetRegister.assets.find(asset => asset.reference === 'Smoke detector 101');
  const originalAsset = saved.assetRegister.assets.find(asset => asset.reference === 'Smoke detector 001');
  expect(duplicate).toMatchObject({ location: 'Synthetic training wing', x: null, y: null, photos: [] });
  expect(duplicate.id).not.toBe(originalAsset.id);
  expect(saved.results.find(result => result.assetId === duplicate.id)).toMatchObject({ state: 'Not tested', notes: '', observations: '', defects: '', readings: [], photos: [] });
  expect(saved.results.find(result => result.assetId === originalAsset.id)).toMatchObject({ state: 'Satisfactory', notes: 'Evidence belongs to the first physical detector only.' });
  expect(saved.results.find(result => result.assetId === originalAsset.id).photos).toHaveLength(1);

  await page.getByRole('button', { name: 'Quick add Heat detectors', exact: true }).click();
  form = page.locator('.assets-create-form');
  await form.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('2');
  const beforeFailure = await stored(page, 'jobs');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') {
        IDBDatabase.prototype.transaction = original;
        throw new DOMException('Synthetic batch save failure', 'QuotaExceededError');
      }
      return original.call(this, stores, mode, options);
    };
  });
  await form.getByRole('button', { name: 'Add 2 assets', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(form.locator('.assets-editor-error')).toBeVisible();
  await expect(form.getByRole('spinbutton', { name: 'Quantity', exact: true })).toHaveValue('2');
  await expect(form.getByLabel('Asset reference', { exact: true })).toHaveValue('Heat detector 001');
  expect(await stored(page, 'jobs')).toEqual(beforeFailure);
  await saveAsset(page, 'Add 2 assets');
  await page.reload();
  await expect(page.locator('#offline-status')).toHaveText('Ready offline');
  await page.getByTestId('job-card').click();
  await openJobSection(page, 'Assets');
  await expect(page.locator('.assets-total')).toHaveText('103');
  await expect(original.getByRole('button', { name: 'Pass', exact: true })).toHaveAttribute('aria-pressed', 'true');
  saved = (await stored(page, 'jobs'))[0];
  expect(new Set(saved.assetRegister.assets.map(asset => asset.id)).size).toBe(103);
  expect(new Set(saved.results.map(result => result.id)).size).toBe(103);
  expect(saved.results.filter(result => result.state === 'Not tested')).toHaveLength(102);
  const exported = await exportData(page);
  expect(exported.data.job.assetRegister).toEqual(saved.assetRegister);
  expect(exported.data.job.results).toEqual(saved.results);
  expect(exported.data.job.results.filter(result => result.photos.length)).toHaveLength(1);
});
