import "./style.css";
import "./mobile-job.css";
import "./mobile-shell.css";
import "./job-fields.css";
import "./site-profile.css";
import { renderSiteProfile, validateSiteProfile } from "./site-profile.js";
import { DISCIPLINES, JOB_TYPES, disciplineLabel, jobTypeLabel } from "./job-options.js";
import "./job-create.css";
import "./job-checklist.css";
import { renderJobChecklist, renderChecklistReport, checklistReportTitle, validateJobChecklist } from "./job-checklist.js";
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
import { renderJobNotes, renderNotesReport, validateNotesDocument } from "./job-notes.js";
import { renderJobSettings, effectiveJob, adoptSiteSettings, captureJobOverrides } from "./job-settings.js";
import "./hold-to-edit.css";
import { attachHoldToEdit } from "./hold-to-edit.js";
import { renderMobileWorkspace } from "./mobile-shell.js";
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
import { renderWorkflowSection, renderWorkflowReport } from "./job-workflow.js";
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
let state = { sites: [], jobs: [] },
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
  drawingOf = (s, j) => s?.drawings.find((d) => d.id === j?.drawingId),
  currentJob = () => draftJob?.id === activeJob ? draftJob : state.jobs.find((job) => job.id === activeJob);
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
function flash(text, isError = false) {
  message = isError ? "" : text;
  error = isError ? text : "";
  render();
}
async function persist(next, success) {
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
    dirty = false;
    saveLabel = draftJob && !next.jobs.some(job => job.id === draftJob.id) ? "Not saved yet" : "Saved on this device";
    error = "";
    message = success || "";
    return true;
  } catch (e) {
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
}
function bindActions(root = document) {
  root.querySelectorAll("[data-action]").forEach((el) => {
    el.onclick = (event) => {
      event.preventDefault();
      runTask(() => action(el.dataset.action));
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
async function saveWorkflow(updatedJob) {
  const original = currentJob();
  return saveJob(captureJobOverrides(original, updatedJob, siteOf(original)));
}
async function saveJob(updatedJob, afterTab = null) {
  if (operationPending) return false;
  operationPending = true;
  updateInteractionLock();
  try {
    const next = structuredClone(state);
    const index = next.jobs.findIndex((j) => j.id === updatedJob.id);
    if (index < 0 && updatedJob.id !== draftJob?.id) throw Error("This job is no longer available.");
    const saved = {
      ...updatedJob,
      revision: index < 0 ? 1 : next.jobs[index].revision + 1,
      updatedAt: now(),
    };
    if (index < 0) next.jobs.push(saved);
    else next.jobs[index] = saved;
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
  if (!(await persist(next))) return false;
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
  }${drawing.kind === "issued" ? '<span class="muted">Issued record is read-only. Import a working drawing to edit.</span>' : button("Edit site", "edit-site", "primary")}</div><p class="muted" data-testid="zone-connection-status">${esc(handoffStatus || "Open the linked Zone Sketch editor, then use Save to Jobs to return your changes.")}</p></div>`;
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
function render() {
  const previousPlan = document.querySelector('.plan-preview');
  const planScroll = previousPlan ? { x: window.scrollX, y: window.scrollY } : null;
  if (previousPlan?.dataset.viewKey && previousPlan.getViewState)
    planViews.set(previousPlan.dataset.viewKey, previousPlan.getViewState());
  document.querySelector(".workflow-module")?.disposeHoldToEdit?.();
  document.querySelector(".job-checklist")?.dispose?.();
  document.querySelector(".job-notes")?.dispose?.();
  document.querySelector(".job-settings")?.dispose?.();
  document.querySelector(".device-remarks")?.dispose?.();
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
  const headerSite = page === "job" && j && s
    ? `<button type="button" class="job-site-link" data-action="site:${esc(s.id)}" title="Open site folder"><strong>${esc(siteLabel(s))}</strong></button>`
    : `<strong>${esc(s ? siteLabel(s) : j ? j.workflow?.details?.title || "Job notes" : "Jobs")}</strong>`;
  const sidebar = `<aside class="sidebar"><a class="brand" href="#" data-action="home"><span class="brand-icon">▤</span> Jobs<span class="version">01</span></a><div class="side-caption">FIELD WORKSPACE</div><nav>${button("▦ &nbsp; Overview", "home", page === "home" ? "nav active" : "nav")}${button("⌂ &nbsp; Sites", "sites", page === "sites" ? "nav active" : "nav")}${button("+ &nbsp; Create job", "create", "nav")}</nav><div class="side-bottom"><span class="dot"></span> Local workspace<p>Your work stays on this device.<br>Export jobs to keep a backup.</p></div></aside>`;
  $("#app").innerHTML =
    `${mobileHome ? "" : sidebar}<div class="workspace"><header><div><span class="eyebrow">${j ? "JOB / " + esc(j.id.slice(0, 8)) : "YOUR FIELD WORKSPACE"}</span>${headerSite}</div><div class="connection"><span data-testid="save-status">${esc(saveLabel)}</span><small id="offline-status">${esc(offlineLabel)}</small></div></header><main><div id="notice" role="status" class="${error ? "notice error" : message ? "notice" : ""}">${esc(error || message)}</div>${page === "home" ? home() : page === "sites" ? sites() : page === "site" ? siteView(s) : page === "review" ? importReview() : jobView(j, s)}</main><footer>JOBS / LOCAL FIRST <span>Version 0.1 · Engineer-confirmed records</span></footer></div><input id="zone-file" type="file" accept=".json,.zonesketch,application/json" hidden><input id="job-file" type="file" accept=".json,application/json" hidden>`;
  bindActions();
  document.body.dataset.page = page;
  document.body.dataset.jobTab = page === "job" ? tab : "";
  if (page === "home" && $("#mobile-workspace-root")) {
    $("#mobile-workspace-root").append(
      renderMobileWorkspace({
        state: { ...state, jobs: state.jobs.map(job => effectiveJob(job, siteOf(job))) },
        onAction: (value) => runTask(() => action(value)),
      }),
    );
  }
  updateInteractionLock();
  $("#zone-file").onchange = (e) => runTask(() => readZone(e.target.files[0]));
  $("#job-file").onchange = (e) => runTask(() => readJob(e.target.files[0]));
  document.querySelectorAll("form").forEach((f) => {
    f.addEventListener("input", () => {
      f.dataset.dirty = "true";
      dirty = true;
      saveLabel = "Unsaved changes";
      updateStatus();
    });
  });
  document.querySelectorAll("form").forEach(
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
              ["print", "export", "import-job-plan"].includes(destination)
                ? destination
                : "tab:" + destination,
            ),
          ),
      }),
    );
  }
  if (page === "job" && rawJob && $("#notes-root")) {
    $("#notes-root").append(renderJobNotes({
      job: rawJob,
      onSave: (document, title) => saveJob({
        ...rawJob,
        notesDocument: validateNotesDocument(document),
        workflow: { ...rawJob.workflow, version: 1, details: { ...rawJob.workflow?.details, title } },
      }),
      onDirty: markDirty,
      onNavigate: (destination) => runTask(() => action(destination === "settings" ? "job-settings:" + rawJob.id : "tab:" + destination)),
    }));
  }
  if (page === "job" && rawJob && $("#job-settings-root")) {
    $("#job-settings-root").append(renderJobSettings({
      job: rawJob,
      sites: state.sites,
      onDirty: markDirty,
      onSave: (updated, siteId) => {
        const selected = state.sites.find((site) => site.id === siteId);
        return saveJob(selected ? attachJobToSite(updated, selected) : updated, "Notes");
      },
    }));
  }
  if (page === "job" && j && $("#job-report-root"))
    $("#job-report-root").append(jobReport(s, j));
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
  if (page === "job" && tab === "Plan" && j && s && $("#plan-root")) {
    mountPlanPreview("#plan-root", drawingOf(s, j), {
        renderAssetCard: draftJob ? undefined : planAssetCard,
        onBeforeNavigate: beforePlanNavigate,
        onPreviewsReady: (drawing) => savePreviewCache(s.id, drawing),
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
  if (changedRoute) window.scrollTo(0, 0);
  else if (planScroll) window.scrollTo(planScroll.x, planScroll.y);
}
function home() {
  if (window.matchMedia("(max-width: 700px)").matches)
    return '<div id="mobile-workspace-root"></div>';
  const open = state.jobs.filter((j) => j.status !== "Complete").length;
  return `<section class="page-title"><div><span class="eyebrow">READY FOR THE NEXT VISIT</span><h1>Your workspace.</h1><p>Prepare the job. Record the work. Keep the evidence.</p></div>${button("+ Create job", "create", "primary")}</section><div class="metrics"><div><span>Saved jobs</span><strong>${state.jobs.length.toString().padStart(2, "0")}</strong></div><div><span>Open visits</span><strong>${String(open).padStart(2, "0")}</strong></div><div><span>Permanent sites</span><strong>${String(state.sites.length).padStart(2, "0")}</strong></div></div><section class="quick-actions" aria-label="Workspace actions"><button data-action="create" ><span class="tile-icon">+</span><strong>Create job</strong><small>Start a new site visit.</small><span class="arrow">→</span></button><button data-action="import-zone"><span class="tile-icon">⌑</span><strong>Import Zone Sketch</strong><small>Bring your site, plans and devices.</small><span class="arrow">→</span></button><button data-action="import-job"><span class="tile-icon">⇩</span><strong>Import job</strong><small>Reopen a job package and its evidence.</small><span class="arrow">→</span></button><button data-action="sites"><span class="tile-icon">⌂</span><strong>Sites</strong><small>Your asset records, across every visit.</small><span class="arrow">→</span></button></section><section><div class="section-head"><h2>Saved jobs <span class="count">${state.jobs.length}</span></h2><span class="muted">Stored on this device</span></div>${state.jobs.length ? `<div class="job-list">${state.jobs.map((j) => jobCard(j)).join("")}</div>` : `<div class="empty"><span class="empty-symbol">▤</span><h3>A clear start.</h3><p>Create a site or import a drawing to prepare your first visit.<br>Every new device result starts as Not tested.</p>${button("Explore demonstration site", "demo", "text-button")}</div>`}</section><div class="info-strip"><strong>Built for work on site.</strong><span>No account needed. Plans, photographs and records travel with your exported job.</span>${button("Protect local storage", "persist", "text-button")}</div>`;
}
function sites() {
  return `<section class="page-title"><div><span class="eyebrow">PERMANENT RECORDS</span><h1>Sites</h1><p>Open a site folder for its details, plans and job files.</p></div>${button("Import Zone Sketch", "import-zone")}</section><div class="two-column"><section class="panel"><h2>Create site manually</h2><form data-form="site">${field("Site name", "name", "", "text", true)}${area("Address", "address")}<button class="primary">Save site</button></form></section><section class="sites-grid">${state.sites.map((s) => `<button class="site-card" data-action="site:${esc(s.id)}"><strong>${esc(siteLabel(s))}</strong><span>${state.jobs.filter((j) => j.siteId === s.id).length} jobs · ${s.drawings.at(-1).assets.length} devices · ${s.drawings.length} drawing revisions</span><small>${esc(s.address || "Address not recorded")}</small></button>`).join("") || '<p class="muted">No sites saved yet.</p>'}</section></div>`;
}

function jobCard(rawJob, siteFolder = false) {
  const site = siteOf(rawJob), j = effectiveJob(rawJob, site);
  const title = j.workflow?.details?.title || (site ? siteFolder ? jobTypeLabel(j) || "Untitled job" : siteLabel(site) : "Untitled job");
  const subtitle = siteFolder
    ? `${j.workflow?.details?.reference || j.id.slice(0, 8)} · Plan ${drawingOf(site, j)?.revision || "Unlabelled"}`
    : site ? [jobTypeLabel(j), j.engineer || "Unassigned"].filter(Boolean).join(" · ") : "No site";
  return `<article class="job-card-shell"><button class="job-card" data-testid="${siteFolder ? "site-job-card" : "job-card"}" data-action="job:${esc(j.id)}"><span class="job-mark">▤</span><span><strong>${esc(title)}</strong><small>${j.importConflict ? "Preserved conflict · " : ""}${esc(subtitle)}</small></span><span class="job-meta">${badge(j.status)}<small>${esc(new Date(j.updatedAt).toLocaleDateString())}</small></span></button><button class="job-card-settings" data-testid="job-settings" data-action="job-settings:${esc(j.id)}" aria-label="Settings for ${esc(title)}" title="Job settings">${settingsIcon}</button></article>`;
}
function siteJobs(s) {
  const jobs = state.jobs.filter((j) => j.siteId === s.id);
  return `<section class="panel site-job-folder"><div class="section-head"><h2>Jobs in this site <span class="count">${jobs.length}</span></h2></div>${jobs.length ? `<div class="job-list">${jobs.map((j) => jobCard(j, true)).join("")}</div>` : '<p class="muted">No jobs yet. Create a job to start writing.</p>'}</section>`;
}

function siteView(s) {
  if (!s) return "";
  const d = s.drawings.at(-1);
  return `<section class="page-title"><div><span class="eyebrow">SITE / ${esc(s.id.slice(0, 8))}</span><h1>${esc(siteLabel(s))}</h1><p>${esc(s.address || "Address not recorded")} · ${d.assets.length} devices</p></div>${button("Create job", "create", "primary")}</section>${siteJobs(s)}<section class="panel site-plan-panel"><div class="section-head"><h2>Site plan</h2><div class="actions">${button("Import site plan", "import-site-plan")}${drawingConnection(d)}</div></div><div id="site-plan-root"></div></section><div class="two-column"><section class="panel"><div id="site-profile-root"></div>${s.importedMetadata?.length ? `<details><summary>Preserved imported site details (${s.importedMetadata.length})</summary>${s.importedMetadata.map((m) => `<p><strong>${esc(m.site.name)}</strong><br>${esc(m.site.address || "No address supplied")}<br><small>Import ${esc(m.fingerprint.slice(0, 12))}</small></p>`).join("")}<p class="muted">Current site details above were retained. Review these imported versions before editing.</p></details>` : ""}<h3>Drawings</h3>${s.drawings.map((d) => `<p>${esc(d.revision || "Unlabelled revision")} · ${d.floors.length} floors · ${d.assets.length} devices</p>`).join("")}<p class="muted">Earlier visits stay linked to their original drawing.</p></section><section class="panel"><h2>Add equipment manually</h2><form data-form="asset">${field("Device reference", "reference", "", "text", true)}${field("Device type", "type", "", "text", true)}${select(
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
  const tools = [...(s ? [["Job details", "Details"], ["Devices", "Devices"], ["Results", "Results"], ["Checklist", "Quick checklist"]] : []), ["Work", "Work"], ["Products", "Products"], ["POs", "POs"], ["Visit records", "Visit records"]];
  return `<details class="quick-job-tools"><summary>More job tools</summary><div class="quick-tool-grid">${tools.map(([key, label]) => button(label, "tab:" + key)).join("")}${s ? button("Site settings", "site:" + s.id) : ""}</div>${s ? `<div class="integration-note"><span>FINDR adapter: future work.</span>${button("Export Panel Pal context", "panel-export")}</div>` : ""}</details>`;
}
function jobView(j, s) {
  if (!j) return "";
  const d = drawingOf(s, j);
  const mainSection = ["Plan", "Devices", "Results"].includes(tab) ? "Plan" : ["Finalisation", "Checklist", "Visit records"].includes(tab) ? "Finalisation" : "Notes";
  const primary = `<nav class="job-main-nav quick-job-nav" aria-label="Job workflow">${["Notes", "Plan", "Finalisation"].map(label => button(label, "tab:" + label, label === mainSection ? "active" : "")).join("")}</nav>`;
  const top = `<div class="quick-job-top">${button("‹ Home", "home", "text-button job-home-link")}<button class="job-settings-icon" data-action="job-settings:${esc(j.id)}" aria-label="Job settings" title="Job settings">${settingsIcon}</button></div>`;
  let content;
  if (tab === "Notes") content = '<div id="notes-root"></div>';
  else if (tab === "Settings") content = `<div id="job-settings-root"></div>${jobTools(j, s)}`;
  else if (tab === "Finalisation") content = draftJob
    ? `<section class="panel"><h1>Finalisation</h1><p>Save your job to prepare its report.</p>${button("Return to notes", "tab:Notes", "primary")}</section>`
    : `<section class="finalisation-actions"><div><span class="eyebrow">FINALISATION</span><h1>Job report</h1><p>Prepared from your saved notes, pictures and recorded work.</p></div><div class="actions">${button("Print report", "print", "primary")}${button("Export job", "export")}</div></section><div id="job-report-root" class="job-report-preview panel"></div>`;
  else if (["Job details", "Work", "Products", "POs", "Visit records"].includes(tab)) content = `<div class="quick-section-title"><h1>${esc(tab === "Job details" ? "Details" : tab)}</h1>${button("Settings & tools", "job-settings:" + j.id, "text-button")}</div><div id="workflow-root"></div>`;
  else if (tab === "Checklist" && s) content = '<div id="checklist-root"></div>';
  else if (tab === "Plan" && d) content = `<section class="plan-actions panel"><div><h1>Plan</h1><p>Drawing ${esc(d.revision || "Unlabelled")}</p></div>${draftJob ? '<p class="muted">Save the job before recording work on this plan.</p>' : `<div class="actions">${button("Import Zone Sketch plan", "import-job-plan")}${button("Devices", "tab:Devices")}${button("Results", "tab:Results")}</div><details><summary>Drawing tools</summary>${drawingConnection(d)}<div class="actions">${button("Export editable drawing", "edited-source-export")}${d.source ? button("Original drawing", "source-export") : ""}</div></details>`}</section><div id="plan-root" class="panel"></div>`;
  else if (tab === "Devices" && d) content = devices(j, d);
  else if (tab === "Results" && d) content = results(j, d);
  else content = `<section class="panel empty-job-plan"><h1>Site plan</h1><p>Add a site in job settings to use its saved plan and equipment.</p>${button("Choose site", "job-settings:" + j.id, "primary")}</section>`;
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
  row.innerHTML = `<button class="plan-asset-name" data-action="asset:${esc(asset.id)}" aria-label="${esc(reference)}"><strong>${esc(reference)}</strong><small>${esc(asset.typeName || asset.type)}${positioned ? "" : " · Position not recorded"}</small></button>${resultButtons(asset, result, "plan-inline-results")}<button class="plan-asset-edit" data-action="edit-defects:${esc(asset.id)}" aria-label="Edit defects for ${esc(reference)}" title="Edit defects">${pencilIcon}</button>${resultReason(asset.id)}`;
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
  const record = `    <details class="device-context"><summary>Drawing details &amp; photographs (${a.photos?.length || 0})</summary><p class="muted">Drawing status: ${esc(a.drawingStatus || "Not supplied")} · Manufacturer / model / loop / address: not confirmed</p>${photos(a.photos, "Drawing photograph")}</details>
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
async function action(a) {
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
  if (dirty) {
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
    if (!confirm("Leave this form and discard unsaved changes?")) return;
    dirty = false;
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
  if (a === "home" || a === "sites") {
    page = a;
    draftJob = null;
    activeJob = null;
    activeSite = null;
    saveLabel = "Saved on this device";
    importTargetJob = null;
    importTargetSite = null;
    message = "";
    error = "";
    render();
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
    if (draftJob && !["Notes", "Plan", "Finalisation", "Settings"].includes(a.slice(4)))
      throw Error("Save this job before recording detailed work.");
    tab = a.slice(4);
    if (tab === "Devices") selectedAsset = null;
    render();
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
  if (draftJob && ["export", "print", "panel-export", "source-export", "edited-source-export"].includes(a))
    throw Error("Save this job first.");
  if (a === "edited-source-export")
    return download(
      buildEditableZoneSketch(drawingOf(s, j), { siteName: s.name }),
      "working-drawing.zonesketch.json",
    );
  if (a === "source-export")
    return download(drawingOf(s, j).source, "original.zonesketch.json");
  if (a === "export")
    return download(await createJobPackage(s || null, rawJob), `job-${j.id}.jobs.json`);
  if (a === "panel-export")
    return download(panelContext(s, j), `job-${j.id}.panel-context.json`);
  if (a === "print") {
    printReport(s, j);
    return;
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
function download(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function jobReport(s, j) {
  const d = drawingOf(s, j), report = document.createElement("section");
  report.className = "job-report-content";
  report.innerHTML = `<div class="report-heading"><span class="eyebrow">DRAFT SERVICE REPORT</span><h1>${esc(j.workflow?.details?.title || (disciplineLabel(j) ? checklistReportTitle(j) : "Job report"))}</h1>${s ? `<h2>${esc(s.name)}</h2>${s.address ? `<p>${esc(s.address)}</p>` : ""}` : ""}<p>${[disciplineLabel(j), jobTypeLabel(j), j.engineer].filter(Boolean).map(esc).join(" · ")}</p><small>Job ${esc(j.id)} · revision ${j.revision}${d ? ` · drawing ${esc(d.revision)}` : ""}${s?.profileRevision ? ` · site settings ${s.profileRevision}` : ""}</small></div>`;
  report.append(renderNotesReport(j));
  const detail = document.createElement("section");
  detail.innerHTML = `${j.scope ? `<h3>Scope</h3><p>${esc(j.scope)}</p>` : ""}${j.instructions ? `<h3>Instructions</h3><p>${esc(j.instructions)}</p>` : ""}${j.visitNotes ? `<h3>Visit notes / condition left</h3><p>${esc(j.visitNotes)}</p>` : ""}`;
  report.append(detail, renderWorkflowReport(j));
  if (j.checklist && s) report.append(renderChecklistReport(s, j));
  if (d && j.results.length) {
    const evidence = document.createElement("section");
    evidence.innerHTML = results(j, d);
    report.append(evidence);
  }
  const footer = document.createElement("p");
  footer.className = "report-disclaimer";
  footer.textContent = "Draft service report. Not a certificate of compliance. Engineer review required.";
  report.append(footer);
  return report;
}
function printReport(s, j) {
  const print = jobReport(s, j);
  print.id = "print-report";
  document.body.append(print);
  window.print();
  print.remove();
}

window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
async function init() {
  try {
    state = await loadState();
    storageReady = true;
    saveLabel = "Saved on this device";
    if (
      state.sites.some((site) =>
        site.drawings.some((drawing) => !Array.isArray(drawing.planPreviews)),
      )
    ) {
      await persist(structuredClone(state));
    }
  } catch (e) {
    saveLabel = "Local storage unavailable";
    error = `Could not open local records: ${e.message}`;
  }
  render();
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    try {
      await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            resolve,
            { once: true },
          ),
        );
      offlineLabel = "Ready offline";
    } catch (e) {
      offlineLabel = "Offline preparation failed";
    }
  } else offlineLabel = "Development mode · offline cache unavailable";
  const status = $("#offline-status");
  if (status) status.textContent = offlineLabel;
}
window.matchMedia("(max-width: 700px)").addEventListener("change", () => {
  if (dirty || busy || operationPending) return;
  // CSS adapts editors without discarding their open picker or unsaved draft.
  if (page === "home") render();
  else if (page === "job" && tab === "Devices" && !selectedAsset) {
    const job = currentJob();
    if (job && $("#device-grid-results")) {
      devicePage = 0;
      updateDeviceGrid(job, drawingOf(siteOf(job), job));
    }
  }
});
init();
