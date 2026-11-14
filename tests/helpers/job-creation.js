/** Complete the user-facing creation choices without relying on inferred defaults. */
export async function fillJobCreation(page, {
  siteName, discipline = 'Fire', jobType = 'Maintenance', description = 'Synthetic training visit',
} = {}) {
  const form = page.locator('[data-form="job"]');
  const site = form.getByRole('combobox', { name: 'Site', exact: true });
  if (siteName) await site.selectOption({ label: siteName });
  else if (!await site.inputValue()) {
    const firstSite = await site.locator('option').evaluateAll(options => options.find(option => option.value)?.value);
    await site.selectOption(firstSite);
  }
  await form.getByRole('combobox', { name: 'Discipline', exact: true }).selectOption({ label: discipline });
  await form.getByRole('combobox', { name: 'Job type', exact: true }).selectOption({ label: jobType });
  await form.getByRole('textbox', { name: 'Description', exact: true }).fill(description);
}
