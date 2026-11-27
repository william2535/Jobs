import { test, expect } from '@playwright/test';

test('an active offline worker can reclaim a document that missed its initial activation claim', async ({ page, context }) => {
  let intercepted = false;
  await context.route('**/sw.js', async route => {
    const response = await route.fetch();
    const original = await response.text();
    // Reproduce a document arriving after the worker's one-off activation claim.
    // The normal message handler and every cache operation remain unchanged.
    // The build strips comments while serializing this function. The activation
    // path is the only awaited claim; message recovery uses event.waitUntil.
    const initialClaim = /await\s+self\.clients\.claim\(\);/g;
    expect([...original.matchAll(initialClaim)]).toHaveLength(1);
    const withoutInitialClaim = original.replace(initialClaim, '/* Simulate a missed initial claim; message recovery remains enabled. */');
    expect(withoutInitialClaim).not.toBe(original);
    intercepted = true;
    await route.fulfill({ response, body: withoutInitialClaim });
  });
  await page.goto('/');
  await expect.poll(() => intercepted).toBeTruthy();
  await expect(page.locator('#offline-status')).toHaveText('Ready offline');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#offline-status')).toHaveText('Ready offline');
  await page.getByRole('button', { name: 'Timesheets', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Add session', exact: true })).toBeVisible();
});

async function savedNote(page, title) {
  await page.locator('[data-action="create"]:visible').first().click();
  const notes = page.locator('.job-notes');
  await notes.getByRole('textbox', { name: 'Job title', exact: true }).fill(title);
  await notes.getByRole('textbox', { name: 'Job notes', exact: true }).fill('Synthetic retained work for offline startup.');
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device');
}

test('a verified cached workspace opens offline even when service worker registration hangs or rejects', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#offline-status')).toHaveText('Ready offline');
  await savedNote(page, 'Synthetic warm-cache job');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'register', {
      configurable: true,
      value: () => localStorage.getItem('synthetic-registration-mode') === 'reject'
        ? Promise.reject(Error('Synthetic offline registration failure')) : new Promise(() => {}),
    });
  });
  await context.setOffline(true);
  for (const mode of ['hang', 'reject']) {
    await page.evaluate(value => localStorage.setItem('synthetic-registration-mode', value), mode);
    await page.reload();
    await expect(page.locator('#offline-status')).toHaveText('Ready offline');
    await page.getByTestId('job-card').click();
    await expect(page.locator('.job-notes').getByRole('textbox', { name: 'Job title', exact: true })).toHaveValue('Synthetic warm-cache job');
    await expect(page.locator('.job-notes').getByRole('textbox', { name: 'Job notes', exact: true })).toContainText('Synthetic retained work for offline startup.');
    await page.getByRole('button', { name: '‹ Home', exact: true }).click();
  }
});

test('a saved offline timeout can be dismissed while vertical gestures and unsaved work remain usable', async ({ page, browserName }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'register', {
      configurable: true, value: () => Promise.reject(Error('Offline registration timed out. Retry online.')),
    });
  });
  await page.goto('/');
  await expect(page.locator('#offline-status')).toHaveText('Offline registration timed out. Retry online.');
  await savedNote(page, 'Synthetic timeout-banner job');
  const banner = page.locator('.connection');
  const close = page.getByRole('button', { name: 'Hide saved and offline status', exact: true });
  await expect(close).toBeVisible();
  await close.click();
  await expect(banner).toBeHidden();
  await page.getByRole('button', { name: '‹ Home', exact: true }).click();
  await page.getByTestId('job-card').click();
  await expect(banner).toBeHidden();
  const notes = page.locator('.job-notes');
  await notes.getByRole('textbox', { name: 'Job notes', exact: true }).fill('A new unsaved edit must remain visible even after the banner was dismissed.');
  await expect(banner).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('Unsaved');
  await expect(close).toBeHidden();
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(banner).toBeHidden();

  // Reopen the same saved status in a fresh presentation session. These pointer
  // events exercise app gesture handling; native hardware swipes are not claimed.
  await page.evaluate(() => sessionStorage.removeItem('jobs-status-banner-dismissed-v1'));
  await page.reload();
  await expect(close).toBeVisible();
  await expect(banner).toHaveCSS('touch-action', 'pan-y');
  const verticalWasPrevented = await page.locator('#offline-status').evaluate(target => {
    const events = [
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 91, isPrimary: true, clientX: 100, clientY: 100 }),
      new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 91, isPrimary: true, clientX: 103, clientY: 170 }),
      new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 91, isPrimary: true, clientX: 103, clientY: 170 }),
    ];
    for (const event of events) target.dispatchEvent(event);
    return events.some(event => event.defaultPrevented);
  });
  expect(verticalWasPrevented).toBe(false);
  await expect(banner).toBeVisible();
  const bounds = await banner.boundingBox();
  if (browserName === 'webkit' && testInfo.project.use.isMobile) {
    // Playwright cannot issue native wheel/swipe scrolling on mobile WebKit.
    // The uncancelled gesture and pan-y assertions above cover that handler;
    // verify the page remains scrollable without claiming a hardware gesture.
    await page.evaluate(() => scrollBy(0, 350));
  } else {
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.wheel(0, 350);
  }
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.locator('#offline-status').evaluate(target => {
    for (const [type, x] of [['pointerdown', 100], ['pointermove', 180], ['pointerup', 180]])
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 92, isPrimary: true, clientX: x, clientY: 100 }));
  });
  await expect(banner).toBeHidden();
  await page.getByTestId('job-card').click();
  await expect(page.locator('.job-notes').getByRole('textbox', { name: 'Job notes', exact: true })).toContainText('A new unsaved edit must remain visible');
});
