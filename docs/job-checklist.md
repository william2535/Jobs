# Quick checklist and draft documents

For a saved, site-linked job, open the **gear → More job tools → Quick checklist**. The main Notes/Plan/Finalisation flow does not require a checklist; standalone note jobs can be saved and exported without one. Jobs selects recording prompts from the visit's discipline and job type. Fire, Intruder, CCTV, Access control, general Security and Custom have separate prompts. Maintenance, Small works, Install, Take over visit, Call out and Custom add the corresponding work-boundary and outcome prompts. Older fire-maintenance and fault/repair classifications remain usable.

Each item starts **Not recorded**. The engineer chooses **Recorded** or **Not applicable**; exclusion needs a written reason. Recorded means that the action/evidence was recorded, not that the equipment passed. Actual observations, measurements, units, photographs and device outcomes remain in Devices. There is no bulk pass or inferred manufacturer, grade, category, reading or signature.

The compact grid keeps notes and visit details behind disclosures. Known engineer and scope details use the current shared site setup or the job’s explicit overrides to prefill a new draft. Previously saved checklist evidence is retained. Company, visit date, standard/edition, premises scope, limitations, condition left and next actions must be recorded by the engineer. Candidate UK standards are reference hints, not a confirmed applicability decision; see [verified reference sources](checklist-standards.md).

**Save checklist** stores the record locally. Incomplete drafts can be saved; the review list identifies unrecorded information and outstanding device results. Save failures preserve the form for retry. Leaving through Home, the site name or another job section protects unsaved changes. Export and printing require saving the current form first.

**Finalisation → Print report** (also **Print draft report** in the checklist) combines saved notes, pictures and checklist evidence with the site's identity, job and drawing references, actual device results and existing visit records. The title uses the saved job title or its discipline and work type. **Finalisation → Export job** (also **Export job & records** in the checklist) downloads the self-contained `.jobs.json`, including the checklist, drawing history, included PNGs and photographs. Import restores that record and uses the existing duplicate/conflict protection. Both actions work offline after the application has been prepared.

## Stored contract

`job.checklist` is an optional version-1 extension carried in the version-3 job package. Version-1 and version-2 packages remain importable, and jobs without a checklist remain valid. A checklist requires the real site and selected drawing references; it is not fabricated for a standalone note job. Its stable ID identifies the checklist; its revision increments on each saved edit. `templateVersion` identifies the application's recording prompts, not a reviewed standards template.

The record contains the saved job classification, drawing reference, supporting job revision, entered `fields`, `entries` and `savedAt`. Every entry has a prompt ID, label, state and notes. Fields and notes are bounded text; IDs, states, dates, versions and revision history are validated before package import changes local records. No online attachment references or external form service is required.

Changing the discipline, job type or pinned drawing flags the saved checklist for review. The next checklist starts with unrecorded prompts and retains the previous evidence in `history`. Previously retained entries are not silently discarded. History is bounded; reaching the limit rejects the change rather than deleting old evidence. Routine edits update the current draft; this is not an immutable issued-certificate audit trail.

The report identifies both current job/drawing references and those supporting the saved checklist. When import preserves a conflicting drawing under a different ID, the checklist and its history follow that same preserved drawing. An ID remapping alone does not falsely invalidate the checklist; an actual change to its pinned drawing or job classification requires review.

## Certificate boundary

The checklist is an independent recording aid. It is not a complete normative inspection schedule, and completing every prompt does not establish compliance. Job completion does not alter device results, clear defects or issue a certificate. Client acknowledgement remains separate from technical responsibility.

The separate [visit-certificate workflow](certificates.md) now provides editable fields, explicit engineer review, numbering, immutable issued snapshots and retained corrections. It never turns checklist completion into a declaration. The checklist's own report remains **Draft**. Validated standards-specific certificates still require a rights-cleared template and full applicable field, test, exception and declaration rules reviewed against the relevant standard; generic visit certificates do not claim that validation.
