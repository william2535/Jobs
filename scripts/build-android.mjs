import { readFile, mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT } from './verify-release.mjs';
import { prepareAndroid } from './prepare-android.mjs';

const required = ['JOBS_UPLOAD_STORE_FILE', 'JOBS_UPLOAD_STORE_PASSWORD', 'JOBS_UPLOAD_KEY_ALIAS', 'JOBS_UPLOAD_KEY_PASSWORD'];
export async function signingEnvironment(base = process.env) {
  const env = { ...base };
  if (env.JOBS_SIGNING_CONFIG) {
    const configPath = resolve(env.JOBS_SIGNING_CONFIG);
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    for (const name of required) if (!env[name] && typeof config[name] === 'string') env[name] = config[name];
    if (env.JOBS_UPLOAD_STORE_FILE && !env.JOBS_UPLOAD_STORE_FILE.startsWith('/')) env.JOBS_UPLOAD_STORE_FILE = resolve(dirname(configPath), env.JOBS_UPLOAD_STORE_FILE);
  }
  for (const name of required) if (!env[name]) throw Error(`Missing ${name}. Set JOBS_SIGNING_CONFIG to your private signing.json file or provide the signing environment variables.`);
  if (!(await stat(env.JOBS_UPLOAD_STORE_FILE)).isFile()) throw Error('The upload keystore is not a regular file.');
  return env;
}

async function main() {
  const target = process.argv[2] || 'release';
  if (!['bundle', 'apk', 'release'].includes(target)) throw Error('Use bundle, apk or release.');
  const env = await signingEnvironment();
  const certificate = JSON.parse(await readFile(join(PROJECT_ROOT, 'android-play/signing-certificate.json'), 'utf8'));
  const exported = spawnSync(env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool', ['-exportcert', '-keystore', env.JOBS_UPLOAD_STORE_FILE, '-alias', env.JOBS_UPLOAD_KEY_ALIAS, '-storepass:env', 'JOBS_UPLOAD_STORE_PASSWORD'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  if (exported.status !== 0 || createHash('sha256').update(exported.stdout).digest('hex') !== certificate.certificateSha256) throw Error('The upload key does not match the recorded Jobs certificate. Restore the existing signing backup; do not generate a replacement for an update.');
  const properties = Object.fromEntries((await readFile(join(PROJECT_ROOT, 'android-play/release.properties'), 'utf8')).split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)]; }));
  const versionCode = Number(env.JOBS_VERSION_CODE || properties.VERSION_CODE);
  if (properties.APPLICATION_ID !== certificate.applicationId) throw Error('Application ID differs from the recorded signing identity.');
  const versionName = env.JOBS_VERSION_NAME || properties.VERSION_NAME;
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) throw Error('JOBS_VERSION_CODE must be an integer from 1 to 2100000000.');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-.][A-Za-z0-9.]+)?$/.test(versionName)) throw Error('Use a version name such as 1.0.0.');
  const web = await prepareAndroid();
  Object.assign(env, { JOBS_VERSION_CODE: String(versionCode), JOBS_VERSION_NAME: versionName, JOBS_BUILD_ID: web.buildId });
  const android = join(PROJECT_ROOT, 'android-play');
  const tasks = target === 'release' ? ['bundleRelease', 'assembleRelease'] : [target === 'bundle' ? 'bundleRelease' : 'assembleRelease'];
  // Java does not automatically honor HTTP(S)_PROXY. Read the current process
  // configuration: managed shells can give each process a different proxy port.
  const proxyArguments = [];
  for (const protocol of ['http', 'https']) {
    const value = env[protocol.toUpperCase() + '_PROXY'] || env[protocol + '_proxy'];
    if (!value) continue;
    const proxy = new URL(value);
    proxyArguments.push(`-D${protocol}.proxyHost=${proxy.hostname}`, `-D${protocol}.proxyPort=${proxy.port || 80}`);
    if (proxy.username) proxyArguments.push(`-D${protocol}.proxyUser=${decodeURIComponent(proxy.username)}`);
    if (proxy.password) proxyArguments.push(`-D${protocol}.proxyPassword=${decodeURIComponent(proxy.password)}`);
  }
  const build = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [...proxyArguments, ...tasks, '--no-daemon'], { cwd: android, env, stdio: 'inherit' });
  if (build.status !== 0) throw Error('Android build failed. No upload package was exported.');
  const output = join(PROJECT_ROOT, 'release/android');
  await mkdir(output, { recursive: true });
  const records = [];
  for (const extension of target === 'release' ? ['aab', 'apk'] : [target === 'bundle' ? 'aab' : 'apk']) {
    const source = join(android, extension === 'aab' ? 'app/build/outputs/bundle/release/app-release.aab' : 'app/build/outputs/apk/release/app-release.apk');
    const name = `Jobs-${versionName}-${versionCode}.${extension}`;
    const file = join(output, name);
    await copyFile(source, file);
    const bytes = await readFile(file);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(file + '.sha256', `${sha256}  ${name}\n`);
    records.push({ name, bytes: bytes.length, sha256, purpose: extension === 'aab' ? 'Google Play upload bundle' : 'Direct-install test build; Play may use a different app-signing key' });
    console.log(`Created ${file}`);
  }
  const record = { application: 'Jobs', applicationId: properties.APPLICATION_ID, versionName, versionCode, targetSdk: 36, minimumSdk: 24, webBuildId: web.buildId, sourceCommit: env.JOBS_SOURCE_COMMIT || null, generatedAt: new Date().toISOString(), artifacts: records, note: 'A signed bundle is not a Google Play approval. Complete native device checks and Console declarations before production rollout.' };
  await writeFile(join(output, 'BUILD-RECORD.json'), JSON.stringify(record, null, 2) + '\n');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
