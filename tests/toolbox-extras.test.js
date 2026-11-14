import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBDatabase } from 'fake-indexeddb';
import { renderToolboxExtra, createToolboxExtraStorage, TOOLBOX_EXTRAS_DATABASE } from '../src/toolbox-extras.js';
import bank from '../vendor/findr-extras/data/fess-mocks.json' with { type: 'json' };
import { FESS_STORE_KEY, validateFessBank, validateFessStore, emptyFessStore, fessScore } from '../vendor/findr-extras/fess-mock-engine.mjs';
import { createFessPaper, answerFessPaper, navigateFessPaper, finishFessPaper, paperRemainingMs, paperScore } from '../vendor/findr-extras/fess-paper-engine.mjs';
import { RESISTOR_LAB_KEY, parseStock, resistor, group, changeCircuit, circuitResistance, findResistorCombinations, instantiateCircuit } from '../vendor/findr-extras/resistor-lab-engine.mjs';
import { installToolboxDOM, mountToolbox, field, click, submit, until } from './helpers/toolbox-dom.js';

const clone = value => value === undefined ? undefined : structuredClone(value);
function memory() {
  const records = new Map();
  return {
    records, fail: false, writes: 0,
    async read(key) { return clone(records.get(key)); },
    async write(key, value) {
      this.writes += 1;
      if (this.fail) throw new DOMException('Synthetic full tool storage', 'QuotaExceededError');
      records.set(key, clone(value));
    },
  };
}
function storageOptions(store) { return { read: store.read.bind(store), write: store.write.bind(store) }; }
function silentAudio() {
  return { disposed: 0, isAvailable: () => false, setEnabled() {}, pause() {}, unlock: async () => false, play: () => false, dispose() { this.disposed += 1; } };
}
async function route(root, href) { click(root, `a[href="${href}"]`); await root.ready; }

test('the retained FESS pack exposes all196 source questions,31 sections,20 mocks and10 complete papers', () => {
  validateFessBank(bank);
  assert.deepEqual(bank.questions.map(question => question.sourceQuestionNumber).sort((a, b) => a - b), Array.from({ length: 196 }, (_, index) => index + 1));
  assert.equal(bank.quizzes.length, 31);
  assert.equal(bank.mocks.length, 20);
  assert.equal(bank.papers.length, 10);
  assert.equal(new Set(bank.mocks.flatMap(mock => mock.questionIds)).size, 196);
  assert.equal(new Set(bank.papers.flatMap(paper => paper.questionIds)).size, 196);
  for (const paper of bank.papers) {
    assert.equal(paper.questionIds.length, 60);
    assert.equal(new Set(paper.questionIds).size, 60);
    assert.equal(paper.durationSeconds, 3600);
  }
  for (const question of bank.questions) {
    assert.equal(question.options.length, 4);
    assert.ok(question.options.every(option => option.explanation.trim().length > 15));
    for (const source of question.sourceIds) assert.equal(new URL(bank.sources[source].url).protocol, 'https:');
  }
});

test('resistor search honours physical stock, topology and cancellation without changing the source circuit', async () => {
  const stock = parseStock('2.2k x 2');
  const found = await findResistorCombinations({ target: 1100, stock, maxParts: 2, yieldControl: async () => {} });
  assert.equal(found.results[0].ohms, 1100);
  assert.equal(found.results[0].count, 2);
  assert.equal(circuitResistance(instantiateCircuit(found.results[0].tree)), 1100);
  const one = await findResistorCombinations({ target: 1100, stock: [2200], maxParts: 2, yieldControl: async () => {} });
  assert.ok(one.results.every(result => result.count === 1 && result.ohms === 2200));
  assert.throws(() => parseStock('1k x 7\n2k x 6'));
  const original = group('series', [resistor(1000, 'r1'), group('parallel', [resistor(2200, 'r2'), resistor(2200, 'r3')], 'p')], 'root');
  const moved = changeCircuit(original, { kind: 'move', id: 'r1', parentId: 'p' });
  assert.equal(circuitResistance(original), 2100);
  assert.ok(Math.abs(circuitResistance(moved) - 1 / (1 / 1000 + 2 / 2200)) < 1e-9);
  assert.throws(() => changeCircuit(original, { kind: 'move', id: 'root', parentId: 'p' }));
  assert.equal(circuitResistance(group('parallel', [resistor(null), resistor(0)])), 0);
  const controller = new AbortController();
  await assert.rejects(findResistorCombinations({ target: 1000, stock: [1, 2, 3, 4, 5, 6], maxParts: 4, signal: controller.signal, onProgress: () => controller.abort(), yieldControl: async () => {} }), { name: 'AbortError' });
});

test('paper timer persists its deadline, permits corrections and refuses answers at expiry', () => {
  const start = 1000000;
  let run = createFessPaper(bank, bank.papers[0].id, { id: 'synthetic-paper-run', now: start });
  const first = run.questions[0], wrong = first.options.find(option => option.id !== first.correctOptionId).id;
  run = answerFessPaper(run, first.id, wrong, { now: start + 100 });
  assert.equal(paperScore(run).correct, null);
  run = answerFessPaper(run, first.id, first.correctOptionId, { now: start + 200 });
  run = navigateFessPaper(run, 4, { now: start + 600000 });
  const restored = validateFessStore(JSON.parse(JSON.stringify({ ...emptyFessStore(), activeRunId: run.id, runs: [run] }))).runs[0];
  assert.equal(restored.deadlineAt, start + 3600000);
  assert.equal(paperRemainingMs(restored, start + 300000), 3000000, 'A backwards clock must not add time');
  const expired = answerFessPaper(restored, restored.questions[4].id, restored.questions[4].correctOptionId, { now: restored.deadlineAt });
  assert.equal(expired.status, 'completed');
  assert.equal(expired.submittedReason, 'expired');
  assert.equal(expired.answers[restored.questions[4].id], undefined);
  assert.deepEqual(paperScore(expired), { total: 60, answered: 1, unanswered: 59, correct: 1, incorrect: 0, percent: 2 });
  assert.equal(finishFessPaper(expired, { now: start }), expired);
});

test('extra-tool storage commits independently and failed writes keep the previous saved copy', async () => {
  const indexedDB = new IDBFactory(), storage = createToolboxExtraStorage({ indexedDB });
  const original = { schemaVersion: 1, synthetic: 'Original toolbox setting' };
  await storage.write('synthetic-setting', original);
  assert.deepEqual(await indexedDB.databases(), [{ name: TOOLBOX_EXTRAS_DATABASE, version: 1 }]);
  original.synthetic = 'Changed outside storage';
  assert.equal((await storage.read('synthetic-setting')).synthetic, 'Original toolbox setting');
  const transaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function(names, mode, options) {
    if (mode === 'readwrite') throw new DOMException('Synthetic full database', 'QuotaExceededError');
    return transaction.call(this, names, mode, options);
  };
  try {
    await assert.rejects(storage.write('synthetic-setting', { synthetic: 'Must not replace' }), { name: 'QuotaExceededError' });
    assert.equal((await storage.read('synthetic-setting')).synthetic, 'Original toolbox setting');
  } finally { IDBDatabase.prototype.transaction = transaction; }
  await storage.write('synthetic-setting', { synthetic: 'Saved after retry' });
  assert.equal((await storage.read('synthetic-setting')).synthetic, 'Saved after retry');
});

test('Resistor Lab searches, opens the sandbox and retains an unsaved circuit until a successful retry', async t => {
  installToolboxDOM(t);
  globalThis.confirm = () => false;
  const store = memory(), originalHash = location.hash;
  let backCalls = 0;
  const root = mountToolbox(t, renderToolboxExtra('resistor-lab', { ...storageOptions(store), onBack: () => { backCalls += 1; } }));
  await root.ready;
  field(root, '[name="target"]', '1100');
  field(root, '[name="targetUnit"]', 'Ω', 'change');
  field(root, '[name="stock"]', '2.2k x 2');
  field(root, '[name="maxParts"]', '2', 'change');
  submit(root, '#lab-find-form');
  await until(() => root.querySelector('.lab-result'), 'Resistor combinations should be displayed');
  assert.match(root.querySelector('.lab-result').textContent, /1\.1 kΩ|1100 Ω|1,100 Ω/);
  click(root, '[data-lab-action="use-result"]');
  await until(() => store.records.get(RESISTOR_LAB_KEY)?.tab === 'sandbox');
  assert.equal(circuitResistance(store.records.get(RESISTOR_LAB_KEY).circuit), 1100);
  click(root, '[data-lab-action="demo"][data-demo="mixed"]');
  await until(() => circuitResistance(store.records.get(RESISTOR_LAB_KEY).circuit) === 2100);
  const saved = clone(store.records.get(RESISTOR_LAB_KEY));
  store.fail = true;
  click(root, '[data-lab-action="reset"]');
  await until(() => root.querySelector('[data-lab-action="retry-save"]'));
  assert.match(root.querySelector('.lab-total').textContent, /Open circuit/);
  assert.deepEqual(store.records.get(RESISTOR_LAB_KEY), saved);
  assert.equal(root.confirmLeave(), false);
  click(root, 'a[href="#toolbox"]');
  assert.equal(backCalls, 0);
  store.fail = false;
  click(root, '[data-lab-action="retry-save"]');
  await until(() => !root.hasUnsavedChanges());
  assert.equal(circuitResistance(store.records.get(RESISTOR_LAB_KEY).circuit), null);
  assert.equal(root.confirmLeave(), true);
  const staleControl = root.querySelector('[data-lab-action="demo"]'), writes = store.writes;
  root.dispose(); staleControl.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.writes, writes);
  const reopened = mountToolbox(t, renderToolboxExtra('resistor-lab', storageOptions(store)));
  await reopened.ready;
  assert.match(reopened.querySelector('.lab-total').textContent, /Open circuit/);
  assert.equal(location.hash, originalHash);
});

test('FESS practice keeps failed answers for retry and records corrections separately from first-attempt marks', async t => {
  installToolboxDOM(t);
  globalThis.confirm = () => false;
  const store = memory(), audio = silentAudio(), originalHash = location.hash;
  let backCalls = 0;
  const root = mountToolbox(t, renderToolboxExtra('fess', { ...storageOptions(store), audio, onBack: () => { backCalls += 1; } }));
  await root.ready;
  while (root.querySelector('[data-fess-action="more-mocks"]')) click(root, '[data-fess-action="more-mocks"]');
  assert.equal(root.querySelectorAll('.fess-mock-card').length, 31);
  await route(root, '#fess-mocks');
  assert.equal(root.querySelectorAll('.fess-mock-card').length, 20);
  await route(root, '#quizzes');
  click(root, '[data-fess-action="start"]');
  await until(() => root.querySelector('#fess-question'));
  const initial = clone(store.records.get(FESS_STORE_KEY)), question = initial.runs[0].questions[0];
  const wrong = question.options.find(option => option.id !== question.correctOptionId).id;
  store.fail = true;
  click(root, `[data-fess-action="answer"][data-option="${wrong}"]`);
  await until(() => root.querySelector('[data-fess-action="retry-save"]'));
  assert.deepEqual(store.records.get(FESS_STORE_KEY), initial);
  assert.equal(root.hasUnsavedChanges(), true);
  assert.equal(root.confirmLeave(), false);
  click(root, 'a[href="#quizzes"]');
  assert.ok(root.querySelector('#fess-question'));
  assert.equal(backCalls, 0);
  store.fail = false;
  click(root, '[data-fess-action="retry-save"]');
  await until(() => !root.hasUnsavedChanges());
  let saved = store.records.get(FESS_STORE_KEY).runs[0];
  assert.equal(saved.answers[question.id].attempts.length, 1);
  assert.equal(saved.answers[question.id].completed, false);
  click(root, `[data-fess-action="answer"][data-option="${question.correctOptionId}"]`);
  await until(() => !root.hasUnsavedChanges());
  saved = store.records.get(FESS_STORE_KEY).runs[0];
  assert.equal(saved.answers[question.id].attempts.length, 2);
  assert.equal(fessScore(saved).firstCorrect, 0);
  assert.equal(fessScore(saved).completed, 1);
  assert.deepEqual(saved.understoodQuestionIds, []);
  click(root, '[data-fess-action="understand"]');
  await until(() => !root.hasUnsavedChanges());
  assert.deepEqual(store.records.get(FESS_STORE_KEY).runs[0].understoodQuestionIds, [question.id]);
  click(root, '[data-fess-action="next"]');
  await until(() => !root.hasUnsavedChanges());
  const persisted = clone(store.records.get(FESS_STORE_KEY));
  assert.equal(persisted.runs[0].cursor, 1);
  assert.deepEqual(validateFessStore(JSON.parse(JSON.stringify(persisted))), persisted);
  const staleControl = root.querySelector('[data-fess-action="sound"]'), writes = store.writes;
  root.dispose(); staleControl.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.writes, writes);
  assert.equal(audio.disposed, 1);
  const reopened = mountToolbox(t, renderToolboxExtra('fess', { ...storageOptions(store), audio: silentAudio() }));
  await reopened.ready;
  await route(reopened, `#quizzes/${persisted.runs[0].id}`);
  assert.equal(reopened.querySelector('#fess-question').textContent, persisted.runs[0].questions[1].question);
  assert.equal(location.hash, originalHash);
});

test('full-paper UI keeps choices unmarked until explicit submission and preserves unanswered questions', async t => {
  installToolboxDOM(t);
  const store = memory();
  const root = mountToolbox(t, renderToolboxExtra('fess', { ...storageOptions(store), audio: silentAudio() }));
  await root.ready;
  await route(root, '#fess-papers');
  assert.equal(root.querySelectorAll('[data-fess-action="start-paper"]').length, 10);
  assert.match(root.textContent, /not official Highfield papers/);
  click(root, '[data-fess-action="start-paper"]');
  await until(() => root.querySelector('#fess-paper-clock'));
  const initial = store.records.get(FESS_STORE_KEY).runs[0], question = initial.questions[0];
  const wrong = question.options.find(option => option.id !== question.correctOptionId).id;
  click(root, `[data-fess-action="paper-answer"][data-option="${wrong}"]`);
  await until(() => !root.hasUnsavedChanges());
  assert.equal(root.querySelector('.fess-option.is-correct'), null);
  assert.equal(root.querySelector('.fess-explanation'), null);
  assert.equal(paperScore(store.records.get(FESS_STORE_KEY).runs[0]).correct, null);
  click(root, '[data-fess-action="paper-nav"][data-cursor="1"]');
  await until(() => !root.hasUnsavedChanges());
  assert.equal(store.records.get(FESS_STORE_KEY).runs[0].cursor, 1);
  click(root, '[data-fess-action="ask-submit-paper"]');
  assert.match(root.querySelector('.fess-paper-submit').textContent, /59 questions are unanswered/);
  click(root, '[data-fess-action="keep-paper"]');
  assert.equal(root.querySelector('.fess-paper-submit'), null);
  click(root, '[data-fess-action="ask-submit-paper"]');
  click(root, '[data-fess-action="submit-paper"]');
  await until(() => !root.hasUnsavedChanges());
  const saved = store.records.get(FESS_STORE_KEY).runs[0];
  assert.equal(saved.status, 'completed');
  assert.equal(saved.deadlineAt, initial.deadlineAt);
  assert.deepEqual(paperScore(saved), { total: 60, answered: 1, unanswered: 59, correct: 0, incorrect: 1, percent: 0 });
  assert.match(root.querySelector('h1').textContent, /Paper submitted/);
  assert.equal(root.querySelectorAll('.fess-review-question').length, 60);
  assert.equal(root.querySelector('#fess-paper-clock'), null);
});
