import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { CERTIFICATE_FIELDS } from '../src/certificates.js';
import { openJobSection } from './helpers/job-creation.js';

async function savedJobs(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('jobs', 'readonly'), values = tx.objectStore('jobs').getAll();
      tx.oncomplete = () => { db.close(); resolve(values.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}
async function startStandalone(page) {
  await page.goto('/');
  await page.locator('[data-action="create"]').first().click();
  await page.locator('.job-notes').getByRole('textbox', {name: 'Job title', exact: true}).fill('Synthetic certificate training');
  await page.locator('.job-notes').getByRole('textbox', {name: 'Job notes', exact: true}).fill('Training visit only. No onsite test has taken place.');
  await page.locator('.job-notes').getByRole('button', {name: 'Save', exact: true}).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await openJobSection(page, 'Finalisation');
}
async function fillRequired(page) {
  const values = {
    title: 'Synthetic intruder call-out certificate', number: 'TRAINING-CERT-001', issueDate: '2026-11-24', visitDate: '2026-11-24',
    discipline: 'Intruder', jobType: 'Call out', siteName: 'Practice premises', siteAddress: 'Synthetic training location',
    clientName: 'Practice customer', companyName: 'Training organisation', engineerName: 'Example Engineer',
    scope: 'Record the synthetic visit.', workDescription: 'Prepared a training record. No onsite work was done.',
    findings: 'No device tests were recorded.', limitations: 'Training only; no installation was inspected.', outcome: 'No equipment condition certified.',
    declaration: 'I reviewed this synthetic example for training only; it is not a declaration about a real installation.',
  };
  for (const field of CERTIFICATE_FIELDS.filter(field => field.required)) await page.locator(`#certificate-${field.key}`).fill(values[field.key]);
}
async function issue(page) {
  await page.locator('[data-certificate-review]').click();
  await expect(page.locator('.certificate-review-preview')).toContainText('Draft certificate');
  await expect(page.locator('[data-certificate-issue]')).toBeDisabled();
  await page.locator('[data-certificate-confirm]').check();
  await page.locator('[data-certificate-issue]').click();
  await expect(page.locator('.certificate-issued-preview')).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function pdfDownload(page, action = 'download') {
  const pending = page.waitForEvent('download');
  await page.locator(`[data-certificate-${action}]`).click();
  const download = await pending;
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(1000);
  return download;
}

test('standalone certificate drafts save, review and issue offline, then reopen and revise without changing the original', async ({page, context}, testInfo) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', {configurable: true, value: () => false}));
  await startStandalone(page);
  await page.locator('[data-certificate-create]').click();
  await expect(page.locator('.certificate-form')).toBeVisible();
  await page.locator('#certificate-siteName').fill('Practice premises');
  await page.locator('.certificate-form').getByRole('button', {name: 'Save draft', exact: true}).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.reload();
  await page.getByTestId('job-card').click();
  await openJobSection(page, 'Finalisation');
  await expect(page.locator('#certificate-siteName')).toHaveValue('Practice premises');
  await page.locator('[data-certificate-review]').click();
  await expect(page.locator('.certificate-missing')).toBeVisible();
  await page.locator('[data-certificate-confirm]').check();
  await expect(page.locator('[data-certificate-issue]')).toBeDisabled();
  await page.locator('[data-certificate-edit]').click();
  await fillRequired(page);
  await page.locator('#certificate-clientEmail').fill('training@example.com');
  await page.locator('.certificate-form').getByRole('button', {name: 'Save draft', exact: true}).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await issue(page);
  const first = (await savedJobs(page))[0];
  expect(first.siteId).toBeNull();
  expect(first.certificates.issued).toHaveLength(1);
  expect(first.certificates.issued[0].fields.clientEmail).toBe('training@example.com');
  expect(first.results).toEqual([]);
  await pdfDownload(page);
  await page.evaluate(() => { window.print = () => { window.__certificatePrint = document.querySelector('#print-report')?.textContent; }; });
  await page.locator('[data-certificate-print]').click();
  await expect.poll(() => page.evaluate(() => window.__certificatePrint)).toContain('TRAINING-CERT-001');
  await expect(page.locator('#job-report-root')).toContainText('Training visit only.');
  await page.reload();
  await page.getByTestId('job-card').click();
  await openJobSection(page, 'Finalisation');
  await expect(page.locator('.certificate-issued-preview')).toContainText('TRAINING-CERT-001');
  await page.locator('[data-certificate-revise]').click();
  await page.locator('#certificate-number').fill('TRAINING-CERT-001-R2');
  await page.locator('#certificate-outcome').fill('Revised training wording; no equipment condition certified.');
  await issue(page);
  const revised = (await savedJobs(page))[0];
  expect(revised.certificates.issued).toHaveLength(2);
  expect(revised.certificates.issued[0]).toEqual(first.certificates.issued[0]);
  expect(revised.certificates.issued[1].revisionOf).toBe(first.certificates.issued[0].id);
  await page.getByRole('combobox', {name: 'Issued certificate', exact: true}).selectOption(first.certificates.issued[0].id);
  await expect(page.locator('.certificate-issued-preview')).toContainText('TRAINING-CERT-001');
  await expect(page.locator('.certificate-issued-preview')).not.toContainText('Revised training wording');
  await pdfDownload(page, 'share');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({width, height: 900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator('.certificate-history > .certificate-actions button').all()) {
      const bounds = await button.boundingBox(); expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    }
  }
  expect(errors).toEqual([]);
});
