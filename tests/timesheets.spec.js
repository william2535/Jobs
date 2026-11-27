import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { newSite, newJob } from '../src/model.js';
import { createJobPackage, validateJobPackage } from '../src/packages.js';
import { updateWorkflow } from '../src/job-workflow.js';
import { clickExportJob } from './helpers/job-creation.js';

const day = '2026-11-14';
const followingDay = '2026-11-15';

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

async function openTimesheets(page, date = day) {
  await page.getByRole('button', { name: 'Timesheets', exact: true }).filter({ visible: true }).click();
  await expect(page.locator('.timesheets-ui')).toBeVisible();
  await page.getByLabel('Timesheet date', { exact: true }).fill(date);
}

async function addSession(page, { type = 'Work', start = `${day}T09:00`, finish = `${day}T10:30`, description = 'Synthetic recorded work', jobId } = {}) {
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add session', exact: true });
  await editor.getByLabel('Type', { exact: true }).selectOption({ label: type });
  if (jobId !== undefined) await editor.getByLabel('Task / job', { exact: true }).selectOption(jobId);
  await editor.getByLabel('Start', { exact: true }).fill(start);
  await editor.getByLabel('Finish', { exact: true }).fill(finish);
  await editor.getByLabel('Description', { exact: true }).fill(description);
  return editor;
}

async function saveSession(page, editor) {
  await editor.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}

async function importJob(page, site, job) {
  const pack = await createJobPackage(site, job);
  await page.locator('#job-file').setInputFiles({ name: 'synthetic-timesheet-job.jobs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.locator('.job-notes')).toBeVisible();
  await page.getByRole('button', { name: '‹ Home', exact: true }).click();
}

async function failNextWrite(page) {
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') { IDBDatabase.prototype.transaction = original; throw new DOMException('Synthetic timesheet save failure', 'QuotaExceededError'); }
      return original.call(this, stores, mode, options);
    };
  });
}

async function unassigned(page) {
  return (await stored(page, 'metadata')).find(item => item.key === 'unassigned-timesheets')?.value || [];
}

async function goHome(page) {
  const home = page.locator('[data-action="home"]:visible');
  if (await home.count()) await home.first().click();
  else await page.getByRole('navigation', { name: 'Mobile workspace', exact: true }).getByRole('button', { name: 'Dashboard', exact: true }).click();
}

async function exportTimesheet(page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export timesheet', exact: true }).click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}

test('standalone sessions validate times, preserve a failed save and can be edited and exported offline', async ({ page, context }) => {
  await page.goto('/');
  await openTimesheets(page);
  const editor = await addSession(page, { finish: `${day}T08:00`, description: 'Synthetic standalone attendance' });
  await editor.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(editor.locator('.timesheet-error')).toBeVisible();
  expect(await unassigned(page)).toEqual([]);
  await editor.getByLabel('Finish', { exact: true }).fill(`${day}T10:30`);
  await editor.getByLabel('Start', { exact: true }).fill('');
  await editor.getByRole('button', { name: 'Save session', exact: true }).click();
  expect(await unassigned(page)).toEqual([]);
  await editor.getByLabel('Start', { exact: true }).fill(`${day}T09:00`);
  await editor.getByRole('button', { name: 'Start plus 1 minute', exact: true }).click();
  await expect(editor.getByLabel('Start', { exact: true })).toHaveValue(`${day}T09:01`);
  await editor.getByRole('button', { name: 'Start minus 1 minute', exact: true }).click();
  await editor.getByRole('button', { name: 'Finish plus 1 minute', exact: true }).click();
  await expect(editor.getByLabel('Finish', { exact: true })).toHaveValue(`${day}T10:31`);
  await editor.getByRole('button', { name: 'Finish minus 1 minute', exact: true }).click();
  await failNextWrite(page);
  await editor.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(editor.getByLabel('Description', { exact: true })).toHaveValue('Synthetic standalone attendance');
  await expect(editor.getByLabel('Start', { exact: true })).toHaveValue(`${day}T09:00`);
  expect(await unassigned(page)).toEqual([]);
  await saveSession(page, editor);
  const saved = (await unassigned(page))[0];
  expect(saved).toMatchObject({ date: day, start: '09:00', endDate: day, end: '10:30', hours: 1.5, sessionType: 'Work', note: 'Synthetic standalone attendance' });
  expect(await stored(page, 'jobs')).toEqual([]);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await openTimesheets(page);
  await page.locator(`.timesheet-session[data-session-id="${saved.id}"]`).click();
  const edit = page.getByRole('dialog', { name: 'Edit session', exact: true });
  await expect(edit.getByLabel('Description', { exact: true })).toHaveValue('Synthetic standalone attendance');
  await edit.getByLabel('Description', { exact: true }).fill('Synthetic attendance updated while offline');
  await saveSession(page, edit);
  const updated = (await unassigned(page))[0];
  expect(updated.id).toBe(saved.id);
  expect(updated.revision).toBeGreaterThan(saved.revision);
  const pack = await exportTimesheet(page);
  expect(pack).toMatchObject({ format: 'JobsTimesheetPackage', version: 1, period: { from: day, to: day } });
  expect(pack.delivery.sent).toBe(false);
  expect(pack.totals).toMatchObject({ minutes: 90, workMinutes: 90, unassignedMinutes: 90 });
  expect(pack.entries).toHaveLength(1);
  expect(pack.entries[0]).toMatchObject({ jobId: null, entry: updated });
  expect(await stored(page, 'jobs')).toEqual([]);
});

test('linked sessions cancel safely, move between jobs without duplication and remain in the receiving job package', async ({ page, browser }, testInfo) => {
  await page.goto('/');
  const site = newSite('Synthetic timesheet site');
  const jobA = updateWorkflow(newJob(site), 'details', { title: 'Synthetic timesheet job A', reference: 'SYN-TIME-A' });
  let jobB = updateWorkflow(newJob(site), 'details', { title: 'Synthetic timesheet job B', reference: 'SYN-TIME-B' });
  jobB = updateWorkflow(jobB, 'timesheets', { date: '', start: '', end: '', hours: 1.25, note: 'Synthetic legacy undated attendance' });
  const legacyId = jobB.workflow.timesheets[0].id;
  await importJob(page, site, jobA);
  await importJob(page, site, jobB);
  await openTimesheets(page);
  await page.locator('summary').filter({ hasText: 'Undated records' }).click();
  await page.locator(`.timesheet-session[data-session-id="${legacyId}"]`).click();
  const legacyEditor = page.getByRole('dialog', { name: 'Edit session', exact: true });
  await expect(legacyEditor.getByLabel('Recorded hours', { exact: true })).toHaveValue('1.25');
  await expect(legacyEditor.getByLabel('Start', { exact: true })).toHaveValue('');
  await expect(legacyEditor.getByLabel('Finish', { exact: true })).toHaveValue('');
  await legacyEditor.getByLabel('Recorded date', { exact: true }).fill(day);
  await saveSession(page, legacyEditor);
  const datedLegacy = (await stored(page, 'jobs')).find(job => job.id === jobB.id).workflow.timesheets[0];
  expect(datedLegacy).toMatchObject({ id: legacyId, date: day, start: '', end: '', hours: 1.25, note: 'Synthetic legacy undated attendance' });
  expect(datedLegacy.sessionType).toBeUndefined();
  await saveSession(page, await addSession(page, { jobId: jobA.id, description: 'Synthetic linked inspection' }));
  let jobs = await stored(page, 'jobs');
  const initial = jobs.find(job => job.id === jobA.id).workflow.timesheets[0];
  expect(initial.note).toBe('Synthetic linked inspection');
  expect(jobs.find(job => job.id === jobB.id).workflow.timesheets).toEqual([datedLegacy]);
  const card = page.locator(`.timesheet-session[data-session-id="${initial.id}"]`);
  await card.click();
  let editor = page.getByRole('dialog', { name: 'Edit session', exact: true });
  await editor.getByLabel('Description', { exact: true }).fill('Synthetic abandoned edit');
  page.once('dialog', dialog => dialog.dismiss());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor.getByLabel('Description', { exact: true })).toHaveValue('Synthetic abandoned edit');
  page.once('dialog', dialog => dialog.accept());
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toBeHidden();
  expect((await stored(page, 'jobs')).find(job => job.id === jobA.id).workflow.timesheets[0]).toEqual(initial);
  await card.click();
  editor = page.getByRole('dialog', { name: 'Edit session', exact: true });
  await editor.getByLabel('Task / job', { exact: true }).selectOption(jobB.id);
  await failNextWrite(page);
  await editor.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(editor.getByLabel('Task / job', { exact: true })).toHaveValue(jobB.id);
  jobs = await stored(page, 'jobs');
  expect(jobs.find(job => job.id === jobA.id).workflow.timesheets[0]).toEqual(initial);
  expect(jobs.find(job => job.id === jobB.id).workflow.timesheets).toEqual([datedLegacy]);
  await saveSession(page, editor);
  jobs = await stored(page, 'jobs');
  expect(jobs.find(job => job.id === jobA.id).workflow.timesheets).toEqual([]);
  const moved = jobs.find(job => job.id === jobB.id).workflow.timesheets;
  expect(moved).toHaveLength(2);
  expect(moved.find(entry => entry.id === initial.id)).toMatchObject({ id: initial.id, note: initial.note, hours: initial.hours });
  expect(moved.find(entry => entry.id === legacyId)).toEqual(datedLegacy);
  expect(await unassigned(page)).toEqual([]);
  await goHome(page);
  await page.getByTestId('job-card').filter({ hasText: 'Synthetic timesheet job B' }).click();
  const download = await clickExportJob(page, { restore: false });
  const input = await readFile(await download.path(), 'utf8'), pack = validateJobPackage(input);
  expect(pack.job.workflow.timesheets).toEqual(moved);
  const receiving = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await receiving.newPage();
    await reopened.goto('/');
    await reopened.locator('#job-file').setInputFiles({ name: 'synthetic-timesheet-return.jobs.json', mimeType: 'application/json', buffer: Buffer.from(input) });
    await expect(reopened.locator('.job-notes')).toBeVisible();
    const returned = await clickExportJob(reopened, { restore: false });
    expect(validateJobPackage(await readFile(await returned.path(), 'utf8')).job.workflow.timesheets).toEqual(moved);
    expect((await stored(reopened, 'jobs'))[0].results).toEqual(pack.job.results);
  } finally { await receiving.close(); }
});

test('the daily timeline splits midnight work, keeps local submission evidence after edits and confirms deletions', async ({ page }, testInfo) => {
  await page.goto('/');
  await openTimesheets(page);
  await saveSession(page, await addSession(page, { start: `${day}T23:30`, finish: `${followingDay}T00:30`, description: 'Synthetic overnight inspection' }));
  const overnight = (await unassigned(page))[0];
  await saveSession(page, await addSession(page, { type: 'Travel', start: `${day}T22:00`, finish: `${day}T22:30`, description: 'Synthetic travel' }));
  await saveSession(page, await addSession(page, { type: 'Break', start: `${day}T22:30`, finish: `${day}T22:45`, description: 'Synthetic break' }));
  await expect(page.locator('.timesheet-work-total')).toHaveText('0:30');
  await expect(page.locator('.timesheet-recorded-total')).toHaveText('1:15');
  await expect(page.locator('.timesheet-session')).toHaveCount(3);
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.getByLabel('Timesheet date', { exact: true })).toHaveValue(followingDay);
  await expect(page.locator('.timesheet-session')).toHaveCount(1);
  await expect(page.locator('.timesheet-work-total')).toHaveText('0:30');
  await expect(page.locator('.timesheet-recorded-total')).toHaveText('0:30');
  await page.getByRole('button', { name: 'Submit timesheet', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review timesheet', exact: true });
  await expect(review).toBeVisible();
  await expect(review).toContainText(/local/i);
  await expect(review).toContainText('Overnight sessions are submitted in full');
  await expect(review).toContainText(`${day} 23:30 → ${followingDay} 00:30 · 1:00 whole session`);
  await expect(review).toContainText(`0:30 counted on ${followingDay}`);
  const submittedDownload = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Confirm submission', exact: true }).click();
  const submittedPackage = JSON.parse(await readFile(await (await submittedDownload).path(), 'utf8'));
  await expect(review).toBeHidden();
  await expect(page.locator('.timesheet-submission-status')).toContainText('submitted on this device');
  await expect(page.getByRole('button', { name: 'Submit timesheet', exact: true })).toBeDisabled();
  const submitted = (await unassigned(page)).find(entry => entry.id === overnight.id);
  expect(submitted.submissionId).toBeTruthy();
  expect(submitted.submittedAt).toBeTruthy();
  expect(submitted.submissionHistory).toHaveLength(1);
  expect(submitted.submissionHistory[0].entry).toMatchObject({ id: overnight.id, endDate: followingDay, end: '00:30', hours: 1 });
  expect(submittedPackage).toMatchObject({ format: 'JobsTimesheetPackage', version: 1, submissionId: submitted.submissionId, period: { from: followingDay, to: followingDay } });
  expect(submittedPackage.delivery.sent).toBe(false);
  expect(submittedPackage.totals).toMatchObject({ minutes: 30, workMinutes: 30 });
  expect(submittedPackage.entries[0].entry).toEqual(submitted);
  await page.locator(`.timesheet-session[data-session-id="${overnight.id}"]`).click();
  let editor = page.getByRole('dialog', { name: 'Edit session', exact: true });
  await editor.getByLabel('Finish', { exact: true }).fill(`${followingDay}T00:45`);
  await saveSession(page, editor);
  const changed = (await unassigned(page)).find(entry => entry.id === overnight.id);
  expect(changed.submissionId || '').toBe('');
  expect(changed.submissionHistory).toEqual(submitted.submissionHistory);
  expect(changed.hours).toBe(1.25);
  await expect(page.locator('.timesheet-totals > div').filter({ hasText: 'Submitted' }).locator('strong')).toHaveText('0');
  await expect(page.locator('.timesheet-work-total')).toHaveText('0:45');
  await expect(page.getByRole('button', { name: 'Submit timesheet', exact: true })).toBeEnabled();
  const exported = await exportTimesheet(page);
  expect(exported.entries).toHaveLength(1);
  expect(exported.entries[0].entry).toEqual(changed);
  expect(exported.totals).toMatchObject({ minutes: 45, workMinutes: 45 });
  await page.getByRole('button', { name: 'Previous day', exact: true }).click();
  await expect(page.locator('.timesheet-work-total')).toHaveText('0:30');
  await expect(page.locator('.timesheet-recorded-total')).toHaveText('1:15');
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile workspace', exact: true });
  if (await mobileNavigation.isVisible()) {
    await expect.poll(async () => {
      const exportBox = await page.getByRole('button', { name: 'Export timesheet', exact: true }).boundingBox();
      const navBox = await mobileNavigation.boundingBox();
      return exportBox.y >= 0 && exportBox.y + exportBox.height <= navBox.y + 1;
    }).toBeTruthy();
  }
  for (const label of ['Previous day', 'Next day', 'Today', 'Add session', 'Submit timesheet', 'Export timesheet']) {
    const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(43.99);
    expect(box.height).toBeGreaterThanOrEqual(43.99);
  }
  const screenshot = testInfo.outputPath('synthetic-timesheets-320.png');
  await page.screenshot({ path: screenshot });
  await testInfo.attach('Synthetic daily timesheet at 320px', { path: screenshot, contentType: 'image/png' });
  await page.locator(`.timesheet-session[data-session-id="${overnight.id}"]`).click();
  editor = page.getByRole('dialog', { name: 'Edit session', exact: true });
  const editorScreenshot = testInfo.outputPath('synthetic-timesheet-editor-320.png');
  await page.screenshot({ path: editorScreenshot });
  await testInfo.attach('Synthetic session editor at 320px', { path: editorScreenshot, contentType: 'image/png' });
  page.once('dialog', dialog => dialog.dismiss());
  await editor.getByRole('button', { name: 'Trash session', exact: true }).click();
  await expect(editor).toBeVisible();
  expect((await unassigned(page)).find(entry => entry.id === overnight.id)).toEqual(changed);
  page.once('dialog', dialog => dialog.accept());
  await editor.getByRole('button', { name: 'Trash session', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator(`.timesheet-session[data-session-id="${overnight.id}"]`)).toHaveCount(0);
  const removed = (await unassigned(page)).find(entry => entry.id === overnight.id);
  expect(removed.deletedAt).toBeTruthy();
  expect(removed.submissionHistory).toEqual(submitted.submissionHistory);
  await expect(page.locator('.timesheet-work-total')).toHaveText('0:00');
  await expect(page.locator('.timesheet-recorded-total')).toHaveText('0:45');
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.locator('.timesheet-session')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export timesheet', exact: true })).toBeEnabled();
  const trashOnly = await exportTimesheet(page);
  expect(trashOnly.entries).toEqual([]);
  expect(trashOnly.totals).toMatchObject({ minutes: 0, workMinutes: 0 });
  expect(trashOnly.archivedEntries).toHaveLength(1);
  expect(trashOnly.archivedEntries[0].entry).toEqual(removed);
  expect(trashOnly.archivedEntries[0].entry.submissionHistory).toEqual(submitted.submissionHistory);
});

test('a submitted session survives a failed download and can be exported again without another receipt', async ({ page }) => {
  await page.goto('/');
  await openTimesheets(page);
  await saveSession(page, await addSession(page));
  await page.getByRole('button', { name: 'Submit timesheet', exact: true }).click();
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = function () {
      URL.createObjectURL = original;
      throw new Error('Synthetic download failure after submission');
    };
  });
  const review = page.getByRole('dialog', { name: 'Review timesheet', exact: true });
  await review.getByRole('button', { name: 'Confirm submission', exact: true }).click();
  await expect(review).toBeHidden();
  await expect(page.locator('.timesheet-submission-status')).toContainText('Submitted locally, but download failed');
  await expect(page.getByRole('button', { name: 'Submit timesheet', exact: true })).toBeDisabled();
  const saved = (await unassigned(page))[0];
  expect(saved.submissionId).toBeTruthy();
  expect(saved.submissionHistory).toHaveLength(1);
  const exported = await exportTimesheet(page);
  expect(exported.entries[0].entry).toEqual(saved);
  expect((await unassigned(page))[0]).toEqual(saved);
});
