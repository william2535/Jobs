# Jobs full application build brief

Repository: [william2535/Jobs](https://github.com/william2535/Jobs)

The sections below define the complete product scope. Delivery milestones describe its implementation order.

**Product proposal · 13 November 2026.** Jobs is an offline job module within Will Flood’s master fire and security project. It turns an editable Zone Sketch save into a usable site record, creates work for engineers, records the visit and produces the appropriate job documents. FINDR’s local Panel Pals load the job and help the engineer work through it using the selected manuals and the job’s recorded evidence.

The first release should complete one whole non-domestic fire alarm maintenance workflow: import or create a site, prepare a job, transfer it to an engineer, work offline with Panel Pal assistance, return the results and produce a reviewed report. Certificate issuance follows validation of the relevant template and rules. This is a build specification; the integrations described below remain proposed.

## Product responsibilities

| Part | Responsibility |
| --- | --- |
| Master project and Jobs | Persistent sites, systems and assets; job scope and assignments; visit results, defects, review and issued documents. |
| Zone Sketch | Building layouts, zones, surveyed device positions, circuit routes and as-fit drawing revisions. |
| FINDR Panel Pals | Load the selected job, understand the current equipment and task, retrieve applicable manual evidence and help the engineer investigate, explain and write notes. |
| Shared job format | Carry the same identified job, drawing revision, assets and evidence between applications and engineers. |

Keep the applications useful individually while making the master project present one connected workflow. A job should open the relevant drawing and Panel Pal with the site, device and task already selected. In the initial integration, explicit job-file import and export provide the dependable connection.

## Two ways to create a job

**Create from a Zone Sketch save.** Select the editable project file, review the imported site, complete missing system information, then choose the work to perform. Device locations and drawing references should already be available.

**Create from scratch or an existing site.** Enter the site and system, choose a job template, add the known equipment and attach drawings when available. An engineer must be able to record work without first completing a drawing.

Initial job types should include fire alarm inspection and servicing and a general fault or repair visit. Structure the data so surveys, additional work, installation, commissioning and the other disciplines can receive their own templates later. Selecting a different discipline must not reuse fire-specific declarations automatically.

## Zone Sketch import

The current editable backup is a `.zonesketch.json` file containing `format: "ZoneSketchByWill"`, `version: 1` and `project`. The importer also recognises the older `ZoneSketch` marker. Floors contain structured device, building and circuit information. The save is therefore suitable for a device-linked plan, rather than requiring image recognition. [Current source](https://github.com/william2535/FIRE-ZONE-PLAN-APP/blob/dca2eff063f52a9980c2aed255879a65cc579379/index.html).

| Import directly when present | Complete or confirm in Jobs |
| --- | --- |
| Site name, discipline and floor names | Customer, address, site contacts and access details |
| Building geometry, background plans and labels | Actual system manufacturer, panel model, variant and protocol |
| Device symbols, references, positions and photos | Confirmed asset identities, model details and actual loop, address or programmed zone |
| Zones, circuit routes and additional-work endpoints | Visit scope, job instructions, assigned engineer and required checks |
| Working as-fit data, issued snapshots and recorded verification states | Present-visit observations, measurements, test outcomes, defects and declaration |

Preserve fresh-install and additional-work projects. The additional-work flow may have a building layout without zones. Do not reject it or create imaginary zones. Preserve existing cable joints and start/return references. The current source includes these structures. [Import and drawing implementation](https://github.com/william2535/FIRE-ZONE-PLAN-APP/blob/dca2eff063f52a9980c2aed255879a65cc579379/index.html).

Only suitable equipment becomes a maintainable asset. Exclude labels, zone polygons, route points and “You are here” symbols. Include panels even when they are drawn in the plan layer. A drawn reference is a label until its meaning is confirmed; it must not automatically become a verified loop address.

Show an import summary before committing: site, floors, recognised devices, drawing views, missing fields and any unsupported content. Keep unknown information visibly unknown. Preserve the original file unchanged so it can be re-exported or interpreted by a newer importer.

Maintain three linked views where the source supports them: **Zones — for customer**, **Survey — for engineer** and **As-fit — for record**. Additional-work projects use **Building layout** where a zone plan does not apply. Distinguish the current working drawing from an issued as-fit snapshot and show the selected revision.

The existing renderer is embedded in the large Zone Sketch application. Functions including `renderModeFloorCanvas`, `cbDrawAsFitOn` and `projectDrawingRender` are useful extraction points, but they are not currently a standalone integration API. Extract a shared parser and read-only renderer with explicit inputs, then compare its views against Zone Sketch. [Renderer source](https://github.com/william2535/FIRE-ZONE-PLAN-APP/blob/dca2eff063f52a9980c2aed255879a65cc579379/index.html).

## Stable site and asset records

Keep a site separate from a visit. The site is the continuing premises record; a job is a dated instruction and set of results against a particular site/drawing revision. A later service visit should see earlier findings without changing their history.

| Record | Identity and purpose |
| --- | --- |
| Site | Stable master site ID, premises details and import lineage. |
| System | Particular panel or system at the site; supports several systems of the same discipline. |
| Asset | Stable device ID, system, location and link to its source drawing object. |
| Drawing revision | Original Zone Sketch data and any rendered views used for the job. |
| Job | Stable job ID, type, scope, assignment, base site revision and status. |
| Task and result | Required action and actual observation, including author, time, method, values, units and evidence. |
| Defect | Identified issue that may remain open across multiple visits. |
| Issued document | Fixed job revision, template version, declaration and generated document. |

Zone Sketch currently keeps its project identity in the outer local database record, while the editable export contains only the project state. Imported copies receive a new outer project ID. Give the master app its own persistent site ID and map source floor/object IDs within that site and import lineage. A filename or site name is insufficient for deduplication. [Save and export implementation](https://github.com/william2535/FIRE-ZONE-PLAN-APP/blob/dca2eff063f52a9980c2aed255879a65cc579379/index.html).

On subsequent drawing imports, present **Update existing site** and **Create another site**. Review added, moved, changed and removed objects before changing the asset register. A deleted drawing symbol should become a proposed reconciliation change, not erase historical work. Replacement equipment should retain a link to the replaced asset.

Keep drawing/work status, onsite verification and this visit’s result as separate values. Existing, proposed, installed, removed or verified drawing records do not determine whether a device was tested today. Proposed equipment should not silently enter the service scope for the existing installation.

## Engineer workflow and interface

Home should offer **Create job**, **Import job** and **Sites**, with a clear list of assigned or locally saved work. A job opens with five concise sections: **Job**, **Plan**, **Devices**, **Results** and **Panel Pal**. Place the site name, job reference and local save status consistently at the top.

1. Review the job scope, instructions, known defects and access information.

2. Open a floor plan or filter the device list by floor, system or outstanding task.

3. Tap a device to see its location, identity, photographs, earlier findings and today’s required work.

4. Record the test, measurement, note or defect immediately.

5. Open the linked Panel Pal when explanation or diagnostic help is needed.

6. Review unresolved items, limitations and the condition in which the system was left.

7. Finish the visit and export its results for review.

Use clear text labels and touch targets, a restrained professional layout and short forms with progressive detail. Show whether a task is unrecorded, satisfactory, unsatisfactory, inaccessible or not applicable; require an explanation where the chosen template needs one. Notes and photographs should remain attached to the relevant asset or task.

Calculate outstanding counts from the stored task/results records. Show what those counts cover: this job’s selected scope, rather than an implied statement about every device on the site. Permit a visit to be recorded as complete with defects or limitations.

## Offline job packs and returned work

Use one documented, versioned job package; `.jobpack` is a proposed extension. A ZIP container can hold a small manifest, structured JSON and media files. The application must treat its contents as data and validate file types, schema, sizes and references before import.

| Package content | Purpose |
| --- | --- |
| Manifest | Schema version, package ID, job ID, site ID, export purpose, source application versions and base revision. |
| Job and site snapshot | Work instructions, selected system and assets, tasks, existing defects and assignment. |
| Drawings | Original editable Zone Sketch data plus the selected rendered drawing views. |
| Attachments | Required photographs and documents included as actual files. |
| Manual references | Exact document IDs, editions and hashes, plus any permitted included documents. |
| Results and change records | Engineer observations, measurements, photographs, defects and reviewed notes. |

Engineers should be able to receive the file through their chosen transfer method, open it in the installed app and continue offline. Email or messaging delivery requires connectivity; local file transfer can be a separate option. The pack must contain the required plans and photos, not just links to them.

The sending app can verify the contents of its package. The receiving device must separately check its local manuals, indexes, app resources and model availability. Model weights should not be copied into every job package. Show **Job ready offline** separately from **Panel Pal ready offline**.

Start with one assigned engineer per job, or explicitly split independent scopes into separate jobs. Every return references the outgoing base revision and carries stable result/change IDs. Reimporting the same return must be idempotent: no duplicated photos, readings or defects.

If the office and engineer changed the same record, present both versions for review. Do not decide the winner solely by timestamps. Preserve accepted history, the original returned pack and the origin of each record. A completion report should be tied to the reviewed job revision.

## FINDR local Panel Pal integration

Use **Load job into Panel Pal** for the local operation. Loading should attach the job to an appropriate existing Pal or guide the engineer to select the correct panel/model family. When the master app hosts the integration directly, **Help with this job** should perform that handoff in one action.

FINDR already has persistent Panel Pals, multiple conversations, conversation context, fault sessions and a helper backup format. Its current store uses `kind: "findr-helper"` and `schemaVersion: 1` for Pal backups. This is a useful foundation, but a Pal backup is not a job package. Add a dedicated job importer and adapter. [Panel Pal storage](https://github.com/william2535/Findr/blob/8bdd8b03feb8babd6266b80b57dbc5d53efeadb2/public/app/helpers-store.mjs).

Each attached conversation should retain the master site ID, job ID, job revision, selected system, optional asset ID and current task. Use a job-specific conversation so observations from one client site do not become another site’s facts. The same Pal’s manual collection and local model can be reused.

| Information supplied to the Pal | What it may support |
| --- | --- |
| Downloaded manufacturer manual passages | Supported procedures, menu paths, terminology and technical limits for the selected model and edition. |
| Imported drawings and asset records | Recorded locations, references, routes and equipment claims, with their verification state. |
| Job instructions and validated task template | Requested work, scope and the checks selected for this visit. |
| Engineer observations and results | What the engineer reported, measured, tested or confirmed during this job. |

Useful actions are **Explain this job**, **What do I need before starting?**, **Help with this device**, **I want to fault find**, **What is still outstanding?** and **Draft my service notes**. Keep manual sources available under a concise expandable section.

Example: an engineer opens a job containing a detector fault at a recorded address, selects **I want to fault find**, and the Pal already knows the selected panel, location, recorded fault and previous observations. It retrieves the relevant manual material, asks for the next useful observation and keeps the investigation linked to that asset. Any unresolved model or address ambiguity is shown before giving a model-specific procedure.

The current offline engine uses bounded manual evidence and selects evidence/next observations; it is not an unrestricted full-job reasoning interface. Build job summarisation, task lookup and job-note retrieval around explicit structured records. Do not assume that pasting a large job file into the existing prompt implements this integration. [Current engine](https://github.com/william2535/Findr/blob/8bdd8b03feb8babd6266b80b57dbc5d53efeadb2/public/app/helpers-engine.mjs).

Provide a compact job summary, the selected device/task, recent relevant observations and retrieved manual passages. Search the remaining job records locally when needed. Compute quantities and completion rules in ordinary code. Preserve numeric readings, units, negation and revisions exactly.

Return proposed notes, proposed defects or suggested next actions as structured drafts with evidence references. The engineer uses **Add to job** or **Confirm result** before a proposal becomes an authoritative record. A Pal can help write the record; the engineer remains the author of confirmed test outcomes.

Job import supplies context; it does not retrain the local model. The existing Panel Pal design similarly treats manuals as searchable references rather than changes to model weights. [Panel Pal design](https://github.com/william2535/Findr/blob/8bdd8b03feb8babd6266b80b57dbc5d53efeadb2/docs/COMPACT-PANEL-PALS.md).

Preserve offline mode. If the local model cannot run or a manual is missing, keep the job forms, map and records usable and explain the missing capability. Do not silently switch to an online service. Imported job text and document text must remain reference data, not commands to change the application.

The map viewer uses drawing coordinates directly. A local text model can use structured device and route information, but should not claim to have interpreted photographs or a floor-plan image without a supported and tested visual/OCR path. Do not infer real cable lengths from uncalibrated plan coordinates.

## Certificate generation

For non-domestic fire detection and alarm systems, BSI identifies **BS 5839-1:2025** as the current edition. Inspection and servicing, design, installation and commissioning have distinct certificate types. Use the appropriate template for the actual job and premises scope. [BSI](https://landingpage.bsigroup.com/LandingPage/Undated?UPI=000000000000862786); [ECA certificate listing](https://www.eca.co.uk/member-support/technical/fire-security-life-safety-systems).

For additional works, the FIA’s 2025 guidance identifies an extension or modification certificate and distinguishes the new work from conformity of the entire existing system. The additional-work import should therefore carry the exact work boundary and affected circuits into the document workflow. [FIA guidance, section 24](https://www.fia.uk.com/static/10e3c380-28c0-499b-887aafd51d12eff6/Guide-to-the-changes-in-BS-5839-1-2025.pdf).

Prefill site information, the equipment schedule and drawing references from the imported project. Build the certificate from the engineer’s actual visit records and declaration. An as-fit drawing or a complete checklist alone must not automatically assert compliance of the entire installation.

Use a reviewed, versioned template and deterministic field mapping. Record the relevant standard/edition, template revision, job scope, results, defects, variations or limitations, responsible engineer and declaration. The Pal may help draft narrative notes from facts, but must not invent measurements, pass results or signatures.

Real inspection, testing and servicing by competent people are the basis of the maintenance record; England’s Home Office guidance expressly addresses these duties. [Maintenance guidance, section 18](https://www.gov.uk/government/publications/people-with-duties-under-fire-safety-laws/a-guide-for-persons-with-duties-under-fire-safety-legislation-accessible).

Allow accurate reporting of defects and restricted access. Missing or excluded tests need the appropriate recorded explanation; they must not be converted to satisfactory results merely to finish the form. A customer acknowledgement should be distinct from the engineer’s technical declaration.

Freeze each issued document together with its supporting job revision. Allocate final certificate numbers at the chosen issuing point, while offline drafts use unique internal IDs. Corrections should create a revised document with retained history.

Before offering a certificate as compliant, validate the complete template, declaration, field requirements and rules against the licensed full applicable standard with a competent fire specialist. Public summaries establish the direction, but do not provide a complete verified certificate implementation. Keep rights-cleared templates separate from copyrighted standards and branded third-party forms.

## Technical integration

Use a modular offline application with an explicit shared data contract. The initial master app can be an installable web app, with local structured storage and packaged runtime assets. Keep its core job workflow independent of a compulsory account, subscription or cloud AI service.

Separate origins cannot directly share IndexedDB databases. Consequently, links between the existing applications are not enough to transfer job data. Begin with explicit packages; later, a deliberate common application/storage layer can provide seamless handoff. [IndexedDB documentation](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

Cache the app shell and all resources needed for the promised offline workflow, including report generation assets. Browser-managed storage has quotas and can be evicted, so provide export/restore and handle failed writes visibly. Persistent storage requests help but do not replace backups. [Offline operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation); [storage guidance](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Implement storage migrations and transactional writes. Large media should be stored once and referenced by stable IDs or hashes. Use hashes to check package integrity and deduplicate media; do not describe a hash as proof of who signed a certificate.

Keep the normal job workflow available while AI processing runs or fails. Bound model context and memory, expose processing progress and cancellation, and test on the actual target phones. Preserve the existing Zone Sketch backup format while adding an independently versioned integration format.

## Delivery sequence

**First milestone — site import and usable job.** Parse actual Zone Sketch saves, preserve revisions and identifiers, show the plans and assets, complete missing information, create a scoped maintenance job and record it locally.

**Second milestone — offline engineer handover.** Export a complete package, reopen it on a second device, record results and media offline, return the job and review conflicts without duplicate records.

**Third milestone — local Panel Pal assistance.** Load the job into a Pal, pass device/task context, retrieve relevant manual and job evidence, and return reviewed notes or defect proposals to the job.

**Fourth milestone — reviewed documents.** Generate a service report and validate the inspection/servicing certificate template. Keep issued documents and source results linked and revisioned.

Then add further job types and disciplines, additional-work certificates and direct shared-module integration. Scheduling, quotes, invoicing, stock control and automatic multi-engineer synchronisation can follow once the complete engineering workflow is dependable.

## Acceptance criteria

1. Import a fresh-install save, an additional-work save without zones, and a multi-floor save containing photos and issued as-fit snapshots.

2. Match the imported drawings and device references to the source project; do not turn non-equipment symbols into assets.

3. Reimport a changed drawing without duplicating the site or deleting historical results; show ambiguous mappings.

4. Create a maintenance job whose tasks all start unrecorded regardless of prior drawing verification.

5. On a second prepared device, cold-start with networking disabled, open the job, view all required plans and photos, record work, reopen after a restart and export the return.

6. Reimport the same returned pack twice without duplicate data; show a genuine conflicting edit for review.

7. Load the job into the correct local Panel Pal and answer with identifiable manual/job evidence. Handle a wrong model, missing manual and unavailable local model explicitly.

8. Keep Pal suggestions separate from confirmed results and prevent any unattended pass or signature.

9. Produce a report with recorded defects and limitations, preserve its issue history, and gate certificate issuance on the reviewed template and required declaration.

10. Reject malformed, unsupported or oversized packages without damaging existing work; retain backups across app updates and storage migrations.

## Open source and distribution

The new application can be released under a deliberately selected open-source licence. Zone Sketch’s current repository licence is proprietary and explicitly says it is not open source, so importing saves and reusing source code are different decisions. Shared code should be released only under the owner’s intended licence and with third-party obligations preserved. [Current Zone Sketch licence](https://github.com/william2535/FIRE-ZONE-PLAN-APP/blob/dca2eff063f52a9980c2aed255879a65cc579379/LICENSE).

Keep client job data, private manuals, credentials and downloaded model weights out of the public source repository. Publish the interchange schema, migration rules and synthetic examples. Document third-party runtime and model licences separately. Model/manual downloads should be explicit and reusable across jobs.
