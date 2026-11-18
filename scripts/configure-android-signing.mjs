import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

// Run once in your own authenticated shell. Secret values go through stdin,
// never command arguments, logs or source control.
try {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) throw Error('Usage: node scripts/configure-android-signing.mjs /absolute/path/signing.json');
  const path = resolve(file), config = JSON.parse(await readFile(path, 'utf8'));
  const keys = ['JOBS_UPLOAD_STORE_PASSWORD', 'JOBS_UPLOAD_KEY_ALIAS', 'JOBS_UPLOAD_KEY_PASSWORD'];
  for (const key of [...keys, 'JOBS_UPLOAD_STORE_FILE']) if (typeof config[key] !== 'string' || !config[key]) throw Error(`Signing configuration lacks ${key}.`);
  const store = await readFile(resolve(dirname(path), config.JOBS_UPLOAD_STORE_FILE));
  const secrets = [['JOBS_UPLOAD_KEYSTORE_BASE64', store.toString('base64')], ...keys.map(key => [key, config[key]])];
  for (const [name, value] of secrets) {
    const result = spawnSync('gh', ['secret', 'set', name, '--repo', 'william2535/Jobs'], { input: value, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    if (result.status !== 0) throw Error(`Could not save ${name}. Check gh auth status and your repository permission, then rerun this command.`);
    console.log(`Saved ${name}`);
  }
  console.log('Jobs signing is configured. Future builds reuse this upload key.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
