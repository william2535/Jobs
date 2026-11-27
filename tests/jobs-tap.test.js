import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTapLink, parseTapLink, writeTapSticker, PUBLIC_JOBS_URL } from '../src/jobs-tap.js';

const base = PUBLIC_JOBS_URL;
test('office and site stickers contain stable entry identifiers, not labels or job data', () => {
  const office = buildTapLink({ kind: 'office', officeId: 'office_7', label: 'Private office name' }, `${base}?old=session#old`);
  assert.equal(office, `${base}#jobs-tap=office&office=office_7`);
  assert.doesNotMatch(office, /Private|session/);
  assert.deepEqual(parseTapLink(office, base), { kind: 'office', siteId: null, officeId: 'office_7', cleanUrl: base });
  const siteId = 'site/<saved>&id#one';
  const site = buildTapLink({ kind: 'site', siteId }, base);
  assert.deepEqual(parseTapLink(site, base), { kind: 'site', siteId, officeId: null, cleanUrl: base });
  assert.equal(new URL(site).pathname, '/Jobs/');
  assert.equal(new URL(site).search, '');
});

test('earlier query stickers and site hash aliases remain compatible without side effects', () => {
  assert.deepEqual(parseTapLink(`${base}?tap=office`, base), { kind: 'office', siteId: null, officeId: null, cleanUrl: base });
  assert.deepEqual(parseTapLink(`${base}?tap=site&id=saved%2Fsite`, base), { kind: 'site', siteId: 'saved/site', officeId: null, cleanUrl: base });
  assert.deepEqual(parseTapLink(`${base}#jobs-site=old-site`, base), { kind: 'site', siteId: 'old-site', officeId: null, cleanUrl: base });
  assert.deepEqual(parseTapLink('#jobs-tap=office', base), parseTapLink('#jobs-tap=office', base));
  assert.equal(parseTapLink(`${base}?search=office#notes`, base), null);
  assert.equal(buildTapLink({ kind: 'office' }, `${base}index.html?from=old`), `${base}#jobs-tap=office`);
  assert.equal(buildTapLink({ kind: 'office' }, 'http://localhost:4173/'), 'http://localhost:4173/#jobs-tap=office');
});

test('foreign, ambiguous, oversized and malformed sticker links are rejected', () => {
  const invalid = [
    'https://other.example/Jobs/#jobs-tap=office',
    'https://william2535.github.io/Other/#jobs-tap=office',
    'https://user:password@william2535.github.io/Jobs/#jobs-tap=office',
    `${base}#jobs-tap=office&jobs-tap=site`,
    `${base}?tap=office#jobs-tap=office`,
    `${base}#jobs-tap=office&site=site-1`,
    `${base}#jobs-tap=office&redirect=https://other.example`,
    `${base}#jobs-tap=office&office=https%3A%2F%2Foffice.example`,
    `${base}#jobs-tap=office&office=${'a'.repeat(161)}`,
    `${base}#jobs-tap=site&site=%00bad`,
    `${base}#jobs-tap=site&site=${'a'.repeat(1001)}`,
    `${base}#jobs-tap=site`,
    `${base}#jobs-tap=finish-work`,
    `${base}?tap=site&id=one&id=two`,
    `${base}?tap=office&id=one`,
    `${base}?tap=office&download=https://other.example`,
    `${base}#jobs-site=one&jobs-tap=site`,
    `${base}?session=secret#jobs-tap=office`,
    `${base}${'a'.repeat(4097)}`,
  ];
  for (const value of invalid) assert.throws(() => parseTapLink(value, base), undefined, value);
  for (const address of ['http://office.example/Jobs/', 'javascript:alert(1)', 'file:///Jobs/', 'https://user:secret@jobs.example/'])
    assert.throws(() => buildTapLink({ kind: 'office' }, address));
  assert.throws(() => buildTapLink({ kind: 'office', siteId: 'site-1' }, base));
  assert.throws(() => buildTapLink({ kind: 'site', siteId: 'site-1', officeId: 'office-1' }, base));
});

test('NFC write only reports success after the real writer resolves', async () => {
  let resolveWrite, call, finished = false;
  class Reader { write(...args) { call = args; return new Promise(resolve => { resolveWrite = resolve; }); } }
  const signal = new AbortController().signal;
  const task = writeTapSticker(`${base}?tap=office`, { NDEFReader: Reader, secureContext: true, userActivation: { isActive: true }, baseUrl: base, signal }).then(result => { finished = true; return result; });
  await Promise.resolve();
  assert.equal(finished, false);
  assert.deepEqual(call, [{ records: [{ recordType: 'url', data: `${base}#jobs-tap=office` }] }, { signal }]);
  resolveWrite();
  assert.deepEqual(await task, { status: 'written', url: `${base}#jobs-tap=office` });
});

test('unsupported iPhone browsers, insecure contexts and missing gestures never write a tag', async () => {
  let written = false;
  class Reader { async write() { written = true; } }
  const link = buildTapLink({ kind: 'office' }, base);
  await assert.rejects(writeTapSticker(link, { NDEFReader: undefined, secureContext: true, baseUrl: base }), { name: 'NotSupportedError' });
  await assert.rejects(writeTapSticker(link, { NDEFReader: Reader, secureContext: false, baseUrl: base }), { name: 'SecurityError' });
  await assert.rejects(writeTapSticker(link, { NDEFReader: Reader, secureContext: true, userActivation: { isActive: false }, baseUrl: base }), { name: 'NotAllowedError' });
  await assert.rejects(writeTapSticker('https://other.example/#jobs-tap=office', { NDEFReader: Reader, secureContext: true, baseUrl: base }), /different app/);
  assert.equal(written, false);
});

test('cancelled and refused NFC operations stay distinct from successful writes', async () => {
  const link = buildTapLink({ kind: 'office' }, base);
  for (const name of ['AbortError', 'NotAllowedError', 'NotSupportedError', 'NotReadableError']) {
    class Reader { async write() { throw Object.assign(new Error('Native message'), { name }); } }
    await assert.rejects(writeTapSticker(link, { NDEFReader: Reader, secureContext: true, baseUrl: base }), { name });
  }
  const aborted = new AbortController(); aborted.abort();
  let constructed = false;
  class Reader { constructor() { constructed = true; } async write() {} }
  await assert.rejects(writeTapSticker(link, { NDEFReader: Reader, secureContext: true, baseUrl: base, signal: aborted.signal }), { name: 'AbortError' });
  assert.equal(constructed, false);
});
