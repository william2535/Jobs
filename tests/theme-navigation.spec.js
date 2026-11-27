import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { newSite } from '../src/model.js';
import { createWorkspaceBackup } from '../src/workspace-backup.js';

const demo = await readFile(new URL('../public/demo.zonesketch.json', import.meta.url));
const appearance = page => page.getByRole('combobox', { name: 'Appearance', exact: true });

async function action(page, name) {
  await expect(page.locator('body')).toHaveAttribute('data-page', /\S+/);
  const visible = page.locator(`[data-action="${name}"]:visible`);
  if (await visible.count()) return visible.first().click();
  const menu = page.locator('.jobs-mobile-menu');
  await menu.locator('summary').click();
  await menu.locator(`[data-action="${name}"]`).click();
}

async function menuAction(page, name, mobile) {
  if (!mobile) return action(page, name);
  const menu = page.locator('.jobs-mobile-menu');
  if (!await menu.evaluate(node => node.open)) await menu.locator('summary').click();
  await menu.locator(`[data-action="${name}"]`).click();
}

async function noOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBeTruthy();
}

/** Inspect the actual painted surface rather than a theme token or class name. */
async function colors(locator) {
  return locator.evaluate(node => {
    const rgba = color => { const c = color.match(/[\d.]+/g)?.map(Number) || []; return [c[0] || 0, c[1] || 0, c[2] || 0, c[3] ?? 1]; };
    const over = (a, b) => a.slice(0, 3).map((channel, index) => channel * a[3] + b[index] * (1 - a[3]));
    const ancestors = []; for (let current = node; current; current = current.parentElement) ancestors.unshift(current);
    let backgrounds = [[255, 255, 255]];
    for (const el of ancestors) {
      const style = getComputedStyle(el);
      backgrounds = backgrounds.map(bg => over(rgba(style.backgroundColor), bg));
      // Branded headers use a CSS gradient. Check every endpoint, including the
      // lighter one, instead of accidentally comparing white text to the page.
      const stops = style.backgroundImage.match(/rgba?\([^)]*\)/g);
      if (stops) backgrounds = backgrounds.flatMap(bg => stops.map(color => over(rgba(color), bg)));
    }
    const luminance = c => c.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return backgrounds.map(background => {
      const foreground = over(rgba(getComputedStyle(node).color), background), a = luminance(foreground), b = luminance(background);
      return { background, light: b, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    }).sort((a, b) => a.ratio - b.ratio)[0];
  });
}

async function readableSurface(locator, theme) {
  await expect(locator).toBeVisible();
  const value = await colors(locator);
  expect(value.ratio, `Text contrast on ${await locator.evaluate(node => node.className || node.tagName)}`).toBeGreaterThanOrEqual(4.5);
  if (theme === 'dark') expect(value.light).toBeLessThan(.2);
  else expect(value.light).toBeGreaterThan(.7);
}

async function sharedShell(page, { mobile, theme, route }) {
  await expect(page.locator('body')).toHaveAttribute('data-page', route);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(appearance(page)).toBeVisible();
  await expect(page.getByTestId('save-status')).toBeVisible();
  const header = page.locator('.workspace > header');
  await expect(header).toBeVisible();
  expect((await colors(header.locator('.jobs-banner-title, .jobs-header-context strong').first())).ratio).toBeGreaterThanOrEqual(4.5);
  if (mobile) {
    await expect(page.locator('.sidebar')).toBeHidden();
    const nav = page.getByRole('navigation', { name: 'Workspace navigation', exact: true });
    await expect(nav).toBeVisible();
    const menu = nav.locator('.jobs-mobile-menu');
    await expect(menu).not.toHaveAttribute('open', '');
    expect((await menu.locator('summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(menu.locator('[data-action="help"]')).toBeHidden();
    await menu.locator('summary').click();
    for (const name of ['home', 'sites', 'timesheets', 'toolbox', 'create', 'help']) {
      const button = menu.locator(`[data-action="${name}"]`);
      await expect(button).toBeVisible();
      const rect = await button.boundingBox(); expect(rect.height).toBeGreaterThanOrEqual(44);
      expect((await colors(button)).ratio).toBeGreaterThanOrEqual(4.5);
    }
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await expect(menu.locator('summary')).toBeFocused();
    await expect(menu.locator('[data-action="create"]')).toBeHidden();
  } else await expect(page.locator('.sidebar')).toBeVisible();
  await noOverflow(page);
}

async function storedSites(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('jobs-local'); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('sites', 'readonly'), request = tx.objectStore('sites').getAll();
      tx.oncomplete = () => { db.close(); resolve(request.result); }; tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}

for (const preference of ['light', 'dark', 'system']) {
  test(`${preference} appearance stays consistent through Sites, site folders, help and import reviews`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const mobile = !!testInfo.project.use.isMobile, theme = preference === 'light' ? 'light' : 'dark';
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addInitScript(preference => localStorage.setItem('jobs-appearance', preference), preference);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-appearance', preference);
    await action(page, 'sites');
    await sharedShell(page, { mobile, theme, route: 'sites' });
    await readableSurface(page.locator('[data-form="site"] input[name="name"]'), theme);
    const headerColor = await page.locator('.workspace > header').evaluate(node => getComputedStyle(node).backgroundColor);
    const headerImage = await page.locator('.workspace > header').evaluate(node => getComputedStyle(node).backgroundImage);
    const form = page.locator('[data-form="site"]');
    const siteName = `Synthetic ${preference} navigation site`;
    await form.getByRole('textbox', { name: 'Site name', exact: true }).fill(siteName);
    await form.getByRole('textbox', { name: 'Address', exact: true }).fill('Synthetic training address');
    await form.getByRole('button', { name: 'Save site', exact: true }).click();
    await sharedShell(page, { mobile, theme, route: 'site' });
    await expect(page.getByRole('heading', { name: siteName, exact: true })).toBeVisible();
    await readableSurface(page.locator('.site-profile').getByRole('textbox', { name: 'Address', exact: true }), theme);
    if (mobile) {
      const controls = page.locator('.site-profile input:not([type="checkbox"]), .site-profile select, .site-profile textarea');
      for (const control of await controls.all()) if (await control.isVisible()) {
        const dimensions = await control.evaluate(node => ({ font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height }));
        expect(dimensions.font).toBeGreaterThanOrEqual(16); expect(dimensions.height).toBeGreaterThanOrEqual(44);
      }
    }
    // Top-level sections share the new branded banner. A saved site keeps its
    // contextual identity; compare contextual screens with each other below.
    const contextHeaderColor = await page.locator('.workspace > header').evaluate(node => getComputedStyle(node).backgroundColor);
    const contextHeaderImage = await page.locator('.workspace > header').evaluate(node => getComputedStyle(node).backgroundImage);
    await page.screenshot({ path: testInfo.outputPath(`${preference}-site-folder.png`), fullPage: true });
    await action(page, 'sites');
    await expect(page.locator('.site-card')).toHaveCount(1);
    await readableSurface(page.locator('.site-card').first(), theme);
    await action(page, 'help');
    await sharedShell(page, { mobile, theme, route: 'help' });
    await readableSurface(page.locator('.release-help p').first(), theme);
    await expect(page.locator('.workspace > header')).toHaveCSS('background-color', headerColor);
    await expect(page.locator('.workspace > header')).toHaveCSS('background-image', headerImage);
    await page.locator('#zone-file').setInputFiles({ name: 'synthetic-theme.zonesketch.json', mimeType: 'application/json', buffer: demo });
    await sharedShell(page, { mobile, theme, route: 'review' });
    await readableSurface(page.locator('#match-site'), theme);
    await expect(page.locator('.workspace > header')).toHaveCSS('background-color', contextHeaderColor);
    await expect(page.locator('.workspace > header')).toHaveCSS('background-image', contextHeaderImage);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-page', 'home');
    expect(await storedSites(page)).toHaveLength(1);
    await action(page, 'sites');
    await page.locator('.site-card').click();
    await expect(page.locator('.site-profile').getByRole('textbox', { name: 'Address', exact: true })).toHaveValue('Synthetic training address');
    if (preference === 'system') {
      await page.emulateMedia({ colorScheme: 'light' });
      await sharedShell(page, { mobile, theme: 'light', route: 'site' });
      await readableSurface(page.locator('.site-profile').getByRole('textbox', { name: 'Address', exact: true }), 'light');
      expect((await storedSites(page))[0].name).toBe(siteName);
    }
  });
}

test('mobile Menu and contextual Back preserve unfinished site forms until discard is confirmed', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const mobile = !!testInfo.project.use.isMobile;
  if (mobile) await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/'); await action(page, 'sites');
  const form = page.locator('[data-form="site"]');
  await form.getByRole('textbox', { name: 'Site name', exact: true }).fill('Synthetic guarded site');
  await form.getByRole('textbox', { name: 'Address', exact: true }).fill('Unfinished synthetic address');
  await appearance(page).selectOption('dark');
  await expect(form.getByRole('textbox', { name: 'Site name', exact: true })).toHaveValue('Synthetic guarded site');
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await noOverflow(page);
  page.once('dialog', async dialog => { expect(dialog.type()).toBe('confirm'); await dialog.dismiss(); });
  await menuAction(page, 'home', mobile);
  await expect(page.locator('body')).toHaveAttribute('data-page', 'sites');
  await expect(form.getByRole('textbox', { name: 'Address', exact: true })).toHaveValue('Unfinished synthetic address');
  expect(await storedSites(page)).toHaveLength(0);
  await form.getByRole('button', { name: 'Save site', exact: true }).click();
  const profile = page.locator('.site-profile');
  await expect(profile).toBeVisible();
  await profile.getByRole('textbox', { name: 'Address', exact: true }).fill('UNSAVED_SITE_ADDRESS');
  page.once('dialog', async dialog => { expect(dialog.type()).toBe('confirm'); await dialog.dismiss(); });
  await action(page, 'sites');
  await expect(profile.getByRole('textbox', { name: 'Address', exact: true })).toHaveValue('UNSAVED_SITE_ADDRESS');
  expect((await storedSites(page))[0].address).toBe('Unfinished synthetic address');
  page.once('dialog', async dialog => { expect(dialog.type()).toBe('confirm'); await dialog.accept(); });
  await action(page, 'sites');
  await expect(page.locator('body')).toHaveAttribute('data-page', 'sites');
  await page.locator('.site-card').click();
  await expect(profile.getByRole('textbox', { name: 'Address', exact: true })).toHaveValue('Unfinished synthetic address');
  await profile.getByRole('textbox', { name: 'Address', exact: true }).fill('Saved revised synthetic address');
  await profile.getByRole('button', { name: 'Save site details', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  await action(page, 'sites'); await page.reload(); await action(page, 'sites');
  await page.locator('.site-card').click();
  await expect(profile.getByRole('textbox', { name: 'Address', exact: true })).toHaveValue('Saved revised synthetic address');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await noOverflow(page);
});

test('backup review uses the shared theme and navigation without restoring until confirmed', async ({ page }, testInfo) => {
  const mobile = !!testInfo.project.use.isMobile;
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/'); await action(page, 'sites'); await action(page, 'help');
  const backup = await createWorkspaceBackup({ sites: [newSite('Synthetic theme backup site', 'Backup address')], jobs: [], quickDefects: [], unassignedTimesheets: [], assetTemplates: [] });
  const file = { name: 'synthetic-theme.jobs-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) };
  await page.locator('#workspace-file').setInputFiles(file);
  await sharedShell(page, { mobile, theme: 'dark', route: 'backup-review' });
  await readableSurface(page.locator('main .panel p').first(), 'dark');
  expect(await storedSites(page)).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await sharedShell(page, { mobile, theme: 'dark', route: 'help' });
  expect(await storedSites(page)).toHaveLength(0);
  await appearance(page).selectOption('light');
  await page.locator('#workspace-file').setInputFiles(file);
  await sharedShell(page, { mobile, theme: 'light', route: 'backup-review' });
  await readableSurface(page.locator('main .panel p').first(), 'light');
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-page', 'home');
  await action(page, 'sites');
  await expect(page.locator('.site-card')).toHaveCount(1);
  await expect(page.locator('.site-card')).toContainText('Synthetic theme backup site');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('Toolbox restores visible focus after resizing in both directions without losing an unfinished site', async ({ page }) => {
  // A touch-capable 1280px viewport is an iPad-sized workspace. Use a width
  // above the tablet range when this test explicitly needs desktop navigation.
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto('/');
  await action(page, 'sites');
  const form = page.locator('[data-form="site"]');
  const name = form.getByRole('textbox', { name: 'Site name', exact: true });
  const address = form.getByRole('textbox', { name: 'Address', exact: true });
  await name.fill('Synthetic resize draft');
  await address.fill('Keep this unfinished address');
  const originalForm = await form.elementHandle();
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });

  const chest = page.getByRole('dialog', { name: 'Pick a tool', exact: true });
  const desktopToolbox = page.locator('.sidebar [data-action="toolbox"]');
  const mobileToolbox = page.locator('.jobs-mobile-menu [data-action="toolbox"]');
  await desktopToolbox.click();
  await expect(chest).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(desktopToolbox).toBeHidden();
  await expect(mobileToolbox).toBeVisible();
  await chest.getByRole('button', { name: 'Close toolbox', exact: true }).click();
  await expect(chest).toBeHidden();
  await expect(mobileToolbox).toBeFocused();
  await expect(mobileToolbox).toHaveAttribute('aria-expanded', 'false');
  await expect(name).toHaveValue('Synthetic resize draft');
  await expect(address).toHaveValue('Keep this unfinished address');
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await noOverflow(page);

  await mobileToolbox.click();
  await expect(chest).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  if (await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches)) {
    await expect(desktopToolbox).toBeHidden();
    await expect(mobileToolbox).toBeVisible();
    await expect(name).toHaveValue('Synthetic resize draft');
  }
  await page.setViewportSize({ width: 1536, height: 900 });
  await expect(mobileToolbox).toBeHidden();
  await expect(desktopToolbox).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(chest).toBeHidden();
  await expect(desktopToolbox).toBeFocused();
  await expect(desktopToolbox).toHaveAttribute('aria-expanded', 'false');
  expect(await originalForm.evaluate(node => node.isConnected)).toBe(true);
  await expect(name).toHaveValue('Synthetic resize draft');
  await expect(address).toHaveValue('Keep this unfinished address');
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  expect(dialogs).toEqual([]);
  expect(await storedSites(page)).toHaveLength(0);

  await form.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-page', 'site');
  const [saved] = await storedSites(page);
  expect(saved.name).toBe('Synthetic resize draft');
  expect(saved.address).toBe('Keep this unfinished address');
});
