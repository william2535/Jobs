import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { getBuildInfo } from './scripts/build-info.mjs';
import { serviceWorkerSource } from './src/service-worker.js';

const build = getBuildInfo(process.cwd());
const digest = value => createHash('sha256').update(value).digest('hex');
function listFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink()) throw Error('Offline assets must not contain symbolic links.');
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : entry.isFile() ? [relative(root, path).replaceAll('\\', '/')] : [];
  });
}

export default defineConfig({
  base: './',
  define: { __JOBS_BUILD_ID__: JSON.stringify(build.buildId) },
  plugins: [{
    name: 'offline-shell',
    // writeBundle sees the final HTML and copied public assets, including subfolders.
    writeBundle(options) {
      const output = resolve(options.dir || 'dist');
      const paths = listFiles(output).filter(path => !['sw.js', 'offline-manifest.json'].includes(path));
      if (!paths.includes('index.html')) throw Error('The offline build has no entry page.');
      const entries = paths.map(path => { const bytes = readFileSync(resolve(output, path)); return { path, sha256: digest(bytes), bytes: bytes.length }; });
      const cacheId = digest(JSON.stringify(entries)).slice(0, 20);
      const cacheName = `jobs-v3-${cacheId}`;
      const manifest = JSON.stringify({ schemaVersion: 1, version: build.version, buildId: build.buildId, cacheId, cacheName, files: entries }, null, 2) + '\n';
      writeFileSync(resolve(output, 'offline-manifest.json'), manifest);
      const files = ['./', ...paths.map(path => './' + path), './offline-manifest.json'];
      const hashes = Object.fromEntries(entries.map(entry => ['./' + entry.path, entry.sha256]));
      hashes['./'] = hashes['./index.html'];
      hashes['./offline-manifest.json'] = digest(manifest);
      writeFileSync(resolve(output, 'sw.js'), serviceWorkerSource({ cacheName, files, hashes, buildId: build.buildId }));
    },
  }],
});
