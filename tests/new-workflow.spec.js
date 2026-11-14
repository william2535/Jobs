import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateJobPackage } from '../src/packages.js';
import { fillJobCreation, saveJobCreation, openJobSection, clickExportJob } from './helpers/job-creation.js';

const fixture = resolve('public/demo.zonesketch.json');
const sample = JSON.parse(await readFile(fixture, 'utf8'));
async function createJob(page) {
  await page.goto('/');
  await page.locator('#zone-file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
  await page.locator('.site-profile').getByRole('textbox', { name: 'Assigned engineer', exact: true }).fill('Test Engineer');
  await page.locator('.site-profile').getByRole('textbox', { name: 'Scope of work', exact: true }).fill('Synthetic complete workflow');
  await page.locator('.site-profile').getByRole('button', { name: 'Save site details', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.locator('[data-action="create"]').last().click();
  await fillJobCreation(page, { description: 'Synthetic complete workflow' });
  await saveJobCreation(page);
  await expect(page.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
}
async function section(page, name) {
  await openJobSection(page, name === 'Finalisation' ? 'Visit records' : name);
}
async function saveEditor(page, name) {
  await page.locator('.wf-editor').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.wf-editor')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function exportJob(page) {
  const download = await clickExportJob(page);
  expect(download.suggestedFilename()).toMatch(/^job-.+\.jobs\.json$/);
  const input = await readFile(await download.path(), 'utf8');
  return { input, data: validateJobPackage(input) };
}
async function screenshot(page, path) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.screenshot({ path, fullPage: true });
}

test('editable visit sections retain work, materials, purchase records and finalisation offline', async ({ page, context, browser }, testInfo) => {
  await createJob(page);
  await page.locator('[data-wf-action="edit:overview"]').click();
  await page.getByRole('textbox', { name: 'Job reference', exact: true }).fill('JOB-SYN-001');
  await page.getByRole('textbox', { name: 'Job title', exact: true }).fill('Training alarm service');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Synthetic first visit');
  await page.getByRole('spinbutton', { name: 'Estimated duration (hours)', exact: true }).fill('2.5');
  await saveEditor(page, 'Save job overview');
  await page.locator('[data-wf-action="edit:instructions"]').click();
  await page.getByRole('textbox', { name: 'Assigned engineer', exact: true }).fill('Engineer Two');
  await page.getByRole('textbox', { name: 'Instructions', exact: true }).fill('Agree access with training manager.');
  await saveEditor(page, 'Save scope & assignment');
  await page.getByTestId('add-job-details').locator('summary').click();
  await page.getByRole('button', { name: 'Client & contacts', exact: true }).click();
  await page.getByRole('textbox', { name: 'Client', exact: true }).fill('Synthetic Training Client');
  await page.getByRole('textbox', { name: 'Contact name', exact: true }).fill('Training Manager');
  await saveEditor(page, 'Save client & contacts');
  await page.getByRole('button', { name: 'Add appointment', exact: true }).click();
  await page.getByLabel('Appointment date', { exact: true }).fill('2026-11-14');
  await page.getByLabel('Start time', { exact: true }).fill('09:00');
  await page.getByLabel('End time', { exact: true }).fill('11:30');
  await saveEditor(page, 'Save appointment');
  await screenshot(page, testInfo.outputPath('details.png'));

  await section(page, 'Work');
  await page.getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('textbox', { name: 'Task title', exact: true }).fill('Agree isolation and access');
  await page.getByRole('checkbox', { name: 'Required action', exact: true }).check();
  await saveEditor(page, 'Save work action');
  await page.locator('.wf-card').filter({ hasText: 'Agree isolation and access' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Action complete', exact: true }).check();
  await page.getByRole('textbox', { name: 'Task notes', exact: true }).fill('Confirmed with training manager.');
  await saveEditor(page, 'Save work action');
  await expect(page.locator('.wf-card').filter({ hasText: 'Agree isolation and access' })).toContainText('Complete');
  await screenshot(page, testInfo.outputPath('work.png'));

  await section(page, 'Products');
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  await page.getByRole('textbox', { name: 'Product / labour description', exact: true }).fill('Synthetic standby battery');
  await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('2');
  await page.getByRole('spinbutton', { name: 'Unit cost', exact: true }).fill('28.50');
  await page.getByRole('checkbox', { name: 'Used / completed', exact: true }).check();
  await saveEditor(page, 'Save product or labour');
  await page.locator('.wf-card').filter({ hasText: 'Synthetic standby battery' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('3');
  await saveEditor(page, 'Save product or labour');
  await expect(page.locator('.wf-card').filter({ hasText: 'Synthetic standby battery' })).toContainText('GBP 85.50');
  await screenshot(page, testInfo.outputPath('products.png'));

  await section(page, 'POs');
  await page.getByRole('button', { name: 'Add purchase order', exact: true }).click();
  await page.getByRole('textbox', { name: 'PO reference', exact: true }).fill('SYN-PO-01');
  await page.getByRole('textbox', { name: 'Supplier', exact: true }).fill('Synthetic supplier');
  await page.getByRole('spinbutton', { name: 'Amount', exact: true }).fill('85.50');
  await saveEditor(page, 'Save purchase order record');
  await expect(page.locator('.workflow-module')).toContainText('does not send an order');

  await section(page, 'Finalisation');
  await page.getByRole('button', { name: 'Add time entry', exact: true }).click();
  await page.getByLabel('Work date', { exact: true }).fill('2026-11-14');
  await page.getByLabel('Start time', { exact: true }).fill('09:00');
  await page.getByLabel('End time', { exact: true }).fill('11:30');
  await page.getByRole('textbox', { name: 'Time note', exact: true }).fill('Synthetic engineer attendance.');
  await saveEditor(page, 'Save time entry');
  await page.getByRole('button', { name: 'Edit notes & status', exact: true }).first().click();
  await page.getByRole('combobox', { name: 'Visit status', exact: true }).selectOption('Complete');
  await page.getByRole('textbox', { name: 'Technician note', exact: true }).fill('Visit complete with device checks still unrecorded.');
  await page.getByRole('textbox', { name: 'Invoice note', exact: true }).fill('Internal billing note.');
  await saveEditor(page, 'Save notes & status');
  await expect(page.locator('.workflow-module')).toContainText('4 device results remain Not tested');
  await expect(page.locator('.workflow-module')).toContainText('Total recorded time: 2.5 hours');
  await screenshot(page, testInfo.outputPath('finalisation.png'));

  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const savedPNG = await pngSource(page);

  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await section(page, 'Finalisation');
  await page.getByRole('button', { name: 'Edit notes & status', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Technician note', exact: true }).fill('Saved offline; all unresolved checks remain visible.');
  await saveEditor(page, 'Save notes & status');
  const exported = await exportJob(page, '.workflow-module');
  expect(exported.data.job.engineer).toBe('Engineer Two');
  expect(exported.data.job.workflow.details.reference).toBe('JOB-SYN-001');
  expect(exported.data.job.workflow.appointments).toHaveLength(1);
  expect(exported.data.job.workflow.tasks).toHaveLength(1);
  expect(exported.data.job.workflow.tasks[0].complete).toBe(true);
  expect(exported.data.job.workflow.products[0].quantity).toBe(3);
  expect(exported.data.job.workflow.purchaseOrders[0].status).toBe('Draft');
  expect(exported.data.job.workflow.timesheets[0].hours).toBe(2.5);
  expect(exported.data.job.status).toBe('Complete');
  expect(exported.data.job.results.every(result => result.state === 'Not tested')).toBe(true);
  expect(exported.data.job.workflow.finalisation.technicianNote).toContain('Saved offline');
  const savedDrawing = exported.data.site.drawings.find(drawing => drawing.id === exported.data.job.drawingId);
  expect(savedDrawing.planPreviews.some(preview => preview.image === savedPNG)).toBe(true);
  expect(savedDrawing.assets.flatMap(asset => asset.photos || []).length).toBeGreaterThan(0);
  const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await fresh.newPage();
    await reopened.goto('/');
    await reopened.locator('#job-file').setInputFiles({ name: 'returned.jobs.json', mimeType: 'application/json', buffer: Buffer.from(exported.input) });
    await expect(reopened.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
    const roundtrip = await exportJob(reopened);
    expect(roundtrip.data.job.workflow).toEqual(exported.data.job.workflow);
    expect(roundtrip.data.job.results).toEqual(exported.data.job.results);
    expect(roundtrip.data.job.status).toBe('Complete');
    expect(roundtrip.data.site.drawings).toEqual(exported.data.site.drawings);
  } finally { await fresh.close(); }
});


async function pngSource(page) {
  const image = page.getByTestId('plan-png');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBeTruthy();
  const src = await image.getAttribute('src');
  expect(src).toMatch(/^data:image\/png;base64,/);
  expect(Buffer.from(src.split(',')[1], 'base64').subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return src;
}
async function importPlan(page, project, name = 'synthetic-update.zonesketch.json') {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import Zone Sketch plan', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await page.getByRole('button', { name: 'Apply plan to job', exact: true }).click();
  await expect(page.getByTestId('plan-png')).toBeVisible();
  await pngSource(page);
}

test('PNG plans, issued evidence and revised imports survive offline package round trips', async ({ page, context, browser }, testInfo) => {
  await createJob(page);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  const firstPNG = await pngSource(page);
  await expect(page.locator('#plan-root svg')).toHaveCount(0);
  await expect(page.locator('.drawing-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.plan-preview-zoom output')).toHaveText('150%');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(page.locator('.plan-preview-zoom output')).toHaveText('100%');
  await expect.poll(() => page.locator('.plan-preview-viewport').evaluate(viewport => {
    const image = viewport.querySelector('[data-testid="plan-png"]');
    return image.getBoundingClientRect().height <= viewport.clientHeight + 1;
  })).toBeTruthy();
  const firstFloor = await page.getByLabel('Plan floor').inputValue();
  await page.getByLabel('Plan floor').selectOption({ index: 1 });
  await pngSource(page);
  await page.getByLabel('Plan floor').selectOption(firstFloor);
  const snapshotId = await page.getByLabel('Drawing record').locator('option').nth(1).getAttribute('value');
  await page.getByLabel('Drawing record').selectOption(snapshotId);
  const issuedPNG = await pngSource(page);
  await expect(page.locator('.plan-status')).toContainText('Issued');
  await page.getByRole('button', { name: 'FAP-01', exact: true }).click();
  await expect(page.locator('.plan-details')).toContainText('Historical drawing evidence');
  await expect(page.getByRole('combobox', { name: 'Result', exact: true })).toHaveCount(0);
  await screenshot(page, testInfo.outputPath('issued-plan.png'));
  await page.getByLabel('Drawing record').selectOption('');
  await expect(page.getByTestId('plan-png')).toHaveAttribute('src', firstPNG);
  await page.getByRole('button', { name: 'Open MCP-01', exact: true }).click();
  await page.getByRole('combobox', { name: 'Result', exact: true }).selectOption('Unsatisfactory');
  await page.getByRole('textbox', { name: 'Observations', exact: true }).fill('Synthetic call point damaged before revised drawing arrived.');
  await page.getByRole('button', { name: 'Save device result', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Work saved');
  const original = await exportJob(page);
  const originalDrawing = original.data.site.drawings.find(d => d.id === original.data.job.drawingId);
  const removedAsset = originalDrawing.assets.find(asset => asset.reference === 'MCP-01');
  const retainedResult = original.data.job.results.find(result => result.assetId === removedAsset.id);
  expect(originalDrawing.planPreviews.find(preview => preview.floorId === firstFloor && !preview.snapshotId).image).toBe(firstPNG);
  expect(originalDrawing.planPreviews.find(preview => preview.floorId === firstFloor && preview.snapshotId === snapshotId).image).toBe(issuedPNG);

  const incoming = structuredClone(sample);
  incoming.project.meta.revision = 'C02-ZONE';
  const floor = incoming.project.floors[0];
  floor.data.symbols.find(symbol => symbol.reference === 'FAP-01').x = 0.55;
  floor.data.symbols = floor.data.symbols.filter(symbol => symbol.reference !== 'MCP-01');
  floor.data.symbols.push({ ...structuredClone(floor.data.symbols.find(symbol => symbol.reference === 'SD-01')), id: 'synthetic-new-device', reference: 'SD-NEW', x: 0.6, y: 0.6 });
  floor.data.walls.push({ id: 'synthetic-added-wall', points: [{ x: 0.2, y: 0.4 }, { x: 0.4, y: 0.4 }] });
  // Actual saves mirror active-floor fields at project level; retain that shape.
  for (const [key, value] of Object.entries(floor.data)) incoming.project[key] = structuredClone(value);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await importPlan(page, incoming);
  const updatedPNG = await pngSource(page);
  expect(updatedPNG).not.toBe(firstPNG);
  await screenshot(page, testInfo.outputPath('png-plan.png'));
  const revised = await exportJob(page);
  const drawing = revised.data.site.drawings.find(d => d.id === revised.data.job.drawingId);
  expect(drawing.revision).toBe('C02-ZONE');
  expect(drawing.assets.find(asset => asset.reference === 'FAP-01').x).toBe(0.55);
  expect(drawing.assets.some(asset => asset.reference === 'MCP-01')).toBe(false);
  const newAsset = drawing.assets.find(asset => asset.reference === 'SD-NEW');
  expect(revised.data.job.results.find(result => result.assetId === newAsset.id).state).toBe('Not tested');
  expect(revised.data.job.archivedResults.find(record => record.assetId === removedAsset.id).result).toEqual(retainedResult);
  expect(revised.data.site.drawings.find(value => value.id === originalDrawing.id)).toEqual(originalDrawing);
  expect(drawing.issuedSnapshots).toEqual(originalDrawing.issuedSnapshots);
  expect(drawing.planPreviews.find(preview => preview.floorId === firstFloor && !preview.snapshotId).image).toBe(updatedPNG);

  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByTestId('plan-png')).toHaveAttribute('src', updatedPNG);
  await pngSource(page);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  const download = await downloaded;
  expect(await readFile(await download.path())).toEqual(Buffer.from(updatedPNG.split(',')[1], 'base64'));
  const offlineExport = await exportJob(page);
  expect(offlineExport.data.site.drawings).toEqual(revised.data.site.drawings);
  expect(offlineExport.data.job.archivedResults).toEqual(revised.data.job.archivedResults);

  const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await fresh.newPage();
    await reopened.goto('/');
    await reopened.locator('#job-file').setInputFiles({ name: 'png-job.jobs.json', mimeType: 'application/json', buffer: Buffer.from(offlineExport.input) });
    await expect(reopened.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
    await reopened.evaluate(async () => navigator.serviceWorker.ready);
    await expect.poll(() => reopened.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
    await fresh.setOffline(true);
    await reopened.reload();
    await reopened.getByTestId('job-card').click();
    await reopened.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(reopened.getByTestId('plan-png')).toHaveAttribute('src', updatedPNG);
    await pngSource(reopened);
    await reopened.getByLabel('Drawing record').selectOption(snapshotId);
    await pngSource(reopened);
    await expect(reopened.locator('.plan-status')).toContainText('Issued');
    const returned = await exportJob(reopened);
    expect(returned.data.site.drawings).toEqual(offlineExport.data.site.drawings);
    expect(returned.data.job.results).toEqual(offlineExport.data.job.results);
  } finally { await fresh.close(); }
});

test('manual equipment stays unplaced and an unrelated supplied plan preserves its recorded work', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="sites"]').first().click();
  await page.getByRole('textbox', { name: 'Site name', exact: true }).fill('Synthetic unplaced equipment');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await page.getByRole('textbox', { name: 'Device reference', exact: true }).fill('SD-MANUAL');
  await page.getByRole('textbox', { name: 'Device type', exact: true }).fill('smoke');
  await page.getByRole('button', { name: 'Add device', exact: true }).click();
  await page.locator('[data-action="create"]').last().click();
  await fillJobCreation(page);
  await saveJobCreation(page);
  await openJobSection(page, 'Devices');
  await page.getByRole('button', { name: /SD-MANUAL/ }).first().click();
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('Manual check recorded before a supplied plan.');
  await page.getByRole('button', { name: 'Save device result', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.locator('.drawing-editor')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open SD-MANUAL', exact: true })).toHaveCount(0);
  const unplaced = await exportJob(page);
  const oldDrawing = unplaced.data.site.drawings.find(d => d.id === unplaced.data.job.drawingId);
  const asset = oldDrawing.assets.find(a => a.reference === 'SD-MANUAL');
  expect(asset.x == null).toBe(true);
  expect(asset.y == null).toBe(true);

  const located = structuredClone(sample);
  located.project.site = 'Synthetic unplaced equipment';
  located.project.meta.revision = 'A01-LOCATED';
  const floor = located.project.floors[0];
  floor.id = oldDrawing.floors[0].id;
  floor.name = oldDrawing.floors[0].name;
  const symbol = structuredClone(floor.data.symbols.find(value => value.type === 'smoke'));
  symbol.id = 'external-source-smoke';
  symbol.reference = 'SD-MANUAL';
  symbol.x = 0.2;
  symbol.y = 0.4;
  floor.data.symbols = [symbol];
  floor.data.circuits = [];
  floor.data.connections = [];
  located.project.floors = [floor];
  located.project.activeFloor = floor.id;
  located.project.issuedAsFits = [];
  for (const [key, value] of Object.entries(floor.data)) located.project[key] = structuredClone(value);
  await importPlan(page, located, 'located-manual.zonesketch.json');
  await expect(page.getByRole('button', { name: 'Open SD-MANUAL', exact: true })).toBeVisible();
  const placed = await exportJob(page);
  const drawing = placed.data.site.drawings.find(d => d.id === placed.data.job.drawingId);
  const updated = drawing.assets.find(a => a.reference === 'SD-MANUAL');
  // A matching human reference alone must not guess a source identity.
  expect(updated.id).not.toBe(asset.id);
  expect(updated.x).toBe(0.2);
  expect(updated.y).toBe(0.4);
  expect(placed.data.job.results.find(result => result.assetId === updated.id).state).toBe('Not tested');
  expect(placed.data.job.archivedResults.find(record => record.assetId === asset.id).result).toEqual(unplaced.data.job.results[0]);
  expect(placed.data.site.drawings.find(value => value.id === oldDrawing.id)).toEqual(oldDrawing);
});

test('an in-progress local save prevents typing that could otherwise be lost', async ({ page }) => {
  await createJob(page);
  await openJobSection(page, 'Devices');
  await page.locator('.device-browser-grid .device-open').first().click();
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true });
  await notes.fill('The engineer-confirmed note to save.');
  // Hold the save completion signal, modelling a slow device without a timed sleep.
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    let hold = true;
    IDBDatabase.prototype.transaction = function (...args) {
      const transaction = original.apply(this, args);
      if (args[1] === 'readwrite' && hold) {
        hold = false;
        Object.defineProperty(transaction, 'oncomplete', {
          set(callback) {
            transaction.addEventListener('complete', event => {
              window.__writeHeld = true;
              window.__releaseWrite = () => callback.call(transaction, event);
            }, { once: true });
          },
        });
      }
      return transaction;
    };
  });
  await page.getByRole('button', { name: 'Save device result', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!window.__writeHeld)).toBeTruthy();
  await expect(page.getByTestId('save-status')).toContainText('Saving');
  expect(await page.locator('main').evaluate(main => main.inert)).toBe(true);
  await notes.evaluate(input => input.focus());
  await page.keyboard.type('This typing must not become an unsaved replacement.');
  await expect(notes).toHaveValue('The engineer-confirmed note to save.');
  await page.evaluate(() => window.__releaseWrite());
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect.poll(() => page.locator('main').evaluate(main => main.inert)).toBe(false);
  await page.reload();
  await page.getByTestId('job-card').first().click();
  await openJobSection(page, 'Devices');
  await page.locator('.device-browser-grid .device-open').first().click();
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('The engineer-confirmed note to save.');
});
