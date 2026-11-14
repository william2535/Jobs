import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateJobPackage } from '../src/packages.js';
import { clickExportJob, openJobSection } from './helpers/job-creation.js';

async function records(page, store) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(name, 'readonly'), values = tx.objectStore(name).getAll();
      tx.oncomplete = () => { db.close(); resolve(values.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), store);
}
async function saveNotes(page) {
  await page.locator('.job-notes').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function moreSettings(page) {
  await page.getByRole('button', { name: 'Job settings', exact: true }).click();
  await page.locator('.job-settings-more > summary').click();
  return page.locator('.job-settings');
}
async function saveSettings(page) {
  await page.locator('.job-settings').getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}

test('a blank job needs no site, saves only on Save and opens as notes with settings on its card', async ({ page, browser }, testInfo) => {
  await page.goto('/');
  const create = page.locator('[data-action="create"]').first();
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.locator('.job-notes')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Job notes', exact: true })).toBeVisible();
  await expect(page.locator('[data-form="job"]')).toHaveCount(0);
  await expect(page.locator('.job-notes').getByRole('textbox', { name: 'Job title', exact: true })).toHaveValue('');
  expect(await records(page, 'jobs')).toHaveLength(0);
  expect(await records(page, 'sites')).toHaveLength(0);
  await saveNotes(page);
  const saved = (await records(page, 'jobs'))[0];
  expect(saved.siteId).toBeNull();
  expect(saved.drawingId).toBeNull();
  expect(saved.results).toEqual([]);
  expect(saved.notesDocument.photos).toEqual([]);
  expect(await records(page, 'sites')).toHaveLength(0);
  await page.reload();
  await expect(page.getByTestId('job-card')).toHaveCount(1);
  await page.getByTestId('job-card').click();
  await expect(page.locator('.job-notes')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Job workflow', exact: true });
  expect(await nav.getByRole('button').allTextContents()).toEqual(['Notes', 'Plan', 'Finalisation']);
  await page.getByRole('button', { name: '‹ Home', exact: true }).click();
  await page.getByTestId('job-settings').click();
  const settings = page.locator('.job-settings');
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('combobox', { name: 'Site (optional)', exact: true })).toHaveValue('');
  await settings.getByRole('textbox', { name: 'Job title', exact: true }).fill('Synthetic quick repair');
  await settings.locator('.job-settings-more > summary').click();
  const disciplines = settings.getByRole('combobox', { name: 'Discipline', exact: true });
  const types = settings.getByRole('combobox', { name: 'Job type', exact: true });
  expect(await disciplines.locator('option').evaluateAll(options => options.filter(o => o.value).map(o => o.textContent))).toEqual(['Fire', 'Security', 'Intruder', 'CCTV', 'Access control', 'Custom']);
  expect(await types.locator('option').evaluateAll(options => options.filter(o => o.value).map(o => o.textContent))).toContain('Call out');
  await disciplines.selectOption('Custom');
  await types.selectOption('Custom');
  await settings.getByRole('button', { name: 'Save settings', exact: true }).click();
  expect(await settings.getByRole('textbox', { name: 'Custom discipline', exact: true }).evaluate(input => input.validity.valueMissing)).toBe(true);
  await settings.getByRole('textbox', { name: 'Custom discipline', exact: true }).fill('Synthetic specialist system');
  await settings.getByRole('textbox', { name: 'Custom job type', exact: true }).fill('Evidence review');
  await saveSettings(page);
  await openJobSection(page, 'Notes');
  await expect(page.locator('.job-notes').getByRole('textbox', { name: 'Job title', exact: true })).toHaveValue('Synthetic quick repair');
  const download = await clickExportJob(page);
  const input = await readFile(await download.path(), 'utf8');
  const wire = JSON.parse(input), output = validateJobPackage(input);
  expect(wire.version).toBe(3);
  expect(output.site).toBeNull();
  expect(output.job.id).toBe(saved.id);
  expect(output.job.customDiscipline).toBe('Synthetic specialist system');
  expect(output.job.customWorkType).toBe('Evidence review');
  const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await fresh.newPage();
    await reopened.goto('/');
    const imported = { name: 'standalone.jobs.json', mimeType: 'application/json', buffer: Buffer.from(input) };
    await reopened.locator('#job-file').setInputFiles(imported);
    await expect(reopened.locator('.job-notes')).toBeVisible();
    await reopened.locator('#job-file').setInputFiles(imported);
    await expect(reopened.locator('#notice')).toContainText('already saved');
    expect(await records(reopened, 'sites')).toHaveLength(0);
    expect(await records(reopened, 'jobs')).toHaveLength(1);
  } finally { await fresh.close(); }
});

test('site setup applies to its jobs while a job-specific settings override and saved notes survive later changes', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="sites"]').first().click();
  await page.locator('[data-form="site"]').getByRole('textbox', { name: 'Site name', exact: true }).fill('Synthetic shared setup site');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  const profile = page.locator('.site-profile');
  await profile.getByRole('textbox', { name: 'Assigned engineer', exact: true }).fill('Shared Engineer One');
  await profile.getByRole('combobox', { name: 'Discipline', exact: true }).selectOption('Fire');
  await profile.getByRole('combobox', { name: 'Job type', exact: true }).selectOption('Maintenance');
  await profile.getByRole('textbox', { name: 'Access procedure', exact: true }).fill('Original shared access');
  await profile.getByRole('button', { name: 'Save site details', exact: true }).click();
  for (const title of ['First shared visit', 'Second shared visit']) {
    await page.locator('[data-action="create"]').last().click();
    if (title === 'First shared visit') {
      await openJobSection(page, 'Plan');
      await expect(page.getByTestId('save-status')).toContainText('Not saved yet');
      await expect(page.getByRole('button', { name: 'Devices', exact: true })).toHaveCount(0);
      expect(await records(page, 'jobs')).toHaveLength(0);
      await openJobSection(page, 'Notes');
    }
    await page.locator('.job-notes').getByRole('textbox', { name: 'Job title', exact: true }).fill(title);
    await page.getByRole('textbox', { name: 'Job notes', exact: true }).fill(`Saved notes for ${title}.`);
    await saveNotes(page);
    await page.locator('header .job-site-link').click();
  }
  const before = await records(page, 'jobs');
  await profile.getByRole('textbox', { name: 'Assigned engineer', exact: true }).fill('Shared Engineer Two');
  await profile.getByRole('textbox', { name: 'Access procedure', exact: true }).fill('Updated shared access');
  await profile.getByRole('button', { name: 'Save site details', exact: true }).click();
  for (const title of ['First shared visit', 'Second shared visit']) {
    await page.getByTestId('site-job-card').filter({ hasText: title }).click();
    const settings = await moreSettings(page);
    await expect(settings.getByRole('textbox', { name: 'Assigned engineer', exact: true })).toHaveValue('Shared Engineer Two');
    await settings.getByText('Client, contacts & access', { exact: true }).click();
    await expect(settings.getByRole('textbox', { name: 'Access procedure', exact: true })).toHaveValue('Updated shared access');
    if (title === 'First shared visit') {
      await settings.getByRole('textbox', { name: 'Assigned engineer', exact: true }).fill('Specific Engineer');
      await saveSettings(page);
    }
    await page.locator('header .job-site-link').click();
  }
  await profile.getByRole('textbox', { name: 'Assigned engineer', exact: true }).fill('Shared Engineer Three');
  await profile.getByRole('button', { name: 'Save site details', exact: true }).click();
  for (const [title, engineer] of [['First shared visit', 'Specific Engineer'], ['Second shared visit', 'Shared Engineer Three']]) {
    await page.getByTestId('site-job-card').filter({ hasText: title }).click();
    const settings = await moreSettings(page);
    await expect(settings.getByRole('textbox', { name: 'Assigned engineer', exact: true })).toHaveValue(engineer);
    await page.locator('header .job-site-link').click();
  }
  const after = await records(page, 'jobs');
  for (const original of before) {
    const current = after.find(job => job.id === original.id);
    expect(current.notesDocument).toEqual(original.notesDocument);
    expect(current.results).toEqual(original.results);
    expect(current.drawingId).toBe(original.drawingId);
  }
});
