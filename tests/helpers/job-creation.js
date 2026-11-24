import { expect } from '@playwright/test';

/** Reach optional detail tools through the same settings entry used by an engineer. */
export async function openJobSection(page, section) {
  if (section === 'Settings') {
    await page.getByRole('button', { name: 'Job settings', exact: true }).click();
    return;
  }
  const label = ({ 'Job details': 'Details', Checklist: 'Quick checklist' })[section] || section;
  const target = ({ Details: 'Job details', 'Quick checklist': 'Checklist' })[label] || section;
  if (await page.locator('body').getAttribute('data-job-tab') === target) return;
  const primary = page.getByRole('navigation', { name: 'Job workflow', exact: true });
  if (section === 'Plan') {
    await primary.getByRole('button', { name: 'Assets', exact: true }).click();
    await page.getByRole('button', { name: 'View plan', exact: true }).click();
    return;
  }
  if (section === 'Devices') {
    await openJobSection(page, 'Plan');
    await page.getByRole('button', { name: 'Devices', exact: true }).click();
    return;
  }
  const primaryButton = primary.getByRole('button', { name: label, exact: true });
  if (await primaryButton.count()) {
    await primaryButton.click();
    return;
  }
  const shown = page.getByRole('button', { name: label, exact: true });
  if (await shown.count() && await shown.first().isVisible()) {
    await shown.first().click();
    return;
  }
  await page.getByRole('button', { name: 'Job settings', exact: true }).click();
  const more = page.getByText('More job tools', { exact: true });
  if (await more.count()) {
    const details = more.locator('..');
    if (await details.evaluate(node => node.tagName === 'DETAILS' && !node.open)) await more.click();
  }
  // Settings may render the same action as the workflow navigation.
  const settingsButton = page.locator('.job-settings').getByRole('button', { name: label, exact: true });
  if (await settingsButton.count()) await settingsButton.click();
  else {
    const workflowButton = primary.getByRole('button', { name: label, exact: true });
    if (await workflowButton.count() && await workflowButton.isVisible()) await workflowButton.click();
    else await page.getByRole('button', { name: label, exact: true }).click();
  }
}

/** Configure a visit only where a test needs classification; quick creation itself has no required fields. */
export async function fillJobCreation(page, {
  siteName, discipline = 'Fire', jobType = 'Maintenance', description = 'Synthetic training visit',
} = {}) {
  await page.getByRole('button', { name: 'Job settings', exact: true }).click();
  const form = page.locator('.job-settings');
  const details = form.locator('details');
  for (const disclosure of await details.all()) {
    if (!await disclosure.evaluate(node => node.open)) await disclosure.locator(':scope > summary').click();
  }
  const site = form.getByRole('combobox', { name: 'Site (optional)', exact: true });
  if (await site.count() && await site.isEnabled()) {
    if (siteName) await site.selectOption({ label: siteName });
    else if (!await site.inputValue()) {
      const firstSite = await site.locator('option').evaluateAll(options => options.find(option => option.value)?.value);
      if (firstSite) await site.selectOption(firstSite);
    }
  }
  await form.getByRole('combobox', { name: 'Discipline', exact: true }).selectOption({ label: discipline });
  await form.getByRole('combobox', { name: 'Job type', exact: true }).selectOption({ label: jobType });
  await form.getByRole('textbox', { name: 'Description', exact: true }).fill(description);
}

export async function saveJobCreation(page, { openDetails = true } = {}) {
  await page.locator('.job-settings').getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  if (openDetails) await openJobSection(page, 'Details');
}

export async function clickExportJob(page, { restore = true } = {}) {
  const previous = await page.locator('body').getAttribute('data-job-tab');
  await openJobSection(page, 'Finalisation');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export job', exact: true }).click();
  await page.getByRole('button', { name: 'Editable Jobs file (.json)', exact: true }).click();
  const download = await pending;
  if (restore && previous && previous !== 'Finalisation') await openJobSection(page, previous);
  return download;
}
