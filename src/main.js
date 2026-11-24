import { initializeAppearance, createAppearanceControl } from "./appearance.js";
import { initializePageScroll, scrollPageToTop } from "./page-scroll.js";
import "./style.css";
import "./mobile-job.css";
import "./mobile-shell.css";
import "./job-fields.css";
import "./site-profile.css";
import { renderSiteProfile, validateSiteProfile } from "./site-profile.js";
import { DISCIPLINES, JOB_TYPES, disciplineLabel, jobTypeLabel } from "./job-options.js";
import "./job-create.css";
import "./job-checklist.css";
import { renderJobChecklist, validateJobChecklist } from "./job-checklist.js";
import "./job-notes.css";
import "./job-settings.css";
import "./quick-job.css";
import "./device-workspace.css";
import "./device-remarks-ui.css";
import "./device-cards.css";
import { validateQuickDefects } from "./quick-defects.js";
import { applyQuickDeviceResult } from "./device-results.js";
import { validateDeviceRemarks } from "./device-remarks.js";
import { renderDeviceRemarks, renderDeviceRemarkReport, renderRemarkProducts, renderRemarkPhotos, renderRemarkHistory } from "./device-remarks-ui.js";
import { renderJobNotes, validateNotesDocument } from "./job-notes.js";
import { renderAssetsWorkspace } from "./assets-workspace.js";
import "./assets-workspace.css";
import { addJobAsset, duplicateJobAsset, saveAssetTemplate, validateAssetTemplates, attachAssetJobToSite } from "./asset-library.js";
import { renderJobSettings, effectiveJob, adoptSiteSettings, captureJobOverrides } from "./job-settings.js";
import "./hold-to-edit.css";
import { attachHoldToEdit } from "./hold-to-edit.js";
import { renderMobileWorkspace } from "./mobile-shell.js";
import { renderTimesheets } from "./timesheets-ui.js";
import { saveTimesheet, deleteTimesheet, submitTimesheets, createTimesheetPackage } from "./timesheets.js";
import "./timesheets-ui.css";
import "./toolbox.css";
import "./toolbox-extras.css";
import "./toolbox-chest.css";
import { createToolboxChest } from "./toolbox-chest.js";
import { renderReleaseHelp } from "./release-help.js";
import "./release-help.css";
import { APP_VERSION, BUILD_ID } from "./release-info.js";
import { startOffline } from "./offline.js";
import { getNativePlatform } from "./native-platform.js";
import { createWorkspaceBackup, restoreWorkspaceBackup } from "./workspace-backup.js";
import { loadState, saveState } from "./storage.js";
import {
  importZoneSketch,
  zoneSourceKeys,
  compareDrawings,
} from "./zone-import.js";
import { createJobPackage, importJobPackage } from "./packages.js";
import { panelContext } from "./panel-context.js";
import {
  renderPlanPreview,
  ensurePlanPreviews,
  acceptZoneSketchPreviews,
} from "./plan-preview.js";
import "./plan-preview.css";
import "./plan-asset-controls.css";
import { buildEditableZoneSketch } from "./drawing-editor.js";
import { createZoneHandoff, DEFAULT_ZONE_SKETCH_URL } from "./zone-handoff.js";
import { prepareZoneLaunch, applyZoneReturn } from "./zone-return.js";
import { renderWorkflowSection } from "./job-workflow.js";
import { isFireMaintenanceJob, validateFireMaintenance } from "./fire-maintenance.js";
import { renderFireMaintenance } from "./fire-maintenance-ui.js";
import { renderServiceReport } from "./service-report.js";
import { installReportPrinting, printServiceReport } from "./print-report.js";
import "./fire-maintenance-ui.css";
import "./service-report.css";
import { renderCertificates } from "./certificates-ui.js";
import { renderCertificate } from "./certificate-renderer.js";
import { generateReportPdf, shareCertificatePdf } from "./certificate-pdf.js";
import "./certificates-ui.css";
import "./appearance.css";
import "./workspace-shell.css";
import "./profile-photo.css";
import { photoMarkup, photoPicker, profilePhoto } from "./profile-photo.js";
import { applyDrawingToJob, alignDrawingAssetsToSite } from "./revisions.js";
import { newSite, createQuickJob, attachJobToSite, siteLabel, id, now, states } from "./model.js";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const toolboxChest = createToolboxChest({
  onClose: () => {
    const active = document.activeElement;
    // Safari can deliver the breakpoint event after a fast close. Resolve the
    // current visible opener here as well, without moving focus out of a form.
    if (!active || active === document.body || !active.getClientRects().length)
      syncToolboxTrigger({ reveal: true })?.focus({ preventScroll: true });
  },
});
initializeAppearance();
initializePageScroll();
let offlineController, updateAvailable = false, recoverySnapshot = null, recoveryCapturedAt = null, recoveryRetryKey = null, pendingRestore = null;
let state = { sites: [], jobs: [] },
  timesheetDate = null,
  page = "home",
  activeJob = null,
  draftJob = null,
  activeSite = null,
  tab = "Notes",
  selectedAsset = null,
  deviceTab = "Record",
  deviceQuery = "",
  deviceState = "",
  devicePage = 0,
  pendingCardResult = null,
  importTargetJob = null,
  importTargetSite = null,
  handoff = null,
  handoffStatus = "",
  review = null,
  saveLabel = "Opening local records…",
  offlineLabel = "Preparing offline use…",
  message = "",
  error = "",
  busy = false,
  dirty = false,
  storageReady = false,
  operationPending = false;
const siteOf = (j) => state.sites.find((s) => s.id === j.siteId),
  drawingOf = (s, j) => s?.drawings.find((d) => d.id === j?.drawingId) || j?.assetRegister,
  currentJob = () => draftJob?.id === activeJob ? draftJob : state.jobs.find((job) => job.id === activeJob);
const assetViews = new Map();
const field = (label, name, value = "", type = "text", required = false) =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></label>`;
const area = (label, name, value = "") =>
  `<label>${label}<textarea name="${name}" rows="3">${esc(value)}</textarea></label>`;
const select = (label, name, options, value, required = false) =>
  `<label>${label}<select name="${name}" ${required ? "required" : ""}>${options
    .map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`;
    })
    .join("")}</select></label>`;
const button = (text, action, cls = "secondary") =>
  `<button class="${cls}" data-action="${esc(action)}">${text}</button>`;
const badge = (s) =>
  `<span class="badge ${s === "Unsatisfactory" ? "bad" : s === "Satisfactory" ? "good" : ""}">${esc(s)}</span>`;
const settingsIcon = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 3-.5 2.1-1.8 1-2.1-.6-2 3.5 1.6 1.5v2.1L2.6 14l2 3.5 2.1-.6 1.8 1L9 20h4l.5-2.1 1.8-1 2.1.6 2-3.5-1.6-1.4v-2.1L19.4 9l-2-3.5-2.1.6-1.8-1L13 3z"/><circle cx="11" cy="11.5" r="3"/></svg>';
async function runTask(fn) {
  if (operationPending) {
    reportError("Please wait for the current operation to finish.");
    return;
  }
  operationPending = true;
  updateInteractionLock();
  try {
    return await fn();
  } catch (e) {
    reportError(e.message);
  } finally {
    operationPending = false;
    updateInteractionLock();
  }
}
function reportError(text) {
  error = text;
  message = "";
  const box = $("#notice");
  if (box) {
    box.className = "notice error";
    box.setAttribute("role", "alert");
    box.textContent = text;
    box.scrollIntoView({ block: "nearest" });
  }
}
function reportNotice(text) {
  error = ""; message = text;
  const box = $("#notice");
  if (box) { box.className = "notice"; box.setAttribute("role", "status"); box.textContent = text; }
}
function updateReleaseStatus() {
  $(".release-help")?.setStatus?.({ offlineStatus: offlineLabel, storageStatus: saveLabel, hasRecovery: !!recoverySnapshot, updateAvailable });
  const recovery = $("#recovery-actions");
  if (recovery) recovery.hidden = !recoverySnapshot;
  const update = $("#release-update");
  if (update) update.hidden = !updateAvailable;
  const offline = $("#offline-status");
  if (offline) offline.textContent = offlineLabel;
}
function flash(text, isError = false) {
  message = isError ? "" : text;
  error = isError ? text : "";
  render();
}
async function persist(next, success, retryKey = null) {
  if (!storageReady)
    throw Error(
      "Local records could not be opened. Reload successfully before saving; existing records have not been changed.",
    );
  if (busy) throw Error("A save is already in progress.");
  busy = true;
  updateInteractionLock();
  saveLabel = "Saving…";
  updateStatus();
  try {
    for (const site of next.sites) {
      for (let index = 0; index < site.drawings.length; index++) {
        site.drawings[index] = await ensurePlanPreviews(site.drawings[index]);
      }
    }
    await saveState(next);
    state = next;
    recoverySnapshot = null;
    recoveryCapturedAt = null;
    recoveryRetryKey = null;
    dirty = false;
    saveLabel = draftJob && !next.jobs.some(job => job.id === draftJob.id) ? "Not saved yet" : "Saved on this device";
    error = "";
    message = success || "";
    return true;
  } catch (e) {
    // This is the attempted, unsaved snapshot. Keep it outside IndexedDB so a
    // quota or stale-tab failure can still be rescued without overwriting data.
    recoverySnapshot = next;
    recoveryCapturedAt = new Date().toISOString();
    recoveryRetryKey = retryKey;
    saveLabel = "Save failed — retry this form";
    error = `Local save failed: ${e.message}. Your last saved records are unchanged. Keep this form open and retry.`;
    updateStatus();
    const box = $("#notice");
    if (box) {
      box.className = "notice error";
      box.textContent = error;
    }
    return false;
  } finally {
    busy = false;
    updateInteractionLock();
    updateStatus();
  }
}
function updateInteractionLock() {
  const main = document.querySelector("main");
  if (main) {
    main.inert = busy || operationPending;
    main.setAttribute("aria-busy", String(busy || operationPending));
  }
}
function updateStatus() {
  const s = $('[data-testid="save-status"]');
  if (s) s.textContent = saveLabel;
  updateReleaseStatus();
}
function bindActions(root = document) {
  root.querySelectorAll("[data-action]").forEach((el) => {
    el.onclick = (event) => {
      event.preventDefault();
      const menu = el.closest('.jobs-mobile-menu');
      if (menu && el.dataset.action !== 'toolbox') {
        menu.open = false;
        menu.querySelector('summary')?.focus({ preventScroll: true });
      }
      if (el.dataset.action === "toolbox") action(el.dataset.action, el);
      else runTask(() => action(el.dataset.action, el));
    };
  });
}
function scrollSection(section) {
  if (!section) return;
  const headerHeight =
    document.querySelector("header")?.getBoundingClientRect().height || 90;
  section.style.scrollMarginTop = `${headerHeight + 12}px`;
  section.scrollIntoView({ block: "start" });
}
function focusDevice() {
  const editor = document.querySelector(".device-editor");
  editor?.querySelector("h2")?.focus({ preventScroll: true });
  scrollSection(editor);
}
function resetDeviceBrowser() {
  selectedAsset = null;
  pendingCardResult = null;
  deviceTab = "Record";
  deviceQuery = "";
  deviceState = "";
  devicePage = 0;
}
function markDirty(value = true) {
  dirty = value;
  saveLabel = value ? "Unsaved changes" : draftJob ? "Not saved yet" : "Saved on this device";
  updateStatus();
}
function workspaceSnapshot() {
  return { ...state, jobs: state.jobs.map(job => effectiveJob(job, siteOf(job))) };
}
async function persistTimesheets(change, success) {
  if (operationPending || busy) throw Error("Please wait for the current save to finish.");
  operationPending = true;
  updateInteractionLock();
  try {
    const result = change(state);
    if (!(await persist(result.state, success))) return false;
    message = "";
    const notice = $("#notice");
    if (notice) {
      notice.className = "";
      notice.setAttribute("role", "status");
      notice.textContent = "";
    }
    if (result.package) {
      try {
        const exported = await download(result.package, `timesheet-${result.package.period?.from || "sessions"}.timesheets.json`);
        if (exported.status === "cancelled") result.downloadError = "The file save was cancelled.";
      }
      catch (cause) { result.downloadError = cause.message || "The browser could not prepare the download."; }
    }
    return { ...result, state: workspaceSnapshot() };
  } finally {
    operationPending = false;
    updateInteractionLock();
  }
}
const timesheetCallbacks = {
  onSaveTimesheet: ({ entry, jobId, previousJobId }) => persistTimesheets(
    current => ({ state: saveTimesheet(current, entry, { jobId, previousJobId }) }), "Session saved on this device.",
  ),
  onDeleteTimesheet: locator => persistTimesheets(
    current => ({ state: deleteTimesheet(current, locator) }), "Session moved to trash. Its saved history is retained.",
  ),
  onSubmitTimesheets: ({ refs, from, to }) => persistTimesheets(
    current => submitTimesheets(current, refs, { from, to }), "Timesheet submitted locally. No office copy has been sent.",
  ),
  onExportTimesheets: async options => {
    if (busy || operationPending) throw Error("Please wait for the current save to finish.");
    if (dirty) throw Error("Save or cancel your session changes before exporting the timesheet.");
    const pack = createTimesheetPackage(state, options);
    const exported = await download(pack, `timesheet-${options.from || "sessions"}.timesheets.json`);
    if (exported.status === "cancelled") throw Error("Timesheet export cancelled. Your saved sessions are unchanged.");
    return { package: pack };
  },
};
async function saveWorkflow(updatedJob) {
  const original = currentJob();
  return saveJob(captureJobOverrides(original, updatedJob, siteOf(original)));
}
async function saveJob(updatedJob, afterTab = null, attachSiteId = null) {
  if (operationPending) return false;
  operationPending = true;
  updateInteractionLock();
  try {
    let next = structuredClone(state);
    const index = next.jobs.findIndex((j) => j.id === updatedJob.id);
    if (index < 0 && updatedJob.id !== draftJob?.id) throw Error("This job is no longer available.");
    const saved = {
      ...updatedJob,
      revision: index < 0 ? 1 : next.jobs[index].revision + 1,
      updatedAt: now(),
    };
    if (index < 0) next.jobs.push(saved);
    else next.jobs[index] = saved;
    if (attachSiteId && saved.assetRegister)
      next = attachAssetJobToSite(next, saved.id, attachSiteId).state;
    if (await persist(next)) {
      draftJob = null;
      if (afterTab) tab = afterTab;
      render();
      return true;
    }
    return false;
  } finally {
    operationPending = false;
    updateInteractionLock();
  }
}
async function saveAssetChange(change, success, saveDraft = false) {
  if (operationPending || busy) return false;
  operationPending = true;
  updateInteractionLock();
  try {
    const next = structuredClone(state);
    if (saveDraft && draftJob) next.jobs.push(structuredClone(draftJob));
    const changed = change(next);
    if (!(await persist(changed.state || changed, success))) return false;
    if (saveDraft) draftJob = null;
    render();
    return true;
  } finally {
    operationPending = false;
    updateInteractionLock();
  }
}
async function saveQuickDefects(templates, remarkId) {
  if (operationPending) return false;
  operationPending = true;
  updateInteractionLock();
  try {
    const next = structuredClone(state);
    next.quickDefects = validateQuickDefects(templates);
    if (!(await persist(next))) return false;
    render();
    return true;
  } finally {
    operationPending = false;
    updateInteractionLock();
    if (remarkId) [...document.querySelectorAll('[data-star-remark]')]
      .find(button => button.dataset.starRemark === remarkId)?.focus({ preventScroll: true });
  }
}
// Called inside runTask so the whole device write has the same save lock.
async function saveCardResult(assetId, outcome, explanation = "") {
  const next = structuredClone(state);
  const index = next.jobs.findIndex(job => job.id === activeJob);
  if (index < 0 || draftJob) throw Error("Save this job before recording results.");
  const original = next.jobs[index];
  const changed = applyQuickDeviceResult(original, assetId, outcome, explanation);
  changed.results.find(result => result.assetId === assetId).recordedBy = effectiveJob(original, siteOf(original)).engineer;
  changed.revision = original.revision + 1;
  changed.updatedAt = now();
  next.jobs[index] = changed;
  const resultAction = { Satisfactory: "pass", Unsatisfactory: "fail", "Not applicable": "na" }[outcome];
  if (!(await persist(next, undefined, `card-result:${resultAction}:${assetId}:${activeJob}`))) return false;
  pendingCardResult = null;
  render();
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll('.device-row, .plan-asset-work-row')].find(row => row.dataset.assetId === assetId);
    row?.querySelector(`[data-card-result="${outcome}"]`)?.focus({ preventScroll: true });
  });
  return true;
}
function bindCardResultForms(root = document) {
  root.querySelectorAll('form[data-form="card-result"]').forEach(form => {
    form.oninput = () => {
      if (pendingCardResult?.assetId === form.dataset.asset) pendingCardResult.explanation = form.elements.explanation.value;
      markDirty();
    };
    form.onsubmit = event => {
      event.preventDefault();
      runTask(() => submit(form));
    };
  });
}
async function saveWorkflowSite(updatedSite) {
  if (operationPending) return false;
  if (
    document.querySelector('form[data-form="asset"][data-dirty="true"]') &&
    !confirm("Save site details and discard the unfinished equipment entry? Cancel keeps both drafts open.")
  ) return false;
  operationPending = true;
  updateInteractionLock();
  try {
    const next = structuredClone(state);
    const saved = next.sites.find((s) => s.id === updatedSite.id);
    if (!saved) throw Error("This site is no longer available.");
    next.jobs = next.jobs.map((job) => job.siteId === saved.id && !job.settings
      ? { ...adoptSiteSettings(job, saved), revision: job.revision + 1, updatedAt: now() }
      : job);
    // Site fields belong to the permanent record, separate from this visit.
    saved.name = updatedSite.name.trim();
    saved.address = updatedSite.address;
    if (!saved.name) throw Error("Enter a site name.");
    if (updatedSite.profile !== undefined) saved.profile = validateSiteProfile(updatedSite.profile);
    saved.profileRevision = (saved.profileRevision || 0) + 1;
    if (await persist(next, "Site details saved on this device.")) {
      render();
      return true;
    }
    return false;
  } finally {
    operationPending = false;
    updateInteractionLock();
  }
}
async function savePreviewCache(siteId, drawing) {
  if (dirty || busy || operationPending)
    throw Error(
      "Finish the open Jobs form, then retry preparing this PNG preview.",
    );
  operationPending = true;
  updateInteractionLock();
  try {
    const next = structuredClone(state);
    const saved = next.sites
      .find((site) => site.id === siteId)
      ?.drawings.find((value) => value.id === drawing.id);
    if (!saved) throw Error("This drawing is no longer available.");
    for (const key of [
      "planPreviews",
      "planPreviewErrors",
      "planPreviewAttemptedFor",
    ]) {
      if (drawing[key] !== undefined)
        saved[key] = structuredClone(drawing[key]);
    }
    if (!(await persist(next, "PNG preview saved for offline use.")))
      throw Error(
        "The PNG preview could not be saved locally. Retry when storage is available.",
      );
  } finally {
    operationPending = false;
    updateInteractionLock();
  }
}
function drawingConnection(drawing) {
  const unknownSystem =
    !drawing.systemType && !drawing.source?.project?.systemType;
  return `<div class="zone-connection"><div class="actions">${
    unknownSystem
      ? select(
          "Drawing system",
          "launchSystem",
          [
            ["", "Choose system"],
            ["fire", "Fire alarm"],
            ["security", "Intruder alarm"],
            ["cctv", "CCTV"],
            ["access", "Access control"],
          ],
          "",
        )
      : ""
  }${drawing.kind === "issued" ? '<span class="muted">Issued record is read-only. Import a working drawing to edit.</span>' : button("Edit site", "edit-site", "primary")}</div><p class="muted" data-testid="zone-connection-status">${esc(handoffStatus || "Automatic loading and return require the optional Zone Sketch receiver, which is not yet deployed on the standard editor. Use Export editable drawing and Import Zone Sketch plan for the supported file workflow.")}</p></div>`;
}
function showHandoffStatus(value) {
  handoffStatus = value;
  document
    .querySelectorAll('[data-testid="zone-connection-status"]')
    .forEach((node) => {
      node.textContent = value;
    });
}
function editSite() {
  if (getNativePlatform()) {
    const instructions = page === "site"
      ? "Open or create a saved job for this site, then choose Plan → Drawing tools → Export editable drawing. Edit the file in Zone Sketch, then use Import Zone Sketch plan in the job, or Import site plan in this site folder."
      : "Choose Drawing tools → Export editable drawing, edit the file in Zone Sketch, then choose Import Zone Sketch plan to bring the updated drawing back into this job.";
    showHandoffStatus(instructions);
    reportNotice(instructions);
    return;
  }
  if (handoff?.active && !handoff.popup?.closed) {
    handoff.popup?.focus();
    showHandoffStatus(
      "A drawing is already open in Zone Sketch. Save or close that editing session before opening another site.",
    );
    return;
  }
  handoff?.dispose();
  const job = state.jobs.find((value) => value.id === activeJob);
  const site = job
    ? siteOf(job)
    : state.sites.find((value) => value.id === activeSite);
  if (!site) throw Error("Open a site or job first.");
  const drawing = job ? drawingOf(site, job) : site.drawings.at(-1);
  const systemType = document.querySelector('[name="launchSystem"]')?.value;
  if (
    !drawing.systemType &&
    !drawing.source?.project?.systemType &&
    !systemType
  ) {
    throw Error("Choose the drawing system before opening Zone Sketch.");
  }
  let launchContext,
    launchWarnings = [];
  const prepared = prepareZoneLaunch(site, job, {
    systemType,
  }).then((value) => {
    launchContext = value.context;
    launchWarnings = value.warnings;
    return value;
  });
  handoff = createZoneHandoff({
    url: import.meta.env.VITE_ZONE_SKETCH_URL || DEFAULT_ZONE_SKETCH_URL,
    payload: prepared.then(({ envelope, context }) => ({
      ...context,
      project: envelope,
    })),
    onStatus: ({ message, connected }) =>
      showHandoffStatus(
        [message, ...(connected ? launchWarnings : [])].join(" "),
      ),
    onError: (failure) => reportError(failure.message),
    onSave: async (envelope, receipt) => {
      if (dirty)
        throw Error(
          "Save the open form in Jobs, then retry Save to Jobs in Zone Sketch.",
        );
      if (operationPending || busy)
        throw Error(
          "Jobs is saving another change. Retry Save to Jobs when it finishes.",
        );
      operationPending = true;
      updateInteractionLock();
      try {
        const result = await applyZoneReturn(state, launchContext, envelope);
        let next = result.state;
        if (receipt.previews?.length) {
          next = structuredClone(next);
          const updatedSite = next.sites.find((value) => value.id === site.id);
          const index = updatedSite.drawings.findIndex(
            (value) => value.id === result.drawing.id,
          );
          updatedSite.drawings[index] = acceptZoneSketchPreviews(
            updatedSite.drawings[index],
            receipt.previews,
          );
        }
        if (!result.unchanged || receipt.previews?.length) {
          if (
            !(await persist(
              next,
              "Zone Sketch drawing saved. Plan and equipment updated; earlier visits and results retained.",
            ))
          ) {
            throw Error(
              "Jobs could not save locally. Keep Zone Sketch open and retry Save to Jobs.",
            );
          }
        }
        launchContext = result.context;
        render();
        return {
          siteId: site.id,
          jobId: job?.id || null,
          drawingId: result.drawing.id,
          jobRevision: result.job?.revision || null,
        };
      } finally {
        operationPending = false;
        updateInteractionLock();
      }
    },
  });
}
let renderedRoute = null;
let disposeJobHold = null;
const planViews = new Map();
function mountPlanPreview(target, drawing, options) {
  const viewKey = `${page}:${activeJob || activeSite || ""}:${drawing.id}`;
  const preview = renderPlanPreview(drawing, { ...options, viewState: planViews.get(viewKey) });
  preview.dataset.viewKey = viewKey;
  $(target).append(preview);
}
function beforePlanNavigate() {
  if (!pendingCardResult) return true;
  if (!confirm("Discard the unsaved result change before changing the plan view?")) return false;
  pendingCardResult = null;
  markDirty(false);
  return true;
}
function openJobField(target) {
  if (busy || operationPending) return;
  let workflow = document.querySelector(".workflow-module");
  if (!workflow) {
    if (dirty && !confirm("Leave this form and discard unsaved changes?")) return;
    markDirty(false);
    tab = "Job details";
    render();
    workflow = document.querySelector(".workflow-module");
  }
  workflow?.openEditor(target.dataset.jobEdit, target.dataset.editField);
}
const holdField = (group, field) =>
  `data-job-edit="${group}" data-edit-field="${field}" data-hold-edit tabindex="0" title="Hold for 3 seconds to edit"`;

// Supporting screens use the same compact mobile shell as the main workspace.
// These controls use the existing action dispatcher, including its unsaved-work guard.
function mobileWorkspaceNavigation() {
  if (page === 'home' || page === 'job') return '';
  const back = page === 'site' ? ['‹ Sites', 'sites']
    : page === 'backup-review' ? ['‹ Help & data', 'help'] : ['‹ Home', 'home'];
  return `<nav class="jobs-mobile-navigation" aria-label="Workspace navigation">${button(back[0], back[1], 'text-button jobs-back-link')}<details class="jobs-mobile-menu"><summary>Menu</summary><div class="jobs-mobile-menu-items">${[
    ['Home', 'home'], ['Sites', 'sites'], ['Timesheets', 'timesheets'],
    ['Toolbox', 'toolbox'], ['Create job', 'create'], ['Help & data', 'help'],
  ].map(([label, destination]) => `<button type="button" data-action="${destination}"${page === destination || (page === 'site' && destination === 'sites') ? ' aria-current="page"' : ''}>${label}</button>`).join('')}</div></details></nav>`;
}

function syncToolboxTrigger({ reveal = false } = {}) {
  const mobile = window.matchMedia('(max-width: 700px)').matches;
  const menu = document.querySelector('.jobs-mobile-menu');
  // Keep a real, visible return target when the desktop rail becomes a phone menu.
  if (mobile && menu && (toolboxChest.isOpen || reveal)) menu.open = true;
  const trigger = mobile
    ? menu?.querySelector('[data-action="toolbox"]') || document.querySelector('.mobile-workspace [data-toolbox-trigger]')
    : document.querySelector('.sidebar [data-action="toolbox"]');
  if (!trigger) return;
  trigger.setAttribute('data-toolbox-trigger', '');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', String(toolboxChest.isOpen));
  trigger.setAttribute('aria-controls', 'toolbox-chest');
  toolboxChest.refreshAnchor(trigger);
  return trigger;
}

function render() {
  document.querySelector(".appearance-control")?.dispose?.();
  const previousAssets = document.querySelector('.assets-workspace');
  if (previousAssets?.dataset.jobId && previousAssets.getViewState)
    assetViews.set(previousAssets.dataset.jobId, previousAssets.getViewState());
  previousAssets?.dispose?.();
  timesheetDate = document.querySelector(".timesheets-ui")?.getViewState?.().date || timesheetDate;
  const previousPlan = document.querySelector('.plan-preview');
  const planScroll = previousPlan ? { x: window.scrollX, y: window.scrollY } : null;
  if (previousPlan?.dataset.viewKey && previousPlan.getViewState)
    planViews.set(previousPlan.dataset.viewKey, previousPlan.getViewState());
  document.querySelector(".workflow-module")?.disposeHoldToEdit?.();
  document.querySelector(".job-checklist")?.dispose?.();
  document.querySelector(".job-notes")?.dispose?.();
  document.querySelector(".job-settings")?.dispose?.();
  document.querySelector(".device-remarks")?.dispose?.();
  document.querySelector(".fire-maintenance")?.dispose?.();
  document.querySelector(".certificates-ui")?.dispose?.();
  document.querySelector(".timesheets-ui")?.dispose?.();
  document.querySelector(".mobile-workspace")?.dispose?.();
  document.querySelector(".release-help")?.dispose?.();
  disposeJobHold?.();
  disposeJobHold = null;
  const route = `${page}:${activeJob || ""}:${activeSite || ""}:${tab}`;
  const changedRoute = route !== renderedRoute;
  renderedRoute = route;
  const rawJob = currentJob(),
    s = rawJob ? siteOf(rawJob) : state.sites.find((s) => s.id === activeSite),
    j = rawJob ? effectiveJob(rawJob, s) : null;
  const mobileHome =
    page === "home" && window.matchMedia("(max-width: 700px)").matches;
  const pageLabel = ({ sites: 'Sites', help: 'Help & data', review: 'Import drawing', 'backup-review': 'Restore workspace', timesheets: 'Timesheets' })[page] || 'Jobs';
  const headerSite = page === "job" && j && s
    ? `<button type="button" class="job-site-link" data-action="site:${esc(s.id)}" title="Open site folder"><strong>${esc(siteLabel(s))}</strong></button>`
    : `<strong>${esc(s ? siteLabel(s) : j ? j.workflow?.details?.title || "Job notes" : pageLabel)}</strong>`;
  const headerIdentity = page === 'home'
    ? `<div><span class="eyebrow">YOUR FIELD WORKSPACE</span>${headerSite}</div>`
    : `<div class="jobs-header-context"><img class="jobs-context-icon" src="./jobs-logo.webp" width="119" height="140" alt="Jobs logo"><div><span class="eyebrow">JOBS / ${page === 'job' ? 'YOUR VISIT' : 'YOUR WORKSPACE'}</span>${headerSite}</div></div>`;
  const sidebar = `<aside class="sidebar"><a class="brand" href="#" data-action="home"><span class="brand-icon">▤</span> Jobs<span class="version">${esc(APP_VERSION)}</span></a><div class="side-caption">FIELD WORKSPACE</div><nav>${button("▦ &nbsp; Overview", "home", page === "home" ? "nav active" : "nav")}${button("⌂ &nbsp; Sites", "sites", page === "sites" ? "nav active" : "nav")}${button("Timesheets", "timesheets", page === "timesheets" ? "nav active" : "nav")}${button("Toolbox", "toolbox", "nav")}${button("+ &nbsp; Create job", "create", "nav")}${button("Help &amp; data", "help", page === "help" ? "nav active" : "nav")}</nav><div class="side-bottom"><span class="dot"></span> Local workspace<p>Your work stays on this device.<br>Export jobs to keep a backup.</p></div></aside>`;
  $("#app").innerHTML =
    `${mobileHome ? "" : sidebar}<div class="workspace"><header class="${page === "home" ? "jobs-banner-app-header" : "jobs-context-header"}">${mobileHome ? '<button type="button" class="jobs-banner-home-button" data-action="home" aria-label="Jobs home" title="Go to dashboard"></button>' : ""}${headerIdentity}<div class="connection"><span data-testid="save-status">${esc(saveLabel)}</span><small id="offline-status">${esc(offlineLabel)}</small></div></header><main>${mobileWorkspaceNavigation()}<div id="notice" role="status" class="${error ? "notice error" : message ? "notice" : ""}">${esc(error || message)}</div><div id="recovery-actions" class="notice" ${recoverySnapshot ? "" : "hidden"}><strong>Latest save failed.</strong> Keep this editor open and retry, or download the attempted records for recovery. ${button("Download unsaved recovery", "recovery-download")}</div><div id="release-update" class="notice" ${updateAvailable ? "" : "hidden"}>An update is ready. Save your current work before applying it. ${button("Apply update", "update-apply")}</div>${!storageReady && page !== "help" ? startupView() : page === "help" ? `<div class="quick-section-title desktop-page-back">${button("‹ Home", "home", "text-button")}</div><div id="release-help-root"></div>` : page === "backup-review" ? backupReview() : page === "home" ? home() : page === "sites" ? sites() : page === "timesheets" ? `<div class="quick-section-title"><h1>Timesheets</h1>${button("‹ Home", "home", "text-button desktop-page-back")}</div><div id="timesheets-root"></div>` : page === "site" ? siteView(s) : page === "review" ? importReview() : jobView(j, s)}</main><footer>JOBS / LOCAL FIRST <span>Version ${esc(APP_VERSION)} · Engineer-confirmed records</span></footer></div><input id="zone-file" type="file" accept=".json,.zonesketch,application/json" hidden><input id="job-file" type="file" accept=".json,application/json" hidden><input id="workspace-file" type="file" accept=".json,application/json" hidden>`;
  bindActions();
  const mobileMenu = document.querySelector('.jobs-mobile-menu');
  mobileMenu?.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !toolboxChest.isOpen) {
      mobileMenu.open = false;
      mobileMenu.querySelector('summary').focus();
      event.preventDefault();
    }
  });
  const appHeader = document.querySelector(".workspace > header");
  if (appHeader) appHeader.append(createAppearanceControl({ compact: true, toggle: mobileHome }));
  document.body.dataset.page = page;
  document.body.dataset.jobTab = page === "job" ? tab : "";
  if (page === "home" && $("#mobile-workspace-root")) {
    $("#mobile-workspace-root").append(
      renderMobileWorkspace({
        state: workspaceSnapshot(),
        ...timesheetCallbacks,
        onDirty: markDirty,
        onAction: (value, source) => value === "toolbox" ? action(value, source) : runTask(() => action(value, source)),
      }),
    );
  }
  updateInteractionLock();
  $("#zone-file").onchange = (e) => runTask(() => readZone(e.target.files[0]));
  $("#job-file").onchange = (e) => runTask(() => readJob(e.target.files[0]));
  $("#workspace-file").onchange = (e) => { const file = e.target.files[0]; e.target.value = ""; runTask(() => readWorkspaceBackup(file)); };
  document.querySelectorAll("#app form").forEach((f) => {
    f.addEventListener("input", () => {
      f.dataset.dirty = "true";
      dirty = true;
      saveLabel = "Unsaved changes";
      updateStatus();
    });
  });
  document.querySelectorAll("#app form").forEach(
    (f) =>
      (f.onsubmit = (e) => {
        e.preventDefault();
        runTask(() => submit(f));
      }),
  );
  if (page === "job" && tab === "Devices" && j && $("#device-search")) {
    const update = () => {
      const query = $("#device-search").value, filter = $("#device-state").value;
      if (pendingCardResult) {
        if (!confirm("Discard the unsaved result change before changing the device filter?")) {
          $("#device-search").value = deviceQuery;
          $("#device-state").value = deviceState;
          return;
        }
        pendingCardResult = null;
        markDirty(false);
      }
      deviceQuery = query;
      deviceState = filter;
      devicePage = 0;
      updateDeviceGrid(j, drawingOf(s, j));
    };
    $("#device-search").oninput = update;
    $("#device-state").onchange = update;
  }
  bindCardResultForms();
  if ($("#device-jump"))
    $("#device-jump").onchange = (event) => {
      const nextId = event.target.value;
      event.target.value = selectedAsset;
      runTask(() => action("asset:" + nextId));
    };
  if (page === "job" && j && tab === "Devices" && selectedAsset) {
    const result = rawJob.results.find(value => value.assetId === selectedAsset);
    const asset = drawingOf(s, j)?.assets.find(value => value.id === selectedAsset);
    const quickForm = document.querySelector('[data-form="quick-result"]');
    if (quickForm) quickForm.elements.observations.maxLength = 10000;
    quickForm?.querySelectorAll('[data-result-value]').forEach(control => {
      control.onclick = () => {
        quickForm.elements.state.value = control.dataset.resultValue;
        quickForm.querySelectorAll('[data-result-value]').forEach(button => button.setAttribute('aria-pressed', String(button === control)));
        quickForm.dataset.dirty = "true";
        markDirty();
      };
    });
    if (result && asset && $("#device-remarks-root")) {
      $("#device-remarks-root").append(renderDeviceRemarks({
        result, asset,
        quickDefects: state.quickDefects || [],
        onQuickDefectsChange: saveQuickDefects,
        onDirty: markDirty,
        onBeforeEdit: () => {
          if (quickForm?.dataset.dirty === "true") {
            if (!confirm("Discard the unsaved result change and edit this remark?")) return false;
            quickForm.reset();
            quickForm.elements.state.value = result.state;
            quickForm.querySelectorAll('[data-result-value]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.resultValue === result.state)));
            delete quickForm.dataset.dirty;
            markDirty(false);
          }
          return true;
        },
        onEdit: editing => { if (quickForm) quickForm.hidden = editing; },
        onSave: remarks => {
          const updated = structuredClone(currentJob());
          updated.results.find(value => value.assetId === result.assetId).remarks = validateDeviceRemarks(remarks);
          return saveJob(updated);
        },
      }));
    }
    if (result && $("#device-aux-root")) {
      const renderer = { Products: renderRemarkProducts, Photos: renderRemarkPhotos, History: renderRemarkHistory }[deviceTab];
      if (renderer) $("#device-aux-root").append(renderer(result));
    }
  }
  if (page === "job" && j && $("#workflow-root")) {
    $("#workflow-root").append(
      renderWorkflowSection(tab === "Job details" ? "Details" : tab === "Visit records" ? "Finalisation" : tab, {
        job: j,
        site: s,
        onSave: saveWorkflow,
        onSaveSite: saveWorkflowSite,
        onDirty: markDirty,
        onNavigate: (destination) =>
          runTask(() =>
            action(
              ["print", "export", "import-job-plan", "timesheets"].includes(destination)
                ? destination
                : "tab:" + destination,
            ),
          ),
      }),
    );
  }
  if (page === "help" && $("#release-help-root")) {
    $("#release-help-root").append(renderReleaseHelp({ version: APP_VERSION, buildId: BUILD_ID, offlineStatus: offlineLabel, storageStatus: saveLabel, hasRecovery: !!recoverySnapshot, onAction: value => runTask(() => action(value)) }));
    updateReleaseStatus();
  }
  if (page === "timesheets" && $("#timesheets-root")) {
    $("#timesheets-root").append(renderTimesheets({
      state: workspaceSnapshot(),
      initialDate: timesheetDate || undefined,
      onSave: timesheetCallbacks.onSaveTimesheet,
      onDelete: timesheetCallbacks.onDeleteTimesheet,
      onSubmit: timesheetCallbacks.onSubmitTimesheets,
      onExport: timesheetCallbacks.onExportTimesheets,
      onDirty: markDirty,
    }));
  }
  if (page === "job" && rawJob && $("#notes-root")) {
    $("#notes-root").append(renderJobNotes({
      job: rawJob,
      site: s,
      photoHost: document.querySelector(".quick-job-top"),
      onSave: (document, title, picture) => saveJob({
        ...rawJob,
        notesDocument: validateNotesDocument(document),
        profilePhoto: picture,
        workflow: { ...rawJob.workflow, version: 1, details: { ...rawJob.workflow?.details, title } },
      }),
      onDirty: markDirty,
      onNavigate: (destination) => runTask(() => action(destination === "settings" ? "job-settings:" + rawJob.id : "tab:" + destination)),
    }));
  }
  if (page === "job" && rawJob && $("#assets-root")) {
    const assets = renderAssetsWorkspace({
      drawing: drawingOf(s, j),
      templates: state.assetTemplates || [],
      initialViewState: assetViews.get(rawJob.id),
      renderAssetCard: asset => planAssetCard(asset, { issued: false }),
      onCreate: values => saveAssetChange(next => addJobAsset(next, rawJob.id, values), "Asset saved.", true),
      onDuplicate: (assetId, values) => saveAssetChange(next => duplicateJobAsset(next, rawJob.id, assetId, values), "Asset duplicated. Ready for its own inspection.", true),
      onSaveTemplate: asset => saveAssetChange(next => ({ ...next, assetTemplates: saveAssetTemplate(next.assetTemplates, asset) }), "Asset saved to favourites."),
      onRemoveTemplate: templateId => saveAssetChange(next => ({ ...next, assetTemplates: validateAssetTemplates((next.assetTemplates || []).filter(item => item.id !== templateId)) }), "Favourite removed."),
      onViewPlan: () => runTask(() => action("tab:Plan")),
      onImport: () => runTask(() => action(s ? "import-job-plan" : "job-settings:" + rawJob.id)),
      importLabel: s ? "Import plan" : "Link site for plan",
      onDirty: markDirty,
      onBeforeBrowse: beforePlanNavigate,
    });
    assets.dataset.jobId = rawJob.id;
    $("#assets-root").append(assets);
  }
  if (page === "job" && rawJob && $("#job-settings-root")) {
    $("#job-settings-root").append(renderJobSettings({
      job: rawJob,
      sites: state.sites,
      onDirty: markDirty,
      onSave: (updated, siteId) => {
        const selected = state.sites.find((site) => site.id === siteId);
        return selected && updated.assetRegister
          ? saveJob(updated, "Notes", selected.id)
          : saveJob(selected ? attachJobToSite(updated, selected) : updated, "Notes");
      },
    }));
  }
  if (page === "job" && rawJob && !draftJob && $("#certificates-root")) {
    $("#certificates-root").append(renderCertificates({
      job: rawJob, site: s || null, drawing: drawingOf(s, j) || null,
      onDirty: markDirty,
      onSave: updated => saveJob(updated),
      onPrint: certificate => runTask(async () => {
        const prepared = await printServiceReport(() => renderCertificate({certificate}));
        reportNotice(getNativePlatform()
          ? (prepared ? "Certificate print dialog closed. The issued copy is unchanged." : "Printing cancelled. The issued copy is unchanged.")
          : "Certificate prepared. Use the print dialog to print or save as PDF.");
        return prepared;
      }),
      onDownload: certificate => runTask(() => exportCertificatePdf(certificate, true)),
      onShare: certificate => runTask(() => exportCertificatePdf(certificate, false)),
    }));
  }
  if (page === "job" && j && $("#job-report-root"))
    $("#job-report-root").append(jobReport(s, j));
  if (page === "job" && j && $("#fire-maintenance-root")) {
    $("#fire-maintenance-root").append(renderFireMaintenance({
      site: s || null, job: j, drawing: drawingOf(s, j) || null,
      onDirty: markDirty,
      onSave: record => {
        const updated = structuredClone(currentJob());
        updated.fireMaintenance = validateFireMaintenance(record);
        return saveJob(updated);
      },
    }));
  }
  if (page === "job" && j && $("#checklist-root")) {
    $("#checklist-root").append(renderJobChecklist({
      site: s,
      job: j,
      onSave: (checklist) => saveWorkflow({ ...j, checklist: validateJobChecklist(checklist) }),
      onDirty: markDirty,
      onNavigate: (destination) => runTask(() => action(
        ["print", "export"].includes(destination) ? destination : "tab:" + destination,
      )),
    }));
  }
  if (page === "job" && j) {
    disposeJobHold = attachHoldToEdit($("#app"), {
      selector: "[data-job-edit]",
      onEdit: openJobField,
    });
  }
  if (page === "job" && tab === "Plan" && j && $("#plan-root")) {
    mountPlanPreview("#plan-root", drawingOf(s, j), {
        renderAssetCard: draftJob ? undefined : planAssetCard,
        onBeforeNavigate: beforePlanNavigate,
        onPreviewsReady: s ? (drawing) => savePreviewCache(s.id, drawing) : undefined,
        onSelectAsset: (aid) => {
          runTask(() => action(`asset:${aid}`));
        },
      });
  }
  if (page === "site" && s) {
    $("#site-profile-root").append(renderSiteProfile({site: s, onSave: saveWorkflowSite, onDirty: markDirty}));
    mountPlanPreview("#site-plan-root", s.drawings.at(-1), {
        onPreviewsReady: (drawing) => savePreviewCache(s.id, drawing),
        onSelectAsset: () =>
          scrollSection(document.querySelector(".asset-summary")),
      });
  }
  if (page === "review")
    $("#match-site").onchange = async (e) => {
      try {
        review.target = e.target.value;
        const r = await importZoneSketch(review.input, {
          siteId: review.target || undefined,
        });
        alignImport(r, review.target);
        review = { ...review, ...r };
        render();
      } catch (e) {
        flash(e.message, true);
      }
    };
  const createPhoto = $("#new-site-photo");
  if (createPhoto) {
    const form = document.querySelector('form[data-form="site"]');
    createPhoto.append(photoPicker({onChange: value => {form.profilePhoto=value;form.dataset.dirty="true";markDirty();},onBusy: value => {form.querySelector('button.primary').disabled=value;}}));
  }
  const existingPhoto = $("#existing-site-photo");
  if (existingPhoto && s) existingPhoto.append(photoPicker({value:s.profilePhoto,onChange:async value=>{
    if(dirty || busy || operationPending) {alert("Save your unfinished changes first.");return false;}
    const next=structuredClone(state);const record=next.sites.find(item=>item.id===s.id);if(!record)return false;
    record.profilePhoto=value;
    if(await persist(next,"Site photo saved.")){render();return true;}return false;
  }}));
  syncToolboxTrigger();
  if (changedRoute) scrollPageToTop();
  else if (planScroll) window.scrollTo(planScroll.x, planScroll.y);
}
function startupView() {
  return `<section class="panel"><h1>Local records could not be opened</h1><p>Your existing records have not been deleted. Keep this browser's website data; clearing it can remove your work.</p><p>Close other Jobs tabs if an upgrade is blocked, check available device storage, then retry.</p><div class="actions">${button("Retry opening records", "storage-retry", "primary")}${button("Help &amp; data", "help")}</div></section>`;
}
function backupReview() {
  if (!pendingRestore) return `<section class="panel"><h1>No backup selected</h1>${button("Help &amp; data", "help")}</section>`;
  const { summary, metadata } = pendingRestore.result;
  return `<section class="panel"><h1>Review workspace backup</h1><p>${metadata.kind === "recovery" ? "This is an unsaved recovery snapshot from a failed save. Review its jobs after restoring." : "This file contains the saved records from another Jobs workspace."}</p><p>Created ${esc(new Date(metadata.createdAt).toLocaleString())} · Jobs ${esc(metadata.appVersion)}</p><div class="metrics"><div><span>Sites</span><strong>${summary.sites}</strong></div><div><span>Jobs</span><strong>${summary.jobs}</strong></div><div><span>Attachments</span><strong>${summary.attachments}</strong></div></div><p>${summary.quickDefects} quick defects · ${summary.unassignedTimesheets} unassigned timesheet sessions. Included drawings, visit records and photographs will be restored locally.</p><p>Restoration requires an empty workspace. Existing work is never replaced.</p><div class="actions">${button("Restore backup", "confirm-workspace-restore", "primary")}${button("Cancel", "help")}</div></section>`;
}
async function readWorkspaceBackup(file) {
  if (!file) return;
  try {
    if (file.size > 100 * 1024 * 1024) throw Error("The backup exceeds the 100 MiB file limit.");
    const result = await restoreWorkspaceBackup(state, await file.text());
    if (result.duplicate) { reportNotice(result.message); return; }
    pendingRestore = { result, original: state };
    page = "backup-review";
    render();
  } catch (cause) { reportError(`Backup not restored: ${cause.message}`); }
}
async function downloadWorkspace(recovery = false) {
  if (!storageReady && !recovery) throw Error("Open your saved records successfully before exporting a backup.");
  const snapshot = recovery ? recoverySnapshot : state;
  if (!snapshot) throw Error("There is no failed-save snapshot to download.");
  const backup = await createWorkspaceBackup(snapshot, { appVersion: APP_VERSION, kind: recovery ? "recovery" : "backup" });
  const exported = await download(backup, `Jobs-${recovery ? "unsaved-recovery" : "workspace"}-${new Date().toISOString().slice(0, 10)}.jobs-backup.json`);
  if (exported.status === "cancelled") return false;
  if (exported.status === "saved") {
    reportNotice(recovery
      ? `Recovery file saved to your chosen location for the attempted save at ${new Date(recoveryCapturedAt).toLocaleTimeString()}. It remains unsaved in Jobs. Keep this editor open and retry, or restore the recovery file into an empty workspace.`
      : `Workspace backup saved to your chosen location. ${dirty ? "It includes saved records only; current unsaved edits are excluded." : "Keep a copy outside this device too."}`);
    return true;
  }
  reportNotice(recovery
    ? `Recovery download started for the attempted save at ${new Date(recoveryCapturedAt).toLocaleTimeString()}. It has not been saved in Jobs. Keep this editor open and retry, or restore the file into an empty workspace.`
    : `Workspace backup download started. Confirm the file reached your chosen folder. ${dirty ? "It includes saved records only; current unsaved edits are excluded." : "Keep a copy outside this browser."}`);
}
function home() {
  if (window.matchMedia("(max-width: 700px)").matches)
    return '<div id="mobile-workspace-root"></div>';
  const open = state.jobs.filter((j) => j.status !== "Complete").length;
  return `<section class="page-title"><div><span class="eyebrow">READY FOR THE NEXT VISIT</span><h1>Your workspace.</h1><p>Prepare the job. Record the work. Keep the evidence.</p></div>${button("+ Create job", "create", "primary")}</section><div class="metrics"><div><span>Saved jobs</span><strong>${state.jobs.length.toString().padStart(2, "0")}</strong></div><div><span>Open visits</span><strong>${String(open).padStart(2, "0")}</strong></div><div><span>Permanent sites</span><strong>${String(state.sites.length).padStart(2, "0")}</strong></div></div><section class="quick-actions" aria-label="Workspace actions"><button data-action="create" ><span class="tile-icon">+</span><strong>Create job</strong><small>Start a new site visit.</small><span class="arrow">→</span></button><button data-action="import-zone"><span class="tile-icon">⌑</span><strong>Import Zone Sketch</strong><small>Bring your site, plans and devices.</small><span class="arrow">→</span></button><button data-action="import-job"><span class="tile-icon">⇩</span><strong>Import job</strong><small>Reopen a job package and its evidence.</small><span class="arrow">→</span></button><button data-action="sites"><span class="tile-icon">⌂</span><strong>Sites</strong><small>Your asset records, across every visit.</small><span class="arrow">→</span></button></section><section><div class="section-head"><h2>Saved jobs <span class="count">${state.jobs.length}</span></h2><span class="muted">Stored on this device</span></div>${state.jobs.length ? `<div class="job-list">${state.jobs.map((j) => jobCard(j)).join("")}</div>` : `<div class="empty"><span class="empty-symbol">▤</span><h3>A clear start.</h3><p>Create a site or import a drawing to prepare your first visit.<br>Every new device result starts as Not tested.</p>${button("Explore demonstration site", "demo", "text-button")}</div>`}</section><div class="info-strip"><strong>Built for work on site.</strong><span>No account needed. Plans, photographs and records travel with your exported job.</span>${button("Protect local storage", "persist", "text-button")}</div>`;
}
function sites() {
  return `<section class="page-title"><div><span class="eyebrow">YOUR SITES</span><h1>Sites</h1><p>Keep each site's details, plans and visits together.</p></div>${button("Import Zone Sketch", "import-zone")}</section><div class="sites-workspace"><section class="panel site-create-panel" aria-labelledby="create-site-title"><div class="record-site-heading"><h2 id="create-site-title">Create site</h2><div id="new-site-photo"></div></div><p class="muted">Start with its name. You can add contacts, plans and equipment after saving.</p><form data-form="site">${field("Site name", "name", "", "text", true)}${area("Address", "address")}<button class="primary">Save site</button></form></section><section class="saved-sites" aria-labelledby="saved-sites-title"><div class="section-head"><h2 id="saved-sites-title">Saved sites <span class="count">${state.sites.length}</span></h2></div><div class="sites-grid">${state.sites.map((s) => `<button class="site-card" data-action="site:${esc(s.id)}">${photoMarkup(s.profilePhoto)}<strong>${esc(siteLabel(s))}</strong><small>${esc(s.address || "Address not recorded")}</small><span>${state.jobs.filter((j) => j.siteId === s.id).length} jobs · ${s.drawings.at(-1).assets.length} devices · ${s.drawings.length} drawing revisions</span></button>`).join("") || '<div class="empty"><h3>No sites yet</h3><p>Create your first site or import a Zone Sketch drawing.</p></div>'}</div></section></div>`;
}

function jobCard(rawJob, siteFolder = false) {
  const site = siteOf(rawJob), j = effectiveJob(rawJob, site);
  const title = j.workflow?.details?.title || (site ? siteFolder ? jobTypeLabel(j) || "Untitled job" : siteLabel(site) : "Untitled job");
  const subtitle = siteFolder
    ? `${j.workflow?.details?.reference || j.id.slice(0, 8)} · Plan ${drawingOf(site, j)?.revision || "Unlabelled"}`
    : site ? [jobTypeLabel(j), j.engineer || "Unassigned"].filter(Boolean).join(" · ") : "No site";
  return `<article class="job-card-shell"><button class="job-card" data-testid="${siteFolder ? "site-job-card" : "job-card"}" data-action="job:${esc(j.id)}">${photoMarkup(profilePhoto(rawJob, site)) || '<span class="job-mark">▤</span>'}<span><strong>${esc(title)}</strong><small>${j.importConflict ? "Preserved conflict · " : ""}${esc(subtitle)}</small></span><span class="job-meta">${badge(j.status)}<small>${esc(new Date(j.updatedAt).toLocaleDateString())}</small></span></button><button class="job-card-settings" data-testid="job-settings" data-action="job-settings:${esc(j.id)}" aria-label="Settings for ${esc(title)}" title="Job settings">${settingsIcon}</button></article>`;
}
function siteJobs(s) {
  const jobs = state.jobs.filter((j) => j.siteId === s.id);
  return `<section class="panel site-job-folder"><div class="section-head"><h2>Jobs in this site <span class="count">${jobs.length}</span></h2></div>${jobs.length ? `<div class="job-list">${jobs.map((j) => jobCard(j, true)).join("")}</div>` : '<p class="muted">No jobs yet. Create a job to start writing.</p>'}</section>`;
}

function siteView(s) {
  if (!s) return "";
  const d = s.drawings.at(-1);
  return `<section class="page-title"><div><span class="eyebrow">SITE / ${esc(s.id.slice(0, 8))}</span><h1>${esc(siteLabel(s))}</h1><div id="existing-site-photo"></div><p>${esc(s.address || "Address not recorded")} · ${d.assets.length} devices</p></div>${button("Create job", "create", "primary")}</section>${siteJobs(s)}<section class="panel site-plan-panel"><div class="section-head"><h2>Site plan</h2><div class="actions">${button("Import site plan", "import-site-plan")}${drawingConnection(d)}</div></div><div id="site-plan-root"></div></section><div class="two-column site-details-layout"><section class="panel site-settings-panel"><div id="site-profile-root"></div>${s.importedMetadata?.length ? `<details><summary>Preserved imported site details (${s.importedMetadata.length})</summary>${s.importedMetadata.map((m) => `<p><strong>${esc(m.site.name)}</strong><br>${esc(m.site.address || "No address supplied")}<br><small>Import ${esc(m.fingerprint.slice(0, 12))}</small></p>`).join("")}<p class="muted">Current site details above were retained. Review these imported versions before editing.</p></details>` : ""}<h3>Drawings</h3>${s.drawings.map((d) => `<p>${esc(d.revision || "Unlabelled revision")} · ${d.floors.length} floors · ${d.assets.length} devices</p>`).join("")}<p class="muted">Earlier visits stay linked to their original drawing.</p></section><section class="panel"><h2>Add equipment manually</h2><form data-form="asset">${field("Device reference", "reference", "", "text", true)}${field("Device type", "type", "", "text", true)}${select(
    "Floor",
    "floorId",
    d.floors.map((f) => [f.id, f.name]),
    d.floors[0]?.id,
  )}<button>Add device</button></form><ul class="asset-summary">${d.assets.map((a) => `<li><strong>${esc(a.reference || a.type)}</strong><span>${esc(a.type)} · ${esc(a.floorName || "")}</span></li>`).join("")}</ul></section></div>`;
}
function importReview() {
  const r = review;
  if (!r) return "";
  const d = r.drawing;
  const existing = state.sites.find((s) => s.id === r.target);
  const old = existing?.drawings.at(-1);
  const oldIds = new Set(old?.assets.map((a) => a.id));
  const newIds = new Set(d.assets.map((a) => a.id));
  const changes = old ? compareDrawings(old, d) : null;
  return `<section class="page-title"><div><span class="eyebrow">IMPORT REVIEW</span><h1>${esc(r.site.name)}</h1><p>Review the source and its mapping before saving.</p></div></section><section class="panel"><label>Site mapping<select id="match-site" ${r.jobId ? "disabled" : ""}><option value="">Create another site</option>${state.sites.map((s) => `<option value="${esc(s.id)}" ${s.id === r.target ? "selected" : ""}>Update existing site: ${esc(siteLabel(s))}</option>`).join("")}</select></label><p class="muted">${r.target ? "Matched source floor IDs or your explicit selection." : "Zone Sketch exports have no permanent site ID. Choose an existing site if this drawing belongs to one."}</p><div class="metrics"><div><span>Floors</span><strong>${d.floors.length}</strong></div><div><span>Equipment</span><strong>${d.assets.length}</strong></div><div><span>Issued snapshots</span><strong>${d.issuedSnapshots.length}</strong></div></div><p>Drawing revision: <strong>${esc(d.revision || "Not supplied")}</strong></p>${old ? `<p>${changes.added.length} added · ${changes.removed.length} removed · ${changes.moved.length} moved · ${changes.changed.length} changed in the new drawing. Historical visits and drawings are retained.</p>` : ""}<details open><summary>Missing information and import notes</summary><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>${changes ? `<details><summary>Review device changes</summary>${["added", "removed", "moved", "changed"].map((key) => `<p><strong>${key}:</strong> ${esc(changes[key].map((a) => a.reference || a.type).join(", ") || "None")}</p>`).join("")}</details>` : ""}<h3>Floors and devices</h3>${d.floors.map((f) => `<p><strong>${esc(f.name)}</strong> · ${d.assets.filter((a) => a.floorId === f.id).length} devices</p>`).join("")}<div class="actions">${r.jobId ? '<p class="muted">Apply to this job as a new working revision. Matching device results stay; removed-device results are archived.</p>' : ""}${button(r.jobId ? "Apply plan to job" : "Save site", "save-import", "primary")}${button("Cancel", "home")}</div></section>`;
}
function jobTools(j, s) {
  if (draftJob) return '<p class="muted">Save this job to use the detailed work tools.</p>';
  const tools = [...(s ? [["Job details", "Details"], ["Checklist", "Quick checklist"]] : []), ...(drawingOf(s, j) ? [["Assets", "Assets"], ["Results", "Results"]] : []), ["Maintenance", "Fire maintenance questions"], ["Work", "Work"], ["Products", "Products"], ["POs", "POs"], ["Visit records", "Visit records"]];
  return `<details class="quick-job-tools"><summary>More job tools</summary><div class="quick-tool-grid">${tools.map(([key, label]) => button(label, "tab:" + key)).join("")}${s ? button("Site settings", "site:" + s.id) : ""}</div>${s ? `<div class="integration-note"><span>FINDR adapter: future work.</span>${button("Export Panel Pal context", "panel-export")}</div>` : ""}</details>`;
}
function jobView(j, s) {
  if (!j) return "";
  const d = drawingOf(s, j);
  const mainSection = ["Assets", "Plan", "Devices", "Results"].includes(tab) ? "Assets" : ["Finalisation", "Checklist", "Maintenance", "Visit records"].includes(tab) ? "Finalisation" : "Notes";
  const primary = `<nav class="job-main-nav quick-job-nav" aria-label="Job workflow">${["Notes", "Assets", "Finalisation"].map(label => button(label, "tab:" + label, label === mainSection ? "active" : "")).join("")}</nav>`;
  const top = `<div class="quick-job-top">${button("‹ Home", "home", "text-button job-home-link")}<button class="job-settings-icon" data-action="job-settings:${esc(j.id)}" aria-label="Job settings" title="Job settings">${settingsIcon}</button></div>`;
  let content;
  if (tab === "Notes") content = '<div id="notes-root"></div>';
  else if (tab === "Assets") content = '<div id="assets-root"></div>';
  else if (tab === "Settings") content = `<div id="job-settings-root"></div>${jobTools(j, s)}`;
  else if (tab === "Finalisation") content = draftJob
    ? `<section class="panel"><h1>Finalisation</h1><p>Save your job to prepare its report.</p>${button("Return to notes", "tab:Notes", "primary")}</section>`
    : `<section class="finalisation-actions"><div><span class="eyebrow">FINALISATION</span><h1>Job report</h1><p>Prepared from your saved notes, pictures and recorded work.</p></div><div class="actions">${isFireMaintenanceJob(j) || j.fireMaintenance ? button("Maintenance questions", "tab:Maintenance") : ""}${button("Print report", "print", "primary")}${button("Export job", "export")}</div></section><div id="certificates-root"></div><div id="job-report-root" class="job-report-preview panel"></div>`;
  else if (tab === "Maintenance" && !draftJob) content = `<div class="quick-section-title">${button("Back to report", "tab:Finalisation", "text-button")}</div><div id="fire-maintenance-root"></div>`;
  else if (["Job details", "Work", "Products", "POs", "Visit records"].includes(tab)) content = `<div class="quick-section-title"><h1>${esc(tab === "Job details" ? "Details" : tab)}</h1>${button("Settings & tools", "job-settings:" + j.id, "text-button")}</div><div id="workflow-root"></div>`;
  else if (tab === "Checklist" && s) content = '<div id="checklist-root"></div>';
  else if (tab === "Plan" && d?.floors.length) content = `<section class="plan-actions panel"><div><h1>Plan</h1><p>Drawing ${esc(d.revision || "Unlabelled")}</p></div><div class="actions">${button("Back to assets", "tab:Assets")}${s && !draftJob ? button("Import Zone Sketch plan", "import-job-plan") : ""}${!draftJob ? button("Devices", "tab:Devices") + button("Results", "tab:Results") : ""}</div>${draftJob ? '<p class="muted">Save the job before recording work on this plan.</p>' : s ? `<details><summary>Drawing tools</summary>${drawingConnection(d)}<div class="actions">${button("Export editable drawing", "edited-source-export")}${d.source ? button("Original drawing", "source-export") : ""}</div></details>` : ""}</section><div id="plan-root" class="panel"></div>`;
  else if (tab === "Devices" && d) content = devices(j, d);
  else if (tab === "Results" && d) content = results(j, d);
  else content = `<section class="panel empty-job-plan"><h1>No plan added</h1><p>You can create assets without a plan. To use a site drawing, choose its site in job settings.</p><div class="actions">${button("Back to assets", "tab:Assets")}${button("Choose site", "job-settings:" + j.id, "primary")}</div></section>`;
  return `${top}${primary}${j.importConflict ? `<div class="notice error">${esc(j.importConflict)} Both versions remain in Saved jobs.</div>` : ""}${content}`;
}

const devicePageSize = () => window.matchMedia("(max-width: 700px)").matches ? 4 : 8;
function filteredDevices(j, d) {
  const query = deviceQuery.trim().toLocaleLowerCase();
  return d.assets.filter((a) => {
    const result = j.results.find((r) => r.assetId === a.id);
    return (
      (!deviceState || result?.state === deviceState) &&
      (!query ||
        [a.reference, a.type, a.typeName, a.floorName].some((value) =>
          String(value || "")
            .toLocaleLowerCase()
            .includes(query),
        ))
    );
  });
}
function priorVisit(assetId, job) {
  return state.jobs
    .filter((other) => other.siteId === job.siteId && other.id !== job.id)
    .flatMap((other) =>
      other.results
        .filter((r) => r.assetId === assetId && r.state !== "Not tested")
        .map((result) => ({
          state: result.state,
          at:
            typeof result.recordedAt === "string" &&
            Number.isFinite(Date.parse(result.recordedAt))
              ? result.recordedAt
              : other.updatedAt,
        })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))[0];
}
function deviceHistoryLabel(asset, job) {
  const previous = priorVisit(asset.id, job);
  return `<small class="asset-identity">Asset ID: ${esc(asset.sourceId || asset.id.slice(0, 12))}</small>${previous ? `<small class="previous-result">Previous visit: ${esc(previous.state)} · ${esc(new Date(previous.at).toLocaleDateString())}</small>` : ""}`;
}
const pencilIcon = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 15z"/></svg>';
function resultButtons(asset, result, extraClass = "") {
  return `<div class="device-card-results ${extraClass}" role="group" aria-label="Today's result for ${esc(asset.reference || asset.type)}" title="Current result: ${esc(result?.state || "Not tested")}">${[["pass", "Pass", "Satisfactory"], ["fail", "Fail", "Unsatisfactory"], ["na", "N/A", "Not applicable"]].map(([key, label, value]) => `<button data-action="card-result:${key}:${esc(asset.id)}" data-card-result="${value}" aria-pressed="${result?.state === value}">${label}</button>`).join("")}</div>`;
}
function resultReason(assetId) {
  const pending = pendingCardResult?.assetId === assetId ? pendingCardResult : null;
  return pending ? `<form data-form="card-result" class="device-quick-explanation" data-asset="${esc(assetId)}"><strong>${pending.state === "Unsatisfactory" ? "Fail" : "N/A"} — add a reason to save</strong><label>Explanation<textarea name="explanation" rows="2" maxlength="10000" required>${esc(pending.explanation)}</textarea></label><div class="actions"><button type="submit" class="primary">Save result</button><button type="button" data-action="cancel-card-result">Cancel</button></div></form>` : "";
}
function planAssetCard(asset, { issued }) {
  if (issued || draftJob) return null;
  const result = currentJob()?.results.find(value => value.assetId === asset.id);
  if (!result) return null;
  const reference = asset.reference || asset.type;
  const positioned = Number.isFinite(asset.x) && Number.isFinite(asset.y) && asset.x >= 0 && asset.x <= 1 && asset.y >= 0 && asset.y <= 1;
  const row = document.createElement('article');
  row.className = 'plan-asset-card plan-asset-work-row';
  row.dataset.assetId = asset.id;
  row.innerHTML = `<button class="plan-asset-name" data-action="asset:${esc(asset.id)}" aria-label="${esc(reference)}"><strong>${esc(reference)}</strong><small>${esc(asset.typeName || asset.type)}${asset.location ? " · " + esc(asset.location) : positioned ? "" : " · Position not recorded"}</small></button>${resultButtons(asset, result, "plan-inline-results")}<button class="plan-asset-edit" data-action="edit-defects:${esc(asset.id)}" aria-label="Edit defects for ${esc(reference)}" title="Edit defects">${pencilIcon}</button>${resultReason(asset.id)}`;
  bindActions(row);
  bindCardResultForms(row);
  return row;
}
function deviceCards(j, d) {
  const found = filteredDevices(j, d);
  const pages = Math.max(1, Math.ceil(found.length / devicePageSize()));
  devicePage = Math.min(devicePage, pages - 1);
  const visible = found.slice(
    devicePage * devicePageSize(),
    (devicePage + 1) * devicePageSize(),
  );
  return `<p class="device-count" role="status">${found.length} of ${d.assets.length} devices${pages > 1 ? ` · Page ${devicePage + 1} of ${pages}` : ""}</p>
    <div class="device-browser-grid">${visible.map(a => {
      const result = j.results.find(value => value.assetId === a.id);
      const reference = a.reference || a.type;
      return `<article class="device-row" data-asset-id="${esc(a.id)}"><div class="device-card-heading"><button class="device-open" data-action="asset:${esc(a.id)}"><strong>${esc(reference)}</strong><small>${esc(a.typeName || a.type)} · ${esc(a.floorName || "Location not supplied")}</small></button><button class="device-edit" data-action="edit-defects:${esc(a.id)}" aria-label="Edit defects for ${esc(reference)}" title="Edit defects">${pencilIcon}<span>Edit</span></button></div>${badge(result?.state || "Not tested")}${resultButtons(a, result)}${resultReason(a.id)}${deviceHistoryLabel(a, j)}</article>`;
    }).join("")}</div>
    ${!found.length ? '<p class="empty">No devices match. Try another reference, floor or result.</p>' : ""}
    ${pages > 1 ? `<div class="device-pagination"><button data-action="device-page:${devicePage - 1}" ${devicePage === 0 ? "disabled" : ""}>Previous devices</button><span>Page ${devicePage + 1} / ${pages}</span><button data-action="device-page:${devicePage + 1}" ${devicePage === pages - 1 ? "disabled" : ""}>Next devices</button></div>` : ""}`;
}
function updateDeviceGrid(j, d) {
  const root = $("#device-grid-results");
  root.innerHTML = deviceCards(j, d);
  bindActions(root);
  bindCardResultForms(root);
}
function devices(j, d) {
  const a = d.assets.find((a) => a.id === selectedAsset);
  const r = j.results.find((r) => r.assetId === selectedAsset);
  if (!a || !r)
    return `<section class="device-browser"><div class="section-head"><h2>Devices <span class="count">${d.assets.length}</span></h2><span class="muted">Choose a device to record work</span></div>
    <div class="device-browser-tools"><label>Search devices<input id="device-search" type="search" value="${esc(deviceQuery)}" placeholder="Reference, type or floor" aria-label="Search devices"></label><label>Result filter<select id="device-state"><option value="">All results</option>${states.map((state) => `<option value="${state}" ${state === deviceState ? "selected" : ""}>${state}</option>`).join("")}</select></label></div>
    <div id="device-grid-results">${d.assets.length ? deviceCards(j, d) : '<p class="empty">No equipment recorded. Add equipment to the site before creating a new visit.</p>'}</div></section>`;
  const index = d.assets.findIndex((asset) => asset.id === a.id);
  const record = `    <details class="device-context"><summary>Drawing details &amp; photographs (${a.photos?.length || 0})</summary><p class="muted">Drawing status: ${esc(a.drawingStatus || "Not supplied")} · Manufacturer: ${esc(a.manufacturer || "Not recorded")} · Model: ${esc(a.model || "Not recorded")}</p>${a.location ? `<p>Location: ${esc(a.location)}</p>` : ""}${a.description ? `<p>${esc(a.description)}</p>` : ""}${photos(a.photos, "Drawing photograph")}</details>
    <form data-form="result" data-asset="${esc(a.id)}"><div class="record-grid">${select("Result", "state", states, r.state)}${area("Observations", "observations", r.observations)}</div>
      <div id="reading-rows">${(r.readings.length ? r.readings : [{}]).map((x) => `<div class="form-grid readings">${field("Reading name", "readingName", x.name)}${field("Value", "readingValue", x.value)}${field("Unit", "readingUnit", x.unit)}</div>`).join("")}</div><button type="button" data-action="add-reading">Add reading</button>
      <div class="record-secondary-grid">${area("Notes", "notes", r.notes)}${area("Defects", "defects", r.defects)}</div>
      <p class="muted">Explain unsatisfactory, inaccessible or not applicable results in observations, notes or defects.</p>${photos(r.photos, "Visit photograph")}<label>Add photographs<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div class="record-save"><button class="primary">Save device result</button></div>
    </form>`;
  const quick = `<form data-form="quick-result" data-asset="${esc(a.id)}" class="device-quick-result"><h3 class="device-section-label">TODAY'S RESULT</h3><input type="hidden" name="state" value="${esc(r.state)}"><div class="device-result-choices" role="group" aria-label="Today's result">${states.map(value => `<button type="button" data-result-value="${esc(value)}" aria-pressed="${value === r.state}" class="${value === "Unsatisfactory" ? "result-fail" : ""}">${esc({ Satisfactory: "Pass", Unsatisfactory: "Fail", "Not applicable": "N/A" }[value] || value)}</button>`).join("")}</div><p class="muted">Choose today's test outcome. Adding or resolving a remark does not change it.</p>${area("Explanation", "observations", r.observations)}<button class="secondary">Save result</button></form>`;
  const content = deviceTab === "Record" ? record : deviceTab === "Defects" ? `${quick}<div id="device-remarks-root"></div>` : `<div id="device-aux-root"></div>${deviceTab === "Photos" ? `<h3>Drawing photographs</h3>${photos(a.photos, "Drawing photograph")}<h3>Visit photographs</h3>${photos(r.photos, "Visit photograph")}` : ""}`;
  return `<section class="device-editor panel" data-section="${deviceTab}">
    <div class="device-switcher">${button("Back to devices", "devices-grid", "text-button")}<div class="device-step-actions"><button data-action="asset:${esc(d.assets[index - 1]?.id || "")}" ${index === 0 ? "disabled" : ""}>Previous device</button><button data-action="asset:${esc(d.assets[index + 1]?.id || "")}" ${index === d.assets.length - 1 ? "disabled" : ""}>Next device</button></div><label>Choose device<select id="device-jump" aria-label="Choose device">${d.assets.map((asset) => `<option value="${esc(asset.id)}" ${asset.id === a.id ? "selected" : ""}>${esc(asset.reference || asset.type)} · ${esc(asset.floorName || "")}</option>`).join("")}</select></label></div>
    <div class="section-head"><div><span class="eyebrow">DEVICE ${index + 1} OF ${d.assets.length}</span><h2 tabindex="-1">${esc(a.reference || a.type)}</h2><p class="muted">${esc(a.typeName || a.type)} · ${esc(a.floorName || "Location not supplied")}</p></div>${badge(r.state)}</div>
    <nav class="device-section-tabs" aria-label="Device sections">${["Record", "Defects", "Products", "Photos", "History"].map(value => `<button data-action="device-tab:${value}" aria-current="${deviceTab === value ? "page" : "false"}">${value}${value === "Defects" && r.remarks?.items?.length ? ` <span aria-hidden="true">${r.remarks.items.length}</span>` : ""}</button>`).join("")}</nav>
    ${content}</section>`;
}

function photos(items, label) {
  return `<div class="photos">${(items || [])
    .filter((p) =>
      /^data:image\/(png|jpe?g|webp|gif|avif|bmp);base64,/i.test(p.image || ""),
    )
    .map(
      (p) =>
        `<figure><a href="${esc(p.image)}" target="_blank" rel="noopener"><img src="${esc(p.image)}" alt="${esc(p.caption || label)}"></a><figcaption>${esc(p.caption || label)}</figcaption></figure>`,
    )
    .join("")}</div>`;
}
function results(j, d) {
  return `<section class="panel"><h2>Visit results</h2><p>Results cover this job’s ${j.results.length} devices. Drawing verification never counts as today’s test.</p><div class="result-counts">${states.map((s) => `<div>${badge(s)}<strong>${j.results.filter((r) => r.state === s).length}</strong></div>`).join("")}</div><div class="result-grid">${j.results
    .map((r) => {
      const a = d.assets.find((a) => a.id === r.assetId);
      return `<article class="result-record"><div class="section-head"><h3>${esc(a?.reference || a?.type)}</h3>${badge(r.state)}</div><p>${esc(r.observations || "No observations recorded.")}</p>${r.readings.map((x) => `<p>${esc(x.name)}: ${esc(x.value)} ${esc(x.unit)}</p>`).join("")}<p>${esc(r.notes)}</p>${r.defects ? `<p class="defect"><strong>Defect:</strong> ${esc(r.defects)}</p>` : ""}${photos(r.photos, "Visit photograph")}${renderDeviceRemarkReport(r).outerHTML}${button("Open device", "asset:" + r.assetId, "text-button")}</article>`;
    })
    .join(
      "",
    )}</div>${j.archivedResults?.length ? `<details class="archived-evidence"><summary>Earlier drawing evidence (${j.archivedResults.length} removed devices)</summary><p>These records belong to earlier drawings and are outside the current device count.</p>${j.archivedResults.map((item) => `<article class="result-record"><h3>${esc(item.asset.reference || item.asset.type)}</h3>${badge(item.result.state)}<p>${esc(item.result.observations)}</p><p>${esc(item.result.notes)}</p><p>${esc(item.result.defects)}</p>${item.result.readings.map((r) => `<p>${esc(r.name)}: ${esc(r.value)} ${esc(r.unit)}</p>`).join("")}${photos(item.result.photos, "Archived visit photograph")}${renderDeviceRemarkReport(item.result).outerHTML}<small>Drawing ${esc(item.drawingId)} · retained ${esc(item.removedAt)}</small></article>`).join("")}</details>` : ""}</section>`;
}
async function readText(file) {
  if (!file) throw Error("No file selected.");
  if (file.size > 100 * 1024 * 1024)
    throw Error("File exceeds the 100 MB import limit.");
  return file.text();
}
async function readZone(file) {
  try {
    await stageZone(await readText(file));
  } catch (e) {
    flash("Drawing import rejected: " + e.message, true);
  }
}
function alignImport(imported, siteId) {
  const site = state.sites.find((site) => site.id === siteId);
  if (site) {
    imported.drawing = alignDrawingAssetsToSite(imported.drawing, site);
    imported.site.drawings = [imported.drawing];
  }
  return imported;
}
async function stageZone(input, jobId = importTargetJob) {
  const keys = zoneSourceKeys(input),
    matches = state.sites.filter((s) =>
      (s.sourceKeys || []).some((k) => keys.includes(k)),
    );
  const targetJob = state.jobs.find((job) => job.id === jobId);
  const target = targetJob
    ? targetJob.siteId
    : importTargetSite || (matches.length === 1
      ? matches[0].id
      : "");
  review = {
    ...alignImport(
      await importZoneSketch(input, { siteId: target || undefined }),
      target,
    ),
    input,
    target,
    jobId: targetJob?.id || null,
  };
  importTargetJob = null;
  importTargetSite = null;
  page = "review";
  error = "";
  message = "";
  render();
}
async function readJob(file) {
  try {
    const result = await importJobPackage(state, await readText(file));
    if (await persist(result.state, result.message)) {
      activeJob = result.job.id;
      draftJob = null;
      page = "job";
      tab = "Notes";
      resetDeviceBrowser();
      render();
    }
  } catch (e) {
    flash("Job import rejected: " + e.message, true);
  }
}
async function action(a, source) {
  if (a === "toolbox") {
    if (toolboxChest.isOpen) toolboxChest.close();
    else toolboxChest.open(source || document.querySelector("[data-toolbox-trigger]"));
    return;
  }
  if (!toolboxChest.close({ restoreFocus: false })) return;
  if (a === "backup-workspace") return downloadWorkspace();
  if (a === "recovery-download") return downloadWorkspace(true);
  if (a === "offline-retry") return offlineController?.retry();
  if (a === "update-check") {
    if (dirty || recoverySnapshot) throw Error("Save your current work before checking for updates.");
    if (!navigator.onLine) { flash("Connect to the internet to check for a new Jobs version.", true); return; }
    if (!offlineController) { flash("Update checking is available on the installed production app."); return; }
    flash("Checking GitHub Pages for the latest Jobs version…");
    const available = await offlineController.checkForUpdates();
    if (available || updateAvailable) {
      if (!window.confirm("A new Jobs version is ready. Apply it and reopen the app? Make sure your work is saved.")) {
        flash("Update ready. Apply it when your work is saved.");
        return;
      }
      if (await offlineController.applyUpdate()) window.location.reload();
      else flash("Update not applied. Close other Jobs tabs and try again.", true);
    } else flash("Update check finished. No new version is ready to apply.");
    return;
  }
  if (a === "update-apply") {
    if (dirty || recoverySnapshot) throw Error("Save your open work and resolve the failed save before applying an update. Your current app remains available.");
    if (await offlineController?.applyUpdate()) window.location.reload();
    return;
  }
  if (a === "storage-retry") { await openRecords(); render(); return; }
  if (!storageReady && !["home", "help"].includes(a)) throw Error("Your saved records have not opened. Retry opening records before making changes.");
  if (a === "restore-workspace") {
    if (dirty) throw Error("Save your current edits before choosing a workspace backup.");
    $("#workspace-file").click();
    return;
  }
  if (a === "confirm-workspace-restore") {
    if (!pendingRestore || pendingRestore.original !== state) throw Error("The workspace changed. Select and review the backup again.");
    if (await persist(pendingRestore.result.state, "Workspace restored on this device.")) {
      pendingRestore = null; page = "home"; activeJob = activeSite = draftJob = null; render();
    }
    return;
  }
  if (a === "cancel-card-result") {
    pendingCardResult = null;
    markDirty(false);
    error = ""; message = "";
    render();
    return;
  }
  if (a === "add-reading") {
    $("#reading-rows").insertAdjacentHTML(
      "beforeend",
      `<div class="form-grid readings">${field("Reading name", "readingName")}${field("Value", "readingValue")}${field("Unit", "readingUnit")}</div>`,
    );
    return;
  }
  const retryingQuickResult = recoveryRetryKey && recoveryRetryKey === `${a}:${activeJob}`;
  if (dirty || (recoverySnapshot && !retryingQuickResult)) {
    if (
      [
        "export",
        "panel-export",
        "print",
        "source-export",
        "edited-source-export",
        "edit-site",
      ].includes(a)
    ) {
      reportError(
        "Save your changes before exporting, printing or opening Zone Sketch.",
      );
      return;
    }
    if (!confirm(recoverySnapshot ? "The latest save failed. Download the unsaved recovery copy first if you need it. Leave and discard this unsaved attempt?" : "Leave this form and discard unsaved changes?")) return;
    dirty = false;
    recoverySnapshot = null;
    recoveryCapturedAt = null;
    recoveryRetryKey = null;
    pendingCardResult = null;
    saveLabel = draftJob ? "Not saved yet" : "Saved on this device";
  }
  if (a.startsWith("card-result:")) {
    const rest = a.slice("card-result:".length), separator = rest.indexOf(":");
    const outcome = { pass: "Satisfactory", fail: "Unsatisfactory", na: "Not applicable" }[rest.slice(0, separator)];
    const assetId = rest.slice(separator + 1);
    const job = currentJob(), result = job?.results.find(value => value.assetId === assetId);
    if (!outcome || !result || draftJob) throw Error("Open a saved device to record its result.");
    const hasExplanation = [result.observations, result.notes, result.defects].some(value => value?.trim());
    // An explicit Fail can use the defect already recorded on this device.
    const defect = outcome === "Unsatisfactory" && !hasExplanation
      ? result.remarks?.items.find(item => item.status === "Open" && item.description?.trim()) : null;
    if (outcome !== "Satisfactory" && !hasExplanation && !defect) {
      pendingCardResult = { assetId, state: outcome, explanation: "" };
      markDirty();
      render();
      requestAnimationFrame(() => document.querySelector('form[data-form="card-result"] textarea')?.focus({ preventScroll: true }));
      return;
    }
    return saveCardResult(assetId, outcome, defect?.description || "");
  }
  if (a.startsWith("edit-defects:")) {
    if (draftJob) throw Error("Save this job before recording defects.");
    selectedAsset = a.slice("edit-defects:".length);
    deviceTab = "Defects";
    tab = "Devices";
    render();
    focusDevice();
    return;
  }
  if (a === "create") {
    const site = page === "site" ? state.sites.find((site) => site.id === activeSite) : null;
    draftJob = createQuickJob(site);
    activeJob = draftJob.id;
    activeSite = null;
    page = "job";
    tab = "Notes";
    saveLabel = "Not saved yet";
    message = "";
    error = "";
    resetDeviceBrowser();
    render();
    return;
  }
  if (a === "home" || a === "sites" || a === "timesheets" || a === "help") {
    pendingRestore = null;
    page = a;
    draftJob = null;
    activeJob = null;
    activeSite = null;
    saveLabel = storageReady ? "Saved on this device" : "Local storage unavailable";
    importTargetJob = null;
    importTargetSite = null;
    message = "";
    if (storageReady) error = "";
    render();
    scrollPageToTop();
    return;
  }
  if (a === "import-zone") {
    importTargetJob = null;
    importTargetSite = null;
    return $("#zone-file").click();
  }
  if (a === "import-site-plan") {
    importTargetSite = activeSite;
    importTargetJob = null;
    return $("#zone-file").click();
  }
  if (a === "import-job-plan") {
    if (!currentJob()?.siteId || draftJob) throw Error("Save this job with a site before importing its plan.");
    importTargetSite = null;
    importTargetJob = activeJob;
    return $("#zone-file").click();
  }
  if (a === "edit-site") {
    if (draftJob) throw Error("Save this job before opening its drawing in Zone Sketch.");
    return editSite();
  }
  if (a === "import-job") return $("#job-file").click();
  if (a === "demo")
    return stageZone(await (await fetch("./demo.zonesketch.json")).text());
  if (a.startsWith("site:")) {
    activeSite = a.slice(5);
    page = "site";
    activeJob = null;
    draftJob = null;
    render();
    return;
  }
  if (a.startsWith("job:")) {
    activeJob = a.slice(4);
    draftJob = null;
    activeSite = null;
    page = "job";
    tab = "Notes";
    resetDeviceBrowser();
    render();
    return;
  }
  if (a.startsWith("job-settings:")) {
    const nextId = a.slice("job-settings:".length);
    if (nextId !== draftJob?.id) draftJob = null;
    activeJob = nextId;
    activeSite = null;
    page = "job";
    tab = "Settings";
    render();
    return;
  }
  if (a.startsWith("tab:")) {
    if (draftJob && !["Notes", "Assets", "Plan", "Finalisation", "Settings"].includes(a.slice(4)))
      throw Error("Save this job before recording detailed work.");
    tab = a.slice(4);
    if (tab === "Devices") selectedAsset = null;
    render();
    scrollPageToTop();
    return;
  }
  if (a.startsWith("asset:")) {
    if (draftJob) throw Error("Save this job before recording device results.");
    selectedAsset = a.slice(6);
    deviceTab = "Record";
    tab = "Devices";
    render();
    focusDevice();
    return;
  }
  if (a.startsWith("device-tab:")) {
    const value = a.slice("device-tab:".length);
    if (!["Record", "Defects", "Products", "Photos", "History"].includes(value)) return;
    deviceTab = value;
    render();
    scrollSection(document.querySelector(".device-section-tabs"));
    return;
  }
  if (a === "devices-grid") {
    selectedAsset = null;
    render();
    scrollSection(document.querySelector(".device-browser"));
    return;
  }
  if (a.startsWith("device-page:")) {
    devicePage = Math.max(0, Number(a.slice(12)) || 0);
    const job = state.jobs.find((job) => job.id === activeJob);
    updateDeviceGrid(job, drawingOf(siteOf(job), job));
    scrollSection($("#device-grid-results"));
    return;
  }
  if (a === "save-import" && review.jobId) {
    const jobId = review.jobId;
    const next = applyDrawingToJob(state, jobId, review.drawing);
    const site = next.sites.find((s) => s.id === review.target);
    site.sourceKeys = [
      ...new Set([...(site.sourceKeys || []), ...review.site.sourceKeys]),
    ];
    if (
      await persist(
        next,
        "Plan imported into this job. Earlier drawing revisions and results were retained.",
      )
    ) {
      activeJob = jobId;
      activeSite = null;
      page = "job";
      tab = "Plan";
      review = null;
      render();
    }
    return;
  }
  if (a === "save-import") {
    if (!review.site.name.trim() && !review.target)
      throw Error(
        "The drawing has no site name. Add a site name in Zone Sketch, or create a named manual site and select it in Site mapping.",
      );
    const next = structuredClone(state),
      r = review;
    let s = next.sites.find((s) => s.id === r.target);
    if (s) {
      s.sourceKeys = [
        ...new Set([...(s.sourceKeys || []), ...r.site.sourceKeys]),
      ];
      if (!s.drawings.some((d) => d.id === r.drawing.id))
        s.drawings.push(r.drawing);
    } else {
      next.sites.push(r.site);
      s = r.site;
    }
    if (
      await persist(next, "Site saved. Review equipment, then create a job.")
    ) {
      activeSite = s.id;
      page = "site";
      review = null;
      render();
    }
    return;
  }
  if (a === "persist") {
    const ok = await navigator.storage?.persist?.();
    flash(
      ok
        ? "Persistent storage granted. Keep exported backups too."
        : "Persistent storage was not granted by this browser. Keep regular job exports.",
    );
    return;
  }
  const rawJob = currentJob(),
    s = rawJob && siteOf(rawJob),
    j = rawJob && effectiveJob(rawJob, s);
  if (draftJob && ["export", "export-json", "export-pdf", "print", "panel-export", "source-export", "edited-source-export"].includes(a))
    throw Error("Save this job first.");
  if (a === "edited-source-export")
    return await download(
      buildEditableZoneSketch(drawingOf(s, j), { siteName: s.name }),
      "working-drawing.zonesketch.json",
    );
  if (a === "source-export")
    return await download(drawingOf(s, j).source, "original.zonesketch.json");
  if (a === "export") {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Export job pack");
    dialog.innerHTML = '<h2>Export job pack</h2><p>Choose a file format.</p><div class="actions"><button type="button" class="primary" data-format="pdf">PDF job pack</button><button type="button" data-format="json">Editable Jobs file (.json)</button><button type="button" data-format="cancel">Cancel</button></div><p class="muted">PDF is for reading and sharing. The Jobs file can be imported again.</p>';
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), {once:true});
    dialog.querySelectorAll("[data-format]").forEach(control => control.onclick = () => {
      const format = control.dataset.format;
      dialog.close();
      if (format !== "cancel") runTask(() => action(format === "pdf" ? "export-pdf" : "export-json"));
    });
    dialog.showModal();
    return;
  }
  if (a === "export-json")
    return await download(await createJobPackage(s || null, rawJob), `job-${j.id}.jobs.json`);
  if (a === "export-pdf") {
    if (dirty || recoverySnapshot) throw Error("Save your changes before exporting a PDF.");
    const title = j.workflow?.details?.title || s?.name || "Job pack";
    const blob = await generateReportPdf(jobReport(s,j), {title, subject:"Job pack", heading:"Jobs · " + title, footer:"Job " + j.id.slice(0,8), label:"Job report and recorded evidence"});
    const name = "Job-" + j.id + ".pdf";
    const native = getNativePlatform();
    if (native) return native.exportBlob(blob,name,{share:true});
    const file = new File([blob],name,{type:"application/pdf"});
    if (navigator.share && navigator.canShare?.({files:[file]})) {
      try { await navigator.share({files:[file],title}); return; }
      catch(error) { if(error.name==="AbortError") return; if(!["NotAllowedError","NotSupportedError","TypeError"].includes(error.name)) throw error; }
    }
    const url=URL.createObjectURL(blob), link=document.createElement("a");
    link.href=url;link.download=name;document.body.append(link);
    try {link.click();} finally {link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    return;
  }
  if (a === "panel-export")
    return await download(panelContext(s, j), `job-${j.id}.panel-context.json`);
  if (a === "print") {
    message = "Preparing report and photographs…";
    error = "";
    const notice = $("#notice");
    if (notice) {
      notice.className = "notice";
      notice.setAttribute("role", "status");
      notice.textContent = message;
    }
    const prepared = await printServiceReport(() => jobReport(s, j));
    message = getNativePlatform()
      ? (prepared ? "Print dialog closed. Your saved report is unchanged." : "Printing cancelled. Your saved report is unchanged.")
      : "Report prepared. Use the print dialog to print or save as PDF.";
    if (notice?.isConnected) notice.textContent = message;
    return prepared;
  }
}
async function submit(form) {
  const f = new FormData(form),
    v = Object.fromEntries(f),
    next = structuredClone(state);
  const type = form.dataset.form;
  if (
    type === "asset" &&
    document.querySelector('.site-profile[data-dirty="true"]') &&
    !confirm("Add this device and discard the unsaved site details? Cancel keeps both drafts open.")
  ) return;
  if (type === "card-result") {
    if (!pendingCardResult || pendingCardResult.assetId !== form.dataset.asset)
      throw Error("Choose the device result again.");
    return saveCardResult(pendingCardResult.assetId, pendingCardResult.state, v.explanation);
  }
  if (type === "site") {
    const s = newSite(v.name.trim(), v.address);
    if (form.profilePhoto) s.profilePhoto = form.profilePhoto;
    if (!s.name) throw Error("Enter a site name.");
    next.sites.push(s);
    if (await persist(next, "Site saved.")) {
      activeSite = s.id;
      page = "site";
      render();
    }
    return;
  }
  if (type === "site-details" || type === "asset") {
    const s = next.sites.find((s) => s.id === activeSite);
    if (type === "site-details") {
      s.name = v.name.trim();
      if (!s.name) throw Error("Enter a site name.");
      s.address = v.address;
    } else {
      let d = s.drawings.at(-1);
      if (next.jobs.some((j) => j.drawingId === d.id)) {
        d = structuredClone(d);
        d.id = id();
        d.revision = `Manual update ${s.drawings.length + 1}`;
        s.drawings.push(d);
      }
      const floor = d.floors.find((f) => f.id === v.floorId);
      d.assets.push({
        id: id(),
        sourceId: null,
        floorId: floor?.id || null,
        floorName: floor?.name || "",
        type: v.type,
        reference: v.reference,
        photos: [],
        drawingStatus: "Manually recorded",
      });
    }
    if (
      await persist(next, "Site updated. Existing visits keep their drawing.")
    )
      render();
    return;
  }
  const j = next.jobs.find((j) => j.id === activeJob);
  if (type === "details") {
    Object.assign(j, v);
  }
  if (type === "quick-result") {
    const result = j.results.find(value => value.assetId === form.dataset.asset);
    if (!result || !states.includes(v.state)) throw Error("Choose a valid device result.");
    if (typeof v.observations !== "string" || v.observations.length > 10000) throw Error("Keep the explanation within 10,000 characters.");
    if (["Unsatisfactory", "Inaccessible", "Not applicable"].includes(v.state) &&
        ![v.observations, result.notes, result.defects].some(value => value?.trim()))
      throw Error("Add an explanation for this result.");
    Object.assign(result, { state: v.state, observations: v.observations,
      recordedAt: now(), recordedBy: effectiveJob(j, next.sites.find(site => site.id === j.siteId)).engineer });
  }
  if (type === "result") {
    const r = j.results.find((r) => r.assetId === form.dataset.asset);
    if (
      ["Unsatisfactory", "Inaccessible", "Not applicable"].includes(v.state) &&
      ![v.observations, v.notes, v.defects].some((x) => x.trim())
    )
      throw Error(
        "Please explain this result in observations, notes or defects.",
      );
    const readings = f
      .getAll("readingName")
      .map((name, i) => ({
        name,
        value: f.getAll("readingValue")[i],
        unit: f.getAll("readingUnit")[i],
      }))
      .filter((x) => x.name || x.value || x.unit);
    if (
      readings.some((x) => !x.name.trim() || !x.value.trim() || !x.unit.trim())
    )
      throw Error("A reading needs a name, value and unit.");
    const added = [];
    for (const file of f.getAll("photos").filter((x) => x.size)) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 15 * 1024 * 1024
      )
        throw Error("Use JPEG, PNG or WebP photographs up to 15 MB each.");
      added.push({
        id: id(),
        caption: file.name,
        createdAt: now(),
        image: await dataURL(file),
      });
    }
    Object.assign(r, {
      state: v.state,
      observations: v.observations,
      notes: v.notes,
      defects: v.defects,
      readings,
      photos: [...r.photos, ...added],
      recordedAt: now(),
      recordedBy: effectiveJob(j, next.sites.find(site => site.id === j.siteId)).engineer,
    });
  }
  j.revision++;
  j.updatedAt = now();
  if (await persist(next, "Work saved on this device.")) render();
}
function dataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error("Could not read photograph."));
    r.readAsDataURL(file);
  });
}
async function download(data, name) {
  const nativePlatform = getNativePlatform();
  if (nativePlatform) {
    const result = await nativePlatform.exportJson(data, name);
    reportNotice(result.status === "saved"
      ? "File saved to your chosen location. Your records remain saved in Jobs."
      : "Export cancelled. Your saved records and any recovery copy in this editor are unchanged.");
    return result;
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { status: "started" };
}
async function exportCertificatePdf(certificate, downloadOnly = false) {
  const result = await shareCertificatePdf(certificate, {downloadOnly});
  if (result.status === "cancelled") reportNotice("PDF sharing or saving cancelled. The issued certificate is unchanged.");
  else if (result.status === "shared") reportNotice("PDF share sheet opened. Choose your email app to send it to the customer.");
  else reportNotice("PDF download prepared. Attach the file to your customer email.");
  return result;
}
function jobReport(site, job) {
  return renderServiceReport({ site: site || null, job, drawing: drawingOf(site, job) || null });
}
installReportPrinting({
  getReport: () => {
    const saved = state.jobs.find(job => job.id === activeJob);
    if (page !== "job" || !saved || draftJob) return null;
    const site = siteOf(saved);
    return jobReport(site, effectiveJob(saved, site));
  },
  onError: cause => reportError(cause.message || "Could not prepare the report."),
});

window.addEventListener("beforeunload", (event) => {
  if (dirty || recoverySnapshot || toolboxChest.hasUnsavedChanges()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
// The Android host asks before finishing its Activity; Jobs does not use URL
// history for screen navigation. Returning true always keeps the app open.
window.__jobsAndroidBack = () => {
  if (busy || operationPending || getNativePlatform()?.isBusy) {
    reportNotice("Please finish the current save, export or print action before leaving.");
    return true;
  }
  if (toolboxChest.isOpen) { toolboxChest.close(); return true; }
  if (dirty || recoverySnapshot || toolboxChest.hasUnsavedChanges()) {
    reportNotice(recoverySnapshot
      ? "Keep this editor open. Retry the failed save or export its recovery copy before leaving."
      : "Save your changes, or use the app's Cancel or Home control to discard them before leaving.");
    return true;
  }
  const dialog = document.querySelector('dialog[open]');
  if (dialog) {
    const cancel = new Event("cancel", { cancelable: true });
    if (dialog.dispatchEvent(cancel)) dialog.close();
    return true;
  }
  if (page === "home") return false;
  if (page === "job" && selectedAsset) {
    selectedAsset = null;
    render();
  } else if (page === "job" && tab !== "Notes") {
    tab = "Notes";
    render();
  } else void runTask(() => action("home"));
  return true;
};
async function openRecords() {
  saveLabel = "Opening local records…";
  updateStatus();
  try {
    const loaded = await loadState();
    state = loaded;
    storageReady = true;
    saveLabel = "Saved on this device";
    error = "";
    if (
      state.sites.some((site) =>
        site.drawings.some((drawing) => !Array.isArray(drawing.planPreviews)),
      )
    ) {
      await persist(structuredClone(state));
    }
  } catch (e) {
    storageReady = false;
    saveLabel = "Local storage unavailable";
    error = `Could not open local records: ${e.message}`;
  }
}
async function init() {
  await openRecords();
  render();
  if (import.meta.env.PROD) offlineController = startOffline({
    onStatus: value => { offlineLabel = value; updateReleaseStatus(); },
    onUpdate: value => { updateAvailable = value.available; if (value.blocked && value.message) reportNotice(value.message); updateReleaseStatus(); },
  });
  else { offlineLabel = "Development mode · offline cache unavailable"; updateReleaseStatus(); }
}
window.matchMedia("(max-width: 700px)").addEventListener("change", () => {
  syncToolboxTrigger();
  if (dirty || busy || operationPending) return;
  // CSS adapts editors without discarding their open picker or unsaved draft.
  if (page === "home") {
    if (document.querySelector(".timesheets-ui")) page = "timesheets";
    render();
  }
  else if (page === "job" && tab === "Devices" && !selectedAsset) {
    const job = currentJob();
    if (job && $("#device-grid-results")) {
      devicePage = 0;
      updateDeviceGrid(job, drawingOf(siteOf(job), job));
    }
  }
});
init();
