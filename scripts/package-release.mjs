import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, cp, writeFile, readFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT, verifyRelease } from './verify-release.mjs';

// Explicit dist-only packaging: never archive the repository or its customer examples.
let staging;
try {
  const manifest = await verifyRelease();
  const output = join(PROJECT_ROOT, 'release');
  await mkdir(output, { recursive: true });
  const stem = `jobs-${manifest.version}-${manifest.buildId}`;
  const archiveName = `${stem}.tar.gz`, archive = join(output, archiveName);
  staging = await mkdtemp(join(tmpdir(), 'jobs-release-'));
  await cp(join(PROJECT_ROOT, 'dist'), join(staging, 'dist'), { recursive: true, dereference: false });
  // Verify again after copying so a concurrent build can never publish mixed files.
  const copied = await verifyRelease({ dist: join(staging, 'dist') });
  if (JSON.stringify(copied) !== JSON.stringify(manifest)) throw Error('The build changed while packaging; finish building and retry.');
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(join(staging, 'RELEASE-MANIFEST.json'), manifestText);
  await writeFile(join(staging, 'INSTALL.txt'), `Jobs ${manifest.version}\nBuild ${manifest.buildId}\n\nServe the contents of dist/ from an HTTPS static host. localhost is also supported.\nKeep the same origin and path when upgrading; changing them creates another browser-local workspace.\nExport a workspace backup before updating. Existing users should close all Jobs tabs before reopening when migrating from a pre-1.0 build.\nWait for Ready offline before relying on offline use. Clearing browser/site data can delete locally stored records.\n\nThe archive contains the compiled application, synthetic demonstration and required component notices. It does not contain customer data, source checkouts, credentials or an application server.\nReports are draft records, not validated compliance certificates. Zone Sketch automatic editing requires a compatible receiver; the Panel Pal adapter is future work.\n\nRELEASE-MANIFEST.json records SHA-256 hashes of every served file. These hashes detect accidental changes; they are not a publisher signature.\n`);
  const stagedArchive = join(staging, archiveName);
  const tarEnvironment = { ...process.env }; delete tarEnvironment.GZIP;
  const result = spawnSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--mode=u=rwX,go=rX', '--format=ustar', '-czf', stagedArchive, '-C', staging, 'dist', 'RELEASE-MANIFEST.json', 'INSTALL.txt'], { encoding: 'utf8', env: tarEnvironment });
  if (result.status !== 0) throw Error(`Packaging needs GNU tar with deterministic archive support. ${result.error?.message || result.stderr || ''}`.trim());
  const hash = createHash('sha256').update(await readFile(stagedArchive)).digest('hex');
  await rename(stagedArchive, archive);
  await writeFile(join(output, `${stem}.manifest.json`), manifestText);
  await writeFile(join(output, `${archiveName}.sha256`), `${hash}  ${archiveName}\n`);
  process.stdout.write(`Release package: ${archive}\nSHA-256: ${hash}\nFiles served: ${manifest.files.length}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally { if (staging) await rm(staging, { recursive: true, force: true }); }
