// Production-browser visual checks; creates no jobs and imports no customer data.
// JOBS_QA_URL, JOBS_QA_BROWSER, JOBS_QA_CHROMIUM, JOBS_QA_WEBKIT,
// JOBS_QA_OUTPUT and PLAYWRIGHT_MODULE select the installed environment.
// JOBS_QA_CAPTURE_ONLY=1 records a baseline; JOBS_QA_BASELINE compares light surfaces.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browserName = process.env.JOBS_QA_BROWSER || 'chromium';
const base = process.env.JOBS_QA_URL || 'http://127.0.0.1:4173/';
const output = process.env.JOBS_QA_OUTPUT || '/tmp/jobs-dark-qa';
const captureOnly = process.env.JOBS_QA_CAPTURE_ONLY === '1';
const baseline = process.env.JOBS_QA_BASELINE
  ? JSON.parse(await fs.readFile(process.env.JOBS_QA_BASELINE, 'utf8')) : null;
await fs.mkdir(output, { recursive: true });
const result = { browser: browserName, base, captureOnly, samples: [], errors: [], physicalDevice: false, batteryMeasured: false };
let browser, page;

async function surfaces(page, selectors) {
  return page.evaluate(selectors => selectors.map(selector => {
    const node = document.querySelector(selector);
    if (!node) throw Error(`Missing surface: ${selector}`);
    const style = getComputedStyle(node);
    return { selector, background: style.backgroundColor, image: style.backgroundImage,
      color: style.color, opacity: style.opacity, backdrop: style.backdropFilter || style.webkitBackdropFilter || 'none' };
  }), selectors);
}

async function assertNoBlur(page) {
  const blurred = await page.evaluate(() => [...document.querySelectorAll('*')].flatMap(node => {
    const style = getComputedStyle(node);
    if (!node.getClientRects().length || style.visibility === 'hidden' || style.opacity === '0') return [];
    return [null, '::before', '::after'].flatMap(pseudo => {
      const current = getComputedStyle(node, pseudo);
      const filter = current.backdropFilter || current.webkitBackdropFilter || 'none';
      return filter === 'none' ? [] : [{ tag: node.tagName, class: node.className, pseudo, filter }];
    });
  }));
  assert.deepEqual(blurred, [], 'Visible app chrome must not use backdrop blur');
}

async function record(theme, width, section, selectors) {
  const rows = await surfaces(page, selectors);
  const sample = { theme, width, section, surfaces: rows };
  result.samples.push(sample);
  if (!captureOnly && theme === 'dark') {
    for (const row of rows) {
      assert.equal(row.background, 'rgb(0, 0, 0)', `${section} ${row.selector} uses an opaque black surface`);
      assert.equal(row.opacity, '1', `${section} ${row.selector} is not translucent`);
      assert.equal(row.image, 'none', `${section} ${row.selector} has a solid fill`);
      assert.equal(row.backdrop, 'none');
    }
    await assertNoBlur(page);
  }
  if (baseline && theme === 'light') {
    const original = baseline.samples.find(row => row.theme === theme && row.width === width && row.section === section);
    assert.ok(original, `Light baseline exists: ${width}/${section}`);
    assert.deepEqual(rows, original.surfaces, `Light surfaces stay unchanged: ${width}/${section}`);
  }
}

async function bannerPixels(page, width) {
  const png = await page.locator('.workspace > header').screenshot();
  await fs.writeFile(path.join(output, `${browserName}-dark-${width}-banner.png`), png);
  return page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const edges = { top: 0, right: 0, bottom: 0, left: 0 };
    let accentMax = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      const brightness = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
      if (y < 3) edges.top = Math.max(edges.top, brightness);
      if (y >= canvas.height - 3) edges.bottom = Math.max(edges.bottom, brightness);
      if (x < 3) edges.left = Math.max(edges.left, brightness);
      if (x >= canvas.width - 3) edges.right = Math.max(edges.right, brightness);
      // Right half contains no title/logo at the tested widths.
      if (x > canvas.width * .75 && y > 8 && y < canvas.height - 12) accentMax = Math.max(accentMax, pixels[offset + 2] - pixels[offset]);
    }
    return { width: canvas.width, height: canvas.height, outerThreePixelMax: edges, interiorBlueExcessMax: accentMax };
  }, png.toString('base64'));
}

async function progressRing(page, width) {
  const ring = page.locator('.mw-ring').first();
  const png = await ring.screenshot();
  await fs.writeFile(path.join(output, `${browserName}-dark-${width}-zero-progress.png`), png);
  return page.evaluate(async ({ data, selector }) => {
    const ring = document.querySelector(selector), counter = ring.querySelector('strong');
    const foreground = getComputedStyle(counter).color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = foreground.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return { counter: counter.textContent, counterContrastOnBlack: (luminance + .05) / .05,
      innerBackground: getComputedStyle(ring, '::before').backgroundColor,
      topTrackPixel: [...context.getImageData(Math.floor(canvas.width / 2), 3, 1, 1).data] };
  }, { data: png.toString('base64'), selector: '.mw-ring' });
}

try {
  const executablePath = process.env[browserName === 'webkit' ? 'JOBS_QA_WEBKIT' : 'JOBS_QA_CHROMIUM'];
  browser = await playwright[browserName].launch({ headless: true, ...(executablePath ? { executablePath } : {}), ...(browserName === 'chromium' ? { args: ['--no-sandbox'] } : {}) });
  result.browserVersion = browser.version();
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: theme, serviceWorkers: 'allow' });
    await context.addInitScript(theme => localStorage.setItem('jobs-appearance', theme), theme);
    page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => result.errors.push(error.message));
    await page.goto(base);
    await page.locator('#jobs-startup').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('#offline-status')?.textContent === 'Ready offline');
    result.build = await page.evaluate(() => fetch('./offline-manifest.json').then(response => response.json()).then(manifest => manifest.buildId));
    const nav = page.getByRole('navigation', { name: 'Mobile workspace', exact: true });
    for (const width of [390, 820]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1180 });
      let headingAnchor;
      for (const section of ['Dashboard', 'Tasks', 'Timesheets', 'About']) {
        await nav.getByRole('button', { name: section, exact: true }).click();
        const anchor = await page.locator('.jobs-banner-title').evaluate(node => {
          const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
          return { x: rect.x, y: rect.y, height: rect.height, font: style.fontSize, line: style.lineHeight };
        });
        if (headingAnchor) assert.deepEqual(anchor, headingAnchor, 'Changing sections does not move or resize the banner title');
        else headingAnchor = anchor;
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal body overflow');
        const targets = ['html', 'body', '.workspace', 'main', '.mobile-workspace', '.mw-bottom-nav'];
        if (section === 'Dashboard') targets.push('.mw-empty', '.mw-shortcuts button');
        if (section === 'Timesheets') targets.push('.timesheet-shell');
        if (section === 'About') targets.push('.mw-about-card');
        if (theme === 'dark') targets.push('.connection');
        await record(theme, width, section, targets);
        if (section === 'Dashboard') {
          await page.screenshot({ path: path.join(output, `${browserName}-${theme}-${width}-home.png`) });
          if (theme === 'dark') {
            const pixels = await bannerPixels(page, width);
            (result.bannerPixels ||= []).push(pixels);
            const ring = await progressRing(page, width);
            (result.progressRings ||= []).push({ width, ...ring });
            if (!captureOnly) {
              assert.ok(Object.values(pixels.outerThreePixelMax).every(value => value <= 3), 'Blue decoration fades to black before all four banner boundaries');
              assert.ok(pixels.interiorBlueExcessMax > 4, 'The retained interior blue accent is visible');
              assert.equal(ring.innerBackground, 'rgb(0, 0, 0)');
              assert.ok(ring.topTrackPixel[0] >= 24 && ring.topTrackPixel[0] === ring.topTrackPixel[1] && ring.topTrackPixel[1] === ring.topTrackPixel[2] && ring.topTrackPixel[3] === 255, 'An opaque neutral track keeps zero progress visible');
              assert.ok(ring.counterContrastOnBlack >= 4.5, 'The progress counter remains readable');
            }
          }
        }
      }
      await nav.getByRole('button', { name: 'Dashboard', exact: true }).click();
      await page.getByRole('button', { name: 'Toolbox', exact: true }).click();
      await record(theme, width, 'Toolbox', ['.toolbox-chest', '.toolbox-chest-tray', '.toolbox-chest-lid']);
      await page.screenshot({ path: path.join(output, `${browserName}-${theme}-${width}-toolbox.png`) });
      await page.getByRole('button', { name: 'Close toolbox', exact: true }).click();
      await nav.getByRole('button', { name: 'Timesheets', exact: true }).click();
      await page.getByRole('button', { name: 'Add session', exact: true }).click();
      await record(theme, width, 'Session dialog', ['.timesheet-dialog', '.timesheet-editor-header']);
      if (!captureOnly && theme === 'dark') assert.equal(await page.locator('.timesheet-dialog').evaluate(node => getComputedStyle(node, '::backdrop').backgroundColor), 'rgb(0, 0, 0)');
      await page.screenshot({ path: path.join(output, `${browserName}-${theme}-${width}-dialog.png`) });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await context.setOffline(true); await page.reload();
    await page.waitForFunction(() => document.querySelector('#offline-status')?.textContent === 'Ready offline');
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    if (!captureOnly && theme === 'dark') assert.equal(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(0, 0, 0)');
    await context.close();
  }
  assert.deepEqual(result.errors, []); result.passed = true;
} catch (error) {
  result.passed = false; result.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
  await page?.screenshot({ path: path.join(output, `${browserName}-failure.png`) }).catch(() => {});
} finally {
  await fs.writeFile(path.join(output, `${browserName}-solid-dark.json`), JSON.stringify(result, null, 2));
  await browser?.close();
  console.log(JSON.stringify({ passed: result.passed, browser: result.browserVersion, build: result.build, samples: result.samples.length, error: result.error?.message }));
}
