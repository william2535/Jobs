import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { newSite, newJob } from '../src/model.js';
import { createJobPackage } from '../src/packages.js';
import { normalizeWorkflow } from '../src/job-workflow.js';
import { newDeviceRemark } from '../src/device-remarks.js';
import { createFireMaintenanceDraft, createFireMaintenanceEquipment, saveFireMaintenance } from '../src/fire-maintenance.js';
import { openJobSection } from './helpers/job-creation.js';

const exec = promisify(execFile);
const sample = JSON.parse(await readFile(resolve('public/demo.zonesketch.json'), 'utf8'));
const picture = sample.project.floors[0].data.symbols.find(symbol => symbol.photos?.length).photos[0].image;
const photo = caption => ({ id: crypto.randomUUID(), image: picture, caption });

async function syntheticReport() {
  const site = newSite('Synthetic Training Site', 'Training address — no customer information');
  const drawing = site.drawings[0], floor = drawing.floors[0];
  drawing.assets = Array.from({ length: 16 }, (_, index) => ({
    id: `synthetic-report-asset-${index + 1}`, floorId: floor.id, floorName: floor.name,
    type: index === 0 ? 'panel' : 'smoke', typeName: index === 0 ? 'Fire panel' : 'Smoke detector',
    reference: `SYN-${String(index + 1).padStart(2, '0')}`, photos: index === 0 ? [photo('Synthetic source photograph')] : [],
    drawingStatus: 'Existing',
  }));
  const job = newJob(site, { discipline: 'Fire', workType: 'Maintenance', engineer: 'Synthetic Engineer', scope: 'Synthetic planned inspection and recorded limitations.' });
  job.workflow = normalizeWorkflow(job);
  Object.assign(job.workflow.details, { reference: 'SYN-REPORT-001', title: 'Synthetic multi-page service report', client: 'Synthetic Training Client', internalNote: 'PRIVATE_JOB_TOKEN' });
  Object.assign(job.workflow.finalisation, { technicianNote: 'Synthetic technician handover note.', invoiceNote: 'PRIVATE_INVOICE_TOKEN' });
  job.notesDocument = { version: 1, blocks: [{ id: crypto.randomUUID(), type: 'paragraph', align: 'left', runs: [{ text: 'Synthetic report note with engineer observations.', bold: true }] }], photos: [photo('Synthetic job note photograph')] };
  for (const [index, result] of job.results.entries()) {
    result.notes = `Synthetic device ${index + 1}. Access and equipment condition recorded for this training example. No unrecorded work is treated as tested. Device marker SYNTHETIC_DEVICE_${index + 1}_END.`;
  }
  job.results[0].state = 'Unsatisfactory';
  job.results[0].observations = 'Synthetic panel fault observed during the engineer functional check.';
  job.results[0].photos = [photo('Synthetic visit photograph')];
  const finding = newDeviceRemark('Custom note');
  Object.assign(finding, { title: 'Synthetic open panel fault', description: 'A synthetic fault requires follow-up.', severity: 'Major defect', internalNote: 'PRIVATE_REMARK_TOKEN', recommendation: 'Arrange the recorded follow-up work.', beforePhotos: [photo('Synthetic fault evidence')] });
  const repair = newDeviceRemark('Custom note');
  Object.assign(repair, { title: 'Synthetic completed repair', description: 'The synthetic cover was secured.', severity: 'Minor defect', status: 'Resolved', internalNote: 'PRIVATE_REPAIR_TOKEN', resolvedPhotos: [photo('Synthetic repair evidence')] });
  job.results[0].remarks = { version: 1, items: [finding, repair], history: [] };
  const maintenance = createFireMaintenanceDraft(job, drawing);
  Object.assign(maintenance.fields, { visitDate: '2026-10-01', engineer: 'Earlier Synthetic Engineer', company: 'Earlier Synthetic Company', scope: 'Earlier synthetic maintenance scope', limitations: 'Fifteen device checks are still not recorded.', conditionLeft: 'Synthetic panel fault remains for follow-up.', engineerName: 'Synthetic Engineer' });
  maintenance.systemAnswers['mcp-siting'] = { value: 'Pass', notes: '' };
  maintenance.systemAnswers['logbook-updated'] = { value: 'Fail', notes: 'Synthetic logbook update remains outstanding.' };
  maintenance.systemAnswers['logbook-location'] = { value: 'Synthetic reception cupboard', notes: '' };
  maintenance.systemAnswers['false-alarms-12-months'] = { value: 0, notes: '' };
  const panel = createFireMaintenanceEquipment('fire-panel', drawing.assets[0]);
  panel.answers['panel-quiescent-current'] = { value: 0, notes: '' };
  panel.answers['panel-controls'] = { value: 'Fail', notes: 'Synthetic indicator fault recorded.' };
  const battery = createFireMaintenanceEquipment('battery');
  battery.label = 'Synthetic manually recorded standby battery';
  battery.answers['battery-charge-voltage'] = { value: 27.4, notes: '' };
  maintenance.equipment.push(panel, battery);
  job.fireMaintenance = saveFireMaintenance(job, maintenance, drawing);
  job.revision += 1;
  const updatedMaintenance = createFireMaintenanceDraft(job, drawing);
  Object.assign(updatedMaintenance.fields, { visitDate: '2026-11-14', engineer: 'Synthetic Engineer', company: 'Synthetic Service Company', scope: 'Synthetic maintenance scope' });
  job.fireMaintenance = saveFireMaintenance(job, updatedMaintenance, drawing);
  return { package: await createJobPackage(site, job), job };
}

test('service reports contain saved maintenance and evidence, prepare photos before printing and retain a multi-page printable snapshot', async ({ page }, testInfo) => {
  const synthetic = await syntheticReport();
  await page.goto('/');
  await page.locator('#job-file').setInputFiles({ name: 'synthetic-service-report.jobs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(synthetic.package)) });
  await expect(page.locator('.job-notes')).toBeVisible();
  await openJobSection(page, 'Finalisation');
  const report = page.locator('.job-report-preview .service-report');
  await expect(report.getByRole('heading', { name: 'Fire maintenance report', exact: true })).toBeVisible();
  await expect(report).toContainText('Synthetic Training Site');
  await expect(report).toContainText('Not a certificate of compliance');
  await expect(report.locator('.service-report-header')).toHaveCSS('position', 'static');
  expect(synthetic.job.fireMaintenance.revision).toBe(2);
  expect(synthetic.job.fireMaintenance.history).toHaveLength(1);
  for (const text of ['Earlier maintenance revision 1', '2026-10-01', 'Earlier Synthetic Engineer', 'Earlier Synthetic Company', 'Earlier synthetic maintenance scope']) {
    await expect(report.locator('.service-report-archived')).toContainText(text);
  }
  for (const text of ['2026-11-14', 'Synthetic Service Company', 'Synthetic maintenance scope']) await expect(report.locator('.service-report-cover')).toContainText(text);
  const major = report.locator('.service-report-defect-summary [data-severity="Major defect"]');
  expect(await major.locator('td').allTextContents()).toEqual(['Major defect', '1', '0', '0']);
  expect(await report.locator('.service-report-defect-summary [data-severity="Minor defect"] td').allTextContents()).toEqual(['Minor defect', '0', '1', '0']);
  await expect(report.locator('.service-report-servicing-summary')).toContainText('1 tested · 15 not tested');
  const systemQuestions = report.locator('.service-report-maintenance .service-report-system-questions');
  await expect(systemQuestions.locator('tr').filter({ hasText: 'How many false alarms' }).locator('td').nth(1)).toHaveText('0');
  await expect(systemQuestions.locator('tr').filter({ hasText: 'Did the audible and visual alarm outputs' }).locator('td').nth(1)).toHaveText('Not recorded');
  await expect(report.locator('.service-report-maintenance .service-report-equipment-questions').filter({ hasText: 'SYN-01' })).toContainText('0 mA');
  await expect(report.locator('.service-report-repairs')).toContainText('Synthetic completed repair');
  for (const token of ['PRIVATE_JOB_TOKEN', 'PRIVATE_INVOICE_TOKEN', 'PRIVATE_REMARK_TOKEN', 'PRIVATE_REPAIR_TOKEN']) await expect(report).not.toContainText(token);
  await expect(report.locator('button,input,textarea,select')).toHaveCount(0);
  await expect(report.getByAltText('Synthetic repair evidence', { exact: true })).toHaveAttribute('src', picture);
  await page.evaluate(() => {
    window.__printCalls = [];
    window.__decodeHeld = 0;
    const decodeGate = new Promise(resolve => { window.__releaseDecode = resolve; });
    const decode = HTMLImageElement.prototype.decode;
    window.__restoreDecode = () => { HTMLImageElement.prototype.decode = decode; };
    HTMLImageElement.prototype.decode = function(...args) {
      const ready = decode.apply(this, args);
      if (!this.closest('[data-print-preparation]')) return ready;
      window.__decodeHeld += 1;
      return ready.then(() => decodeGate);
    };
    window.print = () => {
      const report = document.querySelector('#print-report');
      window.__printCalls.push({
        text: report?.textContent || '',
        controls: report?.querySelectorAll('button,input,textarea,select').length,
        images: [...(report?.querySelectorAll('img') || [])].map(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight })),
      });
    };
  });
  await page.getByRole('button', { name: 'Print report', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__decodeHeld)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__printCalls)).toEqual([]);
  await page.evaluate(() => { window.__restoreDecode(); window.__releaseDecode(); });
  await expect.poll(() => page.evaluate(() => window.__printCalls.length)).toBe(1);
  const printed = await page.evaluate(() => window.__printCalls[0]);
  expect(printed.images.length).toBeGreaterThan(0);
  expect(printed.images.every(image => image.complete && image.width > 0 && image.height > 0)).toBe(true);
  expect(printed.controls).toBe(0);
  expect(printed.text).toContain('SYNTHETIC_DEVICE_16_END');
  await expect(page.locator('#print-report')).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#print-report')).toContainText('Synthetic Training Site');
  // Native browser-menu printing must rebuild from saved data, never a stale retained DOM.
  await page.evaluate(() => {
    document.querySelector('#print-report').textContent = 'STALE_SNAPSHOT_TOKEN';
    window.dispatchEvent(new Event('beforeprint'));
  });
  await expect(page.locator('#print-report')).toContainText('Synthetic Training Site');
  await expect(page.locator('#print-report')).not.toContainText('STALE_SNAPSHOT_TOKEN');
  await expect(page.locator('#print-report button,#print-report input,#print-report textarea,#print-report select')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  if (testInfo.project.name === 'desktop-chromium') {
    const pdf = testInfo.outputPath('synthetic-fire-service-report.pdf');
    await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
    const { stdout: metadata } = await exec('pdfinfo', [pdf]);
    const pages = Number(metadata.match(/^Pages:\s+(\d+)/m)?.[1]);
    expect(pages).toBeGreaterThan(1);
    const { stdout: text } = await exec('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 8 * 1024 * 1024 });
    expect(text).toContain('Fire maintenance report');
    expect(text).toContain('Synthetic Training Site');
    expect(text).toContain('SYNTHETIC_DEVICE_16_END');
    expect(text).toContain('Synthetic repair evidence');
    expect(text).toContain('Earlier Synthetic Engineer');
    expect(text).toContain('Earlier synthetic maintenance scope');
    expect(text).not.toContain('PRIVATE_');
    expect(text).not.toContain('Maintenance questions');
    expect(text).not.toContain('Save maintenance');
    expect(text).not.toContain('Create job');
    await testInfo.attach('Synthetic A4 service report', { path: pdf, contentType: 'application/pdf' });
    for (const [label, pageNumber] of [['first', 1], ['last', pages]]) {
      const prefix = testInfo.outputPath(`synthetic-service-report-${label}`);
      await exec('pdftoppm', ['-f', String(pageNumber), '-singlefile', '-scale-to', '1200', '-png', pdf, prefix]);
      await testInfo.attach(`Report ${label} page`, { path: `${prefix}.png`, contentType: 'image/png' });
    }
  }
  await page.getByRole('button', { name: '‹ Home', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('#print-report')).toHaveCount(0);
});

test('a failed report image decode preserves the last good report, unlocks the app and allows printing again', async ({ page }) => {
  const synthetic = await syntheticReport();
  await page.goto('/');
  await page.locator('#job-file').setInputFiles({ name: 'synthetic-print-retry.jobs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(synthetic.package)) });
  await expect(page.locator('.job-notes')).toBeVisible();
  await openJobSection(page, 'Finalisation');
  await page.evaluate(() => { window.__printCalls = 0; window.print = () => { window.__printCalls += 1; }; });
  const print = page.getByRole('button', { name: 'Print report', exact: true });
  await print.click();
  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('afterprint'));
    window.__goodReport = document.querySelector('#print-report');
    const decode = HTMLImageElement.prototype.decode;
    window.__restoreDecode = () => { HTMLImageElement.prototype.decode = decode; };
    let failNext = true;
    HTMLImageElement.prototype.decode = function(...args) {
      if (failNext && this.closest('[data-print-preparation]')) { failNext = false; return Promise.reject(new Error('Synthetic decode failure')); }
      return decode.apply(this, args);
    };
  });
  await print.click();
  await expect(page.locator('#notice')).toContainText('The report was not printed');
  expect(await page.evaluate(() => window.__printCalls)).toBe(1);
  expect(await page.evaluate(() => document.querySelector('#print-report') === window.__goodReport)).toBe(true);
  await expect(page.locator('#print-report')).toContainText('Synthetic Training Site');
  await expect.poll(() => page.locator('main').evaluate(main => main.inert)).toBe(false);
  await expect(print).toBeEnabled();
  await expect(page.locator('[data-print-preparation]')).toHaveCount(0);
  await page.evaluate(() => window.__restoreDecode());
  await print.click();
  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(2);
  expect(await page.evaluate(() => document.querySelector('#print-report') === window.__goodReport)).toBe(false);
  await expect(page.locator('#print-report')).toContainText('SYNTHETIC_DEVICE_16_END');
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
});
