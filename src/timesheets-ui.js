/** Daily time records saved on this device. Submission never contacts an office. */
import { SESSION_TYPES, timesheetEntries, timesheetDayArchives, splitTimesheetByDay, shiftLocalDateTime, prepareTimesheetEdit, minutesForTimesheet, isWorkSession } from './timesheets.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const pad = value => String(value).padStart(2, '0');
const localDay = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localTime = (date = new Date()) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00`).getFullYear() === Number(value.slice(0, 4)) && localDay(new Date(`${value}T12:00:00`)) === value;
const durationLabel = minutes => `${Math.floor(Math.max(0, Math.round(minutes)) / 60)}:${pad(Math.max(0, Math.round(minutes)) % 60)}`;
const clockMinutes = value => {
  const clock = String(value || '').includes('T') ? String(value).slice(11, 16) : String(value || '');
  return /^\d{2}:\d{2}$/.test(clock) ? Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3)) : null;
};
const titleFor = job => job?.workflow?.details?.title || job?.workflow?.details?.reference || job?.workType || 'Untitled job';
const typeFor = entry => entry.sessionType === 'Custom' ? entry.customType || 'Custom' : entry.sessionType || 'Recorded time';
const plainType = entry => entry.sessionType === 'Travel' ? 'travel' : entry.sessionType === 'Break' ? 'break' : isWorkSession(entry) ? 'work' : 'other';
const dayLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

export function renderTimesheets({ state, onSave = async () => false, onDelete = async () => false, onSubmit = async () => false, onExport, onDirty = () => {}, initialDate, viewState } = {}) {
  const root = document.createElement('section'); root.className = 'timesheets-ui';
  let workspace = state || { jobs: [], sites: [] };
  let date = validDay(viewState?.date) ? viewState.date : validDay(initialDate) ? initialDate : localDay();
  let editor = null, reviewing = false, dirty = false, busy = false, disposed = false, notice = '';
  let scrollPosition = Number.isFinite(viewState?.scrollTop) ? Math.max(0, viewState.scrollTop) : null;
  const rows = () => timesheetEntries(workspace);
  const undatedRows = () => rows().filter(row => !row.entry.date).map(row => ({ ...row, segment: { start: row.entry.start || '', end: row.entry.end || '', minutes: minutesForTimesheet(row.entry) } }));
  const dayRows = () => rows().flatMap(row => splitTimesheetByDay(row.entry).filter(segment => segment.date === date).map(segment => ({ ...row, segment })));
  const archivedRows = () => timesheetDayArchives(workspace, date);
  const jobFor = id => (workspace.jobs || []).find(job => job.id === id);
  const siteName = job => (workspace.sites || []).find(site => site.id === job?.siteId)?.name || '';
  const rowName = row => row.job ? [siteName(row.job), titleFor(row.job)].filter(Boolean).join(' · ') : 'Unassigned session';
  const rowRef = row => ({ jobId: row.jobId ?? null, entryId: row.entry.id });
  const totals = current => current.reduce((result, row) => {
    if (row.conflict) return result;
    const minutes = row.segment.minutes;
    result.recorded += minutes;
    result[plainType(row.entry)] += minutes;
    if (row.entry.submissionId) result.submitted++;
    return result;
  }, { recorded: 0, work: 0, travel: 0, break: 0, other: 0, submitted: 0 });
  function changed() { if (!busy && !disposed) { dirty = true; onDirty(true); } }
  function showError(error, target = root.querySelector('.timesheet-dialog') || root) {
    const box = target.querySelector('.timesheet-error');
    if (box) { box.textContent = error.message || String(error); box.hidden = false; }
  }
  function rememberScroll() { const viewport = root.querySelector('.timesheet-scroll'); if (viewport) scrollPosition = viewport.scrollTop; }
  function confirmLeave() {
    if (busy) return false;
    if (dirty && !confirm('Leave this form and discard unsaved changes?')) return false;
    if (dirty) { dirty = false; onDirty(false); }
    return true;
  }
  function closeDialog(force = false) {
    if (!force && !confirmLeave()) return false;
    const dialog = root.querySelector('.timesheet-dialog');
    if (dialog?.open) dialog.close();
    dialog?.remove(); editor = null; reviewing = false;
    return true;
  }
  function lock(value) {
    busy = value; root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button,input,textarea,select').forEach(control => { control.disabled = value; });
    if (!value) {
      const current = dayRows();
      root.querySelectorAll('[data-timesheet-submit]').forEach(control => { control.disabled = !current.some(row => !row.entry.submissionId) || current.some(row => row.conflict); });
      root.querySelectorAll('[data-timesheet-export]').forEach(control => { control.disabled = !current.length && !archivedRows().length; });
    }
  }
  function applyResponse(response) {
    if (!response || response === false || !response.state) throw Error('The time record was not saved. Your entries are still here; try again.');
    workspace = response.state;
  }
  function changeDate(next) {
    if (!validDay(next) || !confirmLeave()) return;
    date = next; scrollPosition = null; notice = ''; render();
  }
  function shiftDate(delta) {
    const next = new Date(`${date}T12:00:00`); next.setDate(next.getDate() + delta); changeDate(localDay(next));
  }
  function sessionButton(row, style = '', extraClass = '') {
    const entry = row.entry, time = row.segment.start && row.segment.end ? `${row.segment.start}–${row.segment.end}` : `${durationLabel(row.segment.minutes)} recorded hours`;
    const compact = !!style && (clockMinutes(row.segment.end) - clockMinutes(row.segment.start)) * 1.2 < 80;
    const description = `${typeFor(entry)}, ${time}, ${rowName(row)}${row.conflict ? ', duplicate session ID' : ''}`;
    return `<button type="button" class="timesheet-session ${plainType(entry)} ${extraClass}${compact ? ' timesheet-session-short' : ''}${row.conflict ? ' timesheet-conflict-session' : ''}" data-session-id="${esc(entry.id)}" data-session-owner="${esc(row.jobId || '')}" style="${style}" aria-label="Edit ${esc(description)}" title="${esc(description)}"><strong>${esc(typeFor(entry))}${row.conflict ? ' · Duplicate ID' : ''}${compact ? ` · ${esc(rowName(row))}` : ''}</strong>${compact ? '' : `<span>${esc(rowName(row))}</span>`}<small>${esc(time)}${entry.submissionId ? ' · submitted locally' : ''}${!entry.sessionType ? ` · ${durationLabel(row.segment.minutes)} recorded` : ''}</small></button>`;
  }
  function timelineMarkup(current) {
    const timed = current.filter(row => clockMinutes(row.segment.start) !== null && clockMinutes(row.segment.end) !== null);
    const untimed = current.filter(row => !timed.includes(row));
    const laidOut = timed.map(row => ({ row, start: clockMinutes(row.segment.start), end: clockMinutes(row.segment.end) })).sort((a, b) => a.start - b.start || a.end - b.end);
    // Share columns only within overlapping groups; short entries keep a 44px target.
    const groups = []; let group = [], groupEnd = -1;
    for (const entry of laidOut) {
      entry.visualEnd = Math.max(entry.end, entry.start + 44 / 1.2);
      if (entry.start >= groupEnd && group.length) { groups.push(group); group = []; groupEnd = -1; }
      group.push(entry); groupEnd = Math.max(groupEnd, entry.visualEnd);
    }
    if (group.length) groups.push(group);
    let maxLanes = 1;
    const blocks = groups.flatMap(group => {
      const ends = [];
      for (const entry of group) { let lane = ends.findIndex(end => end <= entry.start); if (lane < 0) lane = ends.length; ends[lane] = entry.visualEnd; entry.lane = lane; }
      maxLanes = Math.max(maxLanes, ends.length);
      return group.map(entry => sessionButton(entry.row, `top:${entry.start * 1.2}px;height:${Math.max(44, (entry.end - entry.start) * 1.2)}px;left:calc(${entry.lane / ends.length * 100}% + 3px);width:calc(${100 / ends.length}% - 6px)`));
    }).join('');
    const now = new Date(), currentMinute = now.getHours() * 60 + now.getMinutes();
    return `${untimed.length ? `<div class="timesheet-untimed"><h3>Recorded hours</h3>${untimed.map(row => sessionButton(row, '', 'timesheet-manual-session')).join('')}</div>` : ''}<div class="timesheet-timeline" aria-label="Daily session timeline" style="min-width:${maxLanes * 52}px">${Array.from({ length: 25 }, (_, hour) => `<div class="timesheet-hour" style="top:${hour * 72}px"><span>${pad(hour)}:00</span>${hour < 24 ? '<i class="timesheet-half-hour"></i>' : ''}</div>`).join('')}${date === localDay() ? `<div class="timesheet-now-line" style="top:${currentMinute * 1.2}px" aria-hidden="true"></div>` : ''}${blocks}</div>`;
  }
  function render() {
    if (disposed) return;
    const current = dayRows(), summary = totals(current);
    root.innerHTML = `<div class="timesheet-error" role="alert" hidden></div><div class="timesheet-shell"><div class="timesheet-daybar"><button type="button" data-timesheet-previous aria-label="Previous day">‹</button><label class="timesheet-date-control"><input type="date" aria-label="Timesheet date" value="${date}"><span>${esc(dayLabel(date))}</span></label><button type="button" data-timesheet-next aria-label="Next day">›</button><button type="button" data-timesheet-today>Today</button><button type="button" class="timesheet-add" data-timesheet-add aria-label="Add session">＋</button></div>${!current.length ? '<div class="timesheet-empty">No sessions for this day. Tap + to add one.</div>' : current.some(row => row.conflict) ? '<div class="timesheet-empty timesheet-conflict-warning" role="status">Duplicate session IDs are excluded from totals. Review these sessions before submitting.</div>' : ''}<div class="timesheet-scroll">${timelineMarkup(current)}</div><div class="timesheet-footer"><div class="timesheet-totals"><div><strong>${current.length}</strong><span>Sessions</span></div><div><strong>${summary.submitted}</strong><span>Submitted</span></div><div><strong class="timesheet-work-total">${durationLabel(summary.work)}</strong><span>Work</span></div></div><button type="button" data-timesheet-submit aria-label="Submit timesheet"${current.some(row => !row.entry.submissionId) && !current.some(row => row.conflict) ? '' : ' disabled'}>Submit timesheet<span aria-hidden="true"> (${current.filter(row => !row.entry.submissionId).length})</span></button></div></div>${undatedRows().length ? `<details class="timesheet-undated"><summary>Undated records (${undatedRows().length})</summary><p>Assign a recorded date to include these hours in a daily timesheet.</p>${undatedRows().map(row => sessionButton(row, '', 'timesheet-manual-session')).join('')}</details>` : ''}<div class="timesheet-secondary-summary"><span>Recorded <strong class="timesheet-recorded-total">${durationLabel(summary.recorded)}</strong> · Travel ${durationLabel(summary.travel)} · Break ${durationLabel(summary.break)} · Other ${durationLabel(summary.other)}</span>${onExport ? `<button type="button" data-timesheet-export${current.length || archivedRows().length ? '' : ' disabled'}>Export timesheet</button>` : ''}</div>${archivedRows().length ? `<p class="timesheet-submission-note">${archivedRows().length} session(s) retained in trash and included in this day's export.</p>` : ''}<p class="timesheet-submission-status" role="status">${esc(notice || (summary.submitted ? `${summary.submitted} submitted locally` : 'Not submitted on this device'))}</p>`;
    root.querySelector('[data-timesheet-previous]').onclick = () => shiftDate(-1);
    root.querySelector('[data-timesheet-next]').onclick = () => shiftDate(1);
    root.querySelector('[data-timesheet-today]').onclick = () => changeDate(localDay());
    root.querySelector('[aria-label="Timesheet date"]').onchange = event => { const next = event.target.value; event.target.value = date; changeDate(next); };
    root.querySelector('[data-timesheet-add]').onclick = () => openEditor();
    root.querySelectorAll('[data-session-id]').forEach(button => { button.onclick = () => {
      const row = rows().find(row => row.entry.id === button.dataset.sessionId && (row.jobId || '') === button.dataset.sessionOwner); if (row) openEditor(row);
    }; });
    root.querySelector('[data-timesheet-submit]').onclick = openReview;
    root.querySelector('[data-timesheet-export]')?.addEventListener('click', async () => {
      if (busy || disposed) return;
      rememberScroll(); lock(true);
      try {
        const response = await onExport({ from: date, to: date });
        if (!response || !response.package) throw Error('The timesheet export could not be prepared. Try again.');
        notice = 'Timesheet export prepared on this device.';
        if (!disposed) render();
      } catch (error) { if (!disposed) showError(error); }
      finally { if (!disposed) lock(false); else busy = false; }
    });
    const viewport = root.querySelector('.timesheet-scroll');
    const firstStart = current.map(row => clockMinutes(row.segment.start)).filter(value => value !== null).sort((a, b) => a - b)[0];
    requestAnimationFrame(() => {
      if (disposed || !viewport.isConnected || !root.contains(viewport)) return;
      viewport.scrollTop = scrollPosition ?? Math.max(0, ((firstStart ?? 8 * 60) - 45) * 1.2);
    });
  }
  function updateDuration(dialog) {
    const start = dialog.querySelector('[name="startDateTime"]').value, finish = dialog.querySelector('[name="finishDateTime"]').value;
    const legacy = !dialog.querySelector('[name="sessionType"]').value;
    const hoursOnly = legacy || (!start && !finish && editor.hoursOnly);
    const elapsed = (Date.parse(`${finish}Z`) - Date.parse(`${start}Z`)) / 60000;
    const hours = Number(dialog.querySelector('[name="hours"]')?.value ?? editor.entry.hours);
    dialog.querySelector('.timesheet-duration output').textContent = hoursOnly ? durationLabel((Number.isFinite(hours) ? hours : 0) * 60) : Number.isFinite(elapsed) && elapsed >= 0 ? durationLabel(elapsed) : 'Check times';
    dialog.querySelector('.timesheet-duration > span').textContent = hoursOnly ? 'Recorded hours' : 'Calculated duration';
  }
  function editorMarkup() {
    const entry = editor.entry, legacy = !entry.sessionType, jobs = workspace.jobs || [];
    const existingJob = editor.jobId && !jobs.some(job => job.id === editor.jobId);
    return `<form data-timesheet-form novalidate><div class="timesheet-editor-header"><button type="button" data-editor-cancel>Cancel</button><h2>${editor.isNew ? 'Add session' : 'Edit session'}</h2><button type="submit">Save session</button></div><div class="timesheet-editor-body"><div class="timesheet-error" role="alert" hidden></div><label>Task / job<select name="jobId" aria-label="Task / job"><option value="">Unassigned</option>${existingJob ? `<option value="${esc(editor.jobId)}" selected>Original job reference</option>` : ''}${jobs.map(job => `<option value="${esc(job.id)}"${editor.jobId === job.id ? ' selected' : ''}>${esc([siteName(job), titleFor(job)].filter(Boolean).join(' · '))}</option>`).join('')}</select></label><label>Type<select name="sessionType" aria-label="Type">${legacy ? '<option value="" selected>Legacy recorded time</option>' : ''}${SESSION_TYPES.map(type => `<option${entry.sessionType === type ? ' selected' : ''}>${esc(type)}</option>`).join('')}</select></label><label data-custom-type${entry.sessionType === 'Custom' ? '' : ' hidden'}>Custom type<input name="customType" aria-label="Custom type" value="${esc(entry.customType || '')}" maxlength="200"></label>${legacy || editor.hoursOnly ? `<label>Recorded date<input type="date" name="recordedDate" aria-label="Recorded date" value="${esc(entry.date)}"></label><label data-legacy-hours>Recorded hours<input name="hours" aria-label="Recorded hours" type="number" min="0" step="any" value="${esc(entry.hours)}"><small>${legacy ? 'These recorded hours remain authoritative. Choose a session type to calculate time from Start and Finish.' : 'Hours-only record. Keep both times empty to preserve recorded hours, or enter Start and Finish to calculate duration.'}</small></label>` : ''}${[['Start', 'startDateTime', entry.start ? `${entry.date}T${entry.start}` : ''], ['Finish', 'finishDateTime', entry.end ? `${entry.endDate || entry.date}T${entry.end}` : '']].map(([label, name, value]) => `<div class="timesheet-time-field"><label for="${editor.domId}-${name}">${label}</label><div class="timesheet-time-controls"><button type="button" data-time-step="-1" data-time-field="${name}" aria-label="${label} minus 1 minute">−</button><input type="datetime-local" id="${editor.domId}-${name}" name="${name}" aria-label="${label}" value="${esc(value)}" step="60"><button type="button" data-time-step="1" data-time-field="${name}" aria-label="${label} plus 1 minute">+</button></div></div>`).join('')}<div class="timesheet-duration"><span>${legacy ? 'Recorded hours' : 'Calculated duration'}</span><output aria-label="Session duration"></output></div><label>Description<textarea name="note" aria-label="Description" maxlength="10000" rows="3">${esc(entry.note)}</textarea></label>${entry.submissionId || entry.submissionHistory?.length ? `<details class="timesheet-submission-history"><summary>Submitted records (${entry.submissionHistory?.length || 0})</summary><p>Editing this session creates a draft. Earlier submitted records stay in the export.</p>${(entry.submissionHistory || []).map(record => `<p><strong>${esc(record.submittedAt)}</strong><br>${esc(record.entry.date)} · ${esc(record.entry.start || '')}${record.entry.end ? `–${esc(record.entry.end)}` : ''} · ${esc(record.entry.hours)} hours${record.entry.note ? `<br>${esc(record.entry.note)}` : ''}</p>`).join('')}</details>` : ''}<div class="timesheet-editor-footer"><small>${entry.submissionId ? 'Submitted on this device' : 'Saved only when you tap Save'}</small>${!editor.isNew ? '<button type="button" data-editor-delete>Trash session</button>' : ''}</div></div></form>`;
  }
  function openEditor(row = null) {
    if (busy || disposed || !confirmLeave()) return;
    rememberScroll();
    const now = new Date(), start = date === localDay(now) ? localTime(now) : '09:00';
    const finish = shiftLocalDateTime(`${date}T${start}`, 60);
    editor = {
      entry: structuredClone(row?.entry || { id: crypto.randomUUID(), date, start, endDate: finish.slice(0, 10), end: finish.slice(11), hours: 1, note: '', engineer: '', sessionType: 'Work', customType: '' }),
      jobId: row?.jobId ?? null, previousJobId: row ? row.jobId ?? null : undefined, isNew: !row, hoursOnly: !!row && !row.entry.start && !row.entry.end, domId: `session-${crypto.randomUUID()}`,
    };
    const dialog = document.createElement('dialog'); dialog.className = 'timesheet-dialog'; dialog.setAttribute('aria-label', editor.isNew ? 'Add session' : 'Edit session'); dialog.innerHTML = editorMarkup();
    root.append(dialog); dialog.showModal();
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
    dialog.querySelector('[data-editor-cancel]').onclick = () => closeDialog();
    const form = dialog.querySelector('form');
    form.addEventListener('input', () => { changed(); updateDuration(dialog); });
    form.addEventListener('change', () => { changed(); updateDuration(dialog); });
    dialog.querySelector('[name="sessionType"]').onchange = event => {
      dialog.querySelector('[data-custom-type]').hidden = event.target.value !== 'Custom';
      const legacy = dialog.querySelector('[data-legacy-hours]'); if (legacy) legacy.hidden = !!event.target.value && !editor.hoursOnly;
    };
    dialog.querySelector('[name="recordedDate"]')?.addEventListener('input', event => {
      const recordedDate = event.target.value;
      const startInput = dialog.querySelector('[name="startDateTime"]'), finishInput = dialog.querySelector('[name="finishDateTime"]');
      const startClock = startInput.value.slice(11, 16) || editor.entry.start, finishClock = finishInput.value.slice(11, 16) || editor.entry.end;
      const existingStart = startInput.value.slice(0, 10) || editor.entry.date, existingFinish = finishInput.value.slice(0, 10) || editor.entry.endDate || existingStart;
      const dayOffset = existingStart && existingFinish ? Math.max(0, (Date.parse(existingFinish) - Date.parse(existingStart)) / 86400000) : 0;
      startInput.value = recordedDate && startClock ? `${recordedDate}T${startClock}` : '';
      finishInput.value = recordedDate && finishClock ? shiftLocalDateTime(`${recordedDate}T${finishClock}`, dayOffset * 1440) : '';
    });
    dialog.querySelector('[name="startDateTime"]').addEventListener('input', event => {
      const recordedDate = dialog.querySelector('[name="recordedDate"]');
      if (recordedDate && event.target.value) recordedDate.value = event.target.value.slice(0, 10);
    });
    dialog.querySelectorAll('[data-time-step]').forEach(button => { button.onclick = () => {
      try {
        const input = dialog.querySelector(`[name="${button.dataset.timeField}"]`);
        if (!input.value) throw Error('Enter a date and time before adjusting minutes.');
        input.value = shiftLocalDateTime(input.value, Number(button.dataset.timeStep)); changed(); updateDuration(dialog);
      } catch (error) { showError(error, dialog); }
    }; });
    dialog.querySelector('[data-editor-delete]')?.addEventListener('click', async () => {
      if (busy || !confirm('Trash this session? Earlier submitted records will be retained.')) return;
      lock(true);
      try {
        applyResponse(await onDelete({ jobId: editor.previousJobId, entryId: editor.entry.id }));
        dirty = false; onDirty(false); closeDialog(true); notice = 'Session moved to trash on this device.'; if (!disposed) render();
      } catch (error) { if (!disposed) showError(error, dialog); }
      finally { if (!disposed) lock(false); else busy = false; }
    });
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || disposed) return;
      dialog.querySelector('.timesheet-error').hidden = true; changed();
      try {
        const data = new FormData(form), startValue = String(data.get('startDateTime') || ''), finishValue = String(data.get('finishDateTime') || ''), selectedType = String(data.get('sessionType') || '');
        const recordedDate = data.has('recordedDate') ? String(data.get('recordedDate') || '') : editor.entry.date;
        if (Boolean(startValue) !== Boolean(finishValue)) throw Error('Enter both Start and Finish, including the finish date for overnight work.');
        if (selectedType && (!startValue || !finishValue) && !editor.hoursOnly) throw Error('Enter Start and Finish for this session.');
        const keepUndatedClocks = !selectedType && !recordedDate && !startValue && !finishValue && !editor.entry.date;
        const next = { ...structuredClone(editor.entry), date: startValue ? startValue.slice(0, 10) : recordedDate, start: startValue ? startValue.slice(11, 16) : keepUndatedClocks ? editor.entry.start : '', end: finishValue ? finishValue.slice(11, 16) : keepUndatedClocks ? editor.entry.end : '', endDate: finishValue ? finishValue.slice(0, 10) : recordedDate, note: String(data.get('note') || '') };
        if (selectedType) { next.sessionType = selectedType; next.customType = selectedType === 'Custom' ? String(data.get('customType') || '') : ''; }
        else { delete next.sessionType; delete next.customType; }
        if (!selectedType || (editor.hoursOnly && !startValue && !finishValue)) { const recorded = String(data.get('hours') || ''); if (!recorded.trim()) throw Error('Enter the recorded hours.'); next.hours = Number(recorded); }
        if (!editor.isNew && editor.entry.endDate === undefined && next.endDate === next.date) delete next.endDate;
        const checked = prepareTimesheetEdit(editor.isNew ? null : editor.entry, next);
        lock(true);
        // Validate locally, but keep the draft's expected revision for the
        // atomic state mutation; only the persistence helper advances it.
        applyResponse(await onSave({ entry: next, jobId: String(data.get('jobId') || '') || null, ...(!editor.isNew ? { previousJobId: editor.previousJobId } : {}) }));
        const nextDate = splitTimesheetByDay(checked).some(segment => segment.date === date) || !validDay(checked.date) ? date : checked.date;
        dirty = false; onDirty(false); closeDialog(true); if (nextDate !== date) scrollPosition = null; date = nextDate; notice = 'Session saved on this device.';
        if (!disposed) render();
      } catch (error) { if (!disposed) showError(error, dialog); }
      finally { if (!disposed) lock(false); else busy = false; }
    };
    updateDuration(dialog);
  }
  function openReview() {
    if (busy || disposed || !confirmLeave()) return;
    const current = dayRows().filter(row => !row.entry.submissionId); if (!current.length) return;
    if (current.some(row => row.conflict)) { showError(Error('Review duplicate session IDs before submitting. They are excluded from totals.')); return; }
    reviewing = true; rememberScroll();
    const dialog = document.createElement('dialog'); dialog.className = 'timesheet-dialog'; dialog.setAttribute('aria-label', 'Review timesheet');
    dialog.innerHTML = `<form data-timesheet-submit-form><div class="timesheet-editor-header"><button type="button" data-review-cancel>Cancel</button><h2>Review timesheet</h2><button type="submit">Confirm submission</button></div><div class="timesheet-editor-body"><div class="timesheet-error" role="alert" hidden></div><p class="timesheet-submit-copy">Submit saves a local submitted copy and downloads the timesheet. No remote office connection is configured; this does not send the timesheet to anyone.</p>${current.some(row => row.entry.endDate && row.entry.endDate !== row.entry.date) ? '<p class="timesheet-submit-copy">Overnight sessions are submitted in full, including time on adjacent days. Export totals cover the selected day.</p>' : ''}<p class="timesheet-submit-summary">${esc(dayLabel(date))} · ${current.length} sessions · ${durationLabel(totals(current).recorded)} recorded on this day</p><ul class="timesheet-submit-list">${current.map(row => `<li><strong>${esc(typeFor(row.entry))} · ${esc(rowName(row))}</strong><span>${esc(row.entry.date)} ${esc(row.entry.start || 'Hours only')}${row.entry.end ? ` → ${esc(row.entry.endDate || row.entry.date)} ${esc(row.entry.end)}` : ''} · ${durationLabel(minutesForTimesheet(row.entry))} whole session${row.entry.submissionId ? ' · submitted locally' : ''}</span><span>${durationLabel(row.segment.minutes)} counted on ${esc(date)}</span></li>`).join('')}</ul></div></form>`;
    root.append(dialog); dialog.showModal();
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
    dialog.querySelector('[data-review-cancel]').onclick = () => closeDialog();
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault(); if (busy || disposed) return; lock(true);
      try {
        const response = await onSubmit({ refs: current.map(rowRef), from: date, to: date });
        applyResponse(response);
        closeDialog(true);
        notice = response.downloadError
          ? 'Submitted locally, but download failed. Use Export timesheet to retry.'
          : `${current.length} sessions submitted on this device. Download prepared; nothing was sent to an office.`;
        if (!disposed) render();
      } catch (error) { if (!disposed) showError(error, dialog); }
      finally { if (!disposed) lock(false); else busy = false; }
    };
  }
  root.confirmLeave = confirmLeave;
  root.canLeave = confirmLeave;
  root.getViewState = () => { rememberScroll(); return { date, scrollTop: scrollPosition }; };
  root.dispose = () => { disposed = true; const dialog = root.querySelector('.timesheet-dialog'); if (dialog?.open) dialog.close(); dialog?.remove(); };
  render();
  return root;
}
