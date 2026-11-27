import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateJobPackage } from '../src/packages.js';
import { fillJobCreation, saveJobCreation, openJobSection, clickExportJob } from './helpers/job-creation.js';

const fixture = resolve('public/demo.zonesketch.json');

async function createVisit(page) {
  await page.goto('/');
  await page.locator('#zone-file').setInputFiles(fixture);
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
  const profile = page.locator('.site-profile');
  await profile.getByRole('textbox', { name: 'Assigned engineer', exact: true }).fill('Synthetic checklist engineer');
  await profile.getByRole('textbox', { name: 'Scope of work', exact: true }).fill('Service the training fire alarm within the agreed visit scope.');
  await profile.getByRole('button', { name: 'Save site details', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.locator('[data-action="create"]').last().click();
  await fillJobCreation(page, { description: 'Synthetic scheduled fire alarm maintenance' });
  await saveJobCreation(page);
  await expect(page.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
}

async function openChecklist(page) {
  await openJobSection(page, 'Checklist');
  await expect(page.locator('.job-checklist')).toBeVisible();
  return page.locator('.job-checklist');
}

async function exportJob(page) {
  const download = await clickExportJob(page);
  expect(download.suggestedFilename()).toMatch(/\.jobs\.json$/);
  const input = await readFile(await download.path(), 'utf8');
  return { input, data: validateJobPackage(input) };
}

async function importJob(page, input, name = 'checklist.jobs.json') {
  await page.locator('#job-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(input) });
}

async function rejectNavigation(page, control) {
  const handled = new Promise(resolve => page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('discard unsaved changes');
    await dialog.dismiss();
    resolve();
  }));
  await control.click();
  await handled;
  await expect(page.locator('.job-checklist')).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
}

async function saveChecklist(page) {
  await page.locator('.job-checklist').getByRole('button', { name: 'Save checklist', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(page.locator('.checklist-save-state')).toContainText('saved on this device');
}

async function savedJob(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('jobs', 'readonly');
      const records = transaction.objectStore('jobs').getAll();
      transaction.oncomplete = () => { db.close(); resolve(records.result[0]); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
}

test('quick checklist produces truthful draft documents and travels with the offline job package', async ({ page, context, browser }, testInfo) => {
  await createVisit(page);
  const checklist = await openChecklist(page);
  await expect(checklist).toContainText('Fire · Maintenance');
  await expect(checklist.locator('.checklist-evidence')).toContainText('4 Not tested');
  await expect(checklist.locator('[name="engineer"]')).toHaveValue('Synthetic checklist engineer');
  await expect(checklist.locator('[name="scope"]')).toHaveValue('Service the training fire alarm within the agreed visit scope.');
  await expect(checklist.locator('[name="company"]')).toHaveValue('');
  await expect(checklist.locator('[name="visitDate"]')).toHaveValue('');
  await expect(checklist.locator('[name="standard"]')).toHaveValue('');

  const access = checklist.locator('[data-entry="scope-access"]');
  await access.getByRole('combobox').selectOption('Recorded');
  await access.locator('summary').click();
  await access.getByRole('textbox').fill('Agreed training scope and access with the site contact.');
  const power = checklist.locator('[data-entry="fire-supply"]');
  await power.getByRole('combobox').selectOption('Not applicable');
  await power.getByRole('textbox').fill('Remote document review only; on-site supply checks are excluded and need a follow-up visit.');
  await checklist.locator('.checklist-visit-details > summary').click();
  await checklist.locator('[name="company"]').fill('Synthetic Training Company');
  await checklist.locator('[name="visitDate"]').fill('2026-11-14');
  await checklist.locator('[name="standard"]').fill('BS 5839-1:2025 — scope to be reviewed by the responsible engineer');
  await checklist.locator('[name="premisesScope"]').fill('Synthetic non-domestic training premises; document review only.');
  await checklist.locator('[name="limitations"]').fill('No physical device tests performed during this document review.');
  await checklist.locator('[name="conditionLeft"]').fill('No physical changes made; existing condition not established.');
  await checklist.locator('[name="nextActions"]').fill('Arrange the outstanding physical inspection and tests.');
  await saveChecklist(page);
  const first = await exportJob(page);
  expect(first.data.job.results.every(result => result.state === 'Not tested')).toBe(true);
  expect(first.data.job.checklist.entries.find(entry => entry.id === 'scope-access').state).toBe('Recorded');
  expect(first.data.job.checklist.entries.find(entry => entry.id === 'fire-supply').state).toBe('Not applicable');

  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await openChecklist(page);
  await expect(checklist.locator('[data-entry="scope-access"] select')).toHaveValue('Recorded');
  await expect(checklist.locator('[data-entry="fire-supply"] textarea')).toHaveValue('Remote document review only; on-site supply checks are excluded and need a follow-up visit.');
  await checklist.locator('[data-entry="scope-access"] textarea').fill('Agreed scope retained; further notes saved offline.');
  await saveChecklist(page);
  await page.evaluate(() => {
    window.print = () => { window.__checklistPrinted = document.querySelector('#print-report')?.textContent || ''; };
  });
  await checklist.getByRole('button', { name: 'Print draft report', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.__checklistPrinted)).toBe('string');
  const printed = await page.evaluate(() => window.__checklistPrinted);
  expect(printed).toContain('Draft Fire maintenance report');
  expect(printed).toContain('Not a certificate of compliance');
  expect(printed).toContain('4 device results remain Not tested');
  expect(printed).toContain('further notes saved offline');
  expect(printed).toContain('Synthetic Training Company');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.screenshot({ path: testInfo.outputPath('quick-checklist.png'), fullPage: true });
  const exported = await exportJob(page);
  expect(exported.data.job.checklist.id).toBe(first.data.job.checklist.id);
  expect(exported.data.job.checklist.revision).toBe(first.data.job.checklist.revision + 1);
  expect(exported.data.job.results).toEqual(first.data.job.results);
  expect(exported.data.site.drawings).toEqual(first.data.site.drawings);

  const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await fresh.newPage();
    await reopened.goto('/');
    await importJob(reopened, exported.input);
    await expect(reopened.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
    await openChecklist(reopened);
    await expect(reopened.locator('.job-checklist [name="company"]')).toHaveValue('Synthetic Training Company');
    const roundtrip = await exportJob(reopened);
    expect(roundtrip.data.job.checklist).toEqual(exported.data.job.checklist);
    expect(roundtrip.data.job.results).toEqual(exported.data.job.results);
    expect(roundtrip.data.site.drawings).toEqual(exported.data.site.drawings);
    await importJob(reopened, exported.input);
    await expect(reopened.locator('#notice')).toContainText('already saved');
    await reopened.getByRole('button', { name: '‹ Home', exact: true }).click();
    await expect(reopened.getByTestId('job-card')).toHaveCount(1);
    const invalid = JSON.parse(exported.input);
    invalid.job.checklist.version = 999;
    await importJob(reopened, JSON.stringify(invalid), 'invalid-checklist.jobs.json');
    await expect(reopened.locator('#notice')).toContainText('Job import rejected');
    await expect(reopened.getByTestId('job-card')).toHaveCount(1);
    expect((await savedJob(reopened)).checklist).toEqual(exported.data.job.checklist);
  } finally { await fresh.close(); }
});

test('checklist exclusions need reasons and failed saves or cancelled navigation preserve the draft', async ({ page }) => {
  await createVisit(page);
  const before = await savedJob(page);
  const checklist = await openChecklist(page);
  const power = checklist.locator('[data-entry="fire-supply"]');
  await power.getByRole('combobox').selectOption('Not applicable');
  await checklist.getByRole('button', { name: 'Save checklist', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await expect(power.getByRole('textbox')).toBeVisible();
  expect(await power.getByRole('textbox').evaluate(field => field.validity.valueMissing)).toBe(true);
  expect((await savedJob(page)).checklist).toBeUndefined();
  await rejectNavigation(page, page.getByRole('button', { name: '‹ Home', exact: true }));
  await rejectNavigation(page, page.locator('header .job-site-link'));
  await expect(power.getByRole('combobox')).toHaveValue('Not applicable');
  await power.getByRole('textbox').fill('Document review only; physical checks are not within this visit scope.');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') {
        IDBDatabase.prototype.transaction = original;
        throw new DOMException('Synthetic storage failure for checklist save', 'QuotaExceededError');
      }
      return original.call(this, stores, mode, options);
    };
  });
  await checklist.getByRole('button', { name: 'Save checklist', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(checklist.locator('.checklist-error')).toContainText('not saved');
  await expect(power.getByRole('textbox')).toHaveValue('Document review only; physical checks are not within this visit scope.');
  await expect(checklist.getByRole('button', { name: 'Save checklist', exact: true })).toBeEnabled();
  const unchanged = await savedJob(page);
  expect(unchanged.checklist).toBeUndefined();
  expect(unchanged.revision).toBe(before.revision);
  expect(unchanged.results).toEqual(before.results);
  await saveChecklist(page);
  const saved = await savedJob(page);
  expect(saved.checklist.entries.find(entry => entry.id === 'fire-supply').notes).toContain('Document review only');
  expect(saved.results).toEqual(before.results);
});
