import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Identical source produces the same ID in the GitHub and sanitized hosting checkouts. */
export function getBuildInfo(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version)) throw Error('A release version is required.');
  const paths = [];
  function collect(path) {
    if (!existsSync(path)) return;
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw Error('Build inputs must not contain symbolic links.');
    if (info.isDirectory()) for (const name of readdirSync(path).sort()) collect(join(path, name));
    else if (info.isFile()) paths.push(path);
  }
  for (const input of ['src', 'public', 'vendor', 'scripts', 'package.json', 'package-lock.json', 'vite.config.js', 'index.html']) collect(join(root, input));
  const hash = createHash('sha256');
  for (const path of paths.sort()) hash.update(relative(root, path).split(sep).join('/') + '\0').update(readFileSync(path)).update('\0');
  return { version: pkg.version, buildId: hash.digest('hex').slice(0, 20) };
}
