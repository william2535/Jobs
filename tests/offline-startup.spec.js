import { test, expect } from '@playwright/test';

test('an active offline worker can reclaim a document that missed its initial activation claim', async ({ page, context }) => {
  let intercepted = false;
  await context.route('**/sw.js', async route => {
    const response = await route.fetch();
    const original = await response.text();
    // Reproduce a document arriving after the worker's one-off activation claim.
    // The normal message handler and every cache operation remain unchanged.
    const withoutInitialClaim = original.replace('.then(()=>self.clients.claim())', '.then(()=>Promise.resolve())');
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
