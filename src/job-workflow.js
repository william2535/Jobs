/** Local editable visit workflow. No supplier submission, certification or AI actions. */
const clone = (value) => structuredClone(value);
const arrays = [
  "appointments",
  "tasks",
  "products",
  "purchaseOrders",
  "timesheets",
  "timeline",
];
const detailFields = [
  "reference",
  "title",
  "description",
  "client",
  "contactName",
  "contactPhone",
  "contactEmail",
  "accessHours",
  "accessProcedure",
  "authorizationRef",
  "authorizationName",
  "authorizationDate",
  "authorizationNote",
  "internalNote",
  "quoteRef",
  "safetyRequirements",
  "serviceRequirements",
];
const statusValues = ["Open", "In progress", "Complete"];
const poStates = ["Draft", "Submitted externally", "Billed"];
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const localDateTime = (value) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${name} must be an object.`);
}
function text(value, name, required = false) {
  if (
    typeof value !== "string" ||
    value.length > 10000 ||
    (required && !value.trim())
  )
    throw Error(
      `${name} must be ${required ? "nonempty " : ""}text of at most 10,000 characters.`,
    );
  return value;
}
function number(value, name, optional = false) {
  if (value === "" || value === null || value === undefined) {
    if (optional) return null;
    throw Error(`${name} is required.`);
  }
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0)
    throw Error(`${name} must be a finite number of zero or more.`);
  return n;
}
function date(value, name) {
  text(value, name);
  if (
    value &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value)
  )
    throw Error(`${name} must be a valid date.`);
  return value;
}
function time(value, name) {
  text(value, name);
  if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw Error(`${name} must use HH:mm.`);
  return value;
}
function boolean(value, name) {
  if (typeof value !== "boolean") throw Error(`${name} must be true or false.`);
  return value;
}
function currency(value) {
  value = value || "GBP";
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
    throw Error("Currency must be a three-letter code, such as GBP.");
  return value;
}
function duration(start, end) {
  const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  if (minutes(end) < minutes(start))
    throw Error(
      "End time must be after start time. Record overnight work as separate dated entries.",
    );
  return Math.round(((minutes(end) - minutes(start)) / 60) * 100) / 100;
}
function recordFor(collection, value) {
  object(value, collection);
  const r = { ...clone(value), id: value.id === undefined ? uid() : value.id };
  text(r.id, "Record ID", true);
  if (collection === "appointments") {
    r.date = date(r.date ?? "", "Appointment date");
    r.start = time(r.start ?? "", "Start time");
    r.end = time(r.end ?? "", "End time");
    r.engineer = text(r.engineer ?? "", "Engineer");
    r.note = text(r.note ?? "", "Appointment note");
    if (r.start && r.end) duration(r.start, r.end);
  } else if (collection === "tasks") {
    r.title = text(r.title, "Task title", true);
    r.required = boolean(r.required ?? false, "Required");
    r.complete = boolean(r.complete ?? false, "Complete");
    r.notes = text(r.notes ?? "", "Task notes");
  } else if (collection === "products") {
    r.description = text(r.description, "Product description", true);
    r.quantity = number(r.quantity, "Quantity");
    r.unit = text(r.unit || "each", "Unit", true);
    r.unitCost = number(r.unitCost, "Unit cost", true);
    r.currency = currency(r.currency);
    r.complete = boolean(r.complete ?? false, "Product completed");
  } else if (collection === "purchaseOrders") {
    r.reference = text(r.reference ?? "", "PO reference");
    r.supplier = text(r.supplier, "Supplier", true);
    r.status = r.status || "Draft";
    if (!poStates.includes(r.status))
      throw Error("Choose a supported purchase-order status.");
    r.date = date(r.date ?? "", "PO date");
    r.amount = number(r.amount, "PO amount", true);
    r.currency = currency(r.currency);
    r.notes = text(r.notes ?? "", "PO notes");
  } else if (collection === "timesheets") {
    r.date = date(r.date ?? "", "Work date");
    r.start = time(r.start ?? "", "Start time");
    r.end = time(r.end ?? "", "End time");
    r.note = text(r.note ?? "", "Time note");
    r.engineer = text(r.engineer ?? "", "Engineer");
    if (Boolean(r.start) !== Boolean(r.end))
      throw Error(
        "Enter both start and end time, or leave both empty and enter hours.",
      );
    const calculated = r.start && r.end ? duration(r.start, r.end) : null;
    r.hours = number(r.hours, "Hours", true) ?? calculated;
    if (r.hours === null) throw Error("Enter hours or a start and end time.");
  } else if (collection === "timeline") {
    for (const key of ["at", "action", "collection", "recordId", "summary"])
      r[key] = text(r[key] ?? "", `Timeline ${key}`);
  }
  return r;
}
export function validateWorkflow(value) {
  if (value === undefined || value === null) value = {};
  object(value, "Job workflow");
  if (value.version !== undefined && value.version !== 1)
    throw Error("Unsupported job workflow version.");
  if (value.details !== undefined) object(value.details, "Job details");
  if (value.finalisation !== undefined)
    object(value.finalisation, "Finalisation");
  const w = {
    ...clone(value),
    version: 1,
    details: { ...clone(value.details ?? {}) },
    finalisation: { ...clone(value.finalisation ?? {}) },
  };
  object(w.details, "Job details");
  object(w.finalisation, "Finalisation");
  for (const key of detailFields)
    w.details[key] = text(w.details[key] ?? "", key);
  w.details.estimatedHours = number(
    w.details.estimatedHours,
    "Estimated hours",
    true,
  );
  date(w.details.authorizationDate, "Authorisation date");
  for (const key of arrays) {
    if (value[key] !== undefined && !Array.isArray(value[key]))
      throw Error(`${key} must be a list.`);
    if ((value[key] || []).length > 5000)
      throw Error(`Too many ${key} records.`);
    w[key] = (value[key] || []).map((r) => {
      object(r, key);
      text(r.id, `${key} ID`, true);
      return recordFor(key, r);
    });
    if (new Set(w[key].map((r) => r.id)).size !== w[key].length)
      throw Error(`Duplicate ${key} IDs.`);
  }
  const f = w.finalisation;
  if (f.status !== undefined && !statusValues.includes(f.status))
    throw Error("Choose Open, In progress or Complete.");
  f.technicianNote = text(f.technicianNote ?? "", "Technician note");
  f.invoiceNote = text(f.invoiceNote ?? "", "Invoice note");
  if (f.clientAcknowledgement != null) {
    object(f.clientAcknowledgement, "Client acknowledgement");
    const a = f.clientAcknowledgement;
    a.name = text(a.name, "Acknowledgement name", true);
    a.recordedAt = text(a.recordedAt, "Acknowledgement time", true);
    a.note = text(a.note ?? "", "Acknowledgement note");
    if (!Number.isFinite(Date.parse(a.recordedAt)))
      throw Error("Acknowledgement time is invalid.");
  }
  return w;
}
export function normalizeWorkflow(job) {
  return validateWorkflow(job?.workflow);
}
export function updateWorkflow(job, collection, record) {
  const next = clone(job),
    w = normalizeWorkflow(job);
  let saved;
  if (collection === "details" || collection === "finalisation") {
    object(record, collection);
    w[collection] = { ...w[collection], ...clone(record) };
    saved = w[collection];
  } else if (arrays.includes(collection) && collection !== "timeline") {
    saved = recordFor(collection, record);
    const index = w[collection].findIndex((r) => r.id === saved.id);
    if (index < 0) w[collection].push(saved);
    else w[collection][index] = saved;
  } else throw Error("Unknown editable workflow section.");
  w.timeline.push({
    id: uid(),
    at: now(),
    action: "saved",
    collection,
    recordId: saved.id || "",
    summary: String(
      saved.title ||
        saved.description ||
        saved.supplier ||
        saved.reference ||
        collection,
    ).slice(0, 200),
  });
  next.workflow = validateWorkflow(w);
  if (collection === "finalisation" && record.status !== undefined)
    next.status = next.workflow.finalisation.status;
  return next;
}
export function removeWorkflowRecord(job, collection, id) {
  if (!arrays.includes(collection) || collection === "timeline")
    throw Error("This section cannot be removed.");
  const next = clone(job),
    w = normalizeWorkflow(job);
  if (!w[collection].some((r) => r.id === id))
    throw Error("The record no longer exists.");
  w[collection] = w[collection].filter((r) => r.id !== id);
  w.timeline.push({
    id: uid(),
    at: now(),
    action: "removed",
    collection,
    recordId: id,
    summary: collection,
  });
  next.workflow = validateWorkflow(w);
  return next;
}
export function workflowProgress(job) {
  const w = normalizeWorkflow(job),
    required = w.tasks.filter((t) => t.required);
  return {
    complete: w.tasks.filter((t) => t.complete).length,
    total: w.tasks.length,
    requiredComplete: required.filter((t) => t.complete).length,
    requiredTotal: required.length,
    productsComplete: w.products.filter((p) => p.complete).length,
    productsTotal: w.products.length,
    hours:
      Math.round(w.timesheets.reduce((n, t) => n + t.hours, 0) * 100) / 100,
  };
}

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const input = (label, name, value = "", type = "text", required = false) =>
  `<label>${label}<input name="${name}" value="${esc(value)}" type="${type}" ${required ? "required" : ""} ${type === "number" ? 'min="0" step="any"' : ""}></label>`;
const area = (label, name, value = "") =>
  `<label>${label}<textarea name="${name}" rows="3">${esc(value)}</textarea></label>`;
const select = (label, name, options, value) =>
  `<label>${label}<select name="${name}">${options.map((x) => `<option value="${esc(x)}" ${x === value ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>`;
const check = (label, name, value) =>
  `<label class="wf-check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${label}</label>`;
const button = (label, action, extra = "") =>
  `<button type="button" data-wf-action="${esc(action)}" ${extra}>${label}</button>`;
const empty = (text) => `<p class="muted">${text}</p>`;
const show = (label, value) =>
  value !== "" && value !== null && value !== undefined
    ? `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`
    : "";
const groups = {
  overview: {
    title: "Job overview",
    fields: [
      ["Job reference", "reference"],
      ["Job title", "title"],
      ["Description", "description", "area"],
      ["Estimated duration (hours)", "estimatedHours", "number"],
      ["Quote reference", "quoteRef"],
    ],
  },
  instructions: {
    title: "Scope & assignment",
    fields: [
      ["System reference", "system"],
      ["Assigned engineer", "engineer"],
      ["Work type", "workType", "workType"],
      ["Scope", "scope", "area"],
      ["Instructions", "instructions", "area"],
    ],
  },
  contact: {
    title: "Client & contacts",
    fields: [
      ["Client", "client"],
      ["Contact name", "contactName"],
      ["Contact phone", "contactPhone", "tel"],
      ["Contact email", "contactEmail", "email"],
    ],
  },
  access: {
    title: "Access details",
    fields: [
      ["Access / business hours", "accessHours"],
      ["Access procedure", "accessProcedure", "area"],
    ],
  },
  authorization: {
    title: "Authorisation",
    fields: [
      ["Authorisation reference", "authorizationRef"],
      ["Authorisation name", "authorizationName"],
      ["Authorisation date", "authorizationDate", "date"],
      ["Authorisation note", "authorizationNote", "area"],
    ],
  },
  requirements: {
    title: "Safety & service requirements",
    fields: [
      ["Safety requirements", "safetyRequirements", "area"],
      ["Service requirements", "serviceRequirements", "area"],
    ],
  },
  internal: {
    title: "Internal notes",
    fields: [["Internal note", "internalNote", "area"]],
  },
};
/** Component owns only its draft UI; caller saves returned job atomically and increments its revision. */
export function renderWorkflowSection(
  section,
  { job, site, onSave, onDirty = () => {}, onNavigate = () => {} },
) {
  const root = document.createElement("section");
  root.className = "workflow-module";
  let current = clone(job),
    editor = null,
    localDirty = false,
    saving = false;
  const setDirty = (value) => {
    localDirty = value;
    onDirty(value);
  };
  const fail = (error) => {
    const box = root.querySelector(".wf-error");
    box.textContent = error.message || String(error);
    box.hidden = false;
  };
  const discard = () =>
    !localDirty || confirm("Discard unsaved changes to this form?");
  function openEditor(collection, record = null) {
    if (!discard()) return;
    editor = { collection, record: record ? clone(record) : null };
    setDirty(false);
    render();
    root.querySelector(".wf-editor")?.scrollIntoView({ block: "nearest" });
  }
  async function save(next) {
    if (saving) return;
    saving = true;
    root.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      if (await onSave(next)) {
        current = next;
        editor = null;
        setDirty(false);
        render();
      } else {
        root.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
    } catch (e) {
      root.querySelectorAll("button").forEach((b) => (b.disabled = false));
      fail(e);
    } finally {
      saving = false;
    }
  }
  function summaryCard(key, group, details) {
    const populated = group.fields.filter(
      ([, name]) =>
        details[name] !== "" &&
        details[name] !== null &&
        details[name] !== undefined,
    );
    return `<article class="wf-card"><div class="section-head"><h3>${group.title}</h3>${button("Edit", `edit:${key}`)}</div><dl>${
      populated
        .slice(0, 3)
        .map(([label, name]) => show(label, details[name]))
        .join("") || "<dd>Not recorded</dd>"
    }</dl>${populated.length > 3 ? '<small class="muted">More details saved · open Edit to review</small>' : ""}</article>`;
  }
  function listing(collection, title, items, renderItem) {
    return `<section class="wf-block"><div class="section-head"><h2>${title} <span class="count">${items.length}</span></h2>${button(`Add ${collection === "purchaseOrders" ? "purchase order" : collection === "timesheets" ? "time entry" : collection === "appointments" ? "appointment" : collection === "tasks" ? "task" : "product"}`, `edit:${collection}`)}</div><div class="wf-grid">${items.map((item) => `<article class="wf-card">${renderItem(item)}<div class="actions">${button("Edit", `edit:${collection}:${item.id}`)}${button("Remove", `remove:${collection}:${item.id}`)}</div></article>`).join("") || empty(`No ${title.toLowerCase()} recorded.`)}</div></section>`;
  }
  function listContent(w) {
    if (section === "Details")
      return `<div class="wf-grid">${Object.entries(groups)
        .map(([key, group]) =>
          summaryCard(key, group, key === "instructions" ? current : w.details),
        )
        .join(
          "",
        )}</div>${listing("appointments", "Appointments", w.appointments, (r) => `<h3>${esc(r.date || "Date not recorded")}</h3><p>${esc([r.start, r.end].filter(Boolean).join(" – ") || "Time not recorded")}</p><p>${esc(r.engineer || "Unassigned")}</p><p>${esc(r.note)}</p>`)}<details class="wf-timeline"><summary>Timeline · ${w.timeline.length} changes</summary>${
        w.timeline
          .slice()
          .reverse()
          .map(
            (r) =>
              `<p><strong>${esc(r.action)} ${esc(r.collection)}</strong> · ${esc(new Date(r.at).toLocaleString())}<br>${esc(r.summary)}</p>`,
          )
          .join("") || empty("No workflow edits recorded yet.")
      }</details>`;
    if (section === "Work")
      return `<div class="wf-shortcuts">${button("Plans", "navigate:Plan")}${button("Assets & devices", "navigate:Devices")}${button("Recorded results", "navigate:Results")}</div><p class="muted">${workflowProgress(current).complete} of ${w.tasks.length} work actions complete. Checklist completion does not pass equipment.</p>${listing("tasks", "Work actions / pre-start checklist", w.tasks, (r) => `<div class="section-head"><h3>${esc(r.title)}</h3><span class="badge">${r.complete ? "Complete" : "Not complete"}</span></div><p>${r.required ? "Required work action" : "Optional work action"}</p><p>${esc(r.notes)}</p>`)}`;
    if (section === "Products")
      return `<p class="muted">Record materials and labour for this visit. Quantities and prices are entered by the engineer; no catalogue or ordering service is connected.</p>${listing("products", "Products & labour", w.products, (r) => `<div class="section-head"><h3>${esc(r.description)}</h3><span class="badge">${r.complete ? "Used / complete" : "Planned"}</span></div><p>Quantity: ${esc(r.quantity)} ${esc(r.unit)}</p>${r.unitCost !== null ? `<p>${esc(r.currency)} ${esc((r.quantity * r.unitCost).toFixed(2))} total · ${esc(r.unitCost)} per ${esc(r.unit)}</p>` : empty("Cost not recorded")}`)}`;
    if (section === "POs")
      return `<p class="notice">Purchase orders are local records. Changing a status does not send an order, notify a supplier or take payment.</p>${listing("purchaseOrders", "Purchase orders", w.purchaseOrders, (r) => `<div class="section-head"><h3>${esc(r.supplier)}</h3><span class="badge">${esc(r.status)}</span></div><p>${esc(r.reference || "No reference")} · ${esc(r.date || "No date")}</p><p>${r.amount === null ? "Amount not recorded" : `${esc(r.currency)} ${esc(r.amount.toFixed(2))}`}</p><p>${esc(r.notes)}</p>`)}`;
    if (section === "Finalisation")
      return `<div class="wf-grid"><article class="wf-card"><h3>Visit status</h3><p><span class="badge">${esc(current.status)}</span></p><p>${current.results.filter((r) => r.state === "Not tested").length} device results remain Not tested.</p><p>${workflowProgress(current).requiredComplete} / ${workflowProgress(current).requiredTotal} required work actions complete.</p>${button("Edit notes & status", "edit:finalisation")}</article><article class="wf-card"><h3>Visit notes</h3><dl>${show("Technician note", w.finalisation.technicianNote) || "<dd>No technician note recorded</dd>"}${show("Invoice note", w.finalisation.invoiceNote)}</dl>${button("Edit notes & status", "edit:finalisation")}</article><article class="wf-card"><h3>Client acknowledgement</h3>${w.finalisation.clientAcknowledgement ? `<p>${esc(w.finalisation.clientAcknowledgement.name)}</p><p>${esc(w.finalisation.clientAcknowledgement.recordedAt)}</p><p>${esc(w.finalisation.clientAcknowledgement.note)}</p>` : empty("No acknowledgement recorded.")}<p class="muted">A typed acknowledgement record, not a digital signature or certificate.</p>${button("Record acknowledgement", "edit:acknowledgement")}</article><article class="wf-card"><h3>Review and export</h3><p class="muted">Review actual findings, limitations and the condition left. Completing a job never passes equipment.</p><div class="actions">${button("Draft service report", "navigate:print")}${button("Export job", "navigate:export")}${button("Review results", "navigate:Results")}</div></article></div>${listing("timesheets", "Timesheet", w.timesheets, (r) => `<h3>${esc(r.date || "Date not recorded")} · ${esc(r.hours)} hours</h3><p>${esc([r.start, r.end].filter(Boolean).join(" – "))}</p><p>${esc(r.engineer || current.engineer)}</p><p>${esc(r.note)}</p>`)}<p class="muted">Total recorded time: ${workflowProgress(current).hours} hours</p>`;
    return empty("Choose a job section.");
  }
  function editorContent(w) {
    if (!editor) return "";
    const { collection, record } = editor,
      r = record || {};
    let title = "",
      fields = "";
    if (groups[collection]) {
      const group = groups[collection];
      title = group.title;
      const source = collection === "instructions" ? current : w.details;
      fields = group.fields
        .map(([label, name, type]) =>
          type === "area"
            ? area(label, name, source[name])
            : type === "workType"
              ? select(
                  label,
                  name,
                  ["Fire alarm maintenance", "General fault or repair work"],
                  source[name],
                )
              : input(label, name, source[name], type || "text"),
        )
        .join("");
    }
    if (collection === "appointments") {
      title = "Appointment";
      fields =
        input("Appointment date", "date", r.date, "date") +
        input("Start time", "start", r.start, "time") +
        input("End time", "end", r.end, "time") +
        input("Engineer", "engineer", r.engineer || current.engineer) +
        area("Appointment note", "note", r.note);
    }
    if (collection === "tasks") {
      title = "Work action";
      fields =
        input("Task title", "title", r.title, "text", true) +
        check("Required action", "required", r.required) +
        check("Action complete", "complete", r.complete) +
        area("Task notes", "notes", r.notes);
    }
    if (collection === "products") {
      title = "Product or labour";
      fields =
        input(
          "Product / labour description",
          "description",
          r.description,
          "text",
          true,
        ) +
        input("Quantity", "quantity", r.quantity ?? 1, "number", true) +
        input("Unit", "unit", r.unit || "each", "text", true) +
        input("Unit cost", "unitCost", r.unitCost, "number") +
        input("Currency", "currency", r.currency || "GBP", "text", true) +
        check("Used / completed", "complete", r.complete);
    }
    if (collection === "purchaseOrders") {
      title = "Purchase order record";
      fields =
        input("PO reference", "reference", r.reference) +
        input("Supplier", "supplier", r.supplier, "text", true) +
        select("PO status", "status", poStates, r.status || "Draft") +
        input("PO date", "date", r.date, "date") +
        input("Amount", "amount", r.amount, "number") +
        input("Currency", "currency", r.currency || "GBP", "text", true) +
        area("PO notes", "notes", r.notes);
    }
    if (collection === "timesheets") {
      title = "Time entry";
      fields =
        input(
          "Work date",
          "date",
          r.date || new Date().toISOString().slice(0, 10),
          "date",
        ) +
        input("Start time", "start", r.start, "time") +
        input("End time", "end", r.end, "time") +
        input("Hours (or calculate from times)", "hours", r.hours, "number") +
        input("Engineer", "engineer", r.engineer || current.engineer) +
        area("Time note", "note", r.note);
    }
    if (collection === "finalisation") {
      title = "Notes & status";
      fields =
        select("Visit status", "status", statusValues, current.status) +
        area(
          "Technician note",
          "technicianNote",
          w.finalisation.technicianNote,
        ) +
        area("Invoice note", "invoiceNote", w.finalisation.invoiceNote) +
        '<p class="muted">Changing status does not alter device results or certify compliance. A visit may finish with defects or limitations.</p>';
    }
    if (collection === "acknowledgement") {
      title = "Client acknowledgement";
      const a = w.finalisation.clientAcknowledgement || {};
      fields =
        input("Client name", "name", a.name, "text", true) +
        input(
          "Acknowledgement time",
          "recordedAt",
          a.recordedAt ? localDateTime(a.recordedAt) : "",
          "datetime-local",
          true,
        ) +
        area("Acknowledgement note", "note", a.note) +
        check(
          "Client acknowledgement was actually received",
          "received",
          false,
        ) +
        '<p class="muted">Enter only an acknowledgement actually received. This record is not a digital signature or compliance declaration.</p>';
    }
    return `<section class="wf-editor panel"><div class="section-head"><h2>${title}</h2>${button("Cancel", "cancel")}</div><form data-wf-form="${collection}"><div class="wf-form-grid">${fields}</div><button class="primary" type="submit">Save ${title.toLowerCase()}</button></form></section>`;
  }
  function render() {
    const w = normalizeWorkflow(current);
    root.innerHTML = `<div class="wf-error notice error" role="alert" hidden></div>${editor ? editorContent(w) : listContent(w)}`;
    root.querySelectorAll("[data-wf-action]").forEach(
      (el) =>
        (el.onclick = async () => {
          if (saving) return;
          const [action, collection, ...rest] = el.dataset.wfAction.split(":"),
            id = rest.join(":");
          if (action === "cancel") {
            if (discard()) {
              editor = null;
              setDirty(false);
              render();
            }
            return;
          }
          if (action === "navigate") {
            if (discard()) {
              setDirty(false);
              onNavigate(collection);
            }
            return;
          }
          if (action === "edit") {
            openEditor(
              collection,
              id ? (w[collection] || []).find((r) => r.id === id) : null,
            );
            return;
          }
          if (action === "remove") {
            if (confirm("Remove this local record?"))
              await save(removeWorkflowRecord(current, collection, id));
          }
        }),
    );
    const form = root.querySelector("form");
    if (form) {
      form.addEventListener("input", () => setDirty(true));
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (saving) return;
        try {
          const values = Object.fromEntries(new FormData(form)),
            key = editor.collection;
          for (const checkbox of form.querySelectorAll("input[type=checkbox]"))
            values[checkbox.name] = checkbox.checked;
          let next;
          if (key === "instructions") {
            next = clone(current);
            for (const name of [
              "system",
              "engineer",
              "workType",
              "scope",
              "instructions",
            ])
              next[name] = text(values[name], name);
            if (
              ![
                "Fire alarm maintenance",
                "General fault or repair work",
              ].includes(next.workType)
            )
              throw Error("Choose a supported work type.");
            next = updateWorkflow(next, "details", {});
          } else if (groups[key])
            next = updateWorkflow(current, "details", values);
          else if (key === "acknowledgement") {
            if (!values.received)
              throw Error(
                "Confirm the client acknowledgement was actually received before recording it.",
              );
            next = updateWorkflow(current, "finalisation", {
              clientAcknowledgement: {
                name: values.name,
                recordedAt: new Date(values.recordedAt).toISOString(),
                note: values.note,
              },
            });
          } else
            next = updateWorkflow(current, key, {
              ...(editor.record || {}),
              ...values,
            });
          await save(next);
        } catch (error) {
          fail(error);
        }
      };
    }
  }
  render();
  return root;
}

/** Printable engineer-entered content. Internal and invoice notes are deliberately excluded. */
export function renderWorkflowReport(job) {
  const w = normalizeWorkflow(job),
    root = document.createElement("section");
  root.className = "workflow-report";
  const list = (title, records, row) =>
    records.length
      ? `<section><h3>${title}</h3>${records.map((record) => `<article class="result-record">${row(record)}</article>`).join("")}</section>`
      : "";
  root.innerHTML = `<h2>Visit workflow</h2><dl>${show("Job reference", w.details.reference)}${show("Job title", w.details.title)}${show("Description", w.details.description)}${show("Client", w.details.client)}${show("Estimated hours", w.details.estimatedHours)}${show("Safety requirements", w.details.safetyRequirements)}${show("Service requirements", w.details.serviceRequirements)}</dl>
    ${list("Work actions", w.tasks, (r) => `<p><strong>${esc(r.title)}</strong> · ${r.complete ? "Complete" : "Not complete"}${r.required ? " · Required" : ""}</p><p>${esc(r.notes)}</p>`)}
    ${list("Products and labour", w.products, (r) => `<p><strong>${esc(r.description)}</strong> · ${r.complete ? "Used / complete" : "Planned"}</p><p>${esc(r.quantity)} ${esc(r.unit)}${r.unitCost !== null ? ` · ${esc(r.currency)} ${(r.quantity * r.unitCost).toFixed(2)}` : ""}</p>`)}
    ${list("Recorded time", w.timesheets, (r) => `<p>${esc(r.date)} · ${esc(r.hours)} hours · ${esc(r.engineer || job.engineer)}</p><p>${esc(r.note)}</p>`)}
    ${w.finalisation.technicianNote ? `<h3>Technician note</h3><p>${esc(w.finalisation.technicianNote)}</p>` : ""}
    ${w.finalisation.clientAcknowledgement ? `<h3>Client acknowledgement record</h3><p>${esc(w.finalisation.clientAcknowledgement.name)} · ${esc(w.finalisation.clientAcknowledgement.recordedAt)}</p><p>${esc(w.finalisation.clientAcknowledgement.note)}</p><p>A typed acknowledgement record; not a digital signature or certificate.</p>` : ""}`;
  return root;
}
