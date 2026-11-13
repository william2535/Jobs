// Optional compatibility check against a separate, unmodified Zone Sketch checkout.
// No Zone Sketch implementation is bundled with Jobs.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { createServer } from 'node:http';

import { importZoneSketch } from '../src/zone-import.js';

const reference = process.env.ZONE_SKETCH_REFERENCE;
if (!reference) throw new Error('Set ZONE_SKETCH_REFERENCE to an external Zone Sketch index.html.');
const fixture = resolve(process.env.ZONE_SKETCH_INPUT || 'public/demo.zonesketch.json');
const root = dirname(resolve(reference));
const server = createServer(async (req, res) => {
  const filename = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!filename.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try {
    const content = await readFile(filename);
    res.writeHead(200, {'Content-Type': ({'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'})[extname(filename)] || 'application/octet-stream'}).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  await page.goto(`http://127.0.0.1:${server.address().port}/${resolve(reference).slice(root.length + 1)}`);
  await page.locator('#projectFile').setInputFiles(fixture);
  await page.waitForTimeout(1200);
  if (dialogs.some(message => /not a supported|could not/i.test(message))) throw new Error(`Official importer rejected demo: ${dialogs.join('; ')}`);
  await page.waitForFunction(() => document.getElementById('busyOverlay')?.hidden !== false);
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => document.getElementById('backupProject').click());
  const download = await downloadPromise;
  const data = JSON.parse(await readFile(await download.path(), 'utf8'));
  const expected = JSON.parse(await readFile(fixture, 'utf8'));
  if (data.project.site !== expected.project.site) throw new Error(`Reexport was wrong site: ${data.project.site}`);
  const imported = await importZoneSketch(data);
  const expectedDevices = expected.project.floors.flatMap(floor => floor.data.symbols).filter(symbol => symbol.type !== 'you').length;
  if (imported.summary.devices !== expectedDevices || imported.summary.issuedSnapshots !== (expected.project.issuedAsFits || []).length) throw new Error(`Mapping failed: ${JSON.stringify(imported.summary)}`);
  for (const floor of expected.project.floors) {
    const actual = data.project.floors.find(value => value.id === floor.id);
    if (!actual) throw new Error('Official reexport lost a floor.');
    for (const symbol of floor.data.symbols) {
      const found = actual.data.symbols.find(value => value.id === symbol.id);
      if (!found || found.type !== symbol.type || found.x !== symbol.x || found.y !== symbol.y || found.reference !== symbol.reference) throw new Error('Official reexport changed a device identity or position.');
    }
    if (JSON.stringify(actual.data.walls) !== JSON.stringify(floor.data.walls)) throw new Error('Official reexport changed building walls.');
  }
  const target = process.env.ZONE_SKETCH_EXPORT_OUTPUT;
  if (target) await writeFile(target, JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify({officialImporter:'accepted',officialExporter:data.format,version:data.version,...imported.summary,dialogs}, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
