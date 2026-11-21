/** Engineer-recorded preparation for draft visit documents, not a standards certificate. */
import { disciplineLabel, jobTypeLabel, validateJobClassification } from "./job-options.js";

const STATES = ["Not recorded", "Recorded", "Not applicable"];
const MAX_HISTORY = 100;
const fields = [
  ["engineer", "Responsible engineer", "text"],
  ["company", "Company / issuing organisation", "text"],
  ["visitDate", "Actual visit date", "date"],
  ["standard", "Applicable standard and edition", "text"],
  ["premisesScope", "Premises and system scope", "text"],
  ["scope", "Work boundary / scope", "textarea"],
  ["limitations", "Limitations / variations", "textarea"],
  ["conditionLeft", "Condition left", "textarea"],
  ["nextActions", "Next actions / recommendations", "textarea"],
];
const common = [
  ["scope-access", "Scope, access and site arrangements recorded"],
  ["device-evidence", "Device results, readings and defects recorded"],
  ["handover", "Condition left and handover information recorded"],
];
const disciplines = {
  Fire: [
    ["fire-system", "System category, coverage and drawing references recorded"],
    ["fire-functions", "Relevant alarm, control and interface checks recorded"],
    ["fire-supply", "Relevant power supply and standby observations recorded"],
  ],
  Intruder: [
    ["intruder-scope", "System grade, agreed coverage and signalling scope recorded"],
    ["intruder-functions", "Relevant detection, warning and transmission checks recorded"],
  ],
  CCTV: [
    ["cctv-purpose", "Agreed camera coverage and operational purpose recorded"],
    ["cctv-evidence", "Relevant image, recording, playback and time checks recorded"],
  ],
  "Access control": [
    ["access-boundary", "Controlled doors, permissions and work boundary recorded"],
    ["access-functions", "Relevant access, release and interface checks recorded"],
  ],
  Security: [
    ["security-scope", "Security systems included in this visit identified"],
    ["security-checks", "Agreed system checks and evidence references recorded"],
  ],
  Custom: [
    ["custom-scope", "Custom system purpose and agreed checks recorded"],
    ["custom-evidence", "Supporting evidence and specialist requirements recorded"],
  ],
};
const types = {
  Maintenance: [["maintenance-schedule", "Maintenance scope and work actually performed recorded"]],
  "Small works": [
    ["alteration-boundary", "Altered equipment / circuits and unchanged system boundary recorded"],
    ["alteration-records", "Affected tests and revised drawing references recorded"],
  ],
  Install: [
    ["install-responsibility", "Installation responsibility and any separate design / commissioning roles recorded"],
    ["install-handover", "Installed equipment, verification evidence and handover documents recorded"],
  ],
  "Take over visit": [
    ["takeover-baseline", "Existing condition, available records and unknown information recorded"],
    ["takeover-actions", "Outstanding defects and agreed takeover actions recorded"],
  ],
  "Call out": [
    ["callout-fault", "Reported fault, investigation and work performed recorded"],
    ["callout-outcome", "Restoration checks or remaining fault / restriction recorded"],
  ],
  Custom: [["custom-work", "Custom work requested, evidence and outcome recorded"]],
};
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sameClassification = (a, b) => ["discipline", "customDiscipline", "workType", "customWorkType"].every((key) => (a?.[key] || "") === (b?.[key] || ""));
const classification = (job) => validateJobClassification(job);
const resolvedDiscipline = (job) => job.discipline || (job.workType === "Fire alarm maintenance" ? "Fire" : "Custom");
const resolvedType = (job) => job.workType === "Fire alarm maintenance" ? "Maintenance" : job.workType === "General fault or repair work" ? "Call out" : job.workType || "Custom";
export function checklistPrompts(job) {
  return [...common, ...(disciplines[resolvedDiscipline(job)] || disciplines.Custom), ...(types[resolvedType(job)] || types.Custom)].map(([id, label]) => ({ id, label }));
}
const candidateReference = (job) => ({
  Fire: "For non-domestic fire alarms: BS 5839-1:2025. Confirm the premises scope; domestic systems need a different selection.",
  Intruder: "References to check: PD 6662:2017 and BS EN 50131-1:2006+A3:2020. Monitoring, police response and maintenance can add requirements.",
  CCTV: "Reference to check: BS EN 62676-4:2015. Confirm operational requirements and any detector-activated or remote-monitoring scope.",
  "Access control": "Reference to check: BS EN 60839-11-2:2015. Confirm door escape, fire-interface and scheme requirements separately.",
}[resolvedDiscipline(job)] || "Identify the actual system and applicable standard; Security and Custom do not select a certificate standard.");
function object(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !keys.includes(key)))
    throw Error(`${label} has an invalid structure.`);
}
function text(value, label, max = 10000, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()))
    throw Error(`${label} must be ${required ? "nonempty " : ""}text of at most ${max} characters.`);
  return value.trim();
}
function snapshot(value) {
  object(value, "Checklist record", ["templateVersion", "revision", "classification", "fields", "entries", "savedAt", "drawingId", "drawingRevision", "basedOnJobRevision"]);
  if (value.templateVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1)
    throw Error("Checklist template or revision is unsupported.");
  object(value.classification, "Checklist classification", ["discipline", "customDiscipline", "workType", "customWorkType"]);
  const selected = validateJobClassification(value.classification);
  const drawingId = text(value.drawingId, "Checklist drawing ID", 300, true);
  const drawingRevision = text(value.drawingRevision, "Checklist drawing revision", 300);
  if (!Number.isSafeInteger(value.basedOnJobRevision) || value.basedOnJobRevision < 1) throw Error("Checklist job revision is invalid.");
  object(value.fields, "Checklist details", fields.map(([key]) => key));
  const details = Object.fromEntries(fields.map(([key, label]) => [key, text(value.fields[key] ?? "", label)]));
  if (details.visitDate) {
    const date = new Date(`${details.visitDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(details.visitDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== details.visitDate)
      throw Error("Actual visit date must be a valid date.");
  }
  if (!Array.isArray(value.entries) || value.entries.length > 100) throw Error("Checklist entries must be a list of at most 100 records.");
  const ids = new Set();
  const entries = value.entries.map((entry) => {
    object(entry, "Checklist entry", ["id", "label", "state", "notes"]);
    const id = text(entry.id, "Checklist entry ID", 100, true);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id)) throw Error("Checklist entry IDs must be valid and unique.");
    ids.add(id);
    const label = text(entry.label, "Checklist prompt", 300, true);
    if (!STATES.includes(entry.state)) throw Error("Checklist entry state is invalid.");
    const notes = text(entry.notes ?? "", "Checklist notes");
    if (entry.state === "Not applicable" && !notes) throw Error(`Explain why “${label}” is not applicable.`);
    return { id, label, state: entry.state, notes };
  });
  const savedAt = text(value.savedAt, "Checklist saved time", 40, true);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(savedAt) || !Number.isFinite(Date.parse(savedAt))) throw Error("Checklist saved time is invalid.");
  return { templateVersion: 1, revision: value.revision, classification: selected, drawingId, drawingRevision, basedOnJobRevision: value.basedOnJobRevision, fields: details, entries, savedAt };
}
export function validateJobChecklist(value) {
  if (value === undefined) return undefined;
  object(value, "Checklist", ["version", "id", "templateVersion", "revision", "classification", "fields", "entries", "savedAt", "history", "drawingId", "drawingRevision", "basedOnJobRevision"]);
  if (value.version !== 1) throw Error("Checklist version is unsupported.");
  const id = text(value.id, "Checklist ID", 160, true);
  if (!Array.isArray(value.history) || value.history.length > MAX_HISTORY) throw Error(`Checklist history must contain at most ${MAX_HISTORY} records.`);
  const { version, id: ignored, history, ...current } = value;
  const record = snapshot(current);
  const previous = history.map(snapshot);
  const revisions = new Set();
  for (const old of previous) {
    if (old.revision >= record.revision || revisions.has(old.revision)) throw Error("Checklist history revisions must be unique and earlier than the current revision.");
    revisions.add(old.revision);
  }
  return { version: 1, id, ...record, history: previous };
}
export function createChecklistDraft(job) {
  const saved = validateJobChecklist(job.checklist);
  const selected = classification(job);
  const changed = saved && (!sameClassification(saved.classification, selected) || saved.drawingId !== job.drawingId);
  const history = structuredClone(saved?.history || []);
  if (changed) {
    if (history.length >= MAX_HISTORY) throw Error("Checklist history is full. Export this job before starting a separate visit.");
    const { version, id, history: ignored, ...previous } = saved;
    history.push(structuredClone(previous));
  }
  const prompts = checklistPrompts(job);
  const activeIds = new Set(prompts.map((entry) => entry.id));
  const entries = prompts.map(({ id, label }) => {
    const old = !changed && saved?.entries.find((entry) => entry.id === id);
    return old ? { ...old, label } : { id, label, state: "Not recorded", notes: "" };
  });
  if (!changed) entries.push(...(saved?.entries || []).filter((entry) => !activeIds.has(entry.id)).map((entry) => ({ ...entry })));
  return {
    version: 1,
    id: saved?.id || crypto.randomUUID(),
    templateVersion: 1,
    revision: saved?.revision || 0,
    classification: selected,
    drawingId: job.drawingId,
    drawingRevision: saved?.drawingId === job.drawingId ? saved.drawingRevision : "",
    basedOnJobRevision: job.revision || 1,
    fields: Object.fromEntries(fields.map(([key]) => [key, saved ? saved.fields[key] : (key === "engineer" ? job.engineer || "" : key === "scope" ? job.scope || job.workflow?.details?.description || "" : "")])),
    entries,
    savedAt: saved?.savedAt || "",
    history,
  };
}
export function checklistReportTitle(job) {
  const discipline = disciplineLabel(job) || (job.workType === "Fire alarm maintenance" ? "Fire" : "System");
  const type = jobTypeLabel(job) || "Visit";
  return `Draft ${discipline} ${type.toLocaleLowerCase()} report`;
}
export function checklistProgress(job) {
  const saved = validateJobChecklist(job.checklist);
  const prompts = checklistPrompts(job);
  const needsReview = !!saved && (!sameClassification(saved.classification, classification(job)) || saved.drawingId !== job.drawingId);
  const active = !needsReview && saved ? prompts.map((prompt) => saved.entries.find((entry) => entry.id === prompt.id) || { ...prompt, state: "Not recorded" }) : prompts.map((prompt) => ({ ...prompt, state: "Not recorded" }));
  const gaps = active.filter((entry) => entry.state === "Not recorded").map((entry) => entry.label);
  if (!saved) gaps.unshift("Save this visit checklist.");
  if (needsReview) gaps.unshift("The discipline, job type or drawing changed. Review and save a new checklist revision.");
  for (const [key, label] of fields) if (!saved?.fields[key]?.trim()) gaps.push(label);
  const counts = { notTested: 0, unsatisfactory: 0, inaccessible: 0, notApplicable: 0 };
  for (const result of job.results || []) {
    if (result.state === "Not tested") counts.notTested++;
    if (result.state === "Unsatisfactory") counts.unsatisfactory++;
    if (result.state === "Inaccessible") counts.inaccessible++;
    if (result.state === "Not applicable") counts.notApplicable++;
  }
  if (counts.notTested) gaps.push(`${counts.notTested} device results remain Not tested. Record the outcome or explain the limitation.`);
  if (!(job.results || []).length) gaps.push("No device results are included. Confirm the equipment and scope.");
  return { total: active.length, recorded: active.filter((entry) => entry.state === "Recorded").length, notApplicable: active.filter((entry) => entry.state === "Not applicable").length, needsReview, saved: !!saved, gaps, counts };
}
const detailField = (key, label, type, value) => `<label>${esc(label)}${type === "textarea" ? `<textarea name="${key}" rows="2" maxlength="10000">${esc(value)}</textarea>` : `<input name="${key}" type="${type}" maxlength="10000" value="${esc(value)}">`}</label>`;
export function renderJobChecklist({ site, job, onSave, onDirty = () => {}, onNavigate = () => {} }) {
  const root = document.createElement("section");
  root.className = "job-checklist panel";
  let disposed = false, saving = false;
  let draft = createChecklistDraft(job);
  let current = job;
  const status = checklistProgress(job);
  const known = new Set(checklistPrompts(job).map((entry) => entry.id));
  root.innerHTML = `<div class="section-head"><div><span class="eyebrow">FINALISATION</span><h2>Quick job checklist</h2></div><span class="checklist-count">${status.recorded + status.notApplicable} / ${status.total} recorded or excluded</span></div><p class="checklist-intro">${esc(disciplineLabel(job) || "System")} · ${esc(jobTypeLabel(job) || "Visit")} · ${esc(site.name)}. Record what you actually checked. These prompts do not pass equipment.</p><p class="checklist-boundary">Draft documents only. Templates and compliance rules have not been validated against the full applicable standards.</p>${status.needsReview ? '<p class="notice">The job classification or drawing changed. Review these prompts; the previous checklist is retained in history.</p>' : ""}<div class="checklist-error notice error" role="alert" hidden></div><form data-checklist-form data-dirty="false"><fieldset class="checklist-fields"><legend class="sr-only">Visit checklist</legend><div class="checklist-grid">${draft.entries.filter((entry) => known.has(entry.id)).map((entry) => `<article class="checklist-item" data-entry="${esc(entry.id)}"><label>${esc(entry.label)}<select name="state:${esc(entry.id)}" aria-label="${esc(entry.label)}">${STATES.map((state) => `<option${entry.state === state ? " selected" : ""}>${state}</option>`).join("")}</select></label><details${entry.notes || entry.state === "Not applicable" ? " open" : ""}><summary>Notes / reason</summary><label>Notes for ${esc(entry.label)}<textarea name="notes:${esc(entry.id)}" maxlength="10000" rows="2"${entry.state === "Not applicable" ? " required" : ""}>${esc(entry.notes)}</textarea></label></details></article>`).join("")}</div><details class="checklist-visit-details"><summary>Visit details & work boundary</summary><div class="checklist-detail-grid">${fields.map(([key, label, type]) => detailField(key, label, type, draft.fields[key])).join("")}</div><p class="muted checklist-reference">${esc(candidateReference(job))}</p><p class="muted">Use the actual visit date. State “None identified” only when that is true. Confirm the standard and edition for this system and scope.</p></details>${draft.history.length || draft.entries.some((entry) => !known.has(entry.id)) ? `<details><summary>Retained earlier checklist records</summary><p>${draft.history.length} prior checklist revision(s) retained in the job export.</p>${draft.entries.filter((entry) => !known.has(entry.id)).map((entry) => `<p>${esc(entry.label)} · ${esc(entry.state)}${entry.notes ? `<br>${esc(entry.notes)}` : ""}</p>`).join("")}</details>` : ""}<div class="actions"><button type="submit" class="primary">Save checklist</button></div></fieldset></form><div class="checklist-evidence"><strong>Device evidence</strong><p>${status.counts.notTested} Not tested · ${status.counts.unsatisfactory} Unsatisfactory · ${status.counts.inaccessible} Inaccessible · ${status.counts.notApplicable} Not applicable</p><button type="button" data-checklist-action="Devices">Review device results</button></div><details class="checklist-gaps"><summary>${status.gaps.length} item(s) to review in this draft report</summary><ul>${status.gaps.map((gap) => `<li>${esc(gap)}</li>`).join("")}</ul><p>Completing this checklist does not establish compliance. Defects and limitations remain reportable.</p></details><div class="actions checklist-document-actions"><button type="button" data-checklist-action="print">Print draft report</button><button type="button" data-checklist-action="export">Export job & records</button></div><p class="checklist-save-state" role="status">${job.checklist ? `Checklist revision ${job.checklist.revision} saved on this device.` : "Checklist not saved yet."}</p>`;
  const form = root.querySelector("form");
  const fieldset = root.querySelector("fieldset");
  const error = root.querySelector(".checklist-error");
  function dirty() {
    form.dataset.dirty = "true";
    onDirty(true);
    root.querySelector(".checklist-save-state").textContent = "Unsaved checklist changes";
  }
  form.addEventListener("input", dirty);
  form.addEventListener("change", (event) => {
    dirty();
    const item = event.target.closest("[data-entry]");
    if (item && event.target.tagName === "SELECT") {
      const required = event.target.value === "Not applicable";
      item.querySelector("textarea").required = required;
      if (required) item.querySelector("details").open = true;
    }
  });
  root.querySelectorAll("[data-checklist-action]").forEach((button) => {
    button.onclick = () => { if (!saving && !disposed) onNavigate(button.dataset.checklistAction); };
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (saving || disposed) return;
    error.hidden = true;
    try {
      const data = new FormData(form);
      const next = structuredClone(draft);
      for (const [key] of fields) next.fields[key] = String(data.get(key) || "");
      for (const entry of next.entries) if (known.has(entry.id)) {
        entry.state = String(data.get(`state:${entry.id}`) || "Not recorded");
        entry.notes = String(data.get(`notes:${entry.id}`) || "");
      }
      next.revision = (current.checklist?.revision || 0) + 1;
      next.savedAt = new Date().toISOString();
      next.drawingId = job.drawingId;
      next.drawingRevision = String(site.drawings?.find((record) => record.id === job.drawingId)?.revision || "");
      next.basedOnJobRevision = job.revision + 1;
      const checked = validateJobChecklist(next);
      saving = true;
      fieldset.disabled = true;
      root.querySelectorAll("[data-checklist-action]").forEach((button) => { button.disabled = true; });
      const saved = await onSave(checked);
      if (saved !== true) throw Error("Checklist was not saved. Your entries remain here; try again.");
      current = { ...current, checklist: checked };
      draft = createChecklistDraft(current);
      form.dataset.dirty = "false";
      onDirty(false);
      if (!disposed) {
        root.querySelector(".checklist-save-state").textContent = `Checklist revision ${checked.revision} saved on this device.`;
        const progress = checklistProgress(current);
        root.querySelector(".checklist-count").textContent = `${progress.recorded + progress.notApplicable} / ${progress.total} recorded or excluded`;
        const gaps = root.querySelector(".checklist-gaps");
        gaps.querySelector("summary").textContent = `${progress.gaps.length} item(s) to review in this draft report`;
        gaps.querySelector("ul").innerHTML = progress.gaps.map((gap) => `<li>${esc(gap)}</li>`).join("");
      }
    } catch (cause) {
      if (!disposed) {
        error.textContent = cause.message || "Checklist could not be saved.";
        error.hidden = false;
      }
    } finally {
      saving = false;
      if (!disposed) {
        fieldset.disabled = false;
        root.querySelectorAll("[data-checklist-action]").forEach((button) => { button.disabled = false; });
      }
    }
  };
  root.dispose = () => { disposed = true; };
  return root;
}
export function renderChecklistReport(site, job) {
  const root = document.createElement("section");
  root.className = "checklist-report";
  const saved = validateJobChecklist(job.checklist);
  const progress = checklistProgress(job);
  const drawing = site.drawings?.find((entry) => entry.id === job.drawingId);
  root.innerHTML = `<h2>Saved checklist & document details</h2><p><strong>Draft — not a validated compliance certificate.</strong> Engineer review and an approved template are required before certificate issue.</p><dl><dt>Site ID</dt><dd>${esc(site.id)}</dd><dt>Job ID / revision</dt><dd>${esc(job.id)} / ${esc(job.revision)}</dd><dt>Drawing ID / revision</dt><dd>${esc(job.drawingId)} / ${esc(drawing?.revision || "Not recorded")}</dd></dl>${saved ? `<p>Checklist ${esc(saved.id)} · revision ${saved.revision} · saved ${esc(saved.savedAt)}</p><p>Saved checklist drawing: ${esc(saved.drawingId)} / ${esc(saved.drawingRevision || "Unlabelled")} · supporting job revision ${saved.basedOnJobRevision}</p>${progress.needsReview ? '<p><strong>The job classification or drawing changed since this checklist was saved. These records require review.</strong></p>' : ""}<dl>${fields.filter(([key]) => saved.fields[key]).map(([key, label]) => `<dt>${esc(label)}</dt><dd>${esc(saved.fields[key])}</dd>`).join("")}</dl><table><thead><tr><th>Recorded check</th><th>State</th><th>Notes / exclusion reason</th></tr></thead><tbody>${saved.entries.map((entry) => `<tr><td>${esc(entry.label)}</td><td>${esc(entry.state)}</td><td>${esc(entry.notes)}</td></tr>`).join("")}</tbody></table>${saved.history.length ? `<p>${saved.history.length} prior checklist revision(s) retained in the job package.</p>` : ""}` : "<p>No checklist has been saved for this job.</p>"}<h3>Information still to review</h3>${progress.gaps.length ? `<ul>${progress.gaps.map((gap) => `<li>${esc(gap)}</li>`).join("")}</ul>` : "<p>No empty checklist fields. Template validation and engineer review are still required.</p>"}<p>Device outcomes are reported separately. Checklist completion is not a satisfactory result or a declaration that the whole system complies.</p>`;
  return root;
}
