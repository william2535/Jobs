import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateJobPackage } from '../src/packages.js';

const disciplines = ['Fire', 'Security', 'Intruder', 'CCTV', 'Access control', 'Custom'];
const jobTypes = ['Maintenance', 'Small works', 'Install', 'Take over visit', 'Call out', 'Custom'];

async function savedJobCount(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('jobs', 'readonly');
      const count = transaction.objectStore('jobs').count();
      transaction.oncomplete = () => { db.close(); resolve(count.result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
}

async function exportJob(page) {
  const pending = page.waitForEvent('download');
  await page.locator('.job-toolbar').getByRole('button', { name: 'Export job', exact: true }).click();
  const download = await pending;
  const input = await readFile(await download.path(), 'utf8');
  return { input, data: validateJobPackage(input) };
}

async function capture(page, name, fullPage) {
  await mkdir('docs/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve('docs/screenshots', name), fullPage });
}

test('job creation requires a site and the exact discipline/type choices, then retains custom names and description', async ({ page, context, browser }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chromium';
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const entries = page.locator('[data-action="create"]');
  await expect.poll(() => entries.count()).toBeGreaterThan(0);
  for (const entry of await entries.all()) await expect(entry).toBeDisabled();
  await expect(page.locator('[data-form="job"]')).toHaveCount(0);
  if (mobile) await capture(page, 'mobile-create-disabled.png', false);

  await page.locator('[data-action="sites"]').first().click();
  await page.locator('[data-form="site"]').getByRole('textbox', { name: 'Site name', exact: true }).fill('Synthetic classification site');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic classification site', exact: true })).toBeVisible();
  await page.locator('[data-action="home"]').first().click();
  for (const entry of await entries.all()) await expect(entry).toBeEnabled();
  await entries.first().click();

  const form = page.locator('[data-form="job"]');
  const site = form.getByRole('combobox', { name: 'Site', exact: true });
  const discipline = form.getByRole('combobox', { name: 'Discipline', exact: true });
  const jobType = form.getByRole('combobox', { name: 'Job type', exact: true });
  const description = form.getByRole('textbox', { name: 'Description', exact: true });
  const create = form.getByRole('button', { name: 'Create job', exact: true });
  await expect(form.locator('select')).toHaveCount(3);
  await expect(form.locator('textarea')).toHaveCount(1);
  await expect(form.locator('input:visible')).toHaveCount(0);
  for (const control of [site, discipline, jobType, description]) {
    await expect(control).toHaveJSProperty('required', true);
    await expect(control).toHaveValue('');
  }
  expect(await discipline.locator('option').evaluateAll(options => options.filter(option => option.value).map(option => option.textContent))).toEqual(disciplines);
  expect(await jobType.locator('option').evaluateAll(options => options.filter(option => option.value).map(option => option.textContent))).toEqual(jobTypes);
  await capture(page, mobile ? 'mobile-create-job.png' : 'desktop-create-job.png', !mobile);
  await create.click();
  await expect(form).toBeVisible();
  expect(await savedJobCount(page)).toBe(0);

  await site.selectOption({ label: 'Synthetic classification site' });
  await discipline.selectOption('Fire');
  await jobType.selectOption('Maintenance');
  await description.fill('   ');
  await create.click();
  await expect(form).toBeVisible();
  expect(await savedJobCount(page)).toBe(0);

  await discipline.selectOption('Custom');
  await jobType.selectOption('Custom');
  const customDiscipline = form.getByRole('textbox', { name: 'Custom discipline', exact: true });
  const customJobType = form.getByRole('textbox', { name: 'Custom job type', exact: true });
  await expect(customDiscipline).toBeVisible();
  await expect(customDiscipline).toHaveJSProperty('required', true);
  await expect(customJobType).toHaveJSProperty('required', true);
  await description.fill('Synthetic suppression witness visit and recorded engineer observations.');
  await create.click();
  await expect(form).toBeVisible();
  expect(await savedJobCount(page)).toBe(0);
  await customDiscipline.fill('Gas suppression');
  await create.click();
  expect(await customJobType.evaluate(input => input.validity.valueMissing)).toBe(true);
  expect(await savedJobCount(page)).toBe(0);
  await customJobType.fill('Acceptance witness');
  await create.click();
  await expect(page.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
  await expect(page.locator('.wf-readout[data-hold-field="customDiscipline"]')).toContainText('Gas suppression');
  await expect(page.locator('.wf-readout[data-hold-field="customWorkType"]')).toContainText('Acceptance witness');
  await expect(page.locator('.wf-readout[data-hold-field="description"]')).toContainText('Synthetic suppression witness visit');
  expect(await savedJobCount(page)).toBe(1);
  await page.locator('.job-title [data-edit-field="customWorkType"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Custom job type', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Custom job type', exact: true })).toHaveValue('Acceptance witness');
  await page.locator('.wf-editor').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.wf-editor')).toHaveCount(0);
  await expect(page.locator('.wf-readout[data-hold-field="customWorkType"]')).toContainText('Acceptance witness');

  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('job-card')).toHaveCount(1);
  await expect(page.getByTestId('job-card')).toContainText('Acceptance witness');
  await page.getByTestId('job-card').click();
  const exported = await exportJob(page);
  expect(exported.data.job.discipline).toBe('Custom');
  expect(exported.data.job.customDiscipline).toBe('Gas suppression');
  expect(exported.data.job.workType).toBe('Custom');
  expect(exported.data.job.customWorkType).toBe('Acceptance witness');
  expect(exported.data.job.revision).toBe(1);
  expect(exported.data.job.workflow.details.description).toBe('Synthetic suppression witness visit and recorded engineer observations.');
  expect(exported.data.job.results).toEqual([]);
  await page.locator('#job-file').setInputFiles({ name: 'same-custom-job.jobs.json', mimeType: 'application/json', buffer: Buffer.from(exported.input) });
  await expect(page.locator('#notice')).toContainText('already saved');
  expect(await savedJobCount(page)).toBe(1);
  const existing = await exportJob(page);
  expect(existing.data.job.id).toBe(exported.data.job.id);
  expect(existing.data.site.id).toBe(exported.data.site.id);
  expect(existing.data.job.revision).toBe(1);

  const receiving = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: testInfo.project.use.viewport });
  try {
    const reopened = await receiving.newPage();
    await reopened.goto('/');
    await reopened.locator('#job-file').setInputFiles({ name: 'custom-classification.jobs.json', mimeType: 'application/json', buffer: Buffer.from(exported.input) });
    await expect(reopened.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
    await expect(reopened.locator('.wf-readout[data-hold-field="customDiscipline"]')).toContainText('Gas suppression');
    await expect(reopened.locator('.wf-readout[data-hold-field="customWorkType"]')).toContainText('Acceptance witness');
    const returned = await exportJob(reopened);
    expect(returned.data.job).toEqual(exported.data.job);
  } finally { await receiving.close(); }
});
