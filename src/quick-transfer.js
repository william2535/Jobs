/** The job-card share chest. Storage, imports and delivery receipts belong to the caller. */
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const titleOf = job => job?.workflow?.details?.title || job?.workflow?.details?.reference || job?.title || (job?.id ? `Job ${job.id.slice(0, 8)}` : 'Saved job');
const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const shareIcon = icon('M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3');
const receiveIcon = icon('M12 3v13m-4-4 4 4 4-4M4 16v5h16v-5');
const transferIcon = icon('M3 8h17m-5-5 5 5-5 5M21 16H4m5-5-5 5 5 5');
const localDate = () => {
  const date = new Date(), pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const readableTime = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Time not recorded';
};
const officeTime = (local, instant) => {
  // Keep the engineer's recorded wall-clock time when the office is in another zone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local || '')) {
    const date = new Date(`${local}:00Z`);
    if (Number.isFinite(date.getTime())) return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  }
  return instant ? readableTime(instant) : 'Not recorded';
};
const duration = minutes => {
  const total = Math.round(minutes);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
};
function officeAttendance(item) {
  if (!item.day) return '';
  const summary = item.summary || item;
  const rows = [['Started', officeTime(item.day.localStart, item.day.startedAt)], ['Finished', officeTime(item.day.localFinish, item.day.finishedAt)]];
  if (Number.isFinite(summary.attendanceMinutes) && summary.attendanceMinutes >= 0) rows.push(['Attendance', duration(summary.attendanceMinutes)]);
  if (Number.isFinite(summary.unallocatedMinutes) && summary.unallocatedMinutes >= 0) rows.push(['Unallocated time', duration(summary.unallocatedMinutes)]);
  return `<dl class="transfer-return-attendance">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
}

/**
 * Prepares file bytes before the share tap, preserving Safari's user activation.
 * Only that share button waits for preparation; receiving a file remains available.
 * Share callbacks return a transport status, never evidence of recipient delivery.
 */
export function renderQuickTransfer({
  job = null, jobs = [], day = null, receipts = [], engineer = '', date = localDate(), officeId = '',
  prepareJobShare, prepareDayShare, onReceive, onPrepareDay, onStartDay, onFinishDay,
  onShareDay, onOpenJob, onShareReceipt, onTapSetup, onClose = () => {},
} = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'toolbox-chest transfer-chest quick-transfer';
  dialog.setAttribute('aria-label', 'Quick Transfer');
  let disposed = false, busy = false, startRetry = false, opener = null, currentDay = day, receiptCurrent = true;
  let jobShare = null, dayShare = null, preparedDayShare = null, dayPreparation = 0;
  let jobPreparing = false, dayPreparing = false;
  const availableJobs = jobs.filter(item => item && typeof item.id === 'string');
  const selectedIds = new Set(job ? [job.id] : []);
  dialog.innerHTML = `<header class="toolbox-chest-lid"><div class="toolbox-chest-handle" aria-hidden="true"></div><div class="toolbox-chest-title-row"><span class="toolbox-chest-mark" aria-hidden="true">${transferIcon}</span><div><small>ENGINEER TO ENGINEER</small><h2>Quick Transfer</h2></div><button type="button" class="toolbox-chest-close" data-transfer="cancel" aria-label="Close transfer">×</button></div></header><div class="toolbox-chest-tray"><p class="transfer-job-title">${job ? escape(titleOf(job)) : 'Collect, share or return your work'}</p><div class="transfer-grid"><button type="button" data-transfer="share" disabled>${shareIcon}<strong>Nearby / share job pack</strong><small data-transfer-share-label>${job ? 'Preparing editable file…' : 'Open a saved job to share it'}</small></button><button type="button" data-transfer="receive"${onReceive ? '' : ' disabled'}>${receiveIcon}<strong>Receive job pack</strong><small>Open a received file</small></button></div><p class="transfer-status" role="status" aria-live="polite" hidden></p><button type="button" class="transfer-retry" data-transfer="retry-share" hidden>Prepare job pack again</button><div class="transfer-current-day"></div>${onPrepareDay || onStartDay ? `<details class="transfer-day-options"><summary>Day pack <span>Choose jobs for you or your team</span></summary><form class="transfer-day-form" novalidate><div class="transfer-day-fields"><label>Engineer<input name="engineer" autocomplete="name" maxlength="200" value="${escape(engineer)}" placeholder="Name for the day"></label><label>Date<input name="date" type="date" value="${escape(date)}" required></label></div><label>Pack name (optional)<input name="label" maxlength="200" placeholder="Today's jobs"></label><fieldset class="transfer-job-picker"><legend>Jobs to include</legend>${availableJobs.map(item => `<label><input type="checkbox" name="jobIds" value="${escape(item.id)}"${selectedIds.has(item.id) ? ' checked' : ''}><span>${escape(titleOf(item))}</span></label>`).join('') || '<p>No saved jobs yet. Receive or create a job first.</p>'}</fieldset><p class="transfer-day-error" role="alert" hidden></p><div class="transfer-day-actions">${onPrepareDay ? '<button type="submit" class="primary">Prepare day pack</button>' : ''}${onStartDay ? '<button type="button" data-transfer="start-day">Start my day</button>' : ''}</div><button type="button" class="primary transfer-share-prepared" data-transfer="share-prepared-day" hidden>Share day pack</button></form></details>` : ''}<div class="transfer-receipts"></div>${onTapSetup ? '<details class="transfer-more"><summary>Sticker &amp; sharing help</summary><button type="button" data-transfer="tap-setup">Set up an NFC sticker</button><p>Receive opens an editable Jobs file saved on this phone. Use a nearby sharing option for an offline handover.</p></details>' : ''}</div>`;
  const status = dialog.querySelector('.transfer-status');
  const jobButton = dialog.querySelector('[data-transfer="share"]');
  const jobShareLabel = dialog.querySelector('[data-transfer-share-label]');
  const receiveButton = dialog.querySelector('[data-transfer="receive"]');
  const currentRoot = dialog.querySelector('.transfer-current-day');
  const form = dialog.querySelector('.transfer-day-form');

  function setStatus(message, error = false) {
    if (disposed) return;
    status.textContent = message || '';
    status.hidden = !message;
    status.setAttribute('role', error ? 'alert' : 'status');
    status.classList.toggle('is-error', error);
  }
  function updateLocks() {
    if (disposed) return;
    dialog.setAttribute('aria-busy', String(busy));
    dialog.querySelectorAll('button,input').forEach(control => { control.disabled = busy; });
    form?.querySelectorAll('input,button[type="submit"]').forEach(control => { control.disabled = busy || startRetry; });
    jobButton.disabled = busy || jobPreparing || !jobShare;
    receiveButton.disabled = busy || !onReceive;
    const dayButton = dialog.querySelector('[data-transfer="share-day"]');
    if (dayButton) dayButton.disabled = busy || dayPreparing || !(dayShare || onShareDay);
    const preparedButton = dialog.querySelector('[data-transfer="share-prepared-day"]');
    if (preparedButton) preparedButton.disabled = busy || startRetry || !preparedDayShare;
    const start = dialog.querySelector('[data-transfer="start-day"]');
    if (start) {
      start.disabled = busy || (!startRetry && currentDay?.status === 'running');
      start.textContent = startRetry ? 'Retry starting day' : 'Start my day';
    }
  }
  function setStartRetry(value) {
    startRetry = value === true;
    updateLocks();
  }
  function outcome(result, fallback) {
    if (result === false) throw Error('This action was not completed. Your saved work is unchanged.');
    if (result?.day) setDay(result.day);
    if (result?.status === 'cancelled') return setStatus(result.message || 'Sharing cancelled. Your saved pack is still here.');
    const messages = {
      shared: 'Shared through your device. A receipt confirms the other phone received it.',
      saved: 'Pack saved on this device.', downloaded: 'Pack downloaded. Open it with Receive job pack on the other phone.',
    };
    setStatus(result?.message || messages[result?.status] || fallback || 'Ready.');
  }
  // Invoke task synchronously before awaiting, so native share/file pickers keep the tap's activation.
  async function run(task, fallback) {
    if (busy || disposed) return;
    busy = true; updateLocks(); setStatus('');
    try { outcome(await task(), fallback); }
    catch (error) {
      if (error?.name === 'AbortError') setStatus('Sharing cancelled. Your saved pack is still here.');
      else setStatus(error?.message || 'This action could not be completed. Try again.', true);
    } finally { busy = false; updateLocks(); }
  }
  async function prepareJob() {
    if (!job || typeof prepareJobShare !== 'function' || disposed) {
      jobShareLabel.textContent = job ? 'Sharing is unavailable for this job' : 'Open a saved job to share it';
      return;
    }
    jobPreparing = true; jobShare = null;
    jobShareLabel.textContent = 'Preparing editable file…';
    dialog.querySelector('[data-transfer="retry-share"]').hidden = true;
    updateLocks();
    try {
      const share = await prepareJobShare(job);
      if (disposed) return;
      if (typeof share !== 'function') throw Error('The editable job pack could not be prepared.');
      jobShare = share; jobShareLabel.textContent = 'AirDrop · Quick Share · Files';
    } catch (error) {
      if (!disposed) {
        setStatus(error?.message || 'The job pack could not be prepared.', true);
        jobShareLabel.textContent = 'Preparation failed';
        dialog.querySelector('[data-transfer="retry-share"]').hidden = false;
      }
    } finally { jobPreparing = false; updateLocks(); }
  }
  function dayMarkup() {
    if (!currentDay) return '';
    const running = currentDay.status === 'running';
    const received = !!currentDay.receipt && currentDay.status === 'returned' && receiptCurrent;
    const label = running ? 'Day in progress' : !receiptCurrent ? 'Day saved · changes to return' : received ? 'Receipt received' : 'Day saved · ready to return';
    return `<section class="transfer-day-card"><div class="transfer-day-card-heading"><strong>${label}</strong><span>${escape(currentDay.engineer || '')}</span></div><p>Started ${escape(readableTime(currentDay.startedAt))}${currentDay.finishedAt ? `<br>Finished ${escape(readableTime(currentDay.finishedAt))}` : ''}</p><small>${(currentDay.jobIds || []).length} jobs in this day</small>${running && onFinishDay ? '<button type="button" data-transfer="review-finish">Review &amp; finish day</button><div class="transfer-finish-review" hidden><p>Finish the day timer and save today’s time before returning the pack.</p><div class="transfer-day-actions"><button type="button" class="primary" data-transfer="finish-day">Finish day</button><button type="button" data-transfer="keep-working">Keep working</button></div></div>' : !running && (prepareDayShare || onShareDay) ? `<button type="button" class="primary" data-transfer="share-day">${dayPreparing ? 'Preparing finished day…' : 'Share finished day'}</button><small class="transfer-delivery">${!receiptCurrent ? 'This day has changed since its receipt. Share the updated pack.' : received ? 'A matching receipt is saved on this phone.' : 'Awaiting a receipt from the receiving phone.'}</small>${!dayPreparing && !dayShare && prepareDayShare ? '<button type="button" data-transfer="retry-day">Prepare finished day again</button>' : ''}` : ''}</section>`;
  }
  async function prepareFinishedDay(token) {
    const snapshot = currentDay;
    if (!snapshot || snapshot.status === 'running' || !prepareDayShare) return;
    dayPreparing = true; dayShare = null; currentRoot.innerHTML = dayMarkup(); updateLocks();
    try {
      const share = await prepareDayShare(snapshot);
      if (disposed || token !== dayPreparation) return;
      if (typeof share !== 'function') throw Error('The finished day could not be prepared.');
      dayShare = share;
    } catch (error) { if (!disposed && token === dayPreparation) setStatus(error?.message || 'The finished day could not be prepared.', true); }
    finally {
      if (!disposed && token === dayPreparation) {
        dayPreparing = false; currentRoot.innerHTML = dayMarkup(); updateLocks();
      }
    }
  }
  function setDay(value) {
    if (disposed) return;
    currentDay = value || null; dayShare = null; dayPreparing = false; receiptCurrent = true;
    const token = ++dayPreparation;
    currentRoot.innerHTML = dayMarkup(); updateLocks();
    void prepareFinishedDay(token);
  }
  function setReceiptCurrent(value) {
    receiptCurrent = value !== false;
    if (disposed || !currentDay || currentDay.status === 'running') return;
    const label = currentRoot.querySelector('.transfer-day-card-heading strong');
    if (label) label.textContent = !receiptCurrent ? 'Day saved · changes to return' : currentDay.receipt && currentDay.status === 'returned' ? 'Receipt received' : 'Day saved · ready to return';
    const delivery = currentRoot.querySelector('.transfer-delivery');
    if (delivery) delivery.textContent = !receiptCurrent ? 'This day has changed since its receipt. Share the updated pack.' : currentDay.receipt && currentDay.status === 'returned' ? 'A matching receipt is saved on this phone.' : 'Awaiting a receipt from the receiving phone.';
  }
  function readDayValues(requireEngineer = false) {
    const values = {
      engineer: form.elements.engineer.value.trim(), date: form.elements.date.value,
      label: form.elements.label.value.trim(), officeId,
      jobIds: [...form.querySelectorAll('[name="jobIds"]:checked')].map(input => input.value),
    };
    if (!values.jobIds.length) throw Error('Choose at least one saved job.');
    if (requireEngineer && !values.engineer) throw Error('Enter your name to start the day.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) || !Number.isFinite(Date.parse(values.date)) || new Date(values.date).toISOString().slice(0, 10) !== values.date) throw Error('Choose a valid date.');
    return values;
  }
  function dayFormAction(callback, requireEngineer, fallback) {
    const error = form.querySelector('.transfer-day-error'); error.hidden = true;
    let values;
    try { values = readDayValues(requireEngineer); }
    catch (cause) { error.textContent = cause.message; error.hidden = false; return; }
    return run(() => callback(values), fallback);
  }
  if (form) {
    form.addEventListener('input', () => {
      preparedDayShare = null;
      form.querySelector('[data-transfer="share-prepared-day"]').hidden = true;
      form.querySelector('.transfer-day-error').hidden = true;
    });
    form.onsubmit = event => {
      event.preventDefault();
      if (!onPrepareDay || startRetry) return;
      dayFormAction(async values => {
        const prepared = await onPrepareDay(values);
        if (disposed) return prepared;
        if (typeof prepared?.share !== 'function') throw Error('The day pack could not be prepared. Your selections are still here.');
        preparedDayShare = prepared.share;
        form.querySelector('[data-transfer="share-prepared-day"]').hidden = false;
        return { message: prepared.message || 'Day pack ready. Tap Share day pack to hand it over.' };
      }, false);
    };
  }
  const receiptsRoot = dialog.querySelector('.transfer-receipts');
  if (receipts.length) {
    receiptsRoot.innerHTML = `<details class="transfer-office-returns"><summary>Office returns <span>${receipts.length} received</span></summary><div class="transfer-return-list">${receipts.map((item, index) => `<article class="transfer-return"><strong>${escape(item.engineer || item.receipt?.engineer || 'Returned day')}</strong><small>${escape(item.date || '')} · ${Number(item.jobCount ?? item.jobIds?.length ?? 0)} jobs${item.conflictCount ? ` · ${Number(item.conflictCount)} to review` : ''}</small>${item.label ? `<p>${escape(item.label)}</p>` : ''}${officeAttendance(item)}${item.timeConflicts?.length ? `<details class="transfer-time-review"><summary>Time records to review · ${item.timeConflicts.length}</summary><p>These returned records differ from a saved entry. Both versions are kept for office review.</p><ul>${item.timeConflicts.map(({ entry = {} }) => `<li><strong>${escape(entry.engineer || item.engineer || 'Engineer')} · ${escape(entry.sessionType || 'Work')}</strong><span>${escape(entry.date || '')} ${escape(entry.start || '')}${entry.end ? ` → ${escape(entry.endDate || entry.date || '')} ${escape(entry.end)}` : ''}</span>${entry.deletedAt ? `<span>Deleted by engineer · ${escape(readableTime(entry.deletedAt))}</span>` : ''}${Number.isFinite(entry.hours) ? `<span>${escape(Math.round(entry.hours * 100) / 100)} hours recorded</span>` : ''}${entry.note ? `<span>${escape(entry.note)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}<div class="transfer-return-actions">${onOpenJob ? (item.jobIds || []).map(id => `<button type="button" data-transfer="open-job" data-job-id="${escape(id)}">${escape(titleOf(availableJobs.find(job => job.id === id) || { id }))}</button>`).join('') : ''}${onShareReceipt && item.receipt ? `<button type="button" data-transfer="share-receipt" data-receipt-index="${index}">Share receipt</button>` : ''}</div></article>`).join('')}</div></details>`;
  }
  dialog.addEventListener('click', event => {
    const control = event.target.closest?.('[data-transfer]');
    if (!control || !dialog.contains(control) || control.disabled) return;
    const action = control.dataset.transfer;
    if (action === 'cancel') return dialog.closeChest();
    if (action === 'share' && jobShare) return void run(jobShare);
    if (action === 'retry-share') return void prepareJob();
    if (action === 'receive' && onReceive) {
      // The file picker must be opened in the original gesture, not after async preparation.
      try { onReceive(); dialog.closeChest(); } catch (error) { setStatus(error.message, true); }
      return;
    }
    if (action === 'start-day' && onStartDay) return void dayFormAction(onStartDay, true, 'Day started on this phone.');
    if (action === 'share-prepared-day' && preparedDayShare && !startRetry) return void run(preparedDayShare);
    if (action === 'review-finish') {
      control.hidden = true; currentRoot.querySelector('.transfer-finish-review').hidden = false; return;
    }
    if (action === 'keep-working') {
      currentRoot.querySelector('.transfer-finish-review').hidden = true;
      currentRoot.querySelector('[data-transfer="review-finish"]').hidden = false; return;
    }
    if (action === 'finish-day' && onFinishDay) return void run(() => onFinishDay(currentDay), 'Day saved. Your finished pack is ready to return.');
    if (action === 'share-day') return void run(dayShare || (() => onShareDay?.(currentDay)));
    if (action === 'retry-day') return void prepareFinishedDay(++dayPreparation);
    if (action === 'share-receipt' && onShareReceipt) return void run(() => onShareReceipt(receipts[Number(control.dataset.receiptIndex)]));
    if (action === 'open-job' && onOpenJob) {
      try { onOpenJob(control.dataset.jobId); dialog.closeChest(); } catch (error) { setStatus(error.message, true); }
      return;
    }
    if (action === 'tap-setup' && onTapSetup) {
      try { onTapSetup(); dialog.closeChest(); } catch (error) { setStatus(error.message, true); }
    }
  });
  function cleanup() {
    if (disposed) return;
    disposed = true; dayPreparation++;
    jobShare = dayShare = preparedDayShare = null;
    onClose();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    dialog.remove();
  }
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', cleanup, { once: true });
  dialog.openChest = source => {
    if (disposed) return false;
    opener = source || document.activeElement;
    if (!dialog.isConnected) document.body.append(dialog);
    dialog.style.setProperty('--chest-origin-x', '90%');
    dialog.style.setProperty('--chest-origin-y', '0px');
    if (!dialog.open) dialog.showModal();
    return true;
  };
  dialog.closeChest = () => {
    if (busy) return false;
    if (dialog.open) dialog.close();
    cleanup();
    return true;
  };
  dialog.dispose = cleanup;
  dialog.setStatus = setStatus;
  dialog.setDay = setDay;
  dialog.setReceiptCurrent = setReceiptCurrent;
  dialog.setStartRetry = setStartRetry;
  setDay(day);
  void prepareJob();
  updateLocks();
  return dialog;
}
