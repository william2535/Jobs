import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateJobPackage } from '../src/packages.js';
import { fillJobCreation } from './helpers/job-creation.js';

const zoneFixture = resolve('public/demo.zonesketch.json');
const zoneSave = JSON.parse(await readFile(zoneFixture, 'utf8'));

async function createSite(page, name = 'Synthetic site folder') {
  await page.goto('/');
  await page.locator('[data-action="sites"]').first().click();
  await page.locator('[data-form="site"]').getByRole('textbox', { name: 'Site name', exact: true }).fill(name);
  await page.locator('[data-form="site"]').getByRole('textbox', { name: 'Address', exact: true }).fill('Training address only');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function createJob(page) {
  await page.locator('[data-action="create"]').last().click();
  await fillJobCreation(page);
  await page.locator('[data-form="job"]').getByRole('button', { name: 'Create job', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function exportJob(page) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.job-toolbar').getByRole('button', { name: 'Export job', exact: true }).click();
  const download = await downloadPromise;
  const input = await readFile(await download.path(), 'utf8');
  return { input, data: validateJobPackage(input) };
}
async function hold(page, target) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(3100);
  await page.mouse.up();
}
async function saveEditor(page, label) {
  await page.locator('.wf-editor').getByRole('button', { name: label, exact: true }).click();
  await expect(page.locator('.wf-editor')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function addDetails(page, group) {
  await page.getByTestId('add-job-details').locator('summary').click();
  await page.getByRole('button', { name: group, exact: true }).click();
}
async function capture(page, file, fullPage = true) {
  await mkdir('docs/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve('docs/screenshots', file), fullPage });
}
async function pngSource(page) {
  await expect(page.getByTestId('plan-png')).toBeVisible();
  await expect.poll(() => page.getByTestId('plan-png').evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy();
  return page.getByTestId('plan-png').getAttribute('src');
}

async function savedSites(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('sites', 'readonly');
      const sites = transaction.objectStore('sites').getAll();
      transaction.oncomplete = () => { db.close(); resolve(sites.result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
}

async function respondToGuard(page, button, response) {
  const handled = new Promise(resolve => page.once('dialog', async dialog => {
    const message = dialog.message();
    await dialog[response]();
    resolve(message);
  }));
  await button.click();
  return handled;
}

test('saving one site form protects the other unfinished draft until explicitly discarded', async ({ page }) => {
  await createSite(page, 'Synthetic draft protection site');
  const profile = page.locator('.site-profile');
  const equipment = page.locator('[data-form="asset"]');
  const initialSaved = await savedSites(page);
  await profile.getByRole('textbox', { name: 'Client', exact: true }).fill('Synthetic unsaved client');
  await equipment.getByRole('textbox', { name: 'Device reference', exact: true }).fill('DRAFT-01');
  await equipment.getByRole('textbox', { name: 'Device type', exact: true }).fill('Smoke detector');

  expect(await respondToGuard(page, equipment.getByRole('button', { name: 'Add device', exact: true }), 'dismiss')).toContain('discard the unsaved site details');
  await expect(profile.getByRole('textbox', { name: 'Client', exact: true })).toHaveValue('Synthetic unsaved client');
  await expect(equipment.getByRole('textbox', { name: 'Device reference', exact: true })).toHaveValue('DRAFT-01');
  await expect(equipment.getByRole('textbox', { name: 'Device type', exact: true })).toHaveValue('Smoke detector');
  expect(await savedSites(page)).toEqual(initialSaved);

  expect(await respondToGuard(page, profile.getByRole('button', { name: 'Save site details', exact: true }), 'dismiss')).toContain('discard the unfinished equipment entry');
  await expect(profile.getByRole('textbox', { name: 'Client', exact: true })).toHaveValue('Synthetic unsaved client');
  await expect(equipment.getByRole('textbox', { name: 'Device reference', exact: true })).toHaveValue('DRAFT-01');
  await expect(equipment.getByRole('textbox', { name: 'Device type', exact: true })).toHaveValue('Smoke detector');
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  expect(await savedSites(page)).toEqual(initialSaved);

  expect(await respondToGuard(page, profile.getByRole('button', { name: 'Save site details', exact: true }), 'accept')).toContain('discard the unfinished equipment entry');
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(profile.getByRole('textbox', { name: 'Client', exact: true })).toHaveValue('Synthetic unsaved client');
  await expect(equipment.getByRole('textbox', { name: 'Device reference', exact: true })).toHaveValue('');
  await expect(equipment.getByRole('textbox', { name: 'Device type', exact: true })).toHaveValue('');
  const profileSaved = await savedSites(page);
  expect(profileSaved).toHaveLength(1);
  expect(profileSaved[0].id).toBe(initialSaved[0].id);
  expect(profileSaved[0].profile.client).toBe('Synthetic unsaved client');
  expect(profileSaved[0].drawings.at(-1).assets).toEqual([]);

  await equipment.getByRole('textbox', { name: 'Device reference', exact: true }).fill('SAVED-02');
  await equipment.getByRole('textbox', { name: 'Device type', exact: true }).fill('Manual call point');
  await equipment.getByRole('button', { name: 'Add device', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  const equipmentSaved = await savedSites(page);
  expect(equipmentSaved[0].profile.client).toBe('Synthetic unsaved client');
  expect(equipmentSaved[0].drawings.at(-1).assets).toHaveLength(1);
  expect(equipmentSaved[0].drawings.at(-1).assets[0]).toMatchObject({ reference: 'SAVED-02', type: 'Manual call point' });
});

test('site folder comes first, supplies recorded details, and jobs edit and reopen offline without empty boxes', async ({ page, context, browser }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('[data-action="create"]').first()).toBeDisabled();
  await expect(page.locator('[data-action="create-blank"]')).toHaveCount(0);
  await expect(page.locator('[data-form="job"]')).toHaveCount(0);
  await createSite(page);
  const profile = page.locator('.site-profile');
  await profile.getByRole('textbox', { name: 'Client', exact: true }).fill('Synthetic Training Client');
  await profile.getByRole('textbox', { name: 'Contact phone', exact: true }).fill('01234 000000');
  await profile.getByRole('textbox', { name: 'Access procedure', exact: true }).fill('Meet the training manager at reception.');
  await profile.getByRole('textbox', { name: 'Instructions', exact: true }).fill('Confirm access before the visit.');
  await profile.getByRole('button', { name: 'Save site details', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.locator('[data-action="create"]').last().click();
  await expect(page.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'System reference', exact: true })).toHaveCount(0);
  await fillJobCreation(page);
  await page.locator('[data-form="job"]').getByRole('button', { name: 'Create job', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
  const initial = await exportJob(page);
  expect(initial.data.site.name).toBe('Synthetic site folder');
  expect(initial.data.job.siteId).toBe(initial.data.site.id);
  expect(initial.data.job.discipline).toBe('Fire');
  expect(initial.data.job.workType).toBe('Maintenance');
  expect(initial.data.job.instructions).toBe('Confirm access before the visit.');
  expect(initial.data.job.system).toBe('');
  expect(initial.data.job.engineer).toBe('');
  expect(initial.data.job.visitDate || '').toBe('');
  expect(initial.data.job.results).toEqual([]);
  expect(initial.data.job.workflow.details.client).toBe('Synthetic Training Client');
  expect(initial.data.job.workflow.details.contactPhone).toBe('01234 000000');
  expect(initial.data.job.workflow.details.accessProcedure).toBe('Meet the training manager at reception.');
  await expect(page.locator('.wf-readout[data-hold-field="contactPhone"]')).toContainText('01234 000000');
  await expect(page.locator('.wf-readout[data-hold-field="contactEmail"]')).toHaveCount(0);
  await expect(page.locator('.wf-readout[data-hold-field="serviceRequirements"]')).toHaveCount(0);
  await expect(page.locator('.wf-readout.is-empty')).toHaveCount(0);

  if (testInfo.project.name === 'mobile-chromium') {
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, 'mobile-site-job.png');
    await capture(page, 'mobile-site-job-screen.png', false);
    await page.setViewportSize({ width: 320, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await capture(page, 'mobile-site-job-320.png');
    await page.setViewportSize({ width: 390, height: 844 });
  } else await capture(page, 'desktop-site-job.png');

  await addDetails(page, 'Job overview');
  await page.getByRole('textbox', { name: 'Job title', exact: true }).fill('Synthetic editable visit');
  await page.getByRole('textbox', { name: 'Job reference', exact: true }).fill('SYN-SITE-01');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('A description to clear');
  await saveEditor(page, 'Save job overview');
  await expect(page.locator('.wf-readout[data-hold-field="description"]')).toHaveCount(1);
  const title = page.locator('.wf-readout[data-hold-field="title"]');
  await title.click();
  await expect(page.locator('.wf-editor')).toHaveCount(0);
  await hold(page, title);
  await expect(page.getByRole('textbox', { name: 'Job title', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Job title', exact: true }).fill('Synthetic editable site visit');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('');
  if (testInfo.project.name === 'mobile-chromium') {
    await capture(page, 'mobile-hold-editor.png');
    await capture(page, 'mobile-hold-editor-screen.png', false);
  }
  await saveEditor(page, 'Save job overview');
  await expect(page.locator('.wf-readout[data-hold-field="description"]')).toHaveCount(0);

  const siteName = page.locator('header .job-site-link');
  await siteName.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-page', 'site');
  await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
  await page.locator('.site-profile').getByRole('textbox', { name: 'Address', exact: true }).fill('Updated training address');
  await page.locator('.site-profile').getByRole('button', { name: 'Save site details', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.getByTestId('site-job-card').click();
  await page.getByRole('button', { name: '‹ Home', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-page', 'home');
  await page.getByTestId('job-card').click();
  await page.locator('[data-wf-action="edit:instructions"]').click();
  await expect(page.getByRole('combobox', { name: 'Job type', exact: true })).toHaveValue('Maintenance');
  await page.getByRole('textbox', { name: 'Assigned engineer', exact: true }).fill('Synthetic engineer');
  await saveEditor(page, 'Save scope & assignment');

  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await expect(page.getByRole('heading', { name: 'Synthetic editable site visit', exact: true })).toBeVisible();
  const edited = await exportJob(page);
  expect(edited.data.job.id).toBe(initial.data.job.id);
  expect(edited.data.site.id).toBe(initial.data.site.id);
  expect(edited.data.site.name).toBe('Synthetic site folder');
  expect(edited.data.site.address).toBe('Updated training address');
  expect(edited.data.site.profile.contactPhone).toBe('01234 000000');
  expect(edited.data.job.workType).toBe('Maintenance');
  expect(edited.data.job.system).toBe('');
  expect(edited.data.job.engineer).toBe('Synthetic engineer');
  expect(edited.data.job.results).toEqual([]);

  const receiving = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await receiving.newPage();
    await reopened.goto('/');
    await reopened.locator('#job-file').setInputFiles({ name: 'site-job.jobs.json', mimeType: 'application/json', buffer: Buffer.from(edited.input) });
    await expect(reopened.getByRole('heading', { name: 'Synthetic editable site visit', exact: true })).toBeVisible();
    const returned = await exportJob(reopened);
    expect(returned.data.job.id).toBe(edited.data.job.id);
    expect(returned.data.site.id).toBe(edited.data.site.id);
    expect(returned.data.job.workflow).toEqual(edited.data.job.workflow);
    expect(returned.data.site.profile).toEqual(edited.data.site.profile);
  } finally { await receiving.close(); }
});

test('a site job receives its Zone Sketch plan without duplicating the named folder or passing devices', async ({ page }) => {
  await createSite(page);
  await createJob(page);
  const initial = await exportJob(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.locator('.job-title [data-job-edit="finalisation"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Visit status', exact: true })).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Visit status', exact: true })).toHaveValue('Open');
  await page.locator('.wf-editor').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import Zone Sketch plan', exact: true }).click();
  await (await chooserPromise).setFiles(zoneFixture);
  await expect(page.locator('#match-site')).toHaveValue(initial.data.site.id);
  await page.getByRole('button', { name: 'Apply plan to job', exact: true }).click();
  await pngSource(page);
  const withPlan = await exportJob(page);
  expect(withPlan.data.job.id).toBe(initial.data.job.id);
  expect(withPlan.data.site.id).toBe(initial.data.site.id);
  expect(withPlan.data.site.name).toBe('Synthetic site folder');
  expect(withPlan.data.site.drawings.some(drawing => drawing.id === initial.data.job.drawingId)).toBe(true);
  const drawing = withPlan.data.site.drawings.find(drawing => drawing.id === withPlan.data.job.drawingId);
  expect(drawing.source).toEqual(zoneSave);
  expect(drawing.assets).toHaveLength(4);
  expect(withPlan.data.job.results).toHaveLength(4);
  expect(withPlan.data.job.results.every(result => result.state === 'Not tested')).toBe(true);
  await page.locator('[data-action="home"]').first().click();
  await expect(page.getByTestId('job-card')).toHaveCount(1);
  await page.locator('[data-action="sites"]').first().click();
  await expect(page.locator('.site-card')).toHaveCount(1);
});

test('each visit keeps its included map when the site gains a newer drawing', async ({ page, browser }, testInfo) => {
  await page.goto('/');
  await page.locator('#zone-file').setInputFiles(zoneFixture);
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  const sitePNG = await pngSource(page);
  await createJob(page);
  const original = await exportJob(page);
  const originalDrawing = original.data.site.drawings.find(drawing => drawing.id === original.data.job.drawingId);
  const originalPreview = originalDrawing.planPreviews.find(preview => !preview.snapshotId);
  expect(originalPreview.image).toBe(sitePNG);
  expect(originalPreview.image).toMatch(/^data:image\/png;base64,/);
  const originalBytes = Buffer.from(originalPreview.image.split(',')[1], 'base64');
  expect(originalBytes.length).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  expect(await pngSource(page)).toBe(sitePNG);

  const revisedSource = structuredClone(zoneSave);
  revisedSource.project.meta.revision = 'C02-FOLDER';
  const floor = revisedSource.project.floors[0];
  floor.data.symbols.find(symbol => symbol.reference === 'FAP-01').x = 0.55;
  for (const [key, value] of Object.entries(floor.data)) revisedSource.project[key] = structuredClone(value);
  await page.locator('header .job-site-link').click();
  await expect(page.getByTestId('site-job-card')).toHaveCount(1);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-action="import-site-plan"]').click();
  await (await chooserPromise).setFiles({ name: 'synthetic-revision.zonesketch.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(revisedSource)) });
  await expect(page.locator('#match-site')).toHaveValue(original.data.site.id);
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  expect(await pngSource(page)).not.toBe(sitePNG);
  await expect(page.getByTestId('site-job-card')).toHaveCount(1);
  await page.getByTestId('site-job-card').click();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  expect(await pngSource(page)).toBe(sitePNG);
  const preserved = await exportJob(page);
  expect(preserved.data.site.id).toBe(original.data.site.id);
  expect(preserved.data.site.drawings).toHaveLength(2);
  expect(preserved.data.job.drawingId).toBe(original.data.job.drawingId);
  expect(preserved.data.site.drawings.find(drawing => drawing.id === originalDrawing.id)).toEqual(originalDrawing);
  expect(preserved.data.job.results).toEqual(original.data.job.results);
  expect(preserved.data.site.drawings.at(-1).source).toEqual(revisedSource);

  const receiving = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await receiving.newPage();
    await reopened.goto('/');
    await reopened.locator('#job-file').setInputFiles({ name: 'pinned-map.jobs.json', mimeType: 'application/json', buffer: Buffer.from(preserved.input) });
    await expect(reopened.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
    await expect.poll(() => reopened.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
    await receiving.setOffline(true);
    await reopened.reload();
    await reopened.getByTestId('job-card').click();
    await reopened.getByRole('button', { name: 'Plan', exact: true }).click();
    expect(await pngSource(reopened)).toBe(sitePNG);
    const returned = await exportJob(reopened);
    const returnedDrawing = returned.data.site.drawings.find(drawing => drawing.id === returned.data.job.drawingId);
    expect(returned.data.job.drawingId).toBe(original.data.job.drawingId);
    expect(returnedDrawing.source).toEqual(zoneSave);
    expect(Buffer.from(returnedDrawing.planPreviews.find(preview => !preview.snapshotId).image.split(',')[1], 'base64')).toEqual(originalBytes);
  } finally { await receiving.close(); }
});
