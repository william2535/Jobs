# Editable job workflow

Jobs uses the supplied application screenshots as a workflow reference. It does not include their customer details or reproduce a connection to the reference application's services.

**Create job** opens blank notes immediately. From Home it starts without a site; from a site folder it links that site and its current drawing. A title, classification and description are optional. The draft exists only in memory until **Save** or **Save settings** succeeds. Blank notes can be saved, and failed saves keep the draft open for retry.

The three main sections are **Notes**, **Plan** and **Finalisation**. Opening a saved job card opens Notes. Its editor supports headings, paragraphs, lists, bold, italic, underline, strike-through, text size/colour, highlights and alignment, plus included pictures with captions. Finalisation shows the saved report and offers printing and job export; save the current edits before using these actions.

The **gear icon** on each job card and inside the job opens optional settings: title, site, status, discipline, job type, description, assignment and supporting details. Custom discipline/type choices require a name only when selected. A standalone job can be linked to an existing site without losing notes or pictures. Once linked, the site cannot be silently switched or removed through this form.

Set up reusable contact, access, safety, service and work details once in the site folder. These live defaults apply to linked jobs unless the job explicitly overrides a field, including clearing it. **Use site settings for this job** removes those overrides. Shared setup changes do not replace job notes, selected drawing revisions, device results or checklist evidence. Earlier job values that differ from the site's old setup are retained as overrides when adopting the shared model.

After saving, **Settings → More job tools** provides Work, Products, POs and Visit records. Site-linked jobs also expose Details, Devices, Results and Quick checklist. These detailed tools retain their compact cards and focused editors. A quick checklist is optional evidence recording, separate from device outcomes and work-action completion; its report remains a draft. See [UK standards research](checklist-standards.md).

**Plan** displays the linked job's saved drawing, included PNGs and equipment. Without a site it offers Choose site. New device results start **Not tested**; linking a site never assumes that equipment passed. Explicit drawing imports or Zone Sketch returns are reviewed separately, preserving matching results and earlier drawing evidence. Site map updates do not automatically replace other visits' plans.

**‹ Home** returns to the dashboard. A linked site's name in the persistent header opens its folder. Both routes protect unsaved changes. In detailed tools, populated fields can be held for three seconds to edit, with visible Edit/Add controls and keyboard alternatives. Scrolling cancels a hold. Empty optional fields and groups stay out of readouts and reports; Add details exposes their editors. Blank collections keep a compact Add control.

The permanent site editor saves through `onSaveSite(updatedSite)`, separately from `onSave(updatedJob)`. `renderWorkflowSection` exposes `root.openEditor(group, field?, recordId?)` for detailed-field shortcuts. Dispose its hold listeners before removing the component. The host owns transactional storage and visible save-failure reporting.

## Local data contract

Current exports use job package **version 3**; versions 1 and 2 remain importable. A standalone job has `siteId: null`, `drawingId: null`, no device results and a `site: null` package. No placeholder site is created.

`job.notesDocument` is a validated version-1 document tree of text blocks/runs and embedded raster photographs, with stable block/photo IDs. Formatting is structured data, never executable HTML or online image links. `job.settings` is a version-1 set of explicit shared-field overrides. See the [package contract](job-package.md) for bounds and import validation.

`job.workflow` remains a version-1 extension for detailed work records. It travels in the same job package, separate from notes, permanent site/drawing data and `job.results`.

| Field | Records |
| --- | --- |
| `details` | Reference, title, description, estimate, client and contact information, access instructions, authorisation fields, internal note, quote reference, safety and service requirements |
| `appointments` | Stable `id`, date, start/end time and assigned engineer |
| `tasks` | Stable `id`, title, required flag, completion flag and notes |
| `products` | Stable `id`, description, quantity, unit, unit cost, currency and completion flag |
| `purchaseOrders` | Stable `id`, reference, supplier, date, amount, currency, notes and explicit local status |
| `timesheets` | Stable `id`, date, start/end time, hours and note |
| `finalisation` | Job status, technician/invoice notes and optional typed client acknowledgement |
| `timeline` | Local saved/removed workflow events with ID, time, collection, record ID and summary |

Older jobs acquire empty workflow collections when edited. No pre-start compliance checklist, client acknowledgement, signature, purchase order, product use or task completion is invented. IDs remain stable when a record is edited. The parent application saves the complete changed job transactionally and increments its revision after a successful save. Workflow edits also append a local timeline event; this is a useful history, not a signed or tamper-proof audit record.

`normalizeWorkflow`, `validateWorkflow`, `updateWorkflow`, `removeWorkflowRecord` and `workflowProgress` are pure helpers in `src/job-workflow.js`. They detach changes from input records, validate values and calculate progress from stored task/product flags. Numeric estimates, quantities, costs and hours must be finite and nonnegative. Text is bounded. Dates/times use explicit local fields. Same-day timesheets can calculate hours from their start/end times; reversed intervals are rejected rather than silently interpreted as overnight work.

## Meaning of actions

- Completing a work task or product line only changes that task/line. It never marks an asset satisfactory or clears a defect.
- A PO is a **local record**. `Draft`, `Submitted externally` and `Billed` describe the engineer's recorded state; the app does not send anything to a supplier, incur a charge or verify billing.
- A typed client acknowledgement records a name, timestamp and note entered by the engineer. It is not a drawn signature, a compliance certificate or an engineer's technical declaration.
- Finalising a job changes its explicitly selected visit status. Equipment results and unresolved defects remain unchanged.
- The printable output remains a **draft service report**, using the saved job title or its discipline/work type where supplied. Rich notes and pictures appear alongside recorded work. `renderWorkflowReport(job)` adds actual work actions, materials/labour, time, technician notes and an explicitly recorded acknowledgement. A saved quick checklist and its missing information are included when present. Internal office notes, invoice notes and local purchase orders are not included in this client-facing section; they remain in the job package. Validated certificate templates and issuance remain future work.

No customer screenshot data is bundled in the source or tests. The workflow tests use synthetic records and verify immutability, stable identities, validation, progress totals, time calculations and separation from engineer device results.

Panel Pal context export remains available for site-linked jobs. The FINDR adapter is future work; no AI service is connected and AI proposals cannot change engineer-confirmed results.
