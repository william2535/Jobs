/**
 * Print a detached snapshot of saved report data without changing the preview.
 * The app action waits for every included image. Native beforeprint events are
 * synchronous, so browser-menu printing can refresh the data but cannot await
 * image decoding; use the app's Print report action for prepared photographs.
 */
const IMAGE_TIMEOUT_MS = 15000;
let nativePrintListener = null;
let installedGetter = null;
let lifecycleInstalled = false;
let preparing = false;
let callingPrint = false;
let explicitBeforePrintPending = false;
let awaitingAfterPrint = false;
let clearRequested = false;
let generation = 0;

function removeSnapshot() {
  document.getElementById('print-report')?.remove();
  delete document.body.dataset.printReport;
  clearRequested = false;
}

function installLifecycle() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  window.addEventListener('afterprint', () => {
    awaitingAfterPrint = false;
    explicitBeforePrintPending = false;
    // Keep the snapshot after a normal print/cancel. Some mobile browsers return
    // from print() before their native sheet has captured the document.
    if (clearRequested && !callingPrint) removeSnapshot();
  });
}

/**
 * Explicitly discard a retained snapshot. Returns false if removal is deferred
 * until an active print sheet closes. Ordinary app navigation need not call
 * this: beforeprint always asks for fresh saved data, including the no-job case.
 */
export function clearPrintReport() {
  generation += 1;
  if (callingPrint || awaitingAfterPrint) {
    clearRequested = true;
    return false;
  }
  removeSnapshot();
  return true;
}

function copyReport(getReport) {
  if (typeof getReport !== 'function') throw Error('A saved report is needed for printing.');
  const source = getReport();
  if (source == null) return null;
  if (!(source instanceof Element)) throw Error('The report could not be prepared for printing.');
  const report = source.cloneNode(true);
  report.removeAttribute('id');
  report.querySelectorAll('details').forEach(detail => { detail.open = true; });
  if (report.matches('details')) report.open = true;
  report.querySelectorAll('img').forEach(image => {
    image.loading = 'eager';
    image.decoding = 'sync';
  });
  return report;
}

function publishSnapshot(report) {
  const previous = document.getElementById('print-report');
  report.id = 'print-report';
  if (previous) previous.replaceWith(report);
  else document.body.append(report);
  document.body.dataset.printReport = 'ready';
  clearRequested = false;
}

function waitForImage(image, signal) {
  return new Promise((resolve, reject) => {
    let settled = false, decoding = false;
    const caption = (image.alt || 'Included photograph').slice(0, 120);
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancelled);
      if (error) reject(error); else resolve();
    };
    const failed = () => finish(Error(`${caption} could not be opened. The report was not printed; check the picture and try again.`));
    const cancelled = () => finish(Error('Report preparation was cancelled. Try Print report again.'));
    const loaded = async () => {
      if (settled || decoding) return;
      if (!image.naturalWidth || !image.naturalHeight) { failed(); return; }
      decoding = true;
      try {
        if (typeof image.decode === 'function') await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) { failed(); return; }
        finish();
      } catch { failed(); }
    };
    const timer = setTimeout(() => finish(Error(`${caption} took too long to prepare. The report was not printed; try again.`)), IMAGE_TIMEOUT_MS);
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
    else if (image.complete) loaded();
  });
}

function waitForFonts() {
  if (!document.fonts?.ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Report text took too long to prepare. Try Print report again.')), IMAGE_TIMEOUT_MS);
    Promise.resolve(document.fonts.ready).then(() => {
      clearTimeout(timer); resolve();
    }, () => {
      clearTimeout(timer); reject(Error('Report text could not be prepared. Try Print report again.'));
    });
  });
}

function nextFrame() {
  return new Promise(resolve => {
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      resolve();
    };
    // A background tab may pause animation frames. Do not leave preparation
    // locked indefinitely when the user switches away and returns.
    const timer = setTimeout(finish, 100);
    requestAnimationFrame(finish);
  });
}

/**
 * Register fresh saved-job reports for the browser's own Print command.
 * getReport must return an Element or null when there is no printable job.
 * onError receives native-print preparation errors; the stale snapshot is
 * removed first so the previous job can never be printed instead.
 * Returns a disposer for this registration.
 */
export function installReportPrinting({ getReport, onError = () => {} }) {
  if (typeof getReport !== 'function' || typeof onError !== 'function')
    throw Error('Report printing needs a report getter and an error handler.');
  installLifecycle();
  if (nativePrintListener) window.removeEventListener('beforeprint', nativePrintListener);
  installedGetter = getReport;
  const listener = () => {
    // The explicit app action has already decoded and mounted this snapshot.
    // Some mobile browsers dispatch beforeprint after print() has returned.
    if (callingPrint || explicitBeforePrintPending) {
      explicitBeforePrintPending = false;
      return;
    }
    generation += 1;
    try {
      const report = copyReport(getReport);
      if (report) publishSnapshot(report);
      else removeSnapshot();
      awaitingAfterPrint = true;
    } catch (error) {
      removeSnapshot();
      onError(error instanceof Error ? error : Error(String(error)));
    }
  };
  nativePrintListener = listener;
  window.addEventListener('beforeprint', listener);
  return () => {
    window.removeEventListener('beforeprint', listener);
    if (nativePrintListener === listener) {
      nativePrintListener = null;
      installedGetter = null;
    }
  };
}

/**
 * Prepare and invoke the native print / Save as PDF sheet. Resolves true when
 * print() has been invoked, not when the user saves or prints a document.
 * Rejects missing reports, broken/slow images and browser print errors. The
 * previous snapshot remains intact until a complete replacement is ready.
 */
export async function printServiceReport(getReport = installedGetter) {
  if (preparing || callingPrint) throw Error('A report is already being prepared. Please wait.');
  if (typeof window.print !== 'function') throw Error('Printing is unavailable in this browser.');
  installLifecycle();
  const report = copyReport(getReport);
  if (!report) throw Error('Open a saved job before printing its report.');
  const version = ++generation;
  const controller = new AbortController();
  const staging = document.createElement('div');
  staging.hidden = true;
  staging.dataset.printPreparation = '';
  staging.append(report);
  document.body.append(staging);
  preparing = true;
  try {
    await Promise.all([
      ...Array.from(report.querySelectorAll('img'), image => waitForImage(image, controller.signal)),
      waitForFonts(),
    ]);
    if (version !== generation) throw Error('The report changed while it was being prepared. Try Print report again.');
    publishSnapshot(report);
    await nextFrame();
    if (version !== generation) throw Error('The report changed while it was being prepared. Try Print report again.');
    awaitingAfterPrint = true;
    explicitBeforePrintPending = true;
    callingPrint = true;
    try {
      window.print();
    } catch (error) {
      awaitingAfterPrint = false;
      explicitBeforePrintPending = false;
      throw Error(`The browser could not open printing: ${error?.message || String(error)}`);
    } finally {
      callingPrint = false;
    }
    return true;
  } finally {
    preparing = false;
    controller.abort();
    staging.remove();
    if (clearRequested && !awaitingAfterPrint && !callingPrint) removeSnapshot();
  }
}
