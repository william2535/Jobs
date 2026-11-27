import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, join, relative, sep, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBuildInfo } from './build-info.mjs';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_FILES = new Set([
  'icon-192.png', 'icon-512.png', 'jobs-touch-colour.png', 'icon.svg', 'manifest.webmanifest', 'appearance-init.js', 'jobs-intro.js', 'jobs-intro.css',
  'findr-logo.png', 'zone-sketch-logo.png', 'jobs-logo.webp', 'jobs-share-banner.png', 'demo.zonesketch.json',
  'findr-tools-NOTICE.txt', 'zonesketch-LICENSE.txt', 'zonesketch-NOTICE.txt',
  'pdf-runtime-NOTICE.txt',
]);
const GENERATED_FILES = new Set(['index.html', 'sw.js', 'offline-manifest.json']);
const OPTIONAL_APPROVED_FILES = new Set(['jobs-dashboard-banner.png', 'jobs-tasks-banner.png', 'jobs-timesheets-banner.png', 'jobs-about-banner.png']);
// jsPDF's bundled optional HTML dependencies use dotted ESM chunk names.
// Keep these names explicit; customer files and other dotted assets remain denied.
const PDF_VENDOR_CHUNK = /^assets\/(?:html2canvas\.esm|purify\.es|index\.es)-[A-Za-z\d_-]{6,}\.js$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw Error(`Release verification failed: ${message}`); };
const check = (condition, message) => { if (!condition) fail(message); };

async function collect(root, directory = root) {
  const files = [];
  for (const name of (await readdir(directory)).sort()) {
    const path = join(directory, name), info = await lstat(path);
    check(!info.isSymbolicLink(), 'symbolic links cannot enter the public artifact.');
    if (info.isDirectory()) files.push(...await collect(root, path));
    else {
      check(info.isFile(), 'only ordinary files can enter the public artifact.');
      const value = await readFile(path);
      files.push({ path: relative(root, path).split(sep).join('/'), bytes: value.length, sha256: digest(value) });
    }
  }
  return files;
}

function localReference(value) {
  check(typeof value === 'string' && !/^(?:[a-z]+:|\/\/|\/)/i.test(value), 'shell references must be relative local files.');
  const clean = value.split(/[?#]/)[0];
  check(clean && !clean.includes('\\') && !clean.split('/').includes('..'), 'shell reference escapes the deployment directory.');
  return posix.normalize(clean).replace(/^\.\//, '');
}

/** Validate the actual build, including its complete precache, without executing it. */
export async function verifyRelease({ root = PROJECT_ROOT, dist = join(root, 'dist') } = {}) {
  const info = getBuildInfo(root), files = await collect(dist);
  const indexed = new Map(files.map(file => [file.path, file]));
  check(files.length > 0, 'the production directory is empty.');
  for (const file of files) {
    check(PUBLIC_FILES.has(file.path) || GENERATED_FILES.has(file.path) || OPTIONAL_APPROVED_FILES.has(file.path) || PDF_VENDOR_CHUNK.test(file.path) || /^assets\/[A-Za-z\d_-]+-[A-Za-z\d_-]{6,}\.(?:js|css|png|webp|svg|woff2)$/.test(file.path), `unexpected distributable file: ${file.path}. Review it explicitly before adding it to the allowlist.`);
    check(file.bytes > 0, `empty build file: ${file.path}.`);
  }
  for (const name of [...PUBLIC_FILES, ...GENERATED_FILES]) check(indexed.has(name), `missing required file: ${name}.`);
  for (const name of PUBLIC_FILES) {
    check(digest(await readFile(join(root, 'public', name))) === indexed.get(name).sha256, `public source and build differ: ${name}.`);
  }
  const html = await readFile(join(dist, 'index.html'), 'utf8');
  check(!/cloudflareinsights\.com/i.test(html), 'external analytics must not enter the offline app shell.');
  check(/<title>Jobs\b/i.test(html), 'the page does not identify Jobs.');
  check(/type="module"/.test(html), 'the production entry module is missing.');
  check(!/\/src\/|localhost:|127\.0\.0\.1:|@vite\/client/.test(html), 'development references remain in the entry page.');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) check(indexed.has(localReference(match[1])), `entry page references an absent file: ${match[1]}.`);
  const manifest = JSON.parse(await readFile(join(dist, 'manifest.webmanifest'), 'utf8'));
  check(manifest.id === './' && manifest.start_url === './' && manifest.scope === './', 'installation scope must remain local to this deployment.');
  check(manifest.display === 'standalone' && Array.isArray(manifest.icons), 'installable app metadata is incomplete.');
  for (const icon of manifest.icons) check(indexed.has(localReference(icon.src)), `missing install icon: ${icon.src}.`);
  for (const size of [192, 512]) {
    const icon = await readFile(join(dist, `icon-${size}.png`));
    check(icon.length >= 24 && icon.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && icon.readUInt32BE(16) === size && icon.readUInt32BE(20) === size, `install icon must be a ${size}×${size} PNG.`);
  }
  const offline = JSON.parse(await readFile(join(dist, 'offline-manifest.json'), 'utf8'));
  check(offline.schemaVersion === 1 && offline.buildId === info.buildId && Array.isArray(offline.files), 'offline manifest belongs to a different or unsupported source build.');
  check(typeof offline.cacheId === 'string' && offline.cacheName === `jobs-v3-${offline.cacheId}`, 'offline cache identity is missing or inconsistent.');
  const recorded = new Set();
  for (const file of offline.files) {
    check(file && typeof file.path === 'string' && !recorded.has(file.path), 'offline file records contain duplicate or malformed paths.');
    recorded.add(file.path);
    const actual = indexed.get(file.path);
    check(actual && actual.sha256 === file.sha256 && actual.bytes === file.bytes, `offline content fingerprint mismatch: ${file.path}.`);
  }
  for (const file of files) if (!['sw.js', 'offline-manifest.json'].includes(file.path)) check(recorded.has(file.path), `offline manifest omits ${file.path}.`);
  const worker = await readFile(join(dist, 'sw.js'), 'utf8');
  const declaration = worker.match(/\bFILES\s*=\s*(\[[^;]*?\])/);
  check(declaration, 'service-worker precache declaration could not be inspected.');
  const precache = JSON.parse(declaration[1]);
  check(Array.isArray(precache) && precache.every(path => typeof path === 'string' && (path === './' || indexed.has(localReference(path)))), 'service worker includes missing or non-local cache entries.');
  for (const file of files) if (file.path !== 'sw.js') check(precache.includes(`./${file.path}`), `service worker does not precache ${file.path}.`);
  check(worker.includes(offline.cacheName), 'service-worker cache does not match the offline manifest.');
  return {
    schemaVersion: 1, application: 'Jobs', version: info.version, buildId: info.buildId,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    checks: { localShellReferences: true, installationManifest: true, sourceNotices: true, offlineContentHashes: true, completePrecache: true, distributableAllowlist: true },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length === 2, 'this command takes no arguments; run it from the source checkout after building.');
    const manifest = await verifyRelease();
    process.stdout.write(`Verified Jobs ${manifest.version} (${manifest.buildId}): ${manifest.files.length} distributable files; install metadata, notices and complete offline precache match.\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
