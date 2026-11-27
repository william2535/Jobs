import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareJsonShare, safePackName } from '../src/job-share.js';

function browserFixture({ share, canShare, click } = {}) {
  const events = [], blobs = [], anchors = [], timers = [], revoked = [];
  const host = {
    navigator: { share, canShare },
    URL: {
      createObjectURL(blob) {
        blobs.push(blob);
        return `blob:synthetic-${blobs.length}`;
      },
      revokeObjectURL(url) { revoked.push(url); },
    },
    document: {
      createElement(tag) {
        assert.equal(tag, 'a');
        const anchor = {
          attached: false,
          click() {
            assert.equal(this.attached, true, 'download must be attached before activation');
            events.push('click');
            click?.(this);
          },
          remove() { this.attached = false; events.push('remove'); },
        };
        anchors.push(anchor);
        return anchor;
      },
      body: { append(anchor) { anchor.attached = true; events.push('append'); } },
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
  };
  return { host, events, blobs, anchors, timers, revoked };
}

test('pack names keep IDs useful while removing imported path characters and bounding length', () => {
  const id = '2602b9fc-20aa-4da5-b346-8c0eaa4207fb';
  assert.equal(safePackName('job', id), `job-${id}.jobs.json`);
  assert.equal(safePackName('day', '../floor\\room:1\0🔥'), 'day----floor-room-1---.jobs.json');
  assert.equal(safePackName('day', undefined, '.jobsday.json'), 'day-pack.jobsday.json');
  assert.equal(safePackName('receipt', '', '.jobsreceipt.json'), 'receipt-pack.jobsreceipt.json');
  const longName = safePackName('receipt', 'x'.repeat(200), '.jobsreceipt.json');
  assert.equal(longName, `receipt-${'x'.repeat(90)}.jobsreceipt.json`);
  assert.doesNotMatch(safePackName('job', '../../jobs/private\ncopy'), /[\\/\x00-\x1f]/);
});

test('preparing a share snapshots JSON without opening a picker or a download', async () => {
  const source = { notes: 'Smoke detector 🔥 — étage', assets: [{ id: 'one', result: 'pass' }] };
  const original = structuredClone(source), calls = [];
  const f = browserFixture({
    canShare: () => true,
    share: async value => { calls.push(value); },
  });
  const share = prepareJsonShare(source, 'visit.jobs.json', { host: f.host, native: null });
  assert.equal(calls.length, 0);
  assert.equal(f.blobs.length, 0);
  source.notes = 'Changed after preparing';
  source.assets[0].result = 'fail';
  await share();
  const file = calls[0].files[0];
  assert.equal(file.name, 'visit.jobs.json');
  assert.equal(file.type, 'application/json');
  assert.deepEqual(JSON.parse(await file.text()), original);
});

test('browser sharing is invoked synchronously in the tap, before any awaited work', async () => {
  let inTap = true, resolveShare, shareCalled = false, settled = false;
  const f = browserFixture({
    canShare: ({ files }) => {
      assert.equal(files.length, 1);
      assert.equal(files[0].type, 'application/json');
      return true;
    },
    share: ({ files }) => {
      assert.equal(inTap, true, 'share must retain the user activation');
      assert.equal(files[0].name, 'today.jobsday.json');
      shareCalled = true;
      return new Promise(resolve => { resolveShare = resolve; });
    },
  });
  const share = prepareJsonShare({ day: '2026-11-27' }, 'today.jobsday.json', { host: f.host, native: null });
  queueMicrotask(() => { inTap = false; });
  const operation = share().then(result => { settled = true; return result; });
  assert.equal(shareCalled, true);
  await Promise.resolve();
  assert.equal(settled, false, 'opening the share sheet is not completion');
  resolveShare();
  const result = await operation;
  assert.equal(result.status, 'shared');
  assert.match(result.message, /does not confirm.*received/i);
  assert.equal(f.blobs.length, 0);
});

test('native share preserves shared, saved and cancelled results without claiming delivery', async t => {
  for (const status of ['shared', 'saved', 'cancelled']) {
    await t.test(status, async () => {
      const payload = { description: 'Testing 🔥 — camera é', evidence: [1, 2, 3] };
      const calls = [], f = browserFixture({
        share: () => assert.fail('native exports must not open another browser share'),
        canShare: () => true,
      });
      let complete, settled = false;
      const native = { exportBlob(blob, name, options) {
        calls.push({ blob, name, options });
        return new Promise(resolve => { complete = resolve; });
      } };
      const share = prepareJsonShare(payload, 'return.jobsday.json', { host: f.host, native });
      const operation = share().then(result => { settled = true; return result; });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].blob.type, 'application/json');
      assert.equal(calls[0].name, 'return.jobsday.json');
      assert.deepEqual(calls[0].options, { share: true });
      assert.deepEqual(JSON.parse(await calls[0].blob.text()), payload);
      assert.equal(settled, false, 'wait for the native result');
      complete({ status, bytes: calls[0].blob.size, token: 'native-export-id' });
      const result = await operation;
      assert.equal(result.status, status);
      assert.equal(result.bytes, calls[0].blob.size);
      assert.equal(result.token, 'native-export-id');
      assert.equal(result.delivered, undefined);
      if (status === 'cancelled') assert.match(result.message, /cancelled.*still saved/i);
      if (status === 'shared') assert.match(result.message, /receipt is still pending/i);
      assert.equal(f.blobs.length, 0);
    });
  }
});

test('native cancellation permits retry with the same prepared package', async () => {
  const blobs = [];
  const share = prepareJsonShare({ receipt: 'accepted' }, 'day.jobsreceipt.json', {
    native: { async exportBlob(blob) {
      blobs.push(blob);
      return { status: blobs.length === 1 ? 'cancelled' : 'shared' };
    } },
  });
  assert.equal((await share()).status, 'cancelled');
  assert.equal((await share()).status, 'shared');
  assert.equal(blobs.length, 2);
  assert.equal(blobs[0], blobs[1]);
});

test('browser cancellation keeps the prepared file reusable without downloading a duplicate', async () => {
  const files = [], f = browserFixture({
    canShare: () => true,
    share: async payload => {
      files.push(payload.files[0]);
      if (files.length === 1) throw new DOMException('User cancelled', 'AbortError');
    },
  });
  const share = prepareJsonShare({ job: 'saved locally' }, 'job.jobs.json', { host: f.host, native: null });
  const cancelled = await share();
  assert.equal(cancelled.status, 'cancelled');
  assert.match(cancelled.message, /still saved/i);
  assert.equal(f.anchors.length, 0);
  assert.equal((await share()).status, 'shared');
  assert.equal(files.length, 2);
  assert.equal(files[0], files[1]);
  assert.equal(f.blobs.length, 0);
});

test('share failures remain failures and do not silently download or claim success', async () => {
  const f = browserFixture({
    canShare: () => true,
    share: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); },
  });
  const share = prepareJsonShare({ job: 'saved locally' }, 'job.jobs.json', { host: f.host, native: null });
  await assert.rejects(share(), /Sharing could not open.*Permission denied/);
  assert.equal(f.blobs.length, 0);
  assert.equal(f.anchors.length, 0);
});

test('unavailable file sharing downloads the exact JSON file and releases its URL after activation', async t => {
  for (const support of ['no share API', 'cannot share files']) {
    await t.test(support, async () => {
      const f = browserFixture(support === 'cannot share files' ? {
        share: () => assert.fail('unsupported file sharing must not be attempted'),
        canShare: () => false,
      } : {});
      const data = { notes: 'Fire 🔥', jobs: [{ id: 'synthetic-visit' }] };
      const share = prepareJsonShare(data, 'day.jobsday.json', { host: f.host, native: null });
      const result = await share();
      assert.equal(result.status, 'saved');
      assert.match(result.message, /Download prepared/);
      assert.equal(result.delivered, undefined);
      assert.equal(f.blobs.length, 1);
      assert.equal(f.blobs[0].type, 'application/json');
      assert.deepEqual(JSON.parse(await f.blobs[0].text()), data);
      assert.equal(f.anchors[0].href, 'blob:synthetic-1');
      assert.equal(f.anchors[0].download, 'day.jobsday.json');
      assert.equal(f.anchors[0].attached, false);
      assert.deepEqual(f.events, ['append', 'click', 'remove']);
      assert.deepEqual(f.revoked, [], 'URL must remain valid for the browser to start the download');
      assert.equal(f.timers.length, 1);
      assert.ok(f.timers[0].delay > 0 && f.timers[0].delay <= 60000);
      f.timers[0].callback();
      assert.deepEqual(f.revoked, ['blob:synthetic-1']);
    });
  }
});

test('failed download activation removes the anchor and releases the large package URL', async () => {
  const f = browserFixture({ click: () => { throw Error('Downloads unavailable'); } });
  const share = prepareJsonShare({ evidence: 'saved locally' }, 'day.jobsday.json', { host: f.host, native: null });
  await assert.rejects(share(), /Downloads unavailable/);
  assert.equal(f.anchors[0].attached, false);
  assert.deepEqual(f.events, ['append', 'click', 'remove']);
  for (const timer of f.timers) timer.callback();
  assert.ok(f.revoked.includes('blob:synthetic-1'));
});
