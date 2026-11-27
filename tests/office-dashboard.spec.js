import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createQuickJob, newSite } from '../src/model.js';
import { createJobPackage } from '../src/packages.js';
import { createDayPack, inspectDayPack } from '../src/day-pack.js';
import { startOfficeDay, finishOfficeDay } from '../src/day-session.js';
import { saveTimesheet } from '../src/timesheets.js';
import { addJobAsset } from '../src/asset-library.js';
import { importZoneSketch } from '../src/zone-import.js';

const DAY = '2026-11-27';
const NEXT = '2026-11-28';
const OFFICE = 'synthetic-office-tracking';
const fileFor = (name, value) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
const nameKey = name => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

async function stored(page, store) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const request = indexedDB.open('jobs-local');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction(name, 'readonly'), result = transaction.objectStore(name).getAll();
      transaction.oncomplete = () => { db.close(); resolve(result.result); };
      transaction.onabort = transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }), store);
}
async function metadata(page, key) { return (await stored(page, 'metadata')).find(row => row.key === key)?.value || []; }
async function offline(page, context) {
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-action="create"]:visible').first()).toBeEnabled();
}
async function download(page, button) {
  await expect(button).toBeEnabled();
  const pending = page.waitForEvent('download');
  await button.click();
  const result = await pending;
  return { name: result.suggestedFilename(), mimeType: 'application/json', buffer: await readFile(await result.path()) };
}
async function openChest(page) {
  await page.getByRole('button', { name: 'Transfer job pack', exact: true }).first().click();
  const chest = page.getByRole('dialog', { name: 'Quick Transfer', exact: true });
  await expect(chest).toBeVisible();
  return chest;
}
async function closeChest(page) {
  await page.getByRole('dialog', { name: 'Quick Transfer', exact: true }).getByRole('button', { name: 'Close transfer', exact: true }).click();
}
async function recordJobWork(page, start, finish) {
  await page.clock.setFixedTime(new Date(`${DAY}T${start}:00Z`));
  await page.getByRole('button', { name: 'Start work', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Finish work', exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date(`${DAY}T${finish}:00Z`));
  await page.getByRole('button', { name: 'Finish work', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
}
async function addSession(page, type, start, finish) {
  await page.getByRole('button', { name: 'Add session', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add session', exact: true });
  await editor.getByLabel('Type', { exact: true }).selectOption(type);
  await editor.getByLabel('Start', { exact: true }).fill(`${DAY}T${start}`);
  await editor.getByLabel('Finish', { exact: true }).fill(`${DAY}T${finish}`);
  await editor.getByLabel('Description', { exact: true }).fill(`Synthetic ${type.toLowerCase()} session`);
  await editor.getByRole('button', { name: 'Save session', exact: true }).click();
  await expect(editor).toBeHidden();
}
async function syntheticReturn(engineer, date, jobMinutes) {
  const job = createQuickJob(null, { title: `Synthetic ${nameKey(engineer)} ${date}` });
  job.engineer = engineer;
  let state = { sites: [], jobs: [job] };
  const assignment = await createDayPack(state, { jobIds: [job.id], engineer, date, officeId: OFFICE });
  const started = startOfficeDay(state, { packId: assignment.packId, engineer, date, officeId: OFFICE, jobIds: [job.id], at: `${date}T08:00:00.000Z`, localStart: `${date}T08:00` });
  state = saveTimesheet(started.state, { id: `${job.id}-work`, date, start: '08:00', endDate: date, end: `${String(8 + Math.floor(jobMinutes / 60)).padStart(2, '0')}:${String(jobMinutes % 60).padStart(2, '0')}`, engineer, sessionType: 'Work', customType: '', hours: null, note: 'Synthetic completed job time' }, { jobId: job.id });
  const finished = finishOfficeDay(state, started.day.id, { at: `${date}T16:00:00.000Z`, localFinish: `${date}T16:00` });
  return createDayPack(finished.state, { kind: 'return', day: finished.day, officeId: OFFICE });
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (character === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift().map(value => value.replace(/^\uFEFF/, ''));
  return rows.filter(row => row.some(Boolean)).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}
async function officeCsv(page, dashboard) {
  return parseCsv((await download(page, dashboard.getByRole('button', { name: 'Export office CSV', exact: true }))).buffer.toString());
}
function dayRow(rows, engineer, date) { return rows.find(row => nameKey(row.Engineer) === nameKey(engineer) && row.Date === date); }

// Separate saved browser workspaces use real JSON downloads/imports. NFC routing
// is exercised by its URL; no physical tag, radio or device transport is mocked.
test('a confirmed NFC engineer tag follows work back to the desktop office, where packs sort and amendments count once', async ({ browser }, testInfo) => {
  test.setTimeout(210_000);
  const contexts = await Promise.all([
    browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'UTC', acceptDownloads: true }),
    browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, timezoneId: 'UTC', acceptDownloads: true }),
  ]);
  try {
    const pages = [];
    for (const context of contexts) {
      await context.addInitScript(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(`${DAY}T08:00:00.000Z`));
      await page.goto('/'); pages.push(page);
    }
    const [phone, office] = pages;
    await expect(phone.locator('.mobile-workspace')).toBeVisible();
    await expect(phone.locator('.office-dashboard')).toHaveCount(0);
    const dashboard = office.getByRole('region', { name: 'Engineer day tracking', exact: true });
    await expect(dashboard).toBeVisible();
    for (let index = 0; index < contexts.length; index++) await offline(pages[index], contexts[index]);

    const assignedJob = createQuickJob(null, { title: 'Synthetic NFC-tagged fire visit' });
    const assignment = await createDayPack({ sites: [], jobs: [assignedJob] }, { jobIds: [assignedJob.id], engineer: 'Office assignee placeholder', date: DAY, officeId: OFFICE });
    await phone.goto(`/#jobs-tap=office&office=${OFFICE}`);
    const prompt = phone.getByRole('dialog', { name: 'Engineer tag', exact: true });
    await expect(prompt).toBeVisible();
    expect(await metadata(phone, 'office-days')).toEqual([]);
    await prompt.getByLabel('Your name', { exact: true }).fill('  Alex   Morgan  ');
    await prompt.getByRole('button', { name: 'Continue as engineer', exact: true }).click();
    await expect(prompt).toBeHidden();
    const chest = phone.getByRole('dialog', { name: 'Quick Transfer', exact: true });
    const choose = phone.waitForEvent('filechooser');
    await chest.getByRole('button', { name: /Receive job pack/ }).click();
    await (await choose).setFiles(fileFor('synthetic-assignment.jobsday.json', assignment));
    const review = phone.getByRole('dialog', { name: 'Receive day pack', exact: true });
    await expect(review.getByLabel('Engineer', { exact: true })).toHaveValue('Alex Morgan');
    await review.getByRole('button', { name: 'Collect & start day', exact: true }).click();
    await expect(review).toBeHidden();
    await expect(chest).toContainText('Day in progress');
    expect((await metadata(phone, 'office-days'))[0].engineer).toBe('Alex Morgan');
    expect((await stored(phone, 'jobs'))[0].engineer).toBe('Alex Morgan');
    const individual = await download(phone, chest.getByRole('button', { name: /Nearby \/ share job pack/ }));
    expect(JSON.parse(individual.buffer.toString()).job.engineer).toBe('Alex Morgan');
    await closeChest(phone);

    await phone.getByTestId('job-card').first().click();
    await recordJobWork(phone, '09:00', '12:00');
    await recordJobWork(phone, '12:30', '15:30');
    await phone.getByRole('button', { name: '‹ Home', exact: true }).click();
    await phone.getByRole('button', { name: 'Timesheets', exact: true }).filter({ visible: true }).click();
    await phone.getByLabel('Timesheet date', { exact: true }).fill(DAY);
    await addSession(phone, 'Travel', '08:00', '09:00');
    await addSession(phone, 'Break', '12:00', '12:30');
    expect((await metadata(phone, 'unassigned-timesheets')).map(entry => entry.engineer)).toEqual(['Alex Morgan', 'Alex Morgan']);
    await phone.goto('/');
    await phone.clock.setFixedTime(new Date(`${DAY}T16:00:00.000Z`));
    const finishChest = await openChest(phone);
    await finishChest.getByRole('button', { name: 'Review & finish day', exact: true }).click();
    await finishChest.getByRole('button', { name: 'Finish day', exact: true }).click();
    const originalReturn = await download(phone, finishChest.getByRole('button', { name: 'Share finished day', exact: true }));
    const inspected = await inspectDayPack(originalReturn.buffer.toString());
    expect(inspected.summary).toMatchObject({ engineer: 'Alex Morgan', attendanceMinutes: 480, unallocatedMinutes: 30 });
    await closeChest(phone);

    const casey = await syntheticReturn('Casey Reed', DAY, 240);
    const alexFollowingDay = await syntheticReturn(' alex   MORGAN ', NEXT, 120);
    const legacyJob = createQuickJob(null, { title: 'Synthetic untagged legacy visit' });
    const legacy = await createJobPackage(null, legacyJob);
    const caseyLooseJob = createQuickJob(null, { title: 'Synthetic Casey loose job' });
    caseyLooseJob.engineer = 'Casey Reed';
    const caseyLoose = await createJobPackage(null, caseyLooseJob);
    const picker = dashboard.getByLabel('Receive day pack files', { exact: true });
    await picker.setInputFiles([fileFor('casey.jobsday.json', casey), { name: 'broken.jobsday.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') }]);
    await expect(dashboard.getByRole('alert')).toBeVisible();
    expect(await stored(office, 'jobs')).toEqual([]);
    expect(await metadata(office, 'office-receipts')).toEqual([]);

    await office.clock.setFixedTime(new Date(`${NEXT}T17:00:00.000Z`));
    await picker.setInputFiles([originalReturn, fileFor('casey.jobsday.json', casey), fileFor('alex-next.jobsday.json', alexFollowingDay), fileFor('legacy.jobs.json', legacy), fileFor('casey-loose.jobs.json', caseyLoose)]);
    await expect(dashboard.locator('.office-day')).toHaveCount(3);
    expect(await metadata(office, 'office-days')).toEqual([]);
    expect(await metadata(office, 'office-receipts')).toHaveLength(3);
    const engineerChoices = await dashboard.getByRole('combobox', { name: 'Engineer', exact: true }).locator('option').allTextContents();
    expect(engineerChoices.filter(name => nameKey(name) === 'alex morgan')).toHaveLength(1);
    expect(engineerChoices.filter(name => nameKey(name) === 'casey reed')).toHaveLength(1);
    await dashboard.locator('.office-untagged > summary').click();
    await expect(dashboard).toContainText('Synthetic untagged legacy visit');
    let rows = await officeCsv(office, dashboard);
    expect(rows).toHaveLength(3);
    expect(dayRow(rows, 'Alex Morgan', DAY)).toMatchObject({ 'Attendance minutes': '480', 'Job work minutes': '360', 'Travel minutes': '60', 'Break minutes': '30', 'Unallocated minutes': '30', 'Job time utilisation %': '75' });
    expect(dayRow(rows, 'Casey Reed', DAY)).toMatchObject({ 'Attendance minutes': '480', 'Job work minutes': '240', 'Job time utilisation %': '50' });
    expect(dayRow(rows, 'Alex Morgan', NEXT)).toMatchObject({ 'Attendance minutes': '480', 'Job work minutes': '120', 'Job time utilisation %': '25' });
    const caseyValue = await dashboard.getByRole('combobox', { name: 'Engineer', exact: true }).locator('option').evaluateAll(options => options.find(option => option.textContent.trim() === 'Casey Reed').value);
    await dashboard.getByRole('combobox', { name: 'Engineer', exact: true }).selectOption(caseyValue);
    await expect(dashboard.locator('.office-day')).toHaveCount(1);
    await expect(dashboard.getByRole('button', { name: /Synthetic Casey loose job/ })).toBeVisible();
    await dashboard.getByRole('combobox', { name: 'Engineer', exact: true }).selectOption('');
    await expect(dashboard.locator('.office-day')).toHaveCount(3);

    await phone.getByTestId('job-card').first().click();
    const notes = phone.locator('.job-notes');
    await notes.getByRole('textbox', { name: 'Job notes', exact: true }).fill('Synthetic amended return: retained engineer work and corrected note.');
    await notes.getByRole('button', { name: 'Save', exact: true }).click();
    await phone.getByRole('button', { name: '‹ Home', exact: true }).click();
    const amendedChest = await openChest(phone);
    const amendedReturn = await download(phone, amendedChest.getByRole('button', { name: 'Share finished day', exact: true }));
    const amended = await inspectDayPack(amendedReturn.buffer.toString());
    expect(amended.pack.day.id).toBe(inspected.pack.day.id);
    expect(amended.pack.packId).not.toBe(inspected.pack.packId);
    await office.clock.setFixedTime(new Date(`${NEXT}T18:00:00.000Z`));
    await picker.setInputFiles(amendedReturn);
    await expect.poll(async () => (await metadata(office, 'office-receipts')).length).toBe(4);
    await expect(dashboard.locator('.office-day')).toHaveCount(3);
    rows = await officeCsv(office, dashboard);
    expect(rows).toHaveLength(3);
    expect(dayRow(rows, 'Alex Morgan', DAY)).toMatchObject({ 'Attendance minutes': '480', 'Job work minutes': '360', 'Job time utilisation %': '75' });

    const engineerSelect = dashboard.getByRole('combobox', { name: 'Engineer', exact: true });
    const alexValue = await engineerSelect.locator('option').evaluateAll(options => options.find(option => option.textContent.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() === 'alex morgan').value);
    await engineerSelect.selectOption(alexValue);
    await expect(dashboard.locator('.office-day')).toHaveCount(2);
    await dashboard.getByLabel('From date', { exact: true }).fill(NEXT);
    await dashboard.getByLabel('To date', { exact: true }).fill(NEXT);
    await dashboard.getByLabel('To date', { exact: true }).press('Tab');
    await expect(dashboard.locator('.office-day')).toHaveCount(1);
    rows = await officeCsv(office, dashboard);
    expect(rows).toHaveLength(1);
    expect(dayRow(rows, 'Alex Morgan', NEXT)['Job time utilisation %']).toBe('25');
    await dashboard.locator('.office-day > summary').click();
    await dashboard.getByRole('button', { name: 'Open timesheets', exact: true }).click();
    await expect(office.locator('.timesheets-ui')).toBeVisible();
    await expect(office.getByLabel('Timesheet date', { exact: true })).toHaveValue(NEXT);
    const selectedEngineer = await office.getByLabel('Engineer filter', { exact: true }).locator('option:checked').textContent();
    expect(nameKey(selectedEngineer)).toBe('alex morgan');
    await expect(office.locator('.timesheet-work-total')).toHaveText('8:00');
    await office.reload();
    await expect(dashboard).toBeVisible();
    expect(await metadata(office, 'office-receipts')).toHaveLength(4);
    await expect.poll(() => office.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await office.getByRole('combobox', { name: 'Appearance', exact: true }).selectOption('dark');
    await office.screenshot({ path: testInfo.outputPath('office-engineer-days-dark.png'), fullPage: true, animations: 'disabled' });
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('receiving an ordinary job after an NFC name confirmation preserves its existing engineer tag', async ({ page }) => {
  await page.goto(`/#jobs-tap=office&office=${OFFICE}`);
  const prompt = page.getByRole('dialog', { name: 'Engineer tag', exact: true });
  await prompt.getByLabel('Your name', { exact: true }).fill('Synthetic receiving manager');
  await prompt.getByRole('button', { name: 'Continue as engineer', exact: true }).click();
  const job = createQuickJob(null, { title: 'Synthetic already tagged returned job' });
  job.engineer = 'Casey Reed';
  const pack = await createJobPackage(null, job);
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('dialog', { name: 'Quick Transfer', exact: true }).getByRole('button', { name: /Receive job pack/ }).click();
  await (await picker).setFiles(fileFor('tagged-engineer.jobs.json', pack));
  await expect(page.locator('.job-notes')).toBeVisible();
  expect((await stored(page, 'jobs'))[0].engineer).toBe('Casey Reed');
  expect(await metadata(page, 'office-days')).toEqual([]);
});

test('changing the collecting engineer updates later NFC tags and includes newly saved jobs in that engineer day', async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${DAY}T08:00:00.000Z`));
  await page.goto(`/#jobs-tap=office&office=${OFFICE}`);
  const prompt = page.getByRole('dialog', { name: 'Engineer tag', exact: true });
  await prompt.getByLabel('Your name', { exact: true }).fill('Alex Morgan');
  await prompt.getByRole('button', { name: 'Continue as engineer', exact: true }).click();
  const assigned = createQuickJob(null, { title: 'Synthetic reassigned day visit' });
  const pack = await createDayPack({ sites: [], jobs: [assigned] }, { jobIds: [assigned.id], engineer: 'Office assignment', date: DAY, officeId: OFFICE });
  await page.locator('#job-file').setInputFiles(fileFor('switch-collector.jobsday.json', pack));
  const review = page.getByRole('dialog', { name: 'Receive day pack', exact: true });
  await expect(review.getByLabel('Engineer', { exact: true })).toHaveValue('Alex Morgan');
  await review.getByLabel('Engineer', { exact: true }).fill('Casey Reed');
  await review.getByRole('button', { name: 'Collect & start day', exact: true }).click();
  await expect(review).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Quick Transfer', exact: true })).toContainText('Casey Reed');

  const ordinary = createQuickJob(null, { title: 'Synthetic untagged received work' });
  const received = await createJobPackage(null, ordinary);
  const choose = page.waitForEvent('filechooser');
  await page.getByRole('dialog', { name: 'Quick Transfer', exact: true }).getByRole('button', { name: /Receive job pack/ }).click();
  await (await choose).setFiles(fileFor('untagged-claimed-job.jobs.json', received));
  await expect(page.locator('.job-notes')).toBeVisible();
  expect((await stored(page, 'jobs')).find(job => job.id === ordinary.id).engineer).toBe('Casey Reed');
  await page.getByRole('button', { name: '‹ Home', exact: true }).click();
  await page.locator('[data-action="create"]:visible').first().click();
  const notes = page.locator('.job-notes');
  await notes.getByRole('textbox', { name: 'Job title', exact: true }).fill('Synthetic extra Casey visit');
  await notes.getByRole('textbox', { name: 'Job notes', exact: true }).fill('Saved while Casey’s day is running.');
  await notes.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-status')).toContainText('Saved');
  const added = (await stored(page, 'jobs')).find(job => job.workflow?.details?.title === 'Synthetic extra Casey visit');
  expect(added.engineer).toBe('Casey Reed');
  const [day] = await metadata(page, 'office-days');
  expect(day.engineer).toBe('Casey Reed');
  expect(day.jobIds).toContain(ordinary.id);
  expect(day.jobIds).toContain(added.id);
  expect(day.status).toBe('running');
});

test('desktop site and asset totals include unassigned work without counting revisions or imported copies twice', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false, timezoneId: 'UTC' });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await offline(page, context);
    const dashboard = page.getByRole('region', { name: 'Engineer day tracking', exact: true });
    const summary = page.getByRole('region', { name: 'Saved sites and assets', exact: true });
    const assetCount = summary.locator('.office-assets-count > summary');
    const waitingCount = summary.locator('.office-waiting-sites > summary');
    await expect(assetCount).toContainText('Assets added');
    await expect(assetCount).toContainText('0');
    await expect(waitingCount).toContainText('0');

    const manualSite = newSite('Synthetic site awaiting drawing');
    const manualJob = createQuickJob(manualSite, { title: 'Synthetic manually surveyed visit', engineer: 'Alex Morgan' });
    let manualState = { sites: [manualSite], jobs: [manualJob] };
    for (const reference of ['SYN-PIR-01', 'SYN-PIR-02'])
      manualState = addJobAsset(manualState, manualJob.id, { reference, type: 'pir', typeName: 'PIR detector' }).state;
    expect(manualState.sites[0].drawings).toHaveLength(3);
    const manualPack = await createJobPackage(manualState.sites[0], manualState.jobs[0]);

    const blankSite = newSite('Synthetic empty site awaiting drawing');
    const blankJob = createQuickJob(blankSite, { title: 'Synthetic empty site visit' });
    const blankPack = await createJobPackage(blankSite, blankJob);
    const source = JSON.parse(await readFile(new URL('../public/demo.zonesketch.json', import.meta.url), 'utf8'));
    const linked = await importZoneSketch(source, { siteId: 'synthetic-office-linked-zone-site' });
    linked.site.name = 'Synthetic linked Zone Sketch site';
    const linkedJob = createQuickJob(linked.site, { title: 'Synthetic linked drawing visit', engineer: 'Casey Reed' });
    const linkedPack = await createJobPackage(linked.site, linkedJob);

    const standalone = createQuickJob(null, { title: 'Synthetic standalone equipment register', engineer: 'Casey Reed' });
    const standaloneState = addJobAsset({ sites: [], jobs: [standalone] }, standalone.id, { reference: 'SYN-CAM-01', type: 'camera', typeName: 'Camera' }).state;
    const standalonePack = await createJobPackage(null, standaloneState.jobs[0]);
    await dashboard.getByLabel('Receive day pack files', { exact: true }).setInputFiles([
      fileFor('manual-site.jobs.json', manualPack), fileFor('blank-site.jobs.json', blankPack),
      fileFor('linked-zone-site.jobs.json', linkedPack), fileFor('standalone-register.jobs.json', standalonePack),
    ]);
    await expect.poll(async () => (await stored(page, 'jobs')).length).toBe(4);
    await expect(assetCount).toContainText('7');
    await expect(waitingCount).toContainText('2');
    expect(await stored(page, 'sites')).toHaveLength(3);
    await waitingCount.click();
    await expect(summary.getByRole('button', { name: `Open site ${manualSite.name}`, exact: true })).toBeVisible();
    await expect(summary.getByRole('button', { name: `Open site ${blankSite.name}`, exact: true })).toBeVisible();
    await expect(summary.locator('.office-waiting-sites')).not.toContainText(linked.site.name);

    const amended = structuredClone(manualState.jobs[0]);
    amended.revision++;
    amended.results[0].notes = 'Synthetic amended visit evidence; equipment identities are unchanged.';
    const amendedPack = await createJobPackage(manualState.sites[0], amended);
    await dashboard.getByLabel('Receive day pack files', { exact: true }).setInputFiles([
      fileFor('manual-repeat.jobs.json', manualPack), fileFor('manual-amended.jobs.json', amendedPack),
      fileFor('standalone-repeat.jobs.json', standalonePack),
    ]);
    await expect.poll(async () => (await stored(page, 'jobs')).length).toBe(5);
    await expect(assetCount).toContainText('7');
    await expect(waitingCount).toContainText('2');
    await dashboard.getByRole('combobox', { name: 'Engineer', exact: true }).selectOption('engineer:casey reed');
    await dashboard.getByLabel('From date', { exact: true }).fill('2027-01-01');
    await dashboard.getByLabel('To date', { exact: true }).fill('2027-01-02');
    await expect(assetCount).toContainText('7');
    await expect(waitingCount).toContainText('2');
    if (!await summary.locator('.office-waiting-sites').evaluate(details => details.open)) await waitingCount.click();
    await summary.getByRole('button', { name: `Open site ${manualSite.name}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: manualSite.name, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Site plan', exact: true })).toBeVisible();
    await page.locator('[data-action="home"]:visible').first().click();
    await assetCount.click();
    await summary.getByRole('button', { name: 'Open job Synthetic standalone equipment register', exact: true }).click();
    await expect(page.locator('.job-notes').getByRole('textbox', { name: 'Job title', exact: true })).toHaveValue('Synthetic standalone equipment register');
    await page.getByRole('button', { name: '‹ Home', exact: true }).click();
    await page.reload();
    await expect(assetCount).toContainText('7');
    await expect(waitingCount).toContainText('2');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath('office-site-asset-totals.png'), fullPage: true, animations: 'disabled' });
  } finally { await context.close(); }
});
