/** Offline vector PDFs generated exclusively from an issued certificate snapshot. */
import { jsPDF } from 'jspdf';
import { renderCertificate } from './certificate-renderer.js';
import { getNativePlatform } from './native-platform.js';
import { regular, semibold } from './vendor/open-sans.js';

const MIME = 'application/pdf';
const INK = [25, 43, 59], MUTED = [79, 96, 111], RULE = [218, 226, 233];
const LEFT = 16, RIGHT = 194, TOP = 25, BOTTOM = 279;
const clean = value => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

export function certificatePdfFilename(certificate) {
  const number = clean(certificate?.fields?.number || certificate?.id || 'visit')
    .normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, '-').replace(/^\.+|\.+$/g, '').slice(0, 100);
  return `Certificate-${number || 'visit'}.pdf`;
}

/** Text remains searchable. Embedded fonts, pictures and pagination need no network. */
export async function generateCertificatePdf(certificate) {
  if (!certificate?.issuedAt || certificate.draft || !certificate.evidence?.job) throw Error('Issue and save this certificate before exporting its PDF.');
  // Rendering is synchronous and detached; a later job edit cannot change this export.
  const snapshot = structuredClone(certificate);
  const root = renderCertificate({ certificate: snapshot, includeEvidence: true });
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  pdf.addFileToVFS('OpenSans-Regular.ttf', regular);
  pdf.addFileToVFS('OpenSans-Semibold.ttf', semibold);
  pdf.addFont('OpenSans-Regular.ttf', 'OpenSans', 'normal');
  pdf.addFont('OpenSans-Semibold.ttf', 'OpenSans', 'bold');
  pdf.setProperties({ title: clean(snapshot.fields.title), subject: `Certificate ${clean(snapshot.fields.number)}`, author: clean(snapshot.fields.companyName), creator: 'Jobs — offline certificate export' });
  let y = TOP;
  function font(size = 10, bold = false, colour = INK) { pdf.setFont('OpenSans', bold ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(...colour); }
  function page() { pdf.addPage(); y = TOP; }
  function space(height) { if (y + height > BOTTOM) page(); }
  function lines(value, width, size = 10, bold = false) {
    font(size, bold);
    return pdf.splitTextToSize(clean(value), width);
  }
  function paragraph(value, { size = 10, bold = false, colour = INK, indent = 0, after = 3, keep = 0 } = {}) {
    if (!clean(value).trim()) return;
    const wrapped = lines(value, RIGHT - LEFT - indent, size, bold), height = size * .49;
    space(Math.min(wrapped.length * height + keep, BOTTOM - TOP));
    for (const line of wrapped) {
      space(height); font(size, bold, colour); pdf.text(line, LEFT + indent, y + height * .78); y += height;
    }
    y += after;
  }
  function metadata(node) {
    for (const term of node.querySelectorAll('dt')) {
      const value = term.nextElementSibling;
      if (!value || value.tagName !== 'DD') continue;
      const label = lines(term.textContent, 43, 8.5, true), body = lines(value.textContent, RIGHT - LEFT - 48);
      const count = Math.max(label.length, body.length);
      space(Math.min(count * 5 + 2, BOTTOM - TOP));
      for (let i = 0; i < count; i++) {
        space(5);
        if (label[i]) { font(8.5, true, MUTED); pdf.text(label[i], LEFT, y + 4); }
        if (body[i]) { font(); pdf.text(body[i], LEFT + 48, y + 4); }
        y += 5;
      }
      y += 2;
    }
    y += 2;
  }
  function table(node) {
    const headers = [...node.querySelectorAll('thead th')].map(cell => cell.textContent);
    const rows = [...node.querySelectorAll('tbody tr')].map(row => [...row.children].map(cell => cell.textContent));
    if (!headers.length) { for (const row of rows) paragraph(row.join(' · ')); return; }
    const first = headers[0] === 'Record' ? .12 : headers.length <= 3 ? .44 : .27;
    const widths = headers.map((_, i) => (RIGHT - LEFT) * (headers.join('|') === 'Check|Result|Notes / evidence' ? [.49,.15,.36][i] : headers.length === 1 ? 1 : i === 0 ? first : (1 - first) / (headers.length - 1)));
    const wrap = (row, bold = false) => headers.map((_, i) => lines(row[i] || '', widths[i] - 4, 8.5, bold));
    const heading = wrap(headers, true), headingHeight = Math.max(...heading.map(cell => cell.length)) * 4.3 + 4;
    function draw(cells, offset, count, header = false) {
      const height = count * 4.3 + 4;
      pdf.setFillColor(...(header ? INK : [246, 248, 250]));
      pdf.rect(LEFT, y, RIGHT - LEFT, height, 'F');
      let x = LEFT;
      cells.forEach((cell, col) => {
        font(8.5, header, header ? [255, 255, 255] : INK);
        for (let i = 0; i < count; i++) if (cell[offset + i]) pdf.text(cell[offset + i], x + 2, y + 5.1 + i * 4.3);
        x += widths[col];
      });
      y += height; pdf.setDrawColor(...RULE); pdf.line(LEFT, y, RIGHT, y);
    }
    function head() { draw(heading, 0, Math.max(...heading.map(cell => cell.length)), true); }
    space(headingHeight + 16); head();
    for (const row of rows) {
      const cells = wrap(row), count = Math.max(1, ...cells.map(cell => cell.length));
      // Keep ordinary rows together; very long free-text answers continue intact.
      if (count * 4.3 + 4 <= BOTTOM - TOP - headingHeight && y + count * 4.3 + 4 > BOTTOM) { page(); head(); }
      let offset = 0;
      while (offset < count) {
        const capacity = Math.floor((BOTTOM - y - 4) / 4.3);
        if (capacity < 1) { page(); head(); continue; }
        const take = Math.min(capacity, count - offset); draw(cells, offset, take); offset += take;
        if (offset < count) { page(); head(); }
      }
    }
    y += 5;
  }
  async function picture(node) {
    const source = node.getAttribute('src') || '';
    if (!/^data:image\/(?:png|jpe?g|webp|gif|bmp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(source)) throw Error('A certificate photograph is unavailable. Restore its embedded image before exporting.');
    let image = source, dimensions;
    try { dimensions = pdf.getImageProperties(image); }
    catch {
      // Convert formats such as AVIF using the local browser decoder, never a URL fetch.
      const element = document.createElement('img'); element.src = source;
      let timer;
      try {
        await Promise.race([element.decode(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Image decode timed out')), 15000); })]);
        const canvas = document.createElement('canvas'); canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
        const context = canvas.getContext('2d'); if (!context || !canvas.width || !canvas.height) throw Error('No decoded image');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(element, 0, 0);
        image = canvas.toDataURL('image/jpeg', .92); dimensions = pdf.getImageProperties(image);
      } catch { throw Error('A certificate photograph could not be included. Check its image and try exporting again.'); }
      finally { clearTimeout(timer); }
    }
    const factor = Math.min((RIGHT - LEFT) / dimensions.width, 95 / dimensions.height);
    const width = dimensions.width * factor, height = dimensions.height * factor;
    space(height + 12); pdf.addImage(image, LEFT, y, width, height, undefined, 'FAST'); y += height + 3;
  }
  async function walk(node) {
    if (node.nodeType === 3) { if (node.textContent.trim()) paragraph(node.textContent); return; }
    if (node.nodeType !== 1 || ['SCRIPT', 'STYLE', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) return;
    if (node.classList.contains('certificate-evidence-appendix')) { if (y > TOP) page(); }
    if (/^H[1-6]$/.test(node.tagName)) {
      const level = Number(node.tagName[1]); y += level < 3 ? 3 : 1;
      paragraph(node.textContent, { size: level === 1 ? 20 : level === 2 ? 13 : 10.5, bold: true, after: 3, keep: 12 }); return;
    }
    if (node.tagName === 'DL') { metadata(node); return; }
    if (node.tagName === 'TABLE') { table(node); return; }
    if (node.tagName === 'IMG') { await picture(node); return; }
    if (['P', 'FIGCAPTION', 'SUMMARY', 'BLOCKQUOTE'].includes(node.tagName)) {
      const muted = node.tagName === 'FIGCAPTION' || node.classList.contains('service-report-caption');
      paragraph(node.textContent, { size: muted ? 8.5 : 10, colour: muted ? MUTED : INK, indent: node.tagName === 'BLOCKQUOTE' ? 4 : 0 }); return;
    }
    if (['UL', 'OL'].includes(node.tagName)) {
      let index = 0;
      for (const item of node.children) {
        index++;
        const text = item.cloneNode(true); text.querySelectorAll('[data-note-check]').forEach(control => control.remove());
        const prefix = node.dataset.noteChecklist === 'true' ? (item.dataset.noteChecked === 'true' ? 'Complete:' : 'Incomplete:') : node.tagName === 'OL' ? `${index}.` : '•';
        paragraph(`${prefix} ${text.textContent}`, { indent: 3 });
      }
      return;
    }
    for (const child of node.childNodes) await walk(child);
  }
  await walk(root);
  const pages = pdf.getNumberOfPages();
  for (let index = 1; index <= pages; index++) {
    pdf.setPage(index); font(8, true, MUTED);
    const heading = lines(`${snapshot.fields.companyName || 'Jobs'} · ${snapshot.fields.number}`, RIGHT - LEFT, 8, true)[0];
    pdf.setFillColor(...INK); pdf.rect(LEFT, 7, RIGHT - LEFT, 10, 'F'); font(8, true, [255,255,255]); pdf.text(heading, LEFT + 3, 13.5); pdf.setDrawColor(...RULE); pdf.line(LEFT, 17, RIGHT, 17);
    font(8, false, MUTED); pdf.text(`Issued ${clean(snapshot.fields.issueDate)} · ${index} / ${pages}`, RIGHT, 289, { align: 'right' });
    pdf.text('Certificate and captured visit evidence', LEFT, 289);
  }
  return new Blob([pdf.output('arraybuffer')], { type: MIME });
}

async function download(file, host) {
  const doc = host.document, urls = host.URL;
  if (!doc?.body || typeof urls?.createObjectURL !== 'function') throw Error('PDF download is unavailable in this browser.');
  const url = urls.createObjectURL(file), anchor = doc.createElement('a');
  anchor.href = url; anchor.download = file.name; doc.body.append(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); (host.setTimeout || setTimeout)(() => urls.revokeObjectURL(url), 60000)?.unref?.(); }
}

/** Opens a share sheet; never sends an email automatically. Cancel never downloads. */
export async function shareCertificatePdf(certificate, { host = globalThis, downloadOnly = false } = {}) {
  const blob = await generateCertificatePdf(certificate), fileName = certificatePdfFilename(certificate);
  const native = getNativePlatform(host);
  if (native) {
    const result = await native.exportBlob(blob, fileName, { share: !downloadOnly });
    return { status: result.status === 'saved' ? 'downloaded' : result.status, fileName };
  }
  const FileType = host.File || globalThis.File;
  if (!FileType) throw Error('This browser does not support PDF file exports.');
  const file = new FileType([blob], fileName, { type: MIME });
  if (!downloadOnly && typeof host.navigator?.share === 'function' && host.navigator.canShare?.({ files: [file] })) {
    try {
      await host.navigator.share({ files: [file], title: clean(certificate.fields.title) });
      return { status: 'shared', fileName };
    } catch (error) {
      if (error?.name === 'AbortError') return { status: 'cancelled', fileName };
      // Loss of transient activation during a large PDF is treated as unavailable;
      // failures after handoff are surfaced so a customer never gets two copies.
      if (!['NotSupportedError', 'NotAllowedError', 'TypeError'].includes(error?.name)) throw error;
    }
  }
  await download(file, host);
  return { status: 'downloaded', fileName };
}
