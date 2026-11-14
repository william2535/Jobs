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
