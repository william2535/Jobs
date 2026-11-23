import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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
  await expect.poll(() => page.evaluate(() => window.__printedNotes)).toContain('Further observations saved offline.');
  await openJobSection(page, 'Notes');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('formatted-job-notes.png'), fullPage: true });
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

async function selectItemText(item, { start = 0, end } = {}) {
  await item.evaluate((node, offsets) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: text => !text.length || text.parentElement.closest('[data-note-check]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const text = walker.nextNode();
    const range = document.createRange(); range.setStart(text, offsets.start); range.setEnd(text, offsets.end ?? text.length);
    node.closest('[contenteditable="true"]').focus();
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }, { start, end });
}

test('personal checklists format selected text and retain completion, IDs and formatting offline, in reports and through export', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(90_000);
  await start(page);
  const notes = page.locator('.job-notes'), editor = notes.getByRole('textbox', { name: 'Job notes', exact: true });
  await expect(notes.getByLabel('Text colour', { exact: true })).toBeVisible();
  await expect(notes.getByLabel('Highlight colour', { exact: true })).toBeVisible();
  await editor.fill('Collect evidence'); await editor.focus(); await page.keyboard.press('ControlOrMeta+End');
  await notes.getByRole('button', { name: 'Checklist', exact: true }).click();
  await expect(editor.getByRole('checkbox')).toHaveCount(1);
  await page.keyboard.press('Enter'); await page.keyboard.insertText('Arrange access');
  await expect(editor.getByRole('checkbox')).toHaveCount(2);
  await editor.getByRole('checkbox').first().click();
  await expect(editor.getByRole('checkbox').first()).toBeChecked();
  await editor.getByRole('checkbox').first().press('Space');
  await expect(editor.getByRole('checkbox').first()).not.toBeChecked();
  await editor.getByRole('checkbox').first().press('Enter');
  await expect(editor.getByRole('checkbox').first()).toBeChecked();
  await expect(editor.getByRole('checkbox')).toHaveCount(2);
  const editorHandle = await editor.elementHandle();
  await selectItemText(editor.locator('li').nth(1), { start: 0, end: 7 });
  await notes.getByRole('button', { name: 'Underline', exact: true }).click();
  await expect(notes.getByRole('button', { name: 'Underline', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await notes.getByLabel('Text colour', { exact: true }).fill('#123abc');
  await notes.getByLabel('Highlight colour', { exact: true }).fill('#ffff99');
  expect(await editorHandle.evaluate(node => node.isConnected)).toBe(true);
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await save(page);
  const exported = await exportData(page), document = exported.data.job.notesDocument;
  const list = document.blocks.find(block => block.type === 'checklist');
  expect(list.items.map(item => item.checked)).toEqual([true, false]);
  expect(list.items[0].runs).toEqual([{ text: 'Collect evidence' }]);
  expect(list.items[1].runs).toEqual([{ text: 'Arrange', underline: true, color: '#123abc', highlight: '#ffff99' }, { text: ' access' }]);
  expect(exported.data.job.results).toEqual([]);
  await expect(page.locator('#offline-status')).toContainText('Ready offline');
  await context.setOffline(true); await page.reload(); await page.getByTestId('job-card').click();
  await expect(editor.getByRole('checkbox').first()).toBeChecked();
  await expect(editor.getByRole('checkbox').nth(1)).not.toBeChecked();
  expect(await editor.locator('li').evaluateAll(items => items.map(item => item.dataset.noteId))).toEqual(list.items.map(item => item.id));
  await openJobSection(page, 'Finalisation');
  const report = page.locator('.job-report-preview');
  await expect(report.getByRole('img', { name: 'Completed checklist item', exact: true })).toBeVisible();
  await expect(report.getByRole('img', { name: 'Incomplete checklist item', exact: true })).toBeVisible();
  await expect(report.locator('[data-note-checklist] button')).toHaveCount(0);
  await openJobSection(page, 'Notes');
  expect((await exportData(page)).data.job.notesDocument).toEqual(document);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('personal-checklist.png'), fullPage: true });
  const fresh = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await fresh.newPage(); await reopened.goto('/');
    await reopened.locator('#job-file').setInputFiles({ name: 'personal-checklist.jobs.json', mimeType: 'application/json', buffer: Buffer.from(exported.input) });
    await expect(reopened.locator('.job-notes')).toBeVisible();
    expect((await exportData(reopened)).data.job.notesDocument).toEqual(document);
  } finally { await fresh.close(); }
});

test('checklist Return splits at the caret and safe pasted tasks remain independently editable', async ({ page }) => {
  await start(page);
  const notes = page.locator('.job-notes'), editor = notes.getByRole('textbox', { name: 'Job notes', exact: true });
  await editor.fill('Inspect supply'); await editor.focus(); await page.keyboard.press('ControlOrMeta+End');
  await notes.getByRole('button', { name: 'Checklist', exact: true }).click();
  await editor.getByRole('checkbox').click();
  const firstId = await editor.locator('li').getAttribute('data-note-id');
  await selectItemText(editor.locator('li'), { start: 8, end: 8 }); await page.keyboard.press('Enter');
  await expect(editor.getByRole('checkbox')).toHaveCount(2);
  await expect(editor.locator('li').first()).toHaveAttribute('data-note-id', firstId);
  await expect(editor.getByRole('checkbox').first()).toBeChecked();
  await expect(editor.getByRole('checkbox').nth(1)).not.toBeChecked();
  await expect(editor.locator('li').first()).toContainText('Inspect ');
  await expect(editor.locator('li').nth(1)).toContainText('supply');
  await selectItemText(editor.locator('li').nth(1), { start: 6, end: 6 }); await page.keyboard.press('Enter');
  await expect(editor.getByRole('checkbox')).toHaveCount(3);
  // Mobile software keyboards can use beforeinput without a keydown event.
  await editor.evaluate(node => node.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true })));
  await expect(editor.getByRole('checkbox')).toHaveCount(2);
  await page.keyboard.insertText('Further observations'); await page.keyboard.press('Enter');
  for (let count = 0; count < 2; count++) {
    await editor.evaluate(node => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/html', '<ul data-note-checklist="true" data-note-id="pasted-list"><li data-note-id="pasted-item" data-note-checked="true"><button data-note-check onclick="window.__unsafeNote=true">☑</button><u>Personal task</u><script>window.__unsafeNote=true</script><img src="x" onerror="window.__unsafeNote=true"></li></ul>');
      node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
    });
    await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  }
  await expect(editor.locator('script,img,[onclick]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__unsafeNote)).toBeUndefined();
  await save(page);
  const value = (await exportData(page)).data.job.notesDocument;
  const items = value.blocks.filter(block => block.type === 'checklist').flatMap(block => block.items);
  expect(items).toHaveLength(4);
  expect(items.map(item => item.checked)).toEqual([true, false, true, true]);
  expect(new Set(items.map(item => item.id)).size).toBe(4);
  expect(items[0].id).toBe(firstId);
  expect(items.slice(2).map(item => item.runs)).toEqual([[{ text: 'Personal task', underline: true }], [{ text: 'Personal task', underline: true }]]);
  await page.reload(); await page.getByTestId('job-card').click();
  await expect(editor).toContainText('Further observations');
  await expect(editor.getByRole('checkbox')).toHaveCount(4);
});

test('checklist undo and redo restore completion, text and caret without changing saved task identities', async ({ page }) => {
  await start(page);
  const notes = page.locator('.job-notes'), editor = notes.getByRole('textbox', { name: 'Job notes', exact: true });
  await editor.fill('Inspect supply'); await editor.focus(); await page.keyboard.press('ControlOrMeta+End');
  await notes.getByRole('button', { name: 'Checklist', exact: true }).click();
  const id = await editor.locator('li').getAttribute('data-note-id');
  const checkbox = editor.getByRole('checkbox', { name: 'Checklist item: Inspect supply', exact: true });
  await checkbox.click(); await expect(checkbox).toBeChecked();
  await checkbox.press('ControlOrMeta+z'); await expect(checkbox).not.toBeChecked();
  await editor.press('ControlOrMeta+Shift+z'); await expect(checkbox).toBeChecked();
  await selectItemText(editor.locator('li'), { start: 8, end: 8 }); await page.keyboard.press('Enter');
  await expect(editor.getByRole('checkbox')).toHaveCount(2);
  await editor.press('ControlOrMeta+z'); await expect(checkbox).toBeChecked();
  await expect(editor.getByRole('checkbox')).toHaveCount(1);
  await expect(editor.locator('li')).toHaveAttribute('data-note-id', id);
  await page.keyboard.insertText('the ');
  await expect(editor).toContainText('Inspect the supply');
  await notes.getByRole('button', { name: 'Bulleted list', exact: true }).click();
  await expect(editor.getByRole('checkbox')).toHaveCount(0);
  await notes.locator('.notes-more > summary').click();
  await notes.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.getByRole('checkbox')).toBeChecked();
  await expect(editor.locator('li')).toHaveAttribute('data-note-id', id);
  await notes.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor.getByRole('checkbox')).toHaveCount(0);
  await notes.getByRole('button', { name: 'Undo', exact: true }).click();
  await save(page); await page.reload(); await page.getByTestId('job-card').click();
  await expect(editor.getByRole('checkbox', { name: 'Checklist item: Inspect the supply', exact: true })).toBeChecked();
  await expect(editor.locator('li')).toHaveAttribute('data-note-id', id);
});
