import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyNotesDocument, validateNotesDocument } from '../src/job-notes.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=';
const documentValue = () => ({
  version: 1,
  blocks: [{ id: 'block-1', type: 'paragraph', align: 'left', runs: [{ text: 'Recorded <observation> & evidence.', bold: true, color: '#112233' }] }],
  photos: [{ id: 'photo-1', image: png, caption: 'Synthetic picture' }],
});

test('blank notes are valid and do not invent title, photos or observations', () => {
  assert.deepEqual(createEmptyNotesDocument(), { version: 1, blocks: [], photos: [] });
  assert.deepEqual(validateNotesDocument(createEmptyNotesDocument()), createEmptyNotesDocument());
  assert.equal(validateNotesDocument(undefined), undefined);
});

test('formatted notes preserve exact text, embedded photos and stable IDs without mutating the input', () => {
  const original = documentValue();
  original.blocks[0].runs[0] = { text: '  Actual reading: 24 V\nNo supply fault. ', bold: true, italic: true, underline: true, strike: true, size: 24, color: '#AABBCC', highlight: '#FFFF99' };
  const before = structuredClone(original);
  const normalized = validateNotesDocument(original);
  assert.equal(normalized.blocks[0].runs[0].text, original.blocks[0].runs[0].text);
  assert.equal(normalized.blocks[0].runs[0].color, '#aabbcc');
  assert.equal(normalized.blocks[0].runs[0].highlight, '#ffff99');
  assert.equal(normalized.photos[0].image, png);
  assert.deepEqual(original, before);
  normalized.blocks[0].runs[0].text = 'Changed copy';
  normalized.photos[0].caption = 'Changed copy';
  assert.deepEqual(original, before);
});

test('headings, quotes, alignments and lists retain their independent structure', () => {
  const value = createEmptyNotesDocument();
  value.blocks = [
    { id: 'heading', type: 'heading2', align: 'center', runs: [{ text: 'Observations', size: 24 }] },
    { id: 'quote', type: 'blockquote', align: 'right', runs: [{ text: 'Customer reported an intermittent fault.' }] },
    { id: 'bullet', type: 'bulletList', align: 'left', items: [{ id: 'bullet-item', runs: [{ text: 'Fault remains', bold: true }] }] },
    { id: 'ordered', type: 'orderedList', align: 'justify', items: [{ id: 'ordered-item', runs: [{ text: 'Arrange access.' }] }] },
  ];
  assert.deepEqual(validateNotesDocument(value), value);
});

test('notes reject executable markup, external resources and unrecognised formatting data', () => {
  for (const change of [
    value => { value.html = '<script>alert(1)</script>'; },
    value => { value.blocks[0].type = 'iframe'; },
    value => { value.blocks[0].runs[0].style = 'background:url(https://example.invalid/track)'; },
    value => { value.blocks[0].runs[0].href = 'javascript:alert(1)'; },
    value => { value.blocks[0].runs[0].color = 'url(javascript:alert(1))'; },
    value => { value.photos[0].image = 'https://example.invalid/photo.png'; },
    value => { value.photos[0].image = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='; },
    value => { value.photos[0].onerror = 'alert(1)'; },
  ]) {
    const value = documentValue(); change(value);
    assert.throws(() => validateNotesDocument(value));
  }
  // Literal markup in a text run remains ordinary data, never an HTML field.
  const value = documentValue();
  value.blocks[0].runs[0].text = '<img src=x onerror=alert(1)>';
  assert.equal(validateNotesDocument(value).blocks[0].runs[0].text, '<img src=x onerror=alert(1)>');
});

test('malformed versions, block identities, list shapes, dates and value types reject before import', () => {
  for (const change of [
    value => { value.version = 2; },
    value => { value.blocks = null; },
    value => { value.photos[0].id = value.blocks[0].id; },
    value => { value.blocks[0].align = 'absolute'; },
    value => { value.blocks[0].runs[0].size = 700; },
    value => { value.blocks[0].runs[0].bold = 'yes'; },
    value => { value.blocks[0].runs[0].text = { malicious: true }; },
    value => { value.blocks[0].items = []; },
    value => { value.blocks[0] = { id: 'list', type: 'bulletList', align: 'left', items: [{ id: 'x', runs: [] }, { id: 'x', runs: [] }] }; },
    value => { value.blocks[0] = { id: 'list', type: 'orderedList', align: 'left', runs: [] }; },
  ]) {
    const value = documentValue(); change(value);
    assert.throws(() => validateNotesDocument(value));
  }
});

test('photo declarations must match actual raster content and all text/media are bounded', () => {
  const value = documentValue();
  value.photos[0].image = png.replace('image/png', 'image/jpeg');
  assert.throws(() => validateNotesDocument(value), /declared image format/);
  value.photos[0].image = 'data:image/png;base64,AA==';
  assert.throws(() => validateNotesDocument(value), /declared image format/);
  value.photos[0].image = png;
  value.blocks[0].runs[0].text = 'x'.repeat(250001);
  assert.throws(() => validateNotesDocument(value), /250000|250,000/);
  value.blocks[0].runs[0].text = 'Valid';
  value.photos = Array.from({ length: 25 }, (_, index) => ({ id: `photo-${index}`, image: png, caption: '' }));
  assert.throws(() => validateNotesDocument(value), /24 photos/);
});

test('canonical formatting removes false marks and preserves blank captions', () => {
  const value = documentValue();
  value.blocks[0].runs[0].bold = false;
  value.blocks[0].runs[0].underline = false;
  delete value.blocks[0].align;
  delete value.photos[0].caption;
  const normalized = validateNotesDocument(value);
  assert.equal(normalized.blocks[0].align, 'left');
  assert.ok(!Object.hasOwn(normalized.blocks[0].runs[0], 'bold'));
  assert.ok(!Object.hasOwn(normalized.blocks[0].runs[0], 'underline'));
  assert.equal(normalized.photos[0].caption, '');
  assert.deepEqual(validateNotesDocument(normalized), normalized);
});

test('personal checklist completion is explicit and retains IDs and formatting independently of ordinary lists', () => {
  const value = createEmptyNotesDocument();
  value.blocks = [{ id: 'tasks', type: 'checklist', align: 'left', items: [
    { id: 'todo-1', checked: false, runs: [{ text: 'Ask for access', underline: true, color: '#123ABC' }] },
    { id: 'todo-2', checked: true, runs: [{ text: 'Collect photographs', highlight: '#FFFF99' }] },
  ] }];
  const normalized = validateNotesDocument(value);
  assert.deepEqual(normalized.blocks[0].items.map(item => [item.id, item.checked]), [['todo-1', false], ['todo-2', true]]);
  assert.equal(normalized.blocks[0].items[0].runs[0].color, '#123abc');
  assert.equal(normalized.blocks[0].items[1].runs[0].highlight, '#ffff99');
  assert.deepEqual(validateNotesDocument(normalized), normalized);
  for (const invalid of [undefined, 'true', 1, null]) {
    const changed = structuredClone(value); changed.blocks[0].items[0].checked = invalid;
    assert.throws(() => validateNotesDocument(changed), /Checklist completion/);
  }
  const ordinary = structuredClone(value); ordinary.blocks[0].type = 'bulletList';
  assert.throws(() => validateNotesDocument(ordinary), /invalid structure/);
  const duplicate = structuredClone(value); duplicate.blocks[0].items[1].id = 'todo-1';
  assert.throws(() => validateNotesDocument(duplicate), /unique/);
});

test('pasted checklists retain only supported text, formatting and state, with independent repeated item IDs', async t => {
  const { Window } = await import('happy-dom');
  const { readNotesBlocks } = await import('../src/job-notes.js');
  const dom = new Window(), previous = globalThis.document; globalThis.document = dom.document;
  t.after(() => { globalThis.document = previous; dom.close(); });
  const root = dom.document.createElement('div');
  root.innerHTML = '<ul data-note-checklist="true" data-note-id="list"><li data-note-id="item" data-note-checked="true"><button data-note-check onclick="alert(1)">☑</button><u>Collect evidence</u><script>bad()</script><img src="https://example.invalid/track"></li></ul><ul><li data-note-id="item"><input type="checkbox" checked><span style="background-color:#ffff99">Ask for access</span></li></ul>';
  const blocks = readNotesBlocks(root);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map(block => block.type), ['checklist', 'checklist']);
  assert.deepEqual(blocks.map(block => block.items[0].checked), [true, true]);
  assert.deepEqual(blocks[0].items[0].runs, [{ text: 'Collect evidence', underline: true }]);
  assert.deepEqual(blocks[1].items[0].runs, [{ text: 'Ask for access', highlight: '#ffff99' }]);
  assert.notEqual(blocks[0].items[0].id, blocks[1].items[0].id);
  assert.deepEqual(readNotesBlocks(root), blocks, 'Repeated reads retain canonical item IDs');
});

test('reports show inert completion markers while retaining checklist IDs, text and state on readback', async t => {
  const { Window } = await import('happy-dom');
  const { renderNotesReport, readNotesBlocks } = await import('../src/job-notes.js');
  const dom = new Window(), previous = globalThis.document; globalThis.document = dom.document;
  t.after(() => { globalThis.document = previous; dom.close(); });
  const notesDocument = { version: 1, photos: [], blocks: [{ id: 'checks', type: 'checklist', align: 'left', items: [
    { id: 'checked', checked: true, runs: [{ text: '<img onerror=bad()>', underline: true }] },
    { id: 'unchecked', checked: false, runs: [{ text: 'Still to do', color: '#123456', highlight: '#ffff99' }] },
  ] }] };
  const report = renderNotesReport({ notesDocument });
  assert.equal(report.querySelectorAll('button,input,img,script').length, 0);
  assert.equal(report.querySelector('[aria-label="Completed checklist item"]').textContent, '☑');
  assert.equal(report.querySelector('[aria-label="Incomplete checklist item"]').textContent, '☐');
  assert.ok(report.textContent.includes('<img onerror=bad()>'));
  report.querySelector('h2').remove();
  assert.deepEqual(readNotesBlocks(report), notesDocument.blocks);
});
