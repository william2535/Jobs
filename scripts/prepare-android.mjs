import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT, verifyRelease } from './verify-release.mjs';

export async function prepareAndroid() {
  const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  if (build.status !== 0) throw Error('The Jobs web build failed. No Android assets were replaced.');
  const manifest = await verifyRelease();
  const destination = join(PROJECT_ROOT, 'android-play/app/src/main/assets/web');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(join(PROJECT_ROOT, 'dist'), destination, { recursive: true, dereference: false });
  const copied = await verifyRelease({ dist: destination });
  if (JSON.stringify(copied) !== JSON.stringify(manifest)) throw Error('Android assets changed while they were being copied.');
  await writeFile(join(PROJECT_ROOT, 'android-play/web-build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Android assets verified: ${manifest.files.length} files, web build ${manifest.buildId}.`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareAndroid().catch(error => { console.error(error.message); process.exitCode = 1; });
}
