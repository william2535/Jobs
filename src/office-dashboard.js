import { buildOfficeOverview, UNTAGGED_ENGINEER_KEY } from './office-analytics.js';
import { buildOfficeAssets } from './office-assets.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const list = value => Array.isArray(value) ? value : [];
const counted = (value, label) => `${value} ${label}${value === 1 ? '' : 's'}`;
const duration = value => Number.isFinite(value) ? `${Math.floor(Math.max(0, Math.round(value)) / 60)}h ${Math.max(0, Math.round(value)) % 60}m` : '—';
const dayLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value))
  ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Date not recorded';
const localTime = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '') ? `${dayLabel(value.slice(0, 10))}, ${value.slice(11)}` : 'Not recorded';
const instant = value => Number.isFinite(Date.parse(value || '')) ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
const percentage = value => Number.isFinite(value) ? `${Math.round(value)}%` : 'Not available';
const statusLabel = day => ({ received: 'Received', running: 'Day in progress', finished: 'Awaiting return', returned: 'Receipt received', recorded: 'Time records only', assigned: 'Assignment received' }[day.status] || (day.source === 'return' ? 'Received' : 'Saved'));
const icon = path => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const receiveIcon = icon('M12 3v13m-4-4 4 4 4-4M4 16v5h16v-5');
const teamIcon = icon('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4-3.87a4 4 0 0 1 0 7.75');
const clockIcon = icon('M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0');
const localToday = () => {
  const now = new Date(), pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const categories = [
  ['jobWorkMinutes', 'Job time', 'job'], ['travelMinutes', 'Travel', 'travel'],
  ['breakMinutes', 'Break', 'break'], ['otherMinutes', 'Other time', 'other'],
  ['unallocatedMinutes', 'Unallocated', 'unallocated'],
];

function breakdown(totals = {}) {
  const amount = categories.reduce((sum, [key]) => sum + Math.max(0, totals[key] || 0), 0);
  return `<div class="office-breakdown"><div class="office-time-bar" aria-hidden="true">${categories.map(([key, label, type]) => `<span class="office-time-${type}" style="flex-grow:${Math.max(0, totals[key] || 0)}" title="${label}: ${duration(totals[key] || 0)}"></span>`).join('')}${amount ? '' : '<span class="office-time-empty"></span>'}</div><dl class="office-time-legend">${categories.map(([key, label, type]) => `<div><dt><span class="office-time-dot office-time-${type}" aria-hidden="true"></span>${label}</dt><dd>${duration(totals[key] || 0)}</dd></div>`).join('')}</dl></div>`;
}

/** Desktop office view. All data changes and file writes remain with the caller. */
export function renderOfficeDashboard({
  state = {}, viewState = {}, onImport, onOpenJob, onOpenSite, onOpenTimesheets, onExport,
  onQuickTransfer, onShareReceipt, onStateChange = () => {},
} = {}) {
  const root = document.createElement('section');
  root.className = 'office-dashboard';
  root.setAttribute('aria-label', 'Engineer day tracking');
  let workspace = state, model, assetOverview, jobIndex = new Map(), siteIndex = new Map(), disposed = false, busy = false, dragDepth = 0;
  let filters = { from: viewState.from || '', to: viewState.to || '', engineerKey: viewState.engineerKey || '' };
  let expandedDay = viewState.expandedDay || '', dayPage = Number.isSafeInteger(viewState.dayPage) ? Math.max(0, viewState.dayPage) : 0, status = '', isError = false;
  let assetsOpen = !!viewState.assetsOpen, waitingOpen = !!viewState.waitingOpen;
  let assetsPage = Number.isSafeInteger(viewState.assetsPage) ? Math.max(0, viewState.assetsPage) : 0;
  let waitingPage = Number.isSafeInteger(viewState.waitingPage) ? Math.max(0, viewState.waitingPage) : 0;
  let assetRecords = [];
  const notifyView = () => onStateChange(root.getViewState());
  const savedJobs = () => jobIndex;

  function jobButtons(jobs, extraClass = '') {
    return `<div class="office-job-links ${extraClass}">${list(jobs).map(job => `<button type="button" data-office-action="job" data-job-id="${escape(job.id)}"${onOpenJob && savedJobs().has(job.id) ? '' : ' disabled'}><span><strong>${escape(job.title || 'Untitled job')}</strong>${job.siteName ? `<small>${escape(job.siteName)}</small>` : ''}</span><span class="office-job-status">${escape(job.status || 'Saved')}</span></button>`).join('')}</div>`;
  }
  function siteButton(site) {
    return `<button type="button" data-office-action="site" data-site-id="${escape(site.id)}" aria-label="Open site ${escape(site.name)}"${onOpenSite && siteIndex.has(site.id) ? '' : ' disabled'}>Open site</button>`;
  }
  function inventoryRecords() {
    const records = list(assetOverview.sites).filter(site => site.assetCount > 0).map(site => ({ kind: 'site', id: site.id, title: site.name, site, count: site.assetCount }));
    const standaloneJobs = new Map();
    for (const asset of list(assetOverview.standaloneAssets)) {
      for (const job of list(asset.jobs)) {
        if (!standaloneJobs.has(job.id)) standaloneJobs.set(job.id, { kind: 'job', id: job.id, title: job.title, job, keys: new Set() });
        standaloneJobs.get(job.id).keys.add(asset.key);
      }
    }
    return [...records, ...[...standaloneJobs.values()].map(record => ({ ...record, count: record.keys.size }))];
  }
  function inventoryDetails(kind) {
    const waiting = kind === 'waiting', records = waiting ? list(assetOverview.waitingSites) : assetRecords;
    const pages = Math.max(1, Math.ceil(records.length / 30));
    if (waiting) waitingPage = Math.min(waitingPage, pages - 1); else assetsPage = Math.min(assetsPage, pages - 1);
    const page = waiting ? waitingPage : assetsPage, shown = records.slice(page * 30, (page + 1) * 30);
    return `<div class="office-inventory-detail">${waiting ? '<p>These site folders do not yet contain a saved Zone Sketch project.</p>' : `<dl class="office-asset-sources"><div><dt>Added in Jobs</dt><dd>${Number(assetOverview.totals.manualAssets || 0)}</dd></div><div><dt>From Zone Sketch</dt><dd>${Number(assetOverview.totals.importedAssets || 0)}</dd></div><div><dt>Other saved assets</dt><dd>${Number(assetOverview.totals.otherAssets || 0)}</dd></div></dl><p>Unique assets across saved sites and job copies. Open a site or job to view its asset register.</p>`}<div class="office-inventory-records">${shown.map(record => {
      const site = waiting ? record : record.kind === 'site' ? record.site : null;
      return `<article class="office-inventory-record"><div><strong>${escape(site?.name || record.title || 'Untitled job')}</strong><small>${counted(site ? site.assetCount || 0 : record.count, 'asset')}${site ? ` · ${counted(list(site.jobIds).length, 'linked job')}` : ' · Job without a site'}</small>${site?.address ? `<small>${escape(site.address)}</small>` : ''}</div>${site ? siteButton(site) : `<button type="button" data-office-action="job" data-job-id="${escape(record.id)}" aria-label="Open job ${escape(record.title || 'Untitled job')}"${onOpenJob && jobIndex.has(record.id) ? '' : ' disabled'}>Open job</button>`}</article>`;
    }).join('') || `<p class="office-inventory-empty">${waiting ? 'No saved sites are awaiting Zone Sketch.' : 'No assets have been saved yet.'}</p>`}</div>${pages > 1 ? `<nav class="office-inventory-pages" aria-label="${waiting ? 'Waiting site' : 'Asset record'} pages"><button type="button" data-office-action="${kind}-previous"${page === 0 ? ' disabled' : ''}>Previous records</button><span>Page ${page + 1} of ${pages}</span><button type="button" data-office-action="${kind}-next"${page >= pages - 1 ? ' disabled' : ''}>Next records</button></nav>` : ''}</div>`;
  }
  function inventoryMarkup() {
    return `<section class="office-site-assets" aria-label="Saved sites and assets"><div class="office-inventory-heading"><h3>Sites &amp; assets</h3><span>All saved site and job records</span></div><div class="office-site-metrics"><details class="office-assets-count"${assetsOpen ? ' open' : ''}><summary><span><strong>Assets added</strong><small>Unique assets saved in Jobs</small></span><b>${Number(assetOverview.totals.assets || 0)}</b><span class="office-inventory-chevron" aria-hidden="true">⌄</span></summary><div class="office-inventory-slot">${assetsOpen ? inventoryDetails('assets') : ''}</div></details><details class="office-waiting-sites"${waitingOpen ? ' open' : ''}><summary><span><strong>Sites awaiting Zone Sketch</strong><small>No saved Zone Sketch project yet</small></span><b>${Number(assetOverview.totals.waitingSites || 0)}</b><span class="office-inventory-chevron" aria-hidden="true">⌄</span></summary><div class="office-inventory-slot">${waitingOpen ? inventoryDetails('waiting') : ''}</div></details></div></section>`;
  }
  function dayDetails(day) {
    const totals = day.totals || {}, entries = list(day.entries), prior = list(day.priorReturns);
    return `<div class="office-day-detail"><dl class="office-day-clock"><div><dt>Started</dt><dd>${escape(localTime(day.localStart))}</dd></div><div><dt>Finished</dt><dd>${day.status === 'running' ? 'Still running' : escape(localTime(day.localFinish))}</dd></div><div><dt>Attendance</dt><dd>${duration(totals.attendanceMinutes)}</dd></div><div><dt>Job time / attendance</dt><dd>${percentage(totals.utilisationPercent)}</dd></div></dl>${day.partial ? '<p class="office-muted">This date range shows part of an overnight day.</p>' : ''}${breakdown(totals)}${list(day.issues).length ? `<div class="office-review-note"><strong>Review needed</strong><ul>${day.issues.map(issue => `<li>${escape(issue)}</li>`).join('')}</ul></div>` : ''}<div class="office-detail-heading"><h4>Time records <span>${entries.length}</span></h4>${onOpenTimesheets ? `<button type="button" class="text-button" data-office-action="timesheets" data-day-key="${escape(day.key)}">Open timesheets</button>` : ''}</div>${entries.length ? `<div class="office-table-scroll"><table class="office-time-table"><caption class="office-sr-only">Time records for ${escape(day.engineer)} on ${escape(dayLabel(day.date))}</caption><thead><tr><th scope="col">Time</th><th scope="col">Type</th><th scope="col">Job / note</th><th scope="col">Duration</th></tr></thead><tbody>${entries.map(entry => `<tr${entry.conflict || entry.deletedAt ? ' class="office-time-review"' : ''}><td>${entry.start ? escape(`${entry.date || day.date} ${entry.start}`) : 'Hours only'}${entry.end ? `<small>to ${escape(`${entry.endDate || entry.date || day.date} ${entry.end}`)}</small>` : ''}</td><td>${escape(entry.sessionType || 'Recorded time')}${entry.conflict ? '<small>Conflicting copy</small>' : ''}${entry.deletedAt ? '<small>Deleted by engineer</small>' : ''}</td><td><strong>${escape(entry.jobTitle || 'Unassigned')}</strong>${entry.note ? `<small>${escape(entry.note)}</small>` : ''}</td><td>${duration(entry.minutes)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="office-muted">No time records in this day yet.</p>'}<div class="office-detail-heading"><h4>Jobs <span>${list(day.jobs).length}</span></h4>${day.receipt && onShareReceipt ? `<button type="button" data-office-action="receipt" data-day-key="${escape(day.key)}">Share receipt</button>` : ''}</div>${jobButtons(day.jobs)}${day.receivedAt || day.receipt?.receivedAt ? `<p class="office-received">Received ${escape(instant(day.receivedAt || day.receipt.receivedAt))}</p>` : ''}${prior.length ? `<details class="office-return-history"><summary>Earlier returns <span>${prior.length}</span></summary><p class="office-muted">Earlier copies stay available for review. Only the latest return counts in this overview.</p>${prior.map(record => `<article><strong>Received ${escape(instant(record.receivedAt || record.receipt?.receivedAt))}</strong>${jobButtons(record.jobs || list(record.jobIds).map(id => ({ id, title: savedJobs().get(id)?.workflow?.details?.title || 'Earlier job copy' })))}</article>`).join('')}</details>` : ''}</div>`;
  }
  function dayCard(day) {
    const totals = day.totals || {};
    return `<details class="office-day" data-office-day="${escape(day.key)}"${expandedDay === day.key ? ' open' : ''}><summary><span class="office-day-identity"><strong>${escape(day.engineer || 'Unnamed engineer')}</strong><small>${escape(dayLabel(day.date))}</small></span><span class="office-day-summary"><span><small>Attendance</small><strong>${duration(totals.attendanceMinutes)}</strong></span><span><small>Job time</small><strong>${duration(totals.jobWorkMinutes || 0)}</strong></span></span><span class="office-day-state${totals.conflictCount ? ' office-needs-review' : ''}">${escape(statusLabel(day))}${totals.conflictCount ? `<small>${Number(totals.conflictCount)} to review</small>` : ''}</span><span class="office-day-chevron" aria-hidden="true">⌄</span></summary><div class="office-day-detail-slot">${expandedDay === day.key ? dayDetails(day) : ''}</div></details>`;
  }
  function paint() {
    if (disposed) return;
    jobIndex = new Map(list(workspace.jobs).map(job => [job.id, job]));
    siteIndex = new Map(list(workspace.sites).map(site => [site.id, site]));
    assetOverview = buildOfficeAssets(workspace);
    assetRecords = inventoryRecords();
    try { model = buildOfficeOverview(workspace, filters); }
    catch (cause) { status = cause.message; isError = true; model = { engineers: [], days: [], totals: {}, untaggedJobs: [], engineerOptions: [], hasData: false }; }
    const totals = model.totals || {}, engineers = list(model.engineers), days = list(model.days), options = list(model.engineerOptions);
    const selected = options.find(engineer => engineer.key === filters.engineerKey);
    const dayPages = Math.max(1, Math.ceil(days.length / 30)); dayPage = Math.min(dayPage, dayPages - 1);
    const shownDays = days.slice(dayPage * 30, (dayPage + 1) * 30);
    const dayJobs = new Set(days.flatMap(day => list(day.jobIds)));
    const otherGroups = engineers.filter(engineer => engineer.key !== UNTAGGED_ENGINEER_KEY).map(engineer => ({ ...engineer, jobs: list(engineer.jobs).filter(job => !dayJobs.has(job.id)) })).filter(engineer => engineer.jobs.length);
    root.innerHTML = `<header class="office-heading"><div><span class="office-eyebrow">OFFICE OVERVIEW</span><h2>Engineer days</h2><p>Job packs, attendance and recorded work, together.</p></div><div class="office-header-actions">${onQuickTransfer ? '<button type="button" data-office-action="transfer">Quick Transfer</button>' : ''}${onImport ? `<button type="button" class="primary" data-office-action="import">${receiveIcon}Receive day packs</button>` : ''}</div></header><input class="office-file-picker" type="file" multiple accept=".json,application/json" aria-label="Receive day pack files" hidden><p class="office-status" role="${isError ? 'alert' : 'status'}" aria-live="polite"${status ? '' : ' hidden'}>${escape(status)}</p><div class="office-drop-zone"><span>${receiveIcon}</span><div><strong>Drop received job packs here</strong><small>Saved packs are sorted automatically by the engineer’s name tag.</small></div><span class="office-drop-hint">JSON files</span></div>${inventoryMarkup()}<div class="office-filters"><label>Engineer<select data-office-filter="engineerKey"><option value="">All engineers</option>${options.map(engineer => `<option value="${escape(engineer.key)}"${engineer.key === filters.engineerKey ? ' selected' : ''}>${escape(engineer.name)}</option>`).join('')}</select></label><label>From date<input type="date" data-office-filter="from" value="${escape(filters.from)}"></label><label>To date<input type="date" data-office-filter="to" value="${escape(filters.to)}"></label><div class="office-date-shortcuts"><button type="button" data-office-action="today">Today</button><button type="button" data-office-action="all-dates">All dates</button></div>${onExport ? '<button type="button" data-office-action="export">Export office CSV</button>' : ''}</div><div class="office-metrics"><article><span>${teamIcon}Engineers</span><strong>${engineers.filter(engineer => engineer.key !== UNTAGGED_ENGINEER_KEY).length}</strong><small>${counted(days.filter(day => day.source === 'return').length, 'received day')}</small></article><article><span>${clockIcon}Attendance</span><strong>${duration(totals.attendanceMinutes)}</strong><small>Recorded start to finish</small></article><article><span>Job time</span><strong>${duration(totals.jobWorkMinutes || 0)}</strong><small>${Number(totals.completedJobs || 0)} / ${Number(totals.jobCount || 0)} jobs complete</small></article><article><span>Job time / attendance</span><strong>${percentage(totals.utilisationPercent)}</strong><small>${totals.conflictCount ? `${Number(totals.conflictCount)} records need review` : 'Confirmed work on jobs'}</small></article></div><p class="office-metric-note">Job time / attendance shows the share of attendance recorded as work on a job. Unallocated time is shown separately; missing or conflicting timing can make the figure unavailable.</p><div class="office-content"><aside class="office-engineers" aria-label="Engineer groups"><div class="office-list-heading"><h3>Engineer groups</h3><span>${engineers.length}</span></div><button type="button" class="office-engineer" data-office-engineer="" aria-label="View all engineers" aria-pressed="${!filters.engineerKey}"><span class="office-engineer-avatar" aria-hidden="true">${teamIcon}</span><span><strong>All engineers</strong><small>Days received on this PC</small></span></button>${engineers.map(engineer => `<button type="button" class="office-engineer" data-office-engineer="${escape(engineer.key)}" aria-label="View engineer ${escape(engineer.name)}" aria-pressed="${engineer.key === filters.engineerKey}"><span class="office-engineer-avatar" aria-hidden="true">${escape(engineer.name.slice(0, 1).toLocaleUpperCase())}</span><span><strong>${escape(engineer.name)}</strong><small>${counted(list(engineer.days).length, 'day')} · ${duration(engineer.totals?.jobWorkMinutes || 0)} job time</small></span></button>`).join('')}${engineers.length ? '' : '<p class="office-list-empty">Engineer names appear when you receive their packs or record their time.</p>'}</aside><section class="office-days"><div class="office-list-heading"><h3>${escape(selected?.name || 'All engineer days')}</h3><span>${counted(days.length, 'day')}</span></div>${days.length ? shownDays.map(dayCard).join('') : `<div class="office-empty">${teamIcon}<h4>${model.hasData ? 'No days match these filters' : 'Ready for the first engineer day'}</h4><p>${model.hasData ? 'Choose another engineer or date range to see saved work.' : 'Receive a finished day pack to see its engineer, start and finish times, jobs and time breakdown.'}</p></div>`}${dayPages > 1 ? `<nav class="office-day-pages" aria-label="Engineer day pages"><button type="button" data-office-action="previous-days"${dayPage === 0 ? ' disabled' : ''}>Previous days</button><span>Page ${dayPage + 1} of ${dayPages}</span><button type="button" data-office-action="next-days"${dayPage >= dayPages - 1 ? ' disabled' : ''}>Next days</button></nav>` : ''}${otherGroups.length ? `<section class="office-other-jobs"><h4>Jobs without day records</h4><p class="office-muted">No attendance has been recorded for these jobs.</p>${otherGroups.map(engineer => `<article><h5>${escape(engineer.name)}</h5>${jobButtons(engineer.jobs)}</article>`).join('')}</section>` : ''}</section></div>${list(model.untaggedJobs).length ? `<details class="office-untagged"><summary>Jobs without an engineer tag <span>${model.untaggedJobs.length}</span></summary><p class="office-muted">These earlier or unassigned jobs are kept separately. Open a job’s settings to set its engineer.</p>${jobButtons(model.untaggedJobs)}</details>` : ''}<p class="office-data-note">This view uses records saved on this PC. Receive an updated pack to bring in the engineer’s latest work.</p>`;
    root.querySelectorAll('[data-office-filter]').forEach(control => control.addEventListener('change', () => {
      const key = control.dataset.officeFilter;
      filters = { ...filters, [key]: control.value }; expandedDay = ''; dayPage = 0; status = ''; isError = false;
      notifyView(); paint();
      root.querySelector(`[data-office-filter="${key}"]`)?.focus();
    }));
    root.querySelector('.office-file-picker').addEventListener('change', event => {
      const files = [...(event.target.files || [])]; event.target.value = '';
      if (files.length) void receive(files);
    });
    for (const [selector, kind] of [['.office-assets-count', 'assets'], ['.office-waiting-sites', 'waiting']]) {
      const details = root.querySelector(selector);
      details.addEventListener('toggle', () => {
        if (disposed || !root.contains(details)) return;
        if (kind === 'assets') assetsOpen = details.open; else waitingOpen = details.open;
        const slot = details.querySelector('.office-inventory-slot');
        if (details.open && !slot.children.length) slot.innerHTML = inventoryDetails(kind);
        lock(); notifyView();
      });
    }
    root.querySelectorAll('.office-day').forEach(details => details.addEventListener('toggle', () => {
      if (disposed || !root.contains(details)) return;
      if (details.open) {
        expandedDay = details.dataset.officeDay;
        const slot = details.querySelector('.office-day-detail-slot');
        const day = days.find(day => day.key === expandedDay);
        if (day && !slot.children.length) slot.innerHTML = dayDetails(day);
      }
      else if (expandedDay === details.dataset.officeDay) expandedDay = '';
      notifyView();
    }));
    lock();
  }
  function lock() {
    root.setAttribute('aria-busy', String(busy));
    root.querySelectorAll('button,input,select').forEach(control => {
      control.disabled = busy || (control.dataset.officeAction === 'job' && (!onOpenJob || !savedJobs().has(control.dataset.jobId))) || (control.dataset.officeAction === 'site' && (!onOpenSite || !siteIndex.has(control.dataset.siteId))) || (control.dataset.officeAction === 'assets-previous' && assetsPage === 0) || (control.dataset.officeAction === 'assets-next' && (assetsPage + 1) * 30 >= assetRecords.length) || (control.dataset.officeAction === 'waiting-previous' && waitingPage === 0) || (control.dataset.officeAction === 'waiting-next' && (waitingPage + 1) * 30 >= list(assetOverview.waitingSites).length) || (control.dataset.officeAction === 'previous-days' && dayPage === 0) || (control.dataset.officeAction === 'next-days' && (dayPage + 1) * 30 >= list(model.days).length);
    });
  }
  function showStatus(message, error = false) {
    status = message || ''; isError = error;
    const notice = root.querySelector('.office-status');
    if (!notice || disposed) return;
    notice.textContent = status; notice.hidden = !status; notice.setAttribute('role', isError ? 'alert' : 'status');
  }
  async function run(callback) {
    if (busy || disposed) return;
    busy = true; lock(); showStatus('');
    try {
      const result = await callback();
      if (result === false) throw Error('This action was not completed. Your saved records are unchanged.');
      if (!disposed && result?.state) { workspace = result.state; paint(); }
      if (!disposed && result?.message) showStatus(result.message);
      return result;
    } catch (cause) { if (!disposed) showStatus(cause?.message || 'This action could not be completed. Try again.', true); }
    finally { busy = false; if (!disposed) lock(); }
  }
  function receive(files) { return onImport ? run(() => onImport(files)) : undefined; }
  root.addEventListener('click', event => {
    const engineer = event.target.closest?.('[data-office-engineer]');
    if (engineer && !busy) { filters.engineerKey = engineer.dataset.officeEngineer; expandedDay = ''; dayPage = 0; status = ''; isError = false; notifyView(); paint(); return; }
    const control = event.target.closest?.('[data-office-action]');
    if (!control || control.disabled || busy || disposed) return;
    const action = control.dataset.officeAction;
    if (action === 'import') return root.querySelector('.office-file-picker').click();
    if (action === 'today' || action === 'all-dates') {
      const day = action === 'today' ? localToday() : '';
      filters.from = day; filters.to = day; expandedDay = ''; dayPage = 0; status = ''; isError = false; notifyView(); paint(); return;
    }
    if (action === 'previous-days' || action === 'next-days') {
      dayPage += action === 'next-days' ? 1 : -1; expandedDay = ''; notifyView(); paint(); root.querySelector('.office-days')?.scrollIntoView?.({ block: 'nearest' }); return;
    }
    if (/^(assets|waiting)-(previous|next)$/.test(action)) {
      const [kind, direction] = action.split('-');
      if (kind === 'assets') assetsPage += direction === 'next' ? 1 : -1; else waitingPage += direction === 'next' ? 1 : -1;
      notifyView(); paint(); return;
    }
    if (action === 'site' && onOpenSite) return void run(() => onOpenSite(control.dataset.siteId));
    if (action === 'job' && onOpenJob) return void run(() => onOpenJob(control.dataset.jobId));
    if (action === 'transfer' && onQuickTransfer) return void run(() => onQuickTransfer(control));
    if (action === 'export' && onExport) return void run(() => onExport(model));
    const day = list(model.days).find(day => day.key === control.dataset.dayKey);
    if (action === 'timesheets' && day && onOpenTimesheets) return void run(() => onOpenTimesheets({ engineer: day.engineer, date: day.date }));
    if (action === 'receipt' && day?.receipt && onShareReceipt) return void run(() => onShareReceipt(day.receipt));
  });
  root.addEventListener('dragenter', event => {
    if (busy || !onImport || ![...(event.dataTransfer?.types || [])].includes('Files')) return;
    event.preventDefault(); dragDepth++; root.classList.add('office-dragging');
  });
  root.addEventListener('dragover', event => {
    if (busy || !onImport || ![...(event.dataTransfer?.types || [])].includes('Files')) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
  });
  root.addEventListener('dragleave', event => {
    event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) root.classList.remove('office-dragging');
  });
  root.addEventListener('drop', event => {
    event.preventDefault(); dragDepth = 0; root.classList.remove('office-dragging');
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length && !busy && onImport) void receive(files);
  });
  root.getViewState = () => ({ ...filters, expandedDay, dayPage, assetsOpen, waitingOpen, assetsPage, waitingPage });
  root.setState = value => { workspace = value; paint(); };
  root.setStatus = showStatus;
  root.dispose = () => { disposed = true; };
  paint();
  return root;
}
