import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBuildInfo } from '../scripts/build-info.mjs';
import { verifyRelease, PROJECT_ROOT } from '../scripts/verify-release.mjs';

async function fixture(t, extraChunks = []) {
  const root = await mkdtemp(join(tmpdir(), 'jobs-release-verifier-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(PROJECT_ROOT, 'public'), join(root, 'public'), { recursive: true });
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src/main.js'), 'export const synthetic = true;\n');
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'jobs-release-fixture', version: '1.0.0' }));
  await writeFile(join(root, 'index.html'), '<title>Jobs · Synthetic build</title><script type="module" src="./assets/index-TEST1234.js"></script>');
  const dist = join(root, 'dist');
  await cp(join(root, 'public'), dist, { recursive: true });
  await mkdir(join(dist, 'assets'));
  await cp(join(root, 'index.html'), join(dist, 'index.html'));
  await writeFile(join(dist, 'assets/index-TEST1234.js'), 'const synthetic = true;\n');
  for (const path of extraChunks) await writeFile(join(dist, path), 'const bundledVendor = true;\n');
  const paths = ['index.html', 'assets/index-TEST1234.js', ...extraChunks, ...await readdir(join(root, 'public'))].sort();
  const files = [];
  for (const path of paths) {
    const bytes = await readFile(join(dist, path));
    files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const { buildId } = getBuildInfo(root), cacheId = '1234567890abcdef1234';
  await writeFile(join(dist, 'offline-manifest.json'), JSON.stringify({ schemaVersion: 1, buildId, cacheId, cacheName: `jobs-v3-${cacheId}`, files }));
  const precache = ['./', ...paths.map(path => './' + path), './offline-manifest.json'];
  await writeFile(join(dist, 'sw.js'), `const CACHE="jobs-v3-${cacheId}"; const FILES=${JSON.stringify(precache)};`);
  return { root, dist, precache };
}

test('release verification accepts a complete local build and emits per-file hashes', async t => {
  const { root, dist } = await fixture(t);
  const manifest = await verifyRelease({ root, dist });
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.buildId, getBuildInfo(root).buildId);
  assert.equal(manifest.files.length, 22);
  assert.ok(manifest.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256) && file.bytes > 0));
  assert.ok(manifest.files.some(file => file.path === 'zonesketch-LICENSE.txt'));
  assert.ok(manifest.files.some(file => file.path === 'jobs-logo.webp'));
});

test('release verification refuses unexpected customer-like saves in the distribution', async t => {
  const { root, dist } = await fixture(t);
  await writeFile(join(dist, 'synthetic-customer-backup.jobs.json'), '{"synthetic":true}');
  await assert.rejects(verifyRelease({ root, dist }), /unexpected distributable file/);
});

test('reviewed PDF vendor chunks are allowed without admitting arbitrary dotted files', async t => {
  const { root, dist } = await fixture(t, ['assets/html2canvas.esm-TEST1234.js', 'assets/purify.es-TEST1234.js', 'assets/index.es-TEST1234.js']);
  await verifyRelease({ root, dist });
  await writeFile(join(dist, 'assets/customer.backup-TEST1234.js'), 'private record');
  await assert.rejects(verifyRelease({ root, dist }), /unexpected distributable file/);
});

test('release verification refuses a changed bundled file or an incomplete precache', async t => {
  const { root, dist, precache } = await fixture(t);
  await writeFile(join(dist, 'assets/index-TEST1234.js'), 'const synthetic = false;\n');
  await assert.rejects(verifyRelease({ root, dist }), /fingerprint mismatch/);
  await writeFile(join(dist, 'assets/index-TEST1234.js'), 'const synthetic = true;\n');
  await writeFile(join(dist, 'sw.js'), `const CACHE="jobs-v3-1234567890abcdef1234"; const FILES=${JSON.stringify(precache.filter(path => !path.includes('index-TEST1234')))};`);
  await assert.rejects(verifyRelease({ root, dist }), /does not precache assets\/index/);
});

test('source identity is checkout-independent and a source edit invalidates a stale build', async t => {
  const { root, dist } = await fixture(t);
  const copy = await mkdtemp(join(tmpdir(), 'jobs-release-other-checkout-'));
  t.after(() => rm(copy, { recursive: true, force: true }));
  await cp(root, copy, { recursive: true });
  assert.deepEqual(getBuildInfo(copy), getBuildInfo(root));
  await writeFile(join(root, 'README.md'), 'Documentation does not change the served application.');
  assert.deepEqual(getBuildInfo(copy), getBuildInfo(root));
  await mkdir(join(root, 'vendor'));
  await writeFile(join(root, 'vendor/calculator.js'), 'export const synthetic = 42;');
  assert.notEqual(getBuildInfo(copy).buildId, getBuildInfo(root).buildId);
  await assert.rejects(verifyRelease({ root, dist }), /different or unsupported source build/);
  await rm(join(root, 'vendor'), { recursive: true });
  assert.deepEqual(getBuildInfo(copy), getBuildInfo(root));
  await writeFile(join(root, 'src/main.js'), 'export const synthetic = false;\n');
  assert.notEqual(getBuildInfo(copy).buildId, getBuildInfo(root).buildId);
  await assert.rejects(verifyRelease({ root, dist }), /different or unsupported source build/);
});
