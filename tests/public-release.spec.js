import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { APP_VERSION } from '../src/release-info.js';
import { inspectWorkspaceBackup } from '../src/workspace-backup.js';

const demo = JSON.parse(await readFile(new URL('../public/demo.zonesketch.json', import.meta.url), 'utf8'));
const photo = demo.project.floors[0].data.symbols.find(symbol => symbol.photos?.length).photos[0].image;
const photoFile = { name: 'synthetic-release-evidence.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') };

async function stored(page, storeName) {
  return page.evaluate(storeName => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(storeName, 'readonly');
      const records = tx.objectStore(storeName).getAll();
      tx.oncomplete = () => { db.close(); resolve(records.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), storeName);
}

async function home(page) {
  const control = page.locator('[data-action="home"]:visible').first();
  if (await control.count()) await control.click();
  else {
    const navigation = page.getByRole('navigation', { name: 'Workspace navigation', exact: true });
    if (await navigation.isVisible()) {
      await navigation.getByText('Menu', { exact: true }).click();
      await navigation.getByRole('button', { name: 'Home', exact: true }).click();
    } else await page.getByRole('navigation', { name: 'Mobile workspace', exact: true }).getByRole('button', { name: 'Dashboard', exact: true }).click();
  }
}

async function help(page) {
  if (await page.locator('.release-help').isVisible()) return;
  const desktop = page.locator('[data-action="help"]:visible');
  if (await desktop.count()) await desktop.first().click();
  else {
    await home(page);
    await page.getByRole('navigation', { name: 'Mobile workspace', exact: true }).getByRole('button', { name: 'About', exact: true }).click();
    await page.getByRole('button', { name: 'Help & data', exact: true }).click();
  }
  await expect(page.locator('.release-help')).toBeVisible();
}

async function createNote(page, title, text, includePhoto = false) {
  await page.locator('[data-action="create"]:visible').first().click();
  const notes = page.locator('.job-notes');
  await notes.getByRole('textbox', { name: 'Job title', exact: true }).fill(title);
  await notes.getByRole('textbox', { name: 'Job notes', exact: true }).fill(text);
  if (includePhoto) await notes.locator('.notes-file').setInputFiles(photoFile);
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  return notes;
}

async function downloadBackup(page, selector = '[data-help-action="backup-workspace"]') {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  const input = await readFile(await download.path(), 'utf8');
  return {
    input,
    file: { name: download.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(input) },
    inspected: await inspectWorkspaceBackup(input),
  };
}

async function reviewAndRestore(page, file) {
  await page.locator('#workspace-file').setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Review workspace backup', exact: true })).toBeVisible();
  await page.locator('[data-action="confirm-workspace-restore"]').click();
}

test('release help backs up saved sites, job photos and unassigned time, then restores without overwriting local work', async ({ page, browser }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#offline-status')).toHaveText('Ready offline');
  await page.locator('[data-action="sites"]:visible').first().click();
  await page.getByRole('textbox', { name: 'Site name', exact: true }).fill('Synthetic release site without visits');
  await page.getByRole('textbox', { name: 'Address', exact: true }).fill('Training location only');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
  await home(page);
  await createNote(page, 'Synthetic release backup job', 'Saved evidence for the release backup.', true);
  await home(page);
  await page.getByRole('button', { name: 'Timesheets', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  const session = page.getByRole('dialog', { name: 'Add session', exact: true });
  await session.getByLabel('Task / job', { exact: true }).selectOption('');
  await session.getByLabel('Type', { exact: true }).selectOption({ label: 'Administration' });
  await session.getByLabel('Start', { exact: true }).fill('2026-11-16T09:00');
  await session.getByLabel('Finish', { exact: true }).fill('2026-11-16T09:30');
  await session.getByLabel('Description', { exact: true }).fill('Synthetic unassigned release administration');
  await session.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(session).toBeHidden();
  await home(page);
  await help(page);
  await expect(page.locator('.release-help')).toContainText(APP_VERSION);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  const exported = await downloadBackup(page);
  const workspace = exported.inspected.workspace;
  expect(workspace.sites).toHaveLength(1);
  expect(workspace.jobs).toHaveLength(1);
  expect(workspace.jobs[0].siteId).toBeNull();
  expect(workspace.jobs[0].notesDocument.photos[0].image).toBe(photo);
  expect(workspace.unassignedTimesheets).toHaveLength(1);
  expect(workspace.unassignedTimesheets[0].note).toBe('Synthetic unassigned release administration');

  const fresh = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
    deviceScaleFactor: testInfo.project.use.deviceScaleFactor,
    userAgent: testInfo.project.use.userAgent,
  });
  try {
    const reopened = await fresh.newPage();
    await reopened.goto('/');
    await reviewAndRestore(reopened, exported.file);
    await expect(reopened.getByTestId('save-status')).toContainText('Saved');
    await expect(reopened.locator('#offline-status')).toHaveText('Ready offline');
    await fresh.setOffline(true);
    await reopened.reload();
    await reopened.getByTestId('job-card').click();
    const includedPhoto = reopened.locator('.job-notes .notes-photo img');
    await expect(includedPhoto).toHaveAttribute('src', photo);
    await expect.poll(() => includedPhoto.evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy();
    await home(reopened);
    await help(reopened);
    expect((await downloadBackup(reopened)).inspected.workspace).toEqual(workspace);
    await reopened.locator('#workspace-file').setInputFiles(exported.file);
    await expect(reopened.locator('#notice')).toContainText(/already|unchanged/i);
    expect(await stored(reopened, 'jobs')).toHaveLength(1);
    expect(await stored(reopened, 'sites')).toHaveLength(1);

    await home(reopened);
    await createNote(reopened, 'Additional local release job', 'This later local job must not be overwritten.');
    await home(reopened);
    const before = await stored(reopened, 'jobs');
    await reopened.locator('#workspace-file').setInputFiles(exported.file);
    await expect(reopened.locator('#notice')).toContainText(/empty(?: job)? workspace/i);
    expect(await stored(reopened, 'jobs')).toEqual(before);
    expect(await stored(reopened, 'sites')).toHaveLength(1);
  } finally { await fresh.close(); }
});

test('a failed save can download the attempted note and photo without changing or mislabelling the saved copy', async ({ page }) => {
  await page.goto('/');
  const notes = await createNote(page, 'Original saved release job', 'Original persisted evidence.');
  const before = await stored(page, 'jobs');
  await notes.getByRole('textbox', { name: 'Job title', exact: true }).fill('Unsaved recovery title');
  await notes.getByRole('textbox', { name: 'Job notes', exact: true }).fill('New evidence retained after a failed save.');
  await notes.locator('.notes-file').setInputFiles(photoFile);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') {
        IDBDatabase.prototype.transaction = original;
        throw new DOMException('Synthetic release save failure', 'QuotaExceededError');
      }
      return original.call(this, stores, mode, options);
    };
  });
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(page.locator('#recovery-actions')).toBeVisible();
  const recovery = await downloadBackup(page, '[data-action="recovery-download"]');
  expect(recovery.inspected.metadata.kind).toBe('recovery');
  expect(recovery.input).toContain('New evidence retained after a failed save.');
  expect(recovery.input).toContain('Unsaved recovery title');
  expect(recovery.inspected.workspace.jobs[0].notesDocument.photos[0].image).toBe(photo);
  expect(await stored(page, 'jobs')).toEqual(before);
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(notes.getByRole('textbox', { name: 'Job notes', exact: true })).toContainText('New evidence retained after a failed save.');
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(page.locator('#recovery-actions')).toBeHidden();
  expect(JSON.stringify(await stored(page, 'jobs'))).toContain('New evidence retained after a failed save.');
});

test('failed local opening offers retry and does not turn retained records into an empty workspace', async ({ page }) => {
  await page.goto('/');
  await createNote(page, 'Existing retained release job', 'This record survives an opening failure.');
  const before = await stored(page, 'jobs');
  await home(page);
  await page.addInitScript(() => {
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, ...args) {
      if (name === 'jobs-local') {
        IDBFactory.prototype.open = original;
        throw new DOMException('Synthetic local opening failure', 'SecurityError');
      }
      return original.call(this, name, ...args);
    };
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Local records could not be opened', exact: true })).toBeVisible();
  await expect(page.getByTestId('job-card')).toHaveCount(0);
  await page.locator('[data-action="help"]:visible').first().click();
  await expect(page.locator('.release-help-status')).toContainText('Local storage unavailable');
  await home(page);
  await page.locator('[data-action="storage-retry"]').click();
  await expect(page.getByTestId('job-card')).toHaveCount(1);
  await expect(page.getByTestId('job-card')).toContainText('Existing retained release job');
  expect(await stored(page, 'jobs')).toEqual(before);
});
