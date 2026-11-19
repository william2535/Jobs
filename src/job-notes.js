/** Offline rich notes. Packages contain a bounded document tree, never executable HTML. */
const BLOCK_TYPES = ['paragraph', 'heading1', 'heading2', 'heading3', 'blockquote', 'bulletList', 'orderedList'];
const ALIGNMENTS = ['left', 'center', 'right', 'justify'];
const FONT_SIZES = [12, 14, 16, 18, 24, 32];
const FLAGS = ['bold', 'italic', 'underline', 'strike'];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS_BYTES = 40 * 1024 * 1024;
const newId = () => crypto.randomUUID();
const isList = type => type === 'bulletList' || type === 'orderedList';
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)))
    throw Error(`${label} has an invalid structure.`);
}
function text(value, label, limit, required = false) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim()))
    throw Error(`${label} must be ${required ? 'nonempty ' : ''}text of at most ${limit} characters.`);
  return value;
}
function identity(value, used, label) {
  const id = text(value, label, 160, true);
  if (used.has(id)) throw Error(`${label} must be unique.`);
  used.add(id);
  return id;
}
function colour(value, label) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw Error(`${label} must be a six-digit colour.`);
  return value.toLowerCase();
}
function imageBytes(value) {
  if (typeof value !== 'string') throw Error('A note photo must contain its included image.');
  const match = /^data:image\/(png|jpe?g|gif|webp|bmp|avif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match || match[2].length % 4) throw Error('Note photos must be included PNG, JPEG, GIF, WebP, BMP or AVIF images.');
  const size = match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  if (size > MAX_PHOTO_BYTES) throw Error('Each note photo must be 8 MiB or smaller.');
  const signature = atob(match[2].slice(0, 128));
  const bytes = Array.from(signature, char => char.charCodeAt(0));
  const type = match[1].toLowerCase();
  const valid = type === 'png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((n, index) => bytes[index] === n)
    : type === 'jpg' || type === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : type === 'gif' ? /^GIF8[79]a/.test(signature)
        : type === 'webp' ? signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP'
          : type === 'bmp' ? signature.startsWith('BM')
            : signature.slice(4, 8) === 'ftyp' && /avif|avis/.test(signature.slice(8, 40));
  if (!valid) throw Error('The note photo does not match its declared image format.');
  return size;
}

export function createEmptyNotesDocument() { return { version: 1, blocks: [], photos: [] }; }

/** Strict import boundary; returned values are detached and canonical. */
export function validateNotesDocument(value) {
  if (value === undefined) return undefined;
  record(value, ['version', 'blocks', 'photos'], 'Notes document');
  if (value.version !== 1) throw Error('Notes document version is unsupported.');
  if (!Array.isArray(value.blocks) || value.blocks.length > 1000) throw Error('Notes may contain at most 1,000 blocks.');
  if (!Array.isArray(value.photos) || value.photos.length > 24) throw Error('Notes may contain at most 24 photos.');
  const used = new Set();
  let characters = 0, runCount = 0, itemCount = 0, photoBytes = 0;
  function runs(values) {
    if (!Array.isArray(values) || values.length > 10000) throw Error('Note text runs are invalid.');
    return values.map(value => {
      record(value, ['text', ...FLAGS, 'size', 'color', 'highlight'], 'Note text');
      const result = { text: text(value.text, 'Note text', 250000) };
      characters += result.text.length;
      if (++runCount > 10000 || characters > 250000) throw Error('Notes are limited to 250,000 characters and 10,000 text runs.');
      for (const flag of FLAGS) if (own(value, flag)) {
        if (typeof value[flag] !== 'boolean') throw Error(`Note ${flag} must be true or false.`);
        if (value[flag]) result[flag] = true;
      }
      if (own(value, 'size')) {
        if (!FONT_SIZES.includes(value.size)) throw Error('Note font size is unsupported.');
        result.size = value.size;
      }
      if (own(value, 'color')) result.color = colour(value.color, 'Text colour');
      if (own(value, 'highlight')) result.highlight = colour(value.highlight, 'Highlight colour');
      return result;
    });
  }
  const blocks = value.blocks.map(block => {
    record(block, ['id', 'type', 'align', 'runs', 'items'], 'Note block');
    const id = identity(block.id, used, 'Note block ID');
    if (!BLOCK_TYPES.includes(block.type)) throw Error('Note block type is unsupported.');
    const align = block.align ?? 'left';
    if (!ALIGNMENTS.includes(align)) throw Error('Note alignment is unsupported.');
    if (isList(block.type)) {
      if (own(block, 'runs') || !Array.isArray(block.items) || block.items.length > 1000) throw Error('Note list items are invalid.');
      const items = block.items.map(item => {
        record(item, ['id', 'runs'], 'Note list item');
        if (++itemCount > 2000) throw Error('Notes may contain at most 2,000 list items.');
        return { id: identity(item.id, used, 'Note list item ID'), runs: runs(item.runs) };
      });
      return { id, type: block.type, align, items };
    }
    if (own(block, 'items')) throw Error('Only note lists may contain items.');
    return { id, type: block.type, align, runs: runs(block.runs) };
  });
  const photos = value.photos.map(photo => {
    record(photo, ['id', 'image', 'caption'], 'Note photo');
    const id = identity(photo.id, used, 'Note photo ID');
    photoBytes += imageBytes(photo.image);
    if (photoBytes > MAX_PHOTOS_BYTES) throw Error('The included note photos must total 40 MiB or less.');
    return { id, image: photo.image, caption: text(photo.caption ?? '', 'Photo caption', 2000) };
  });
  return { version: 1, blocks, photos };
}

function appendRuns(parent, runs) {
  for (const run of runs) {
    const span = document.createElement('span');
    span.textContent = run.text;
    if (run.bold) span.style.fontWeight = '700';
    if (run.italic) span.style.fontStyle = 'italic';
    if (run.underline || run.strike) span.style.textDecoration = [run.underline && 'underline', run.strike && 'line-through'].filter(Boolean).join(' ');
    if (run.size) span.style.fontSize = `${run.size}px`;
    if (run.color) span.style.color = run.color;
    if (run.highlight) span.style.backgroundColor = run.highlight;
    parent.append(span);
  }
}
function appendBlocks(parent, blocks) {
  for (const block of blocks) {
    const tags = { paragraph: 'p', heading1: 'h1', heading2: 'h2', heading3: 'h3', blockquote: 'blockquote', bulletList: 'ul', orderedList: 'ol' };
    const node = document.createElement(tags[block.type]);
    node.dataset.noteId = block.id;
    node.style.textAlign = block.align;
    if (isList(block.type)) for (const item of block.items) {
      const li = document.createElement('li');
      li.dataset.noteId = item.id;
      appendRuns(li, item.runs);
      if (!li.childNodes.length) li.append(document.createElement('br'));
      node.append(li);
    } else {
      appendRuns(node, block.runs);
      if (!node.childNodes.length) node.append(document.createElement('br'));
    }
    parent.append(node);
  }
}

const skippedTags = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO', 'IMG']);
const blockTags = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'PRE', 'SECTION', 'ARTICLE']);
function cssColour(value) {
  if (!value) return null;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) return '#' + value.slice(1).split('').map(c => c + c).join('');
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*1)?\s*\)$/.exec(value);
  return rgb && rgb.slice(1).every(n => +n <= 255) ? '#' + rgb.slice(1).map(n => (+n).toString(16).padStart(2, '0')).join('') : null;
}
function marksFor(node, inherited) {
  const marks = { ...inherited }, tag = node.tagName;
  if (node.style.fontWeight === 'normal' || (node.style.fontWeight && +node.style.fontWeight < 600)) delete marks.bold;
  if (node.style.fontStyle === 'normal') delete marks.italic;
  if (['B', 'STRONG'].includes(tag) || +node.style.fontWeight >= 600 || node.style.fontWeight === 'bold') marks.bold = true;
  if (['I', 'EM'].includes(tag) || node.style.fontStyle === 'italic') marks.italic = true;
  const decoration = `${node.style.textDecoration} ${node.style.textDecorationLine}`;
  if (tag === 'U' || decoration.includes('underline')) marks.underline = true;
  if (['S', 'STRIKE', 'DEL'].includes(tag) || decoration.includes('line-through')) marks.strike = true;
  const color = cssColour(node.style.color || node.getAttribute('color'));
  const highlight = cssColour(node.style.backgroundColor);
  if (node.style.backgroundColor && !highlight) delete marks.highlight;
  if (color) marks.color = color;
  if (highlight) marks.highlight = highlight;
  const nativeSizes = { 1: 12, 2: 14, 3: 16, 4: 18, 5: 24, 6: 32, 7: 32 };
  const size = node.style.fontSize.endsWith('px') ? parseFloat(node.style.fontSize) : nativeSizes[node.getAttribute('size')];
  if (size) marks.size = FONT_SIZES.reduce((closest, candidate) => Math.abs(candidate - size) < Math.abs(closest - size) ? candidate : closest, 16);
  return marks;
}
function inlineRuns(node, inherited = {}) {
  const runs = [];
  function walk(child, marks) {
    if (child.nodeType === 3) { if (child.textContent) runs.push({ text: child.textContent, ...marks }); return; }
    if (child.nodeType !== 1 || skippedTags.has(child.tagName)) return;
    if (child.tagName === 'BR') { runs.push({ text: '\n', ...marks }); return; }
    const next = marksFor(child, marks);
    for (const inner of child.childNodes) walk(inner, next);
  }
  if (node.nodeType === 1) inherited = marksFor(node, inherited);
  for (const child of node.childNodes) walk(child, inherited);
  // A browser's placeholder line break is not entered text.
  if (runs.length === 1 && runs[0].text === '\n') return [];
  return runs;
}
/** Read only supported text/formatting from a contenteditable or inert pasted DOM. */
export function readNotesBlocks(root) {
  const blocks = [], used = new Set();
  const nodeId = node => {
    let id = node?.dataset?.noteId;
    if (!id || used.has(id)) id = newId();
    used.add(id);
    if (node?.dataset) node.dataset.noteId = id;
    return id;
  };
  const alignFor = node => ALIGNMENTS.includes(node.style?.textAlign) ? node.style.textAlign : ALIGNMENTS.includes(node.getAttribute?.('align')) ? node.getAttribute('align') : 'left';
  let loose = [];
  const flush = () => {
    if (!loose.length) return;
    const wrapper = document.createElement('div');
    for (const child of loose) wrapper.append(child.cloneNode(true));
    blocks.push({ id: nodeId(root), type: 'paragraph', align: 'left', runs: inlineRuns(wrapper) });
    loose = [];
  };
  function collect(node) {
    if (node.nodeType !== 1) { loose.push(node); return; }
    if (skippedTags.has(node.tagName)) return;
    if (!blockTags.has(node.tagName)) { loose.push(node); return; }
    flush();
    if (['UL', 'OL'].includes(node.tagName)) {
      const items = [...node.children].filter(item => item.tagName === 'LI').map(item => ({ id: nodeId(item), runs: inlineRuns(item) }));
      blocks.push({ id: nodeId(node), type: node.tagName === 'UL' ? 'bulletList' : 'orderedList', align: alignFor(node), items });
    } else if (['DIV', 'SECTION', 'ARTICLE'].includes(node.tagName) && [...node.children].some(child => blockTags.has(child.tagName))) {
      for (const child of node.childNodes) collect(child);
      flush();
    } else {
      const type = { H1: 'heading1', H2: 'heading2', H3: 'heading3', H4: 'heading3', H5: 'heading3', H6: 'heading3', BLOCKQUOTE: 'blockquote' }[node.tagName] || 'paragraph';
      blocks.push({ id: nodeId(node), type, align: alignFor(node), runs: inlineRuns(node) });
    }
  }
  for (const node of root.childNodes) collect(node);
  flush();
  return validateNotesDocument({ version: 1, blocks, photos: [] }).blocks;
}

function legacyNotes(job) {
  const values = [job.workflow?.details?.description, job.visitNotes, job.workflow?.finalisation?.technicianNote].filter(value => typeof value === 'string' && value.trim());
  return { version: 1, blocks: [...new Set(values)].map(value => ({ id: newId(), type: 'paragraph', align: 'left', runs: [{ text: value }] })), photos: [] };
}
function loadImage(file) {
  if (!/^image\/(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.type)) throw Error('Choose a PNG, JPEG, GIF, WebP, BMP or AVIF picture.');
  if (file.size > MAX_PHOTO_BYTES) throw Error(`${file.name || 'This picture'} is larger than 8 MiB.`);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(Error('The picture could not be read. Try selecting it again.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => image.naturalWidth ? resolve({ id: newId(), image: String(reader.result), caption: '' }) : reject(Error('This picture could not be opened.'));
      image.onerror = () => reject(Error('This picture could not be opened. Choose another image format.'));
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function renderJobNotes({ job, onSave, onDirty = () => {}, onNavigate = () => {} }) {
  const root = document.createElement('section');
  root.className = 'job-notes';
  let documentValue = validateNotesDocument(job.notesDocument) || legacyNotes(job);
  let photos = structuredClone(documentValue.photos);
  let saving = false, disposed = false, readingPhotos = false, lastRange = null;
  const title = job.workflow?.details?.title || job.title || '';
  root.innerHTML = `<div class="notes-error notice error" role="alert" hidden></div><form class="notes-form" data-dirty="false"><label class="notes-title-label"><span class="sr-only">Job title</span><input class="notes-title" name="title" placeholder="Untitled job" maxlength="200" aria-label="Job title"></label><div class="notes-toolbar" role="toolbar" aria-label="Text formatting"><button type="button" data-note-command="bold" aria-label="Bold" title="Bold"><b>B</b></button><button type="button" data-note-command="italic" aria-label="Italic" title="Italic"><i>I</i></button><button type="button" data-note-command="underline" aria-label="Underline" title="Underline"><u>U</u></button><button type="button" data-note-command="insertUnorderedList" aria-label="Bulleted list" title="Bulleted list">• List</button><button type="button" data-note-action="picture" aria-label="Add pictures">＋ Picture</button><details class="notes-more"><summary>More</summary><div class="notes-extra"><label>Text style<select data-note-style="block" aria-label="Text style"><option value="p">Body</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option></select></label><label>Text size<select data-note-style="size" aria-label="Text size">${FONT_SIZES.map(size => `<option value="${size}"${size === 16 ? ' selected' : ''}>${size}px</option>`).join('')}</select></label><label>Text colour<input type="color" data-note-style="color" value="#202b39" aria-label="Text colour"></label><label>Highlight<input type="color" data-note-style="highlight" value="#fff2b3" aria-label="Highlight colour"></label><div class="notes-extra-actions"><button type="button" data-note-command="strikeThrough" aria-label="Strikethrough"><s>Strike</s></button><button type="button" data-note-command="insertOrderedList">Numbered list</button><button type="button" data-note-command="justifyLeft">Align left</button><button type="button" data-note-command="justifyCenter">Align centre</button><button type="button" data-note-command="justifyRight">Align right</button><button type="button" data-note-command="removeFormat">Clear formatting</button><button type="button" data-note-command="undo">Undo</button><button type="button" data-note-command="redo">Redo</button></div></div></details></div><div class="notes-paper"><div class="notes-editor" contenteditable="true" role="textbox" aria-label="Job notes" aria-multiline="true" data-placeholder="Write your notes here…" spellcheck="true"></div></div><div class="notes-photo-grid" aria-label="Job pictures"></div><div class="notes-save-bar"><span class="notes-status" role="status">${job.notesDocument ? 'Notes saved on this device' : 'Ready to write'}</span><button class="primary" type="submit">Save</button></div></form><input class="notes-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif" multiple hidden>`;
  const form = root.querySelector('form');
  const editor = root.querySelector('.notes-editor');
  const titleInput = root.querySelector('.notes-title');
  const error = root.querySelector('.notes-error');
  const status = root.querySelector('.notes-status');
  titleInput.value = title;
  appendBlocks(editor, documentValue.blocks);
  function dirty() {
    form.dataset.dirty = 'true';
    status.textContent = 'Unsaved changes';
    onDirty(true);
  }
  function report(cause) {
    error.textContent = cause.message || String(cause);
    error.hidden = false;
  }
  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)) {
      lastRange = selection.getRangeAt(0).cloneRange();
      for (const button of root.querySelectorAll('[data-note-command]')) {
        if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(button.dataset.noteCommand))
          button.setAttribute('aria-pressed', String(document.queryCommandState(button.dataset.noteCommand)));
      }
    }
  }
  function restoreSelection() {
    editor.focus();
    const selection = window.getSelection();
    if (lastRange && editor.contains(lastRange.startContainer) && editor.contains(lastRange.endContainer)) {
      selection.removeAllRanges(); selection.addRange(lastRange);
    } else {
      const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
      selection.removeAllRanges(); selection.addRange(range);
    }
  }
  document.addEventListener('selectionchange', rememberSelection);
  editor.addEventListener('input', dirty);
  titleInput.addEventListener('input', dirty);
  root.querySelectorAll('[data-note-command]').forEach(button => {
    button.onpointerdown = event => event.preventDefault();
    button.onclick = () => {
      if (saving || disposed || readingPhotos) return;
      restoreSelection();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(button.dataset.noteCommand, false, null);
      rememberSelection(); dirty();
    };
  });
  root.querySelectorAll('[data-note-style]').forEach(control => {
    control.onchange = () => {
      if (saving || disposed || readingPhotos) return;
      restoreSelection();
      document.execCommand('styleWithCSS', false, true);
      const kind = control.dataset.noteStyle;
      if (kind === 'block') document.execCommand('formatBlock', false, control.value);
      if (kind === 'size') {
        document.execCommand('fontSize', false, '7');
        for (const font of editor.querySelectorAll('font[size="7"]')) { font.removeAttribute('size'); font.style.fontSize = `${control.value}px`; }
        for (const span of editor.querySelectorAll('[style]')) if (span.style.fontSize === 'xxx-large') span.style.fontSize = `${control.value}px`;
      }
      if (kind === 'color') document.execCommand('foreColor', false, control.value);
      if (kind === 'highlight') document.execCommand('hiliteColor', false, control.value);
      rememberSelection(); dirty();
    };
  });
  function renderPhotos() {
    const gallery = root.querySelector('.notes-photo-grid'); gallery.replaceChildren();
    for (const photo of photos) {
      const figure = document.createElement('figure'); figure.className = 'notes-photo'; figure.dataset.photoId = photo.id;
      const image = document.createElement('img'); image.src = photo.image; image.alt = photo.caption || 'Job photograph'; image.loading = 'lazy';
      const label = document.createElement('label'); label.textContent = 'Caption';
      const input = document.createElement('input'); input.value = photo.caption; input.maxLength = 2000; input.setAttribute('aria-label', 'Picture caption');
      input.oninput = () => { photo.caption = input.value; image.alt = input.value || 'Job photograph'; dirty(); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'notes-remove-picture'; remove.textContent = 'Remove picture';
      remove.onclick = () => { if (!saving && !readingPhotos) { photos = photos.filter(item => item.id !== photo.id); renderPhotos(); dirty(); } };
      label.append(input); figure.append(image, label, remove); gallery.append(figure);
    }
  }
  function lock(locked) {
    form.querySelectorAll('input,select,button').forEach(control => { control.disabled = locked; });
    editor.contentEditable = String(!locked);
    form.setAttribute('aria-busy', String(locked));
  }
  async function addPhotos(files) {
    if (!files.length || saving || disposed || readingPhotos) return;
    readingPhotos = true; lock(true); error.hidden = true;
    // File reads must also protect navigation away from this draft.
    dirty(); status.textContent = 'Adding pictures…';
    try {
      if (photos.length + files.length > 24) throw Error('A job note can contain at most 24 pictures.');
      const additions = await Promise.all(files.map(loadImage));
      if (disposed) return;
      const checked = validateNotesDocument({ version: 1, blocks: readNotesBlocks(editor), photos: [...photos, ...additions] });
      photos = checked.photos; renderPhotos(); dirty();
    } catch (cause) { if (!disposed) { report(cause); status.textContent = 'Unsaved changes'; } }
    finally { readingPhotos = false; if (!disposed) lock(false); }
  }
  root.querySelector('[data-note-action="picture"]').onclick = () => root.querySelector('.notes-file').click();
  root.querySelector('.notes-file').onchange = event => { const files = [...event.target.files]; event.target.value = ''; addPhotos(files); };
  editor.addEventListener('paste', event => {
    event.preventDefault();
    const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
    if (files.length) { addPhotos(files); return; }
    try {
      const html = event.clipboardData?.getData('text/html');
      if (html) {
        // Template contents stay inert, including images and embedded resources.
        const inert = document.createElement('template'); inert.innerHTML = html;
        const safe = document.createElement('div'); appendBlocks(safe, readNotesBlocks(inert.content));
        document.execCommand('insertHTML', false, safe.innerHTML);
      } else {
        const value = event.clipboardData?.getData('text/plain') || '';
        if (value.length > 250000) throw Error('Paste at most 250,000 characters.');
        document.execCommand('insertText', false, value);
      }
      dirty(); rememberSelection();
    } catch (cause) { report(cause); }
  });
  editor.addEventListener('drop', event => { event.preventDefault(); if (event.dataTransfer?.files?.length) addPhotos([...event.dataTransfer.files]); });
  editor.addEventListener('dragover', event => event.preventDefault());
  form.onsubmit = async event => {
    event.preventDefault();
    if (saving || disposed || readingPhotos) return;
    error.hidden = true;
    try {
      const next = validateNotesDocument({ version: 1, blocks: readNotesBlocks(editor), photos });
      const nextTitle = titleInput.value.trim();
      if (nextTitle.length > 200) throw Error('Keep the job title to 200 characters.');
      saving = true; lock(true); status.textContent = 'Saving…';
      const saved = await onSave(next, nextTitle);
      if (saved !== true) throw Error('Your notes could not be saved. They are still here; try Save again.');
      documentValue = next; form.dataset.dirty = 'false'; onDirty(false);
      if (!disposed) status.textContent = 'Notes saved on this device';
    } catch (cause) { if (!disposed) { report(cause); status.textContent = 'Not saved — retry'; } }
    finally { saving = false; if (!disposed) lock(false); }
  };
  renderPhotos();
  root.dispose = () => { disposed = true; document.removeEventListener('selectionchange', rememberSelection); };
  return root;
}

/** Render through DOM text/style APIs, so imported text never becomes markup. */
export function renderNotesReport(job) {
  const root = document.createElement('section'); root.className = 'job-notes-report';
  const value = validateNotesDocument(job.notesDocument);
  if (!value || (!value.blocks.length && !value.photos.length)) return root;
  const title = document.createElement('h2'); title.textContent = 'Job notes'; root.append(title);
  appendBlocks(root, value.blocks);
  for (const photo of value.photos) {
    const figure = document.createElement('figure');
    const image = document.createElement('img'); image.src = photo.image; image.alt = photo.caption || 'Job photograph';
    figure.append(image);
    if (photo.caption) { const caption = document.createElement('figcaption'); caption.textContent = photo.caption; figure.append(caption); }
    root.append(figure);
  }
  return root;
}
