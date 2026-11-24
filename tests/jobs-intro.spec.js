import { test, expect } from '@playwright/test';

const intro = page => page.locator('#jobs-startup');
const skip = page => page.getByRole('button', { name: 'Skip intro', exact: false });

async function openIntro(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(intro(page)).toBeVisible();
  await expect(page.locator('#app')).toHaveJSProperty('inert', true);
  await expect(page.locator('#app')).toHaveAttribute('aria-hidden', 'true');
}

async function workspaceAvailable(page) {
  await expect(intro(page)).toBeHidden();
  await expect(page.locator('#app')).toHaveJSProperty('inert', false);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-action="create"]:visible').first()).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

test('the branded intro ends automatically and leaves job creation usable', async ({ page }) => {
  await openIntro(page);
  const logo = intro(page).locator('img');
  await expect(logo).toHaveAttribute('src', './jobs-logo.webp');
  await expect.poll(() => logo.evaluate(node => node.complete && node.naturalWidth > 0)).toBeTruthy();
  await expect(intro(page).getByText('Timesheets', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await workspaceAvailable(page);
  await page.locator('[data-action="create"]:visible').first().click();
  await expect(page.getByRole('textbox', { name: 'Job title', exact: true })).toBeVisible();
});

test('Skip and Escape restore keyboard access, and refresh does not replay the intro', async ({ page }) => {
  await openIntro(page);
  await page.keyboard.press('Tab');
  await expect(skip(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(skip(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await workspaceAvailable(page);
  expect(await page.locator('#app').evaluate(node => node.contains(document.activeElement))).toBeTruthy();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await workspaceAvailable(page);

  // A new tab has its own session and can still dismiss with the keyboard.
  const other = await page.context().newPage();
  await other.emulateMedia({ reducedMotion: 'no-preference' });
  await openIntro(other);
  await other.keyboard.press('Escape');
  await workspaceAvailable(other);
  expect(await other.locator('#app').evaluate(node => node.contains(document.activeElement))).toBeTruthy();
  await other.close();
});

test('two ordinary taps dismiss without activating the job button underneath', async ({ page }, testInfo) => {
  await openIntro(page);
  const create = page.locator('[data-action="create"]:visible').first();
  await expect(create).toBeVisible();
  const bounds = await create.boundingBox();
  const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  const tap = () => testInfo.project.use.isMobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
  await tap();
  await expect(intro(page)).toBeVisible();
  await tap();
  await workspaceAvailable(page);
  await expect(page.locator('body')).toHaveAttribute('data-page', 'home');
  await expect(page.locator('.job-notes')).toHaveCount(0);
  await create.click();
  await expect(page.getByRole('textbox', { name: 'Job title', exact: true })).toBeVisible();
});

test('reduced motion skips the scene and changing the preference releases an active scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await workspaceAvailable(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(intro(page)).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await workspaceAvailable(page);
});

test('restricted session storage cannot trap the workspace behind the scene', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await workspaceAvailable(page);
  await page.locator('[data-action="create"]:visible').first().click();
  await expect(page.getByRole('textbox', { name: 'Job title', exact: true })).toBeVisible();
});

for (const asset of ['jobs-intro.js', 'jobs-intro.css']) {
  test(`a missing ${asset} leaves the application accessible`, async ({ page }) => {
    await page.route(`**/${asset}`, route => route.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await workspaceAvailable(page);
    await page.locator('[data-action="create"]:visible').first().click();
    await expect(page.getByRole('textbox', { name: 'Job title', exact: true })).toBeVisible();
  });
}

test('the intro works under the Android self-only script policy', async ({ page }) => {
  await page.route(/\/$/, async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'" } });
  });
  await openIntro(page);
  await skip(page).click();
  await workspaceAvailable(page);
});
