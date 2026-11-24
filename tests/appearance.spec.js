import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importZoneSketch } from '../src/zone-import.js';
import { newJob } from '../src/model.js';
import { createJobPackage } from '../src/packages.js';
import { openJobSection } from './helpers/job-creation.js';

const appearanceSelect = page => page.getByRole('combobox', { name: 'Appearance', exact: true });
const appearanceToggle = page => page.getByRole('button', { name: /^Switch to (light|dark) mode$/ });
const appearance = page => appearanceSelect(page).or(appearanceToggle(page));

async function chooseAppearance(page, preference) {
  const menu=page.locator('.compact-appearance-settings');
  if (!(await menu.getAttribute('open') !== null)) await menu.locator('summary').click();
  await expect(appearance(page)).toBeVisible();
  if (await appearanceSelect(page).count()) await appearanceSelect(page).selectOption(preference);
  else await page.getByRole('button', { name: `Switch to ${preference} mode`, exact: true }).click();
}

async function expectTheme(page, preference, resolved) {
  await expect(page.locator('html')).toHaveAttribute('data-appearance', preference);
  await expect(page.locator('html')).toHaveAttribute('data-theme', resolved);
  if (await appearanceSelect(page).isVisible()) await expect(appearanceSelect(page)).toHaveValue(preference);
  else if (await appearanceToggle(page).isVisible()) await expect(appearanceToggle(page)).toHaveAttribute('aria-label', `Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`);
  expect(await page.locator('html').evaluate(node => node.style.colorScheme)).toBe(resolved);
}

async function home(page) {
  await page.locator('[data-action="home"]:visible').first().click();
}

async function assertNoOverflow(page) {
  try {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= Math.min(innerWidth, document.documentElement.clientWidth) + 1)).toBeTruthy();
  } catch (error) {
    try {
      const diagnostics = await page.evaluate(() => {
        const crossing = [...document.body.querySelectorAll('*')].flatMap(node => {
          const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
          if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return [];
          const overflow = Math.max(0, -rect.left, rect.right - innerWidth);
          if (overflow <= 1) return [];
          return [{
            tag: node.tagName, id: node.id, classes: node.getAttribute('class'),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
            computed: { width: style.width, minWidth: style.minWidth, maxWidth: style.maxWidth, position: style.position, overflowX: style.overflowX },
            parent: node.parentElement ? { tag: node.parentElement.tagName, id: node.parentElement.id, classes: node.parentElement.getAttribute('class'), overflowX: getComputedStyle(node.parentElement).overflowX } : null,
            overflow,
          }];
        }).sort((a, b) => b.overflow - a.overflow).slice(0, 20);
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          innerWidth, scrollX,
          visualViewport: visualViewport ? { width: visualViewport.width, scale: visualViewport.scale, offsetLeft: visualViewport.offsetLeft } : null,
          crossing,
        };
      });
      const json = JSON.stringify(diagnostics, null, 2);
      console.log('LAYOUT_OVERFLOW', json);
      await test.info().attach('layout-overflow.json', { body: json, contentType: 'application/json' });
      const screenshot = test.info().outputPath('layout-overflow.png');
      await page.screenshot({ path: screenshot, fullPage: true });
      await test.info().attach('layout-overflow.png', { path: screenshot, contentType: 'image/png' });
    } catch (diagnosticError) {
      console.log('Overflow diagnostics could not complete:', diagnosticError.message);
    }
    throw error;
  }
}

/** Contrast against the actual nearest painted surfaces, including translucent controls. */
async function contrast(locator) {
  return locator.evaluate(node => {
    const rgba = color => {
      const values = color.match(/[\d.]+/g)?.map(Number) || [];
      return [values[0] || 0, values[1] || 0, values[2] || 0, values[3] ?? 1];
    };
    const over = (front, back) => front.slice(0, 3).map((channel, i) => channel * front[3] + back[i] * (1 - front[3]));
    const ancestors = [];
    for (let current = node; current; current = current.parentElement) ancestors.unshift(current);
    let background = [255, 255, 255];
    for (const ancestor of ancestors) background = over(rgba(getComputedStyle(ancestor).backgroundColor), background);
    const foreground = over(rgba(getComputedStyle(node).color), background);
    const luminance = channels => channels.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const foregroundLight = luminance(foreground), backgroundLight = luminance(background);
    return { ratio: (Math.max(foregroundLight, backgroundLight) + 0.05) / (Math.min(foregroundLight, backgroundLight) + 0.05), backgroundLight };
  });
}

async function readable(locator, { dark = false } = {}) {
  await expect(locator).toBeVisible();
  const colors = await contrast(locator);
  expect(colors.ratio).toBeGreaterThanOrEqual(4.5);
  if (dark) expect(colors.backgroundLight).toBeLessThan(0.2);
}

test('System follows the device and an explicit appearance survives reload without following later device changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expectTheme(page, 'system', 'dark');
  const darkChrome = await page.locator('meta[name="theme-color"]').getAttribute('content');

  await chooseAppearance(page, 'light');
  await expectTheme(page, 'light', 'light');
  expect(await page.locator('meta[name="theme-color"]').getAttribute('content')).not.toBe(darkChrome);
  await page.reload();
  await expectTheme(page, 'light', 'light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'light', 'light');

  // The mobile home has a single quick toggle. Jobs retain the full selector
  // so an engineer can explicitly return to following the system appearance.
  if (!await appearanceSelect(page).count()) {
    await page.locator('[data-action="create"]:visible').first().click();
    await expect(page.locator('.job-notes')).toBeVisible();
  }
  await chooseAppearance(page, 'system');
  await expectTheme(page, 'system', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'system', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'system', 'dark');
  await assertNoOverflow(page);
});

test('changing appearance preserves an unsaved notebook and the saved theme and note reopen offline', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.locator('[data-action="create"]:visible').first().click();
  const notes = page.locator('.job-notes');
  const editor = notes.getByRole('textbox', { name: 'Job notes', exact: true });
  await notes.getByRole('textbox', { name: 'Job title', exact: true }).fill('Synthetic dark-mode visit');
  await editor.fill('Unfinished observations must survive an appearance change.');
  const originalEditor = await editor.elementHandle();
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');

  for (const preference of ['dark', 'light', 'dark']) {
    await chooseAppearance(page, preference);
    await expectTheme(page, preference, preference);
    expect(await originalEditor.evaluate(node => node.isConnected)).toBe(true);
    await expect(editor).toContainText('Unfinished observations must survive an appearance change.');
    await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  }
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' Further work can still be recorded.');
  await readable(editor);
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await expect(page.locator('#offline-status')).toContainText('Ready offline');

  await context.setOffline(true);
  await page.reload();
  await expectTheme(page, 'dark', 'dark');
  await page.getByTestId('job-card').click();
  await expect(editor).toContainText('Further work can still be recorded.');
  await chooseAppearance(page, 'light');
  await expectTheme(page, 'light', 'light');
  await expect(page.getByTestId('save-status')).toContainText('Saved');
});

test('dark tools, timesheets and plan results remain readable while drawings and printed reports keep their original paper', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  await chooseAppearance(page, 'dark');
  await readable(appearance(page), { dark: true });
  await page.screenshot({ path: testInfo.outputPath('dark-overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Toolbox', exact: true }).click();
  const chest = page.locator('.toolbox-chest');
  await expect(chest).toBeVisible();
  await readable(chest.locator('[data-toolbox-open="battery"] strong'), { dark: true });
  await chest.locator('[data-toolbox-open="battery"]').click();
  await readable(chest.locator('[name="standbyCurrent"]'), { dark: true });
  await chest.locator('.toolbox-chest-close').click();

  const mobile = page.getByRole('navigation', { name: 'Mobile workspace', exact: true });
  if (testInfo.project.use.isMobile) await mobile.getByRole('button', { name: 'Timesheets', exact: true }).click();
  else await page.locator('[data-action="timesheets"]:visible').first().click();
  await readable(page.locator('.timesheet-empty'), { dark: true });
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  const session = page.getByRole('dialog', { name: 'Add session', exact: true });
  await readable(session.getByLabel('Description', { exact: true }), { dark: true });
  await session.getByRole('button', { name: 'Cancel', exact: true }).click();
  await home(page);

  if (testInfo.project.use.isMobile) {
    await mobile.getByRole('button', { name: 'About', exact: true }).click();
    await readable(page.locator('.mw-about-card p').first(), { dark: true });
    await page.getByRole('button', { name: 'Help & data', exact: true }).click();
  } else await page.locator('[data-action="help"]:visible').first().click();
  await readable(page.locator('.release-help p').first(), { dark: true });
  await home(page);

  const sample = JSON.parse(await readFile(resolve('public/demo.zonesketch.json'), 'utf8'));
  const { site } = await importZoneSketch(sample);
  const job = newJob(site, { engineer: 'Synthetic Engineer' });
  const pack = await createJobPackage(site, job);
  await page.locator('#job-file').setInputFiles({ name: 'synthetic-dark-plan.jobs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect(page.locator('.job-notes')).toBeVisible();
  await openJobSection(page, 'Plan');
  await expect(page.getByTestId('plan-png')).toBeVisible();
  await expect(page.locator('.plan-preview-stage')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.mouse.move(0, 0);
  await expect(page.locator('.plan-device-hit').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const firstRow = page.locator('.plan-asset-work-row').first();
  const pass = firstRow.getByRole('button', { name: 'Pass', exact: true });
  const fail = firstRow.getByRole('button', { name: 'Fail', exact: true });
  await pass.click();
  await expect(pass).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await readable(pass);
  await readable(fail);
  expect(await pass.evaluate(node => getComputedStyle(node).backgroundColor)).not.toBe(await fail.evaluate(node => getComputedStyle(node).backgroundColor));
  if (testInfo.project.use.isMobile) await page.setViewportSize({ width: 320, height: 844 });
  await assertNoOverflow(page);
  await appearance(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('dark-plan.png'), fullPage: true });

  await openJobSection(page, 'Finalisation');
  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole('button', { name: 'Print report', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-print-report', 'ready');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#print-report')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await readable(page.locator('#print-report'));
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});
