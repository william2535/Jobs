import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createDayPack, inspectDayPack } from '../src/day-pack.js';
import { inspectDayReceipt } from '../src/day-session.js';
import { createQuickJob } from '../src/model.js';

const DATE = '2026-11-27';
const START = new Date(`${DATE}T08:00:00.000Z`);
const FINISH = new Date(`${DATE}T17:00:00.000Z`);

async function records(page, store) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction(name, 'readonly');
      const result = transaction.objectStore(name).getAll();
      transaction.oncomplete = () => { db.close(); resolve(result.result); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }), store);
}
async function metadata(page, key) {
  return (await records(page, 'metadata')).find(record => record.key === key)?.value || [];
}
async function readyOffline(page, context) {
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-action="create"]:visible').first()).toBeEnabled();
}
async function home(page) {
  const back = page.getByRole('button', { name: '‹ Home', exact: true });
  if (await back.isVisible()) await back.click();
  else await page.goto('/');
}
async function createJob(page, title, note) {
  await page.locator('[data-action="create"]:visible').first().click();
  const notes = page.locator('.job-notes');
  await notes.getByRole('textbox', { name: 'Job title', exact: true }).fill(title);
  await notes.getByRole('textbox', { name: 'Job notes', exact: true }).fill(note);
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await home(page);
}
async function openChest(page) {
  await page.getByRole('button', { name: 'Transfer job pack', exact: true }).first().click();
  const chest = page.getByRole('dialog', { name: 'Quick Transfer', exact: true });
  await expect(chest).toBeVisible();
  await expect(chest.getByRole('button', { name: /Receive job pack/ })).toBeEnabled();
  return chest;
}
async function downloadJson(page, button) {
  await expect(button).toBeEnabled();
  const pending = page.waitForEvent('download');
  await button.click();
  const download = await pending;
  return {
    name: download.suggestedFilename(), mimeType: 'application/json',
    buffer: await readFile(await download.path()),
  };
}
async function preparePack(page, engineer) {
  const chest = await openChest(page);
  await chest.locator('.transfer-day-options > summary').click();
  const form = chest.locator('.transfer-day-form');
  await form.getByLabel('Engineer', { exact: true }).fill(engineer);
  await form.getByLabel('Date', { exact: true }).fill(DATE);
  await form.getByLabel('Pack name (optional)', { exact: true }).fill('Synthetic two-job day');
  for (const box of await form.getByRole('checkbox').all()) await box.check();
  await form.getByRole('button', { name: 'Prepare day pack', exact: true }).click();
  const file = await downloadJson(page, chest.getByRole('button', { name: 'Share day pack', exact: true }));
  await chest.getByRole('button', { name: 'Close transfer', exact: true }).click();
  return file;
}
async function receivePack(page, file, { start = false } = {}) {
  await page.locator('#job-file').setInputFiles(file);
  const review = page.getByRole('dialog', { name: 'Receive day pack', exact: true });
  await expect(review).toBeVisible();
  await review.locator(`[data-day-accept="${start ? 'start' : 'save'}"]`).click();
  await expect(review).toBeHidden();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.getByRole('dialog', { name: 'Quick Transfer', exact: true }).getByRole('button', { name: 'Close transfer', exact: true }).click();
}
async function editNotes(page, jobId, text) {
  const cards = page.getByTestId('job-card');
  const title = (await records(page, 'jobs')).find(job => job.id === jobId).workflow.details.title;
  await cards.filter({ has: page.getByText(title, { exact: true }) }).click();
  const notes = page.locator('.job-notes');
  await notes.getByRole('textbox', { name: 'Job notes', exact: true }).fill(text);
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await home(page);
}

// These contexts are independent saved workspaces. Download/upload transfers the
// real file bytes; it does not simulate NFC, AirDrop, Bluetooth or delivery.
test('an offline manager redistributes two jobs and only an office receipt confirms the engineer day return', async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({
    baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport,
    timezoneId: 'UTC', serviceWorkers: 'allow', acceptDownloads: true,
  })));
  try {
    const pages = [];
    for (const context of contexts) {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      });
      const page = await context.newPage();
      await page.clock.setFixedTime(START);
      await page.goto('/');
      pages.push(page);
    }
    const [office, manager, engineer] = pages;
    await createJob(office, 'Synthetic fire visit', 'Original office instructions.');
    await createJob(office, 'Synthetic CCTV visit', 'Second office instructions.');
    const originalJobs = await records(office, 'jobs');
    const changedJob = originalJobs.find(job => job.notesDocument.blocks.some(block => block.runs?.some(run => run.text.includes('Original office'))));
    expect(originalJobs).toHaveLength(2);
    for (let index = 0; index < contexts.length; index++) await readyOffline(pages[index], contexts[index]);

    const assignment = await preparePack(office, '');
    expect((await inspectDayPack(assignment.buffer.toString())).summary).toMatchObject({ kind: 'assignment', jobCount: 2, engineer: '' });
    await receivePack(manager, assignment);
    expect(await records(manager, 'jobs')).toHaveLength(2);
    expect(await metadata(manager, 'office-days')).toEqual([]);
    expect(await metadata(manager, 'unassigned-timesheets')).toEqual([]);

    const forwarded = await preparePack(manager, 'Synthetic engineer');
    expect((await inspectDayPack(forwarded.buffer.toString())).summary).toMatchObject({ kind: 'assignment', jobCount: 2, engineer: 'Synthetic engineer' });
    await receivePack(engineer, forwarded, { start: true });
    expect(await metadata(engineer, 'office-days')).toMatchObject([{ status: 'running', engineer: 'Synthetic engineer', startedAt: START.toISOString() }]);
    expect(await metadata(manager, 'office-days')).toEqual([]);
    await receivePack(engineer, forwarded);
    expect(await records(engineer, 'jobs')).toHaveLength(2);
    expect(await metadata(engineer, 'office-days')).toHaveLength(1);

    await editNotes(engineer, changedJob.id, 'Engineer recorded this observation offline.');
    await editNotes(office, changedJob.id, 'Office retained this independent instruction.');
    await engineer.clock.setFixedTime(FINISH);
    let chest = await openChest(engineer);
    await chest.getByRole('button', { name: 'Review & finish day', exact: true }).click();
    await chest.getByRole('button', { name: 'Finish day', exact: true }).click();
    await expect(chest).toContainText('Awaiting a receipt from the receiving phone.');
    const returned = await downloadJson(engineer, chest.getByRole('button', { name: 'Share finished day', exact: true }));
    const returnedPack = await inspectDayPack(returned.buffer.toString());
    expect(returnedPack.summary).toMatchObject({ kind: 'return', jobCount: 2, attendanceMinutes: 540, unallocatedMinutes: 540 });
    expect(await metadata(engineer, 'office-days')).toMatchObject([{ status: 'finished', receipt: null, finishedAt: FINISH.toISOString() }]);
    const timeBeforeReceipt = await metadata(engineer, 'unassigned-timesheets');
    expect(timeBeforeReceipt).toHaveLength(1);
    await chest.getByRole('button', { name: 'Close transfer', exact: true }).click();

    await office.clock.setFixedTime(new Date(`${DATE}T17:05:00.000Z`));
    await receivePack(office, returned);
    const officeJobs = await records(office, 'jobs');
    expect(officeJobs).toHaveLength(3);
    expect(officeJobs.find(job => job.id === changedJob.id).notesDocument.blocks[0].runs[0].text).toBe('Office retained this independent instruction.');
    expect(officeJobs.some(job => job.id !== changedJob.id && job.notesDocument.blocks.some(block => block.runs?.some(run => run.text.includes('Engineer recorded'))))).toBe(true);
    const officeReceipts = await metadata(office, 'office-receipts');
    expect(officeReceipts).toHaveLength(1);
    expect(officeReceipts[0].summary).toMatchObject({ kind: 'return', conflictCount: 1, jobCount: 2 });
    await receivePack(office, returned);
    expect(await records(office, 'jobs')).toHaveLength(3);
    expect(await metadata(office, 'office-receipts')).toHaveLength(1);

    chest = await openChest(office);
    await chest.locator('.transfer-office-returns > summary').click();
    await expect(chest.locator('.transfer-return')).toContainText('1 to review');
    const receiptFile = await downloadJson(office, chest.getByRole('button', { name: 'Share receipt', exact: true }));
    const receipt = await inspectDayReceipt(receiptFile.buffer.toString());
    expect(receipt.packId).toBe(returnedPack.pack.packId);
    await engineer.locator('#job-file').setInputFiles(receiptFile);
    await expect.poll(async () => (await metadata(engineer, 'office-days'))[0]?.status).toBe('returned');
    expect(await metadata(engineer, 'unassigned-timesheets')).toEqual(timeBeforeReceipt);
    await engineer.reload();
    chest = await openChest(engineer);
    await expect(chest).toContainText('Receipt received');
    await expect(chest).toContainText('A matching receipt is saved on this phone.');
    await expect.poll(() => engineer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await engineer.screenshot({ path: testInfo.outputPath('day-return-receipt.png'), animations: 'disabled' });
    expect(await metadata(manager, 'office-days')).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('the existing job share chest keeps user activation and cancellation never claims a handover', async ({ page, context }) => {
  await context.addInitScript(() => {
    window.__shareResult = 'cancelled';
    window.__shareCalls = [];
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => {
      const call = { active: navigator.userActivation?.isActive, files: [] };
      window.__shareCalls.push(call);
      call.files = await Promise.all(payload.files.map(async file => ({ name: file.name, type: file.type, text: await file.text() })));
      if (window.__shareResult === 'cancelled') throw new DOMException('Synthetic user cancellation', 'AbortError');
    } });
  });
  await page.goto('/');
  await createJob(page, 'Synthetic share cancellation', 'Saved local work.');
  await readyOffline(page, context);
  const chest = await openChest(page);
  const share = chest.getByRole('button', { name: /Nearby \/ share job pack/ });
  await expect(share).toBeEnabled();
  await share.click();
  await expect(chest.locator('.transfer-status')).toContainText('Sharing cancelled');
  const calls = await page.evaluate(() => window.__shareCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].active).toBe(true);
  expect(calls[0].files[0].name).toMatch(/\.jobs\.json$/);
  expect(calls[0].files[0].type).toBe('application/json');
  expect(JSON.parse(calls[0].files[0].text).job.notesDocument.blocks[0].runs[0].text).toBe('Saved local work.');
  expect(await metadata(page, 'office-days')).toEqual([]);
  expect(await metadata(page, 'office-receipts')).toEqual([]);
  await page.evaluate(() => { window.__shareResult = 'shared'; });
  await share.click();
  await expect(chest.locator('.transfer-status')).toContainText('does not confirm');
  expect(await metadata(page, 'office-receipts')).toEqual([]);

  const picker = page.waitForEvent('filechooser');
  await chest.getByRole('button', { name: /Receive job pack/ }).click();
  await (await picker).setFiles({ name: calls[0].files[0].name, mimeType: 'application/json', buffer: Buffer.from(calls[0].files[0].text) });
  await expect(page.locator('#notice')).toContainText('already saved');
  expect(await records(page, 'jobs')).toHaveLength(1);
  await page.goto('/#jobs-tap=office&office=synthetic-office');
  await expect(page.getByRole('dialog', { name: 'Quick Transfer', exact: true })).toBeVisible();
  expect(await metadata(page, 'office-days')).toEqual([]);
  expect(await metadata(page, 'unassigned-timesheets')).toEqual([]);
});

async function failMetadataWriteOnce(page, key) {
  await page.evaluate(target => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (this.name === 'metadata' && value.key === target) {
        IDBObjectStore.prototype.put = put;
        throw new DOMException('Synthetic full storage during handover', 'QuotaExceededError');
      }
      return put.call(this, value, ...args);
    };
  }, key);
}

test('a failed collection or finish keeps its timer and receipt unchanged and can retry in the same chest', async ({ page, context }) => {
  const job = createQuickJob(null, { title: 'Synthetic save retry visit' });
  const pack = await createDayPack({ sites: [], jobs: [job] }, {
    jobIds: [job.id], engineer: 'Synthetic retry engineer', date: DATE, officeId: 'synthetic-office',
  });
  await page.clock.setFixedTime(START);
  await page.goto('/');
  await readyOffline(page, context);
  await page.locator('#job-file').setInputFiles({
    name: 'retry.jobsday.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)),
  });
  const review = page.getByRole('dialog', { name: 'Receive day pack', exact: true });
  await expect(review).toBeVisible();
  await failMetadataWriteOnce(page, 'office-receipts');
  const collect = review.getByRole('button', { name: 'Collect & start day', exact: true });
  await collect.click();
  await expect(review.getByRole('alert')).toContainText('nothing has been acknowledged');
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  expect(await records(page, 'jobs')).toEqual([]);
  expect(await metadata(page, 'office-days')).toEqual([]);
  expect(await metadata(page, 'office-receipts')).toEqual([]);
  await expect(collect).toBeEnabled();
  await page.clock.setFixedTime(new Date(`${DATE}T08:05:00.000Z`));
  await collect.click();
  await expect(review).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Quick Transfer', exact: true })).toContainText('Day in progress');
  expect(await records(page, 'jobs')).toHaveLength(1);
  expect(await metadata(page, 'office-days')).toMatchObject([{ status: 'running', startedAt: START.toISOString() }]);
  expect(await metadata(page, 'office-receipts')).toHaveLength(1);

  await page.reload();
  await page.clock.setFixedTime(FINISH);
  const chest = await openChest(page);
  await chest.getByRole('button', { name: 'Review & finish day', exact: true }).click();
  await failMetadataWriteOnce(page, 'office-days');
  const finish = chest.getByRole('button', { name: 'Finish day', exact: true });
  await finish.click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(chest.locator('.transfer-status')).toHaveAttribute('role', 'alert');
  expect(await metadata(page, 'office-days')).toMatchObject([{ status: 'running', finishedAt: null, receipt: null }]);
  expect(await metadata(page, 'unassigned-timesheets')).toEqual([]);
  await expect(finish).toBeEnabled();
  await page.clock.setFixedTime(new Date(`${DATE}T17:03:00.000Z`));
  await finish.click();
  await expect(chest).toContainText('Awaiting a receipt from the receiving phone.');
  await expect(chest.getByRole('button', { name: 'Share finished day', exact: true })).toBeEnabled();
  expect(await metadata(page, 'office-days')).toMatchObject([{ status: 'finished', finishedAt: FINISH.toISOString(), receipt: null }]);
  expect(await metadata(page, 'unassigned-timesheets')).toHaveLength(1);
  await page.reload();
  expect(await metadata(page, 'unassigned-timesheets')).toHaveLength(1);
});
