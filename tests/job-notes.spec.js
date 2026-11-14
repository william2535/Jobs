import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateJobPackage } from '../src/packages.js';
import { clickExportJob, openJobSection } from './helpers/job-creation.js';

const sample = JSON.parse(await readFile(resolve('public/demo.zonesketch.json'), 'utf8'));
const photo = sample.project.floors[0].data.symbols.find(symbol => symbol.photos?.length).photos[0].image;
const photoBuffer = Buffer.from(photo.split(',')[1], 'base64');

async function start(page) {
  await page.goto('/');
  await page.locator('[data-action="create"]').first().click();
  await expect(page.locator('.job-notes')).toBeVisible();
}
async function save(page) {
  await page.locator('.job-notes').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function exportData(page) {
  const download = await clickExportJob(page);
  const input = await readFile(await download.path(), 'utf8');
  return { input, data: validateJobPackage(input) };
}
async function selectText(editor) {
  await editor.focus();
  await editor.evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

test('formatted notes and included pictures save offline and appear in Finalisation and the portable job', async ({ page, context, browser }, testInfo) => {
  await start(page);
  const notes = page.locator('.job-notes');
  const editor = notes.getByRole('textbox', { name: 'Job notes', exact: true });
  await notes.getByRole('textbox', { name: 'Job title', exact: true }).fill('Synthetic photo repair note');
  await editor.fill('Synthetic formatted repair note.');
  await selectText(editor);
  await notes.getByRole('button', { name: 'Bold', exact: true }).click();
  await notes.locator('.notes-more > summary').click();
  await notes.getByRole('combobox', { name: 'Text style', exact: true }).selectOption('h2');
  await notes.getByRole('combobox', { name: 'Text size', exact: true }).selectOption('24');
  await notes.getByLabel('Text colour', { exact: true }).fill('#234f8f');
  await notes.locator('.notes-file').setInputFiles({ name: 'synthetic-evidence.png', mimeType: 'image/png', buffer: photoBuffer });
  await expect(notes.locator('.notes-photo img')).toHaveCount(1);
  await notes.getByRole('textbox', { name: 'Picture caption', exact: true }).fill('Synthetic included photograph');
  await save(page);
  const before = await exportData(page);
  expect(before.data.site).toBeNull();
  expect(before.data.job.notesDocument.blocks.some(block => block.type === 'heading2')).toBe(true);
  const runs = before.data.job.notesDocument.blocks.flatMap(block => block.runs || block.items?.flatMap(item => item.runs) || []);
  expect(runs.some(run => run.bold && run.color === '#234f8f' && run.size === 24)).toBe(true);
  expect(before.data.job.notesDocument.photos[0]).toMatchObject({ image: photo, caption: 'Synthetic included photograph' });
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('job-card').click();
  await expect(editor).toContainText('Synthetic formatted repair note.');
  await expect(notes.locator('.notes-photo img')).toHaveAttribute('src', photo);
  await expect.poll(() => notes.locator('.notes-photo img').evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Further observations saved offline.');
  await save(page);
  await openJobSection(page, 'Finalisation');
  const report = page.locator('.job-report-preview');
  await expect(report).toContainText('Synthetic formatted repair note.');
  await expect(report).toContainText('Further observations saved offline.');
  await expect(report).toContainText('Synthetic included photograph');
  await expect(report.locator('img')).toHaveAttribute('src', photo);
  await page.evaluate(() => { window.print = () => { window.__printedNotes = document.querySelector('#print-report')?.textContent || ''; }; });
  await page.getByRole('button', { name: 'Print report', exact: true }).click();
  expect(await page.evaluate(() => window.__printedNotes)).toContain('Further observations saved offline.');
  await openJobSection(page, 'Notes');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: resolve('docs/screenshots', testInfo.project.name === 'mobile-chromium' ? 'mobile-notes-job.png' : 'desktop-notes-job.png'), fullPage: true });
  const exported = await exportData(page);
  expect(exported.data.job.id).toBe(before.data.job.id);
  expect(exported.data.job.notesDocument.photos).toEqual(before.data.job.notesDocument.photos);
  const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await fresh.newPage();
    await reopened.goto('/');
    const file = { name: 'notes.jobs.json', mimeType: 'application/json', buffer: Buffer.from(exported.input) };
    await reopened.locator('#job-file').setInputFiles(file);
    await expect(reopened.locator('.job-notes')).toBeVisible();
    const again = await exportData(reopened);
    expect(again.data.job.notesDocument).toEqual(exported.data.job.notesDocument);
    await reopened.locator('#job-file').setInputFiles(file);
    await expect(reopened.locator('#notice')).toContainText('already saved');
    await reopened.getByRole('button', { name: '‹ Home', exact: true }).click();
    await expect(reopened.getByTestId('job-card')).toHaveCount(1);
    const invalid = JSON.parse(exported.input);
    invalid.job.notesDocument.blocks[0].html = '<script>window.__injected=true</script>';
    await reopened.locator('#job-file').setInputFiles({ name: 'invalid-note.jobs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
    await expect(reopened.locator('#notice')).toContainText('Job import rejected');
    await expect(reopened.getByTestId('job-card')).toHaveCount(1);
    expect(await reopened.evaluate(() => window.__injected)).toBeUndefined();
  } finally { await fresh.close(); }
});

test('pasted content stays safe and cancelled navigation or a failed save preserves the note draft', async ({ page }) => {
  await start(page);
  const notes = page.locator('.job-notes'), editor = notes.getByRole('textbox', { name: 'Job notes', exact: true });
  await editor.focus();
  await editor.evaluate(node => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/html', '<p>Safe pasted note <strong>with emphasis</strong><img src="x" onerror="window.__injected=true"><script>window.__injected=true</script></p>');
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await expect(editor).toContainText('Safe pasted note with emphasis');
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  await expect(editor.locator('script,img,iframe,svg')).toHaveCount(0);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '‹ Home', exact: true }).click();
  await expect(editor).toContainText('Safe pasted note');
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, options) {
      if (mode === 'readwrite') { IDBDatabase.prototype.transaction = original; throw new DOMException('Synthetic failed note save', 'QuotaExceededError'); }
      return original.call(this, stores, mode, options);
    };
  });
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Save failed');
  await expect(editor).toContainText('Safe pasted note');
  await expect(notes.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await save(page);
  await page.reload();
  await page.getByTestId('job-card').click();
  await expect(editor).toContainText('Safe pasted note with emphasis');
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
});
