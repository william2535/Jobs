import { test, expect } from '@playwright/test';
import { newSite, newJob } from '../src/model.js';
import { createJobPackage } from '../src/packages.js';

async function gridPackage() {
  const site = newSite('Synthetic equipment grid');
  const drawing = site.drawings[0];
  drawing.assets = Array.from({ length: 40 }, (_, i) => ({
    id: `grid-asset-${i + 1}`,
    floorId: drawing.floors[0].id,
    floorName: 'Ground floor',
    type: 'smoke',
    reference: `SD-${String(i + 1).padStart(2, '0')}`,
    photos: [],
    drawingStatus: 'Existing',
  }));
  const job = newJob(site, { engineer: 'Test Engineer', scope: 'Synthetic navigation test' });
  job.results[5].state = 'Unsatisfactory';
  job.results[5].observations = 'Synthetic defect for filtering.';
  job.results[9].state = 'Inaccessible';
  job.results[9].notes = 'Synthetic access limitation.';
  job.results[0].state = 'Satisfactory';
  return createJobPackage(site, job);
}

test('device grid finds equipment without a long list and keeps edits safe between records', async ({ page }, testInfo) => {
  const pack = await gridPackage();
  await page.goto('/');
  await page.locator('#job-file').setInputFiles({ name: 'grid.jobs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await page.getByRole('button', { name: 'Devices', exact: true }).click();
  const cards = page.locator('.device-browser-grid > button');
  const pageSize = await page.evaluate(() => window.matchMedia('(max-width: 700px)').matches ? 4 : 8);
  await expect(cards).toHaveCount(pageSize);
  await expect(cards.first()).toContainText('SD-01');
  await expect(page.getByRole('combobox', { name: 'Result', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next devices', exact: true }).click();
  await expect(cards.first()).toContainText(`SD-${String(pageSize + 1).padStart(2, '0')}`);
  await page.getByRole('button', { name: 'Previous devices', exact: true }).click();
  await expect(cards.first()).toContainText('SD-01');

  await page.locator('#device-search').fill('SD-37');
  await expect(cards).toHaveCount(1);
  await cards.click();
  await expect(page.locator('.device-editor h2')).toHaveText('SD-37');
  await expect.poll(async () => {
    const back = await page.getByRole('button', { name: /Back to devices/ }).boundingBox();
    const header = await page.locator('header').boundingBox();
    return back.y >= header.y + header.height - 1;
  }).toBeTruthy();
  await page.getByRole('button', { name: /Back to devices/ }).click();
  await expect(page.locator('#device-search')).toHaveValue('SD-37');
  await page.locator('#device-search').fill('');
  await page.locator('#device-state').selectOption('Unsatisfactory');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('SD-06');
  await page.locator('#device-state').selectOption('Not tested');
  await expect(cards).toHaveCount(pageSize);
  await expect(cards.first()).toContainText('SD-02');
  await page.locator('#device-state').selectOption('');
  await cards.first().click();
  await expect(page.locator('.device-editor h2')).toHaveText('SD-01');

  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Keep this draft until I save it.');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Next device', exact: true }).click();
  await expect(page.locator('.device-editor h2')).toHaveText('SD-01');
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Keep this draft until I save it.');
  await page.getByRole('button', { name: 'Save device result', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Work saved');
  await page.getByRole('button', { name: 'Next device', exact: true }).click();
  await expect(page.locator('.device-editor h2')).toHaveText('SD-02');
  await page.getByRole('button', { name: 'Previous device', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Keep this draft until I save it.');
  await page.locator('#device-jump').selectOption('grid-asset-40');
  await expect(page.locator('.device-editor h2')).toHaveText('SD-40');
  await page.getByRole('button', { name: /Back to devices/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.screenshot({ path: testInfo.outputPath('device-grid-40.png'), fullPage: true });

  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: 'Devices', exact: true }).click();
  await expect(cards).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const gridBox = await page.locator('.device-browser-grid').boundingBox();
  expect(gridBox.height).toBeLessThan(700);
  await page.locator('[data-action="home"]').first().click();
  const actions = page.locator('.quick-actions > button, .mw-shortcuts > button');
  await expect(actions).toHaveCount(4);
  const first = await actions.nth(0).boundingBox();
  const second = await actions.nth(1).boundingBox();
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
