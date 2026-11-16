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
