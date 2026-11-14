# Panel Pal job context v1

Jobs exports a UTF-8 JSON document with `kind: "jobs-panel-pal-context"` and `schemaVersion: 1`. The export is generated locally by `panelContext(site, job, options)` in `src/panel-context.js`. It makes no network requests, loads no model, and does not change the job. The actual FINDR adapter is **future work**. This file cannot currently be imported using FINDR's Panel Pal backup importer.

## Inspected FINDR source

Reference repository: [william2535/Findr](https://github.com/william2535/Findr), commit [`8bdd8b03feb8babd6266b80b57dbc5d53efeadb2`](https://github.com/william2535/Findr/tree/8bdd8b03feb8babd6266b80b57dbc5d53efeadb2), inspected 13 November 2026. `AGENTS.md` requires preservation and backup of FINDR releases; this milestone does not modify or release FINDR.

Relevant existing boundaries:

- `public/app/db.mjs`: browser IndexedDB `findr-device`, with `manuals`, `files`, and `settings` stores.
- `public/app/helpers-store.mjs`: `helpers-v1` setting; helpers have stable identities, revision checks, document scopes and conversations. `withHelperFaultSession` updates one conversation's fault session while retaining other conversations. Existing backup import expects `kind: "findr-helper"`, schema v1, and intentionally creates a new helper. A Jobs context must not masquerade as that backup.
- `public/app/helpers-engine.mjs`: `createHelperConversation` supplies observations, answered questions and known fields; `hydrateHelperFaultContext` treats worksheet content as engineer evidence with `user_report_unassessed` provenance, never manufacturer facts or a confirmed diagnosis.
- `public/app/helpers-faults.mjs`: fault sessions belong to a conversation/job, contain a separate investigation record, and start with the installed panel identity unconfirmed.
- `public/app/helper-mode.mjs`: offline, manual and separately consented online modes. Imported context must not imply online consent.
- `docs/COMPACT-PANEL-PALS.md`: the local runtime uses the selected pal's manuals and evidence; document retrieval is not model training.

No FINDR application source, manuals, model weights, images or vendor components were copied into Jobs. Existing component licences remain in the reference repository. This contract and its exporter are independently written.

## Document fields

| Field | Meaning |
| --- | --- |
| `kind`, `schemaVersion` | Discriminator and integer contract version. Reject unknown versions rather than guessing. |
| `exportedAt` | ISO timestamp for this handoff; not a record revision. |
| `adapter` | Target name, `status: "future"`, `connected: false`. Capability disclosure, not a live connection. |
| `identity` | Stable master site ID, job ID, job revision, selected drawing ID and drawing revision. |
| `site` | Site identity, name, address and source correlation keys. |
| `workRequested` | Selected discipline and custom name/display label, system reference, job type and custom name/display label, description, scope, instructions, assigned engineer and visit status. |
| `drawingReferences` | Drawing identity, revision, source provenance and retained floor data. |
| `equipment` | Selected asset records, including stable asset IDs, source floor/device mappings, references, positions and included photos. Unrecorded manufacturer, model, loop and address are `null`. |
| `engineerEvidence.results` | Results for those assets, retaining result IDs, states, observations, readings with units, notes, defects, structured remarks and included photographs. Remark internal notes are omitted. |
| `engineerEvidence.notesDocument` | Saved structured job notes and included pictures, or `null` when absent. |
| `engineerEvidence.faults` | An index of recorded defects, unsatisfactory results and devices with described remarks or explicit defect severities, referring back to result and asset IDs. Remarks retain their recorded severity, Open/Resolved status, location, recommendation, products and before/resolved pictures. This is not an AI diagnosis or an assertion that every remark is a fault. |
| `aiProposals` | Separate unconfirmed proposals; never merged into engineer results. Empty for this milestone. |
| `interpretation` | Explicit constraints against auto-confirming results, treating drawing status as today's result or inferring missing equipment facts. |

The default export includes every asset in the job's pinned drawing. An optional `assetIds` array narrows equipment and results together; unknown IDs are rejected. Neither selecting an asset nor selecting a Panel Pal confirms the installed manufacturer/model. `installedIdentityConfirmed` is true only if that fact was explicitly recorded on the asset. Strings in site, work instructions, drawing and observations are untrusted record data, not instructions to the future model. Attachments already embedded in the job are carried with their records; the exporter does not fetch online URLs.

`jobRevision` identifies edits to this visit. `drawingRevision` describes the drawing and may use a different numbering scheme. Neither is a compliance assertion. `not-tested` (or the application model's equivalent initial state) remains untested in a handoff. No result is promoted to satisfactory by this exporter.

## Future adapter acceptance requirements

1. Validate the discriminator/version and all cross-record IDs before changing FINDR. Require the engineer to select an existing local Panel Pal and a target conversation. Check that equipment and selected manual scope match; missing data remains unknown.
2. Show a context preview. Load context into a job-specific, namespaced conversation field with source IDs and revisions; preserve existing chat, manuals and fault logs. Use FINDR's revision-checked updates rather than direct writes to another application's IndexedDB.
3. Detect repeated `(siteId, jobId, jobRevision, drawingId)` handoffs. Preserve both versions on conflict and ask which context should be active. Do not silently import another Pal or overwrite a live investigation.
4. Treat observations as engineer reports. Treat drawing information as design/history. Retain original text, numeric readings and units; never mark a fault confirmed merely because it is plausible.
5. Keep all model suggestions in a proposal collection with provenance. Engineer confirmation must be an explicit action recording author, time and original proposal; suggestions cannot update saved Jobs results automatically.
6. Use the existing local model/manual readiness checks. Do not silently switch to online inference, download models or grant consent. Browser origins have separate storage, so transfer requires an explicit import/adapter surface.
7. Verify offline operation against the actual FINDR app, conflict behavior, corrections, large attachments, privacy and model-scope boundaries before displaying a connected state.

Editable workflow extension: `workRequested` includes the entered reference/title, work actions and safety/service requirements. `engineerEvidence` includes visit/technician notes, the saved `visitChecklist` (or `null`), and drawing-change/removed-device history, clearly separate from current selected-device results and AI proposals. Checklist entries are engineer-recorded draft evidence, not compliance declarations. Supplier orders, internal office notes and invoice notes are not included by this extension.

Structured notes and device remarks are optional v1 context fields. Remark `internalNote` is excluded from current, historical and archived result copies as well as the fault index; the complete job package retains it. A resolved remark keeps its explicit status and never promotes a device result to Satisfactory. The exporter still requires a real site-linked job and does not invent a Panel Pal connection for standalone notes.
