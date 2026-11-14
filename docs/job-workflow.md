# Editable job workflow

Jobs uses the supplied application screenshots as a workflow reference. It does not include their customer details or reproduce a connection to the reference application's services.

The job workspace separates **Details**, **Work**, **Products**, **POs** and **Finalisation**. Related fields open in small editable groups; devices and other repeated records use compact cards. Plans, device evidence and results remain linked to the existing job and selected drawing revision.

Create the permanent site folder first, then create its visit jobs. A new job can inherit the site's saved defaults without inventing missing client, contact, access or equipment information. Details shows populated fields and actual visit status; empty fields and empty groups are omitted. The **Add details** picker exposes every supported editor, including groups that are not yet shown. A populated group's Edit button also lets the engineer add or clear its fields. Clearing a field removes its readout after saving; zero-valued estimates remain visible.

Hold a saved readout for three seconds to open its editor with that field focused. A short tap does not edit; scrolling or moving the pointer cancels the hold. The visible Edit/Add buttons remain available, and focused readouts support Enter/Space. Appointments, tasks, products, purchase orders, notes, acknowledgements and timesheets use the same shortcut. Unfilled fields are omitted from these records too. Empty record collections keep a compact Add control; completion still requires an explicit saved choice.

The permanent site name/address has its own editor and save callback; it does not replace a visit or its results. Unfilled system/work-type/date fields stay empty until entered and do not appear as placeholder boxes. `renderWorkflowSection` accepts `onSaveSite(updatedSite)` separately from `onSave(updatedJob)` and exposes `root.openEditor(group, field?, recordId?)` for job-header shortcuts. Call `root.disposeHoldToEdit()` before removing the component to release its delegated document listeners. The host remains responsible for transactional storage and save-failure reporting. Each visit remains linked to its saved drawing revision; updating the site map does not automatically replace earlier visits' plans.

## Local data contract

`job.workflow` is a version 1 extension to the Jobs package. It travels inside the exported job JSON and remains separate from permanent site/drawing data and `job.results`.

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
- The printable output remains **Draft service report**. `renderWorkflowReport(job)` adds actual work actions, materials/labour, time, technician notes and an explicitly recorded acknowledgement. Internal office notes, invoice notes and local purchase orders are not included in this client-facing section; they remain in the job package. Certificate validation and issuance remain future work.

No customer screenshot data is bundled in the source or tests. The workflow tests use synthetic records and verify immutability, stable identities, validation, progress totals, time calculations and separation from engineer device results.
