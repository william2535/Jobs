import { test, expect } from '@playwright/test';
import { newSite, newJob } from '../src/model.js';
import { createJobPackage } from '../src/packages.js';
import { updateWorkflow } from '../src/job-workflow.js';

async function importPackage(page, site, job) {
  const pack = await createJobPackage(site, job);
  await page.locator('#job-file').setInputFiles({ name: 'synthetic-dashboard.jobs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
  await page.locator('[data-action="home"]:visible').first().click();
}

async function capture(page, path) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.screenshot({ path, fullPage: true });
}

test('mobile dashboard navigation and schedule reflect the saved records', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, 'This shell is specific to mobile screens.');
  await page.goto('/');
  const dates = await page.evaluate(() => {
    const local = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const today = new Date(), tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    return { today: local(today), tomorrow: local(tomorrow) };
  });
  const site = newSite('Synthetic dashboard site');
  let completed = newJob(site, { engineer: 'Dashboard Engineer' });
  completed = updateWorkflow(completed, 'details', { reference: 'DASH-01', title: 'Synthetic completed visit' });
  completed = updateWorkflow(completed, 'appointments', { date: dates.today, start: '09:00', end: '11:30', engineer: 'Dashboard Engineer' });
  completed = updateWorkflow(completed, 'products', { description: 'Synthetic cable', quantity: 3, unit: 'm', unitCost: 2, currency: 'GBP', complete: true });
  completed = updateWorkflow(completed, 'timesheets', { date: dates.today, start: '09:00', end: '11:30', hours: '', note: 'Synthetic recorded attendance.' });
  completed = updateWorkflow(completed, 'finalisation', { status: 'Complete', technicianNote: 'Visit record only.' });
  let planned = newJob(site, { engineer: 'Second Engineer' });
  planned = updateWorkflow(planned, 'details', { reference: 'DASH-02', title: 'Synthetic planned repair' });
  planned = updateWorkflow(planned, 'appointments', { date: dates.tomorrow, start: '13:00', end: '14:00', engineer: 'Second Engineer' });
  await importPackage(page, site, completed);
  await importPackage(page, site, planned);

  const nav = page.getByRole('navigation', { name: 'Mobile workspace', exact: true });
  await expect(nav).toBeVisible();
  await expect(page.locator('.mw-ring').nth(0)).toHaveText('1 of 2');
  await expect(page.locator('.mw-ring').nth(1)).toHaveText('2:30');
  await expect(page.getByTestId('job-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByTestId('job-card')).toHaveCount(1);
  await expect(page.getByTestId('job-card')).toContainText('DASH-01');
  await page.getByRole('button', { name: 'Tomorrow', exact: true }).click();
  await expect(page.getByTestId('job-card')).toHaveCount(1);
  await expect(page.getByTestId('job-card')).toContainText('DASH-02');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByTestId('job-card')).toHaveCount(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo.outputPath('mobile-dashboard.png'));

  await nav.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Find a job', exact: true }).fill('DASH-02');
  await expect(page.getByTestId('job-card')).toHaveCount(1);
  await capture(page, testInfo.outputPath('mobile-tasks.png'));
  await page.getByTestId('job-card').click();
  await expect(page.getByRole('navigation', { name: 'Job workflow' })).toBeVisible();
  await expect(page.locator('.job-notes').getByRole('textbox', { name: 'Job title', exact: true })).toHaveValue('Synthetic planned repair');
  await page.locator('[data-action="home"]:visible').first().click();
  await nav.getByRole('button', { name: 'Stock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stock & materials', exact: true })).toBeVisible();
  await expect(page.locator('.mw-record-card')).toContainText('Synthetic cable');
  await expect(page.locator('.mw-record-card')).toContainText('3 m');
  await capture(page, testInfo.outputPath('mobile-stock.png'));
  await nav.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await expect(page.locator('.mw-screen-description')).toContainText('2:30 recorded');
  await expect(page.locator('.mw-record-card')).toContainText('Synthetic recorded attendance.');
  await capture(page, testInfo.outputPath('mobile-timesheets.png'));
  await nav.getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'About Jobs', exact: true })).toBeVisible();
  await expect(page.locator('.mw-about-card')).toContainText('FINDR adapter are future work');
  await capture(page, testInfo.outputPath('mobile-about.png'));
  await nav.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByLabel('Choose date', { exact: true }).fill(dates.tomorrow);
  await expect(page.getByTestId('job-card')).toHaveCount(1);
  await expect(page.getByTestId('job-card')).toContainText('DASH-02');
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await expect(nav).toBeVisible();
  const actions = page.locator('.mw-shortcuts > button');
  await expect(actions).toHaveCount(4);
  const first = await actions.nth(0).boundingBox(), second = await actions.nth(1).boundingBox();
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo.outputPath('mobile-dashboard-320.png'));
});
