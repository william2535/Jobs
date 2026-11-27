# Milestone verification

Original milestone verified on 13 November 2026; daily timesheets update verified on 14 November 2026 with Node 24.22.1 and Chromium 156.0.8078.79. Automated fixtures and committed screenshots are synthetic. Physical iPhone/Android testing remains outstanding.

## Offline startup and quick assets 1.3.1 — 27 November 2026

Already installed Jobs now verifies the controlling worker's saved files and build without waiting for network registration. First installations that finish late can recover automatically; manual retry can replace a hung registration. Controller identity and attempt generations prevent delayed replies from claiming readiness for the wrong worker. Missing, incomplete, mismatched or unresponsive caches remain unverified. Update activation remains explicit and never discards work.

Saved-work status banners can be closed, swiped horizontally or dismissed with Escape even when offline registration failed. Vertical gestures retain native scrolling. Actual unsaved work, failed saves, recovery and unavailable local storage still force the status visible; Help & data retains offline readiness information.

Quick asset presets, favourites and duplicates support 1–100 equipment records in one atomic save. Numbering retains prefixes and padding while skipping occupied references. Duplicates prefill equipment details, floor and location; every new device has a fresh identity and untested result, without copied serial numbers, map positions, photos or inspection evidence. A linked batch creates one working drawing revision. Compact quick forms keep quantity, reference preview and Add together on mobile; unchanged preview text preserves the first Safari submit tap after typing.

- **455 unit/DOM/service-worker tests passed**, including controller races, registration retry, status gestures, batch validation/rollback, large numbered sequences, fresh evidence and package round trips.
- All **15 targeted browser cases passed** on iPhone WebKit, desktop Chromium and mobile Chromium against the final build. Tests create 100 devices offline, duplicate without retyping, preserve original photo/result evidence, retry a failed batch save, reload and export 103 distinct devices. Prepared profiles reopen with registration deliberately hung or rejected; timeout banners dismiss without suppressing unsaved-work warnings. Gesture handling is tested with pointer events and native Chromium wheel scrolling; physical iPhone swipes remain a hardware check.
- Production build `3bb4acb2689206ae2d15` and release verification passed with **30 distributable files** and complete offline precache.
- Light/dark quick forms were checked at 375, 390 and 1024 pixels without horizontal overflow. Browser regression scenarios cover cached offline reload, timeout dismissal, first-tap saving, a 100-asset batch, duplication, failed-save retry and exported evidence.

## Desktop office overview 1.3.0 — 27 November 2026

Desktop Jobs now groups received day packs by engineer, shows recorded attendance and time allocation, opens engineer-filtered timesheets and exports office CSV. Office NFC entry explicitly confirms the engineer tag; that tag follows ordinary job exports, newly created jobs and recorded sessions. The site/asset overview counts saved sites without a retained Zone Sketch source and distinct saved asset identities, including manual registers and retained history. These inventory counts are independent of day/engineer filters and do not invent historical creation dates.

- **432 unit/DOM/service-worker tests passed**, including atomic batch imports, engineer identity, filtered timesheet exports, latest-return selection, cross-engineer time conflicts and site/asset deduplication.
- **21 targeted browser cases passed across the development runs** on iPhone WebKit, desktop Chromium and mobile Chromium. The final six-case run on build `2c37f488d5adb65f5bfc` verifies that changing the collecting engineer updates later NFC imports and new-job membership, and that repeated/amended packs retain three sites and seven distinct assets without inflation. Site/job drilldowns, reload, offline work, invalid-batch rollback, filtered CSV and day-return receipts are covered.
- Production build and release verification passed with **30 distributable files** and complete offline precache. The complete browser regression suite also runs in GitHub CI before merge.
- Light/dark desktop layouts were checked at 1024 and 1440 pixels. The phone field dashboard and existing Share chest remain the entry points for mobile work.

The office view updates when files are received on that computer; it is not a live remote feed. Job time / attendance is an explicit allocation calculation and is withheld when timing is missing or conflicting. Hardware NFC, OS share sheets and mixed iPhone/Android offline file delivery still require physical-device testing. Engineer tags are entered names, not authenticated identities.

## Quick Transfer 1.2.0 — 27 November 2026

The existing job-card share chest now supports multi-job day packs, manager save-only redistribution, explicit day start/finish, returned work and matching receiving-phone receipts. The Android share bridge accepts editable JSON packs as well as PDFs. NFC office links open the same chest without changing timers.

- All **387 unit/DOM/service-worker tests passed**. Focused coverage includes bounded/checksummed packs, unchanged reimports, conflicting time retention, moved/deleted attendance, exact failed-save retries, backup persistence and native share cancellation.
- All **9 new browser checks passed** across iPhone WebKit, desktop Chromium and mobile Chromium with real file downloads/imports and offline browser contexts. A three-workspace office → manager → engineer → office handover retains conflicting office work and only marks the returned copy received after its matching receipt is imported.
- Real IndexedDB failures during collection and finishing leave saved records unchanged; retry saves the original candidate, including its original start/finish times. Share cancellation and offline office-link navigation do not acknowledge a return or stop a day.
- The production build and release verification pass with 30 distributable files. Existing complete browser regression checks also run in GitHub CI before merge.
- Physical NFC routing, installed-phone storage context and actual AirDrop/Quick Share delivery still require hardware testing. Browser automation does not prove mixed iPhone/Android transport interoperability. Receipts match content; they are not authenticated identities or payroll approval.

## Public release 1.0.0 — 16 November 2026

This release targets independent engineers using their own local workspace. The release source is [`8bf0eab03dcdd75443c0d68c2f54f9ac523df030`](https://github.com/william2535/Jobs/commit/8bf0eab03dcdd75443c0d68c2f54f9ac523df030), version **1.0.0**, application build **`4feb87501bab15ae2b3c`**. Earlier counts and limitations below describe their named development releases; this section records the public-release checks.

- **Local checks:** all **272 unit, DOM and service-worker VM tests passed**. `npm audit` reported **zero vulnerabilities** in the locked dependency tree. Production build and release verification passed.
- **Browser CI:** both the exact-commit [push run 43824940846](https://github.com/william2535/Jobs/actions/runs/43824940846) and [pull-request run 43824946784](https://github.com/william2535/Jobs/actions/runs/43824946784) completed successfully. The full browser suite recorded **74 passed and one intentional skip** in 5.6 minutes, including **all three iPhone WebKit cases**. Unit tests, production build, release verification, browser tests and release packaging all succeeded in the workflow.
- **New release workflows:** three browser scenarios cover whole-workspace backup and safe restore with photographs and unassigned time, recovery of attempted notes/photos after a failed save, and retrying failed local opening without presenting retained records as an empty workspace. They run in desktop Chromium, Pixel 7 Chromium emulation and iPhone 13 WebKit emulation. Existing job, plan, offline, report, timesheet and import suites remain in the Chromium projects.
- **Private genuine-save check:** the supplied **22,437,621-byte Zone Sketch save** imported as **one floor and 40 assets**, with **40 Not tested visit results**. A **11,454,371-byte workspace backup** restored the complete workspace, original drawing, included photos and stable IDs exactly; repeating the restore was a duplicate no-op. This check ran privately in memory; no customer file, export or screenshot was written or added to release assets.

Release fixes include complete job-workspace backup of sites without visits, jobs, drawings/attachments, import receipts, quick defects and unassigned timesheets; strict restore validation with refusal to overwrite a different populated workspace; and a clearly labelled recovery download of the attempted save when local storage fails. Normal job-package import remains the route for merging individual jobs. In-app Help & data explains installation, browser-local storage, backups, recovery and updates. Failed startup now offers retry rather than an apparent fresh workspace.

The service worker verifies actual cached shell bytes before reporting readiness, handles preparation failure with bounded retry, waits for an explicit saved-work update transition, blocks activation while another Jobs window remains open and retains the preceding hashed assets. VM checks cover old-client lazy loading, failed preparation and safe activation. Cache identity includes built HTML and asset contents. When migrating from a pre-1.0 installation, first open Jobs online so it can download the updated worker, then close all Jobs tabs and installed-app windows and reopen online; the prior worker cannot display the new Apply update control. Keep the same host/base path and export a backup before updating.

The [successful CI release artifact](https://github.com/william2535/Jobs/actions/runs/43824940846/artifacts/14206351899) contains **16 served files**, plus installation instructions and a per-file SHA-256 manifest. The workflow retains this artifact for 30 days; keep a separate copy for long-term release records. The distribution allowlist excludes source checkouts, JavaScript source maps, credentials and customer saves; public assets match source, all served shell assets are precached and original ownership/licence notices are retained. The current archive checksum is `cd1b52bf8aa9467461ef371eb00cb3158f825d43c2ee16d1cc8f6ddeadf34ae4` for `jobs-1.0.0-4feb87501bab15ae2b3c.tar.gz`. Checksums detect accidental changes and are not a publisher signature. The input audit found no executable rich-text/image path or supplied-customer markers in shipped assets; imported PNG previews now validate their real PNG dimensions instead of trusting metadata. See [release building](release-build.md), [workspace backup](workspace-backup.md) and [public-release guidance](public-release.md).

Physical iPhone/Android installation, OS share sheets and device-storage pressure still need real-device validation; WebKit emulation is not a physical iPhone test. The live Zone Sketch automatic receiver remains unavailable while [companion PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40) is unmerged/undeployed, so file export/import is the supported fallback. Reports remain draft service records, not validated compliance certificates. FINDR tools are local deterministic aids and practice tools; Panel Pal provides an export contract only, with the actual adapter still future work. Records do not synchronize automatically or back up to a cloud account.

## References and repository boundaries

- Zone Sketch reference: `dca2eff063f52a9980c2aed255879a65cc579379`; its actual importer/exporter, engine, documentation and proprietary licence were inspected. No AGENTS.md was present. The source checkout remains unchanged.
- The approved companion receiver is in [Zone Sketch PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40), commit `ea04c0b8a1fad8fef1f649822b51d0d1a8170f3f`. It adds one receiver insertion in the web entry point and documentation. It is not merged or deployed; Android files and licences are unchanged.
- FINDR reference: `8bdd8b03feb8babd6266b80b57dbc5d53efeadb2`; repository instructions and actual local Panel Pal storage/engine were inspected. No FINDR changes were made.
- The owner's Jobs build brief and uploaded files were inspected. The existing customer save was used privately, with no copy added to public assets, automated fixtures or screenshots.

## Automated checks

`npm test`: **195 passed**. Coverage includes the genuine current and legacy Zone Sketch formats, stable mappings, excluded drawing objects, immutable drawing revisions, attachment validation, version 1/2/3 packages, duplicate/conflict protection, atomic save failures, concurrent-tab protection, workflow records, Panel Pal evidence separation, PNG caches, mobile totals and secure drawing handoff. New cases cover optional-site jobs, structured notes, photos, safe rich text, shared site settings and explicit per-job overrides. Device-remark cases cover strict schemas, retained history, actual photo pooling, archive/drawing-history preservation and Panel Pal privacy. Quick-defect cases cover safe reusable fields, deduplication, fresh evidence, explicit outcomes, legacy storage, atomic library writes and stale-tab protection.

`npm run build`: passed. The production shell has no runtime npm dependencies. Its service worker precaches the built modules/styles, icons, manifest, synthetic demonstration and original licence notices. No customer files enter the build.

Previous device-card update — `npm run test:e2e`: the complete run finished with **43 passed, 1 intentional desktop skip** and two copies of the existing 320px grid-height check failing because the new controls made four rows 718px high. Mobile spacing was reduced without changing font sizes or 44px touch targets. After rebuilding, `npx playwright test tests/grid.spec.js tests/quick-devices.spec.js` passed **all 6 cases** on the final production build, including both compact-grid checks. All 45 applicable cases therefore passed across the full run and focused correction check. The suite uses desktop Chromium and Pixel 7 emulation; the dashboard case intentionally runs only on mobile. Earlier workflow assertions for persistence and evidence remain intact.

The new quick-flow cases verify that Create job works with no sites and creates no stored record until Save; the gear opens job settings; shared site changes appear in all linked jobs while explicit overrides remain; and an unsaved job cannot record work against its plan. Rich-note cases use actual browser formatting commands, an embedded photograph and a caption, then reload offline, edit, print, export, import into a fresh profile and check duplicate detection. They also reject unsafe pasted markup and malformed note packages, protect unsaved navigation and recover from a simulated IndexedDB failure.

Four new device-remark browser cases verify the screenshot-based editor, before/resolution photographs, captions, products, severity, dates and retained history. They save and reopen offline, export/reimport exact data, reject invalid files, keep internal notes out of reports, recover after a failed save and check all device tabs. Discarding a changed quick result restores its actual hidden value as well as its visual selection. Adding or resolving a remark leaves equipment Not tested; an explicit failed result requires an explanation.

Four quick-device cases verify direct Pass, required Fail/N/A explanations, cancelled navigation and filtering, failed result writes, existing-explanation reuse, offline reopening and exact result export. Starred-defect cases verify quota-failure rollback, retry, deduplication, keyboard focus, offline reuse on a new visit, new IDs and Open status, exclusion of old photos/location/private notes/products, removal without deleting recorded evidence, and exact package round trips. The picker remains open when crossing the mobile breakpoint; a global resize redraw that previously closed it was corrected.

The retained browser cases exercise the detailed work tools behind settings, site/equipment editing, hold-to-edit, checklist drafts, pinned maps, offline recording, full package round trips and conflicting imports. Checklists never pass equipment and do not issue compliance certificates.

| Workflow | Verified behaviour |
| --- | --- |
| Genuine save import | Real source envelope and legacy marker accepted; stable floor/device mappings; source content, photos, circuits and issued records retained |
| Local save/reopen | IndexedDB persistence after reload; invalid files and failed transactions preserve saved work |
| Offline work | Prepared profile reloads offline, opens included PNGs/photos, records results and exports |
| Complete package round trip | Fresh receiving profile retains IDs, drawing histories, exact PNG bytes, original data and visit photographs |
| Duplicate/conflict protection | Identical packages do not duplicate visits; divergent work remains separate; derived PNG cache changes do not create false drawing conflicts |
| Results | New visits remain Not tested; explanations required for inaccessible/unsatisfactory/not-applicable outcomes; prior drawing state does not pass today's equipment |
| Revised drawings | In-job source import retains matching results, archives removed-device evidence and starts added devices Not tested |
| PNG plans | Working/issued selectors, exact offline PNG download, genuine full-image Fit and zoom, included historical evidence, paged asset navigation |
| Manual equipment | Unknown positions remain unknown; unrelated external symbols are not silently equated by human reference alone; archived evidence remains intact |
| Editable job workflow | Details, scope, contacts, appointments, actions, products, local POs, timesheets and finalisation survive reload/export |
| Job creation | Create job immediately opens a blank notebook, with or without a site; only Save/Save settings persists the record; optional classifications and site are behind the gear |
| Shared site setup | Recorded site settings apply to linked jobs; explicit job overrides survive later site changes, while notes, results and pinned drawings remain unchanged. Detailed readouts retain hold/Edit/keyboard editing |
| Each job’s saved map | Existing job retains original drawing and exact PNG bytes after a newer plan is saved to the site; offline export/import includes that job’s map |
| Save-time input protection | A deliberately delayed local save makes the editable area inert until completion, preventing late typing from being discarded by the saved render |
| Concurrent site/equipment drafts | Saving one form warns before discarding the other unfinished form; cancelling retains both drafts and saved records |
| Mobile workspace | Deep-blue dashboard shows actual completion/time, date filters, job search, products and timesheets; fixed navigation; no horizontal page overflow at 320px |
| Device remarks | Grouped finding/resolution editor; separate before/resolved photos; explicit severity/status; products/history; internal notes excluded from client reports; no automatic result changes |
| Notes and finalisation | Formatted text, photographs and captions survive offline save/reload/export; Finalisation previews and prints recorded content and exports the complete job |
| Reports/FINDR | Draft report contains actual engineer evidence; Panel Pal export identifies its adapter as future work |

## Actual Zone Sketch connection

Both optional integration checks passed against the separately checked-out original application plus the independent receiver:

```sh
ZONE_SKETCH_REFERENCE=/workspace/zone-sketch/index.html node tests/zone-bridge-source.mjs
ZONE_SKETCH_REFERENCE=/workspace/zone-sketch/index.html node tests/zone-bridge-jobs.mjs
```

The first verifies automatic loading without a file picker, editing through original controls, original-engine PNG generation, duplicate-load protection, forged-source rejection and dropped-acknowledgement retry with the same request. Switching to another Zone Sketch project blocks Save to Jobs, protecting the pinned site.

The second uses a real production Jobs build at 390px and a separate temporary Zone Sketch origin. Site-only and job launches load automatically. Saving returns actual PNG sheets and the editable envelope, preserves stable site/job/asset IDs and an existing unsatisfactory result, retains previous revisions, then reopens the returned PNG and exports the job while offline.

The actual companion branch was also verified with its configured trusted HTTPS origin. An ordinary Zone Sketch launch does not show the connection UI. Its existing original browser regression passed. No proprietary full application is committed or bundled with Jobs.

Earlier compatibility checks also used the unmodified application's actual import/backup UI with synthetic fire, intruder, CCTV and access drawings. IDs, types, references, positions and walls survived; multi-floor photographs, circuits and issued snapshots remained present.

## Supplied real example

The user-supplied save contains **1 floor, 40 equipment assets, 3 zones, 3 circuits and 276 revisions**. The independent importer excluded 190 non-equipment objects. Parsed original-envelope equality was checked.

The final PNG flow privately imported it, produced one decodable included PNG with no preview errors, created a job with all 40 results Not tested, reopened the exact PNG offline, and exported with the complete original source preserved. The resulting package was approximately **20.4 MB**. No customer screenshot or exported package was committed.

Earlier v2 attachment-pooling verification retained the real source plus four edited drawing revisions in approximately 12.1 MiB before the PNG cache feature was added. This is a different package from the final PNG example above.

## Previews and boundaries

Current device previews: [mobile quick results](screenshots/mobile-inline-device-results.png), [saved quick defects](screenshots/mobile-quick-defects.png), [desktop quick results](screenshots/desktop-inline-device-results.png), [mobile remark editor](screenshots/mobile-remark-editor.png) and [desktop remark editor](screenshots/desktop-remark-editor.png).

Current notebook previews: [mobile job](screenshots/mobile-notes-job.png) and [desktop job](screenshots/desktop-notes-job.png). Existing synthetic previews show the unchanged [mobile dashboard](screenshots/mobile-dashboard.png), [desktop home](screenshots/desktop-home.png), [asset grid](screenshots/mobile-device-grid.png) and [included plans](screenshots/mobile-png-plan.png). Older creation screenshots document the previous flow and are not the current job-creation interface.

The public automatic connection becomes available after the companion Zone Sketch PR is merged and deployed. Jobs reports a missing receiver or blocked popup; it does not claim a connection before acknowledgement. Cold-opening the external Zone Sketch editor offline depends on that application's own caching, which the inspected web app does not provide. Jobs' saved PNG viewing, recording and export work independently offline.

Mobile verification uses browser emulation. Physical-device installation, OS share sheets and storage-pressure behaviour still need validation. FINDR's real adapter, validated certificate templates, cloud/team synchronisation and warehouse stock management remain future work. Draft reports do not claim compliance or automatically pass equipment.


## FINDR launcher update

The owner-requested circular FINDR logo sits directly below Toolbox on the mobile dashboard. The production build and existing mobile dashboard browser case passed. A focused browser check verified the original logo bytes, minimum 44px touch target, position below Toolbox, a real click opening `https://findr-fault-finder.floodyyy21.chatgpt.site/app/` with the FINDR app title, offline logo loading after preparation, and no horizontal overflow at 320px. [Mobile preview](screenshots/mobile-findr-launcher.png). This launcher does not transfer job context or implement the future Panel Pal adapter.


## Zone Sketch navigation update

Zone Sketch replaces Stock in the third position of the mobile home navigation. The production build and updated existing mobile dashboard browser test passed. A focused real-browser click opened the verified Zone Sketch v0.64 editor at `https://william2535.github.io/FIRE-ZONE-PLAN-APP/` in another tab, with a minimum 44px target and no horizontal overflow at 320px. FINDR remains underneath Toolbox. Existing per-job product records are unchanged. [Mobile preview](screenshots/mobile-zone-sketch-navigation.png).

## Plan asset-row controls

The corrected placement puts Pass / Fail / N/A in the middle of each working asset row under **Plan → Assets on this floor**, with an icon-only pencil at the far right. Names still open full device records. Issued snapshots and site-only plans have no visit-result controls. Draft jobs must be saved before recording results.

`npm test`: **172 passed**; production build passed. The affected grid, quick-device, Plan and workflow suite covered 18 desktop/mobile cases. Its first run passed 15, with the remaining failures caused by a PNG-only assertion counting the new pencil icons and a 43.99994px floating-point measurement of a 44px control. The assertions now target the actual plan viewport and round geometry to 0.01px. After adding pan preservation and rebuilding, all **6 final Plan/PNG cases passed**, completing the affected coverage. No application or test failures remain.

The final cases verify horizontal name/result/pencil placement at 390px and 320px, minimum 44px controls, no page overflow, name→Record and pencil→Defects, and absence of editing controls in issued/site-only views. Result saves preserve floor, asset page, zoom and nonzero pan; failed saves preserve saved evidence. Cancelled floor/page/record changes retain unfinished explanations. Offline reopening/export retains exact results and included drawing/PNG data. Existing issued/revision/attachment round trips also pass. View position is session UI state, not new drawing or package data.

Previews: [mobile plan rows](screenshots/mobile-plan-inline-results.png) and [desktop plan rows](screenshots/desktop-plan-inline-results.png). Physical-device testing remains outstanding.


## PDF-derived fire maintenance and A4 reports

Verified on 14 November 2026. The supplied nine-page PDF was inspected privately; its customer details, photographs, branding, accreditation declarations and terms were not copied into fixtures, application assets or generated reports. Twenty-one prompt types were independently implemented: eight system questions, seven panel questions and six battery questions. The battery service-life prompt uses manufacturer criteria, not an assumed universal replacement interval. The source is an example report, not a complete compliance standard.

`npm test`: **183 passed**, including 11 new data/package cases. Production build passed. The complete browser run passed 52 cases with one intentional desktop skip and one old print assertion that read the result before asynchronous photo preparation finished. The notes/checklist/workflow assertions now wait for the print callback, keeping their content assertions intact. All **20 affected desktop/mobile cases then passed**. Following scoped print-layout and form-label corrections, all **6 final maintenance/report cases passed** on the final build. All 55 applicable cases are covered across these runs; no unresolved failures remain.

The checks verify null-first partial answers, valid zero readings, required Fail/N/A explanations, explicit linked/manual panel and battery records, standalone opt-in without inventing job classification, revision history, offline save/reload, failed-save retry, attachment-preserving package round trips, duplicate detection and malformed-record rejection. Device results remain Not tested unless separately confirmed. At 320px the form has no horizontal page overflow, result controls retain 44px touch targets and text fields retain usable width.

Report verification covers actual severity/status totals, current and historical maintenance answers with original visit metadata, separate resolved repairs, rich notes, source/visit/remark photographs and exclusion of internal/invoice notes. Printing waits for deliberately delayed image decoding, retains its snapshot through print/cancel, refreshes saved data for native beforeprint, clears a stale snapshot when no job is open, and recovers from a deliberately failed image decode without invoking print or replacing the last good report. Controls do not enter the printable document.

A real **11-page A4 PDF** was generated from synthetic data containing 16 devices, open/resolved findings, included photographs and two maintenance revisions. Text extraction verified the last device, photo captions and exclusion of private-note tokens. The first, question and final pages were visually inspected; pages have a white background, readable tables, separate historical evidence and page numbers in Chromium. Physical iPhone/Android print/share sheets remain unverified. Browser support for printed page counters may vary.

Previews: [synthetic PDF](examples/synthetic-fire-service-report.pdf), [report first page](screenshots/fire-service-report-first.png), [report final page](screenshots/fire-service-report-last.png), [mobile maintenance](screenshots/mobile-fire-maintenance.png) and [desktop maintenance](screenshots/desktop-fire-maintenance.png). Reports remain draft service reports, not issued compliance certificates. See [maintenance and printing details](fire-maintenance.md).

## Daily timesheets

`npm test`: **195 passed**. Production build passed. The complete browser run finished with **62 passed, 1 intentional desktop skip and 1 first-install offline-startup failure**. The failure exposed an existing uncontrolled-document race after navigation during service-worker activation. Jobs now asks the active worker to claim the document, preserving any open draft. After rebuilding, all **18 affected desktop/mobile cases passed**, including the previously failing case, all timesheet cases and two new regressions that deliberately suppress the initial activation claim and then reopen offline. All **65 applicable browser cases passed across these runs**; no unresolved failure remains.

Coverage includes the daily timeline, date navigation, add/edit sessions, type selection, optional job links, Start/Finish dates, one-minute adjustments and calculated duration. Job-linked and unassigned records save and reopen offline. Overnight intervals retain one stable session while daily totals count only the relevant portion; calculations use local wall-clock values rather than timezone/DST elapsed time. Earlier hours-only and undated records remain editable without invented times. The mobile layout is checked at 320px without horizontal page overflow.

Data and browser checks cover atomic moves between jobs and the unassigned collection, failed-save preservation, stable IDs, stale edits, local submission receipts and retained amendment history. Submission reviews pending sessions and shows whole overnight intervals separately from the selected day's totals. Trashed records and their submitted snapshots remain in exported `archivedEntries`, including an otherwise empty day. Duplicate active IDs are flagged and excluded from confirmed totals. Job-linked time survives normal job-package export/import; the separate timesheet JSON includes the selected day's linked and unassigned records. A post-commit download failure preserves the saved local submission and allows a plain export retry.

Previews: [mobile daily timesheet](screenshots/mobile-timesheets.png) and [mobile session editor](screenshots/mobile-timesheet-editor.png). These use synthetic records. Physical iPhone/Android testing remains outstanding. Submission is a local saved snapshot and JSON download; there is no office delivery, payroll approval, synchronisation or standalone timesheet-file importer. See the [timesheet workflow and data contract](timesheets.md).

## Coloured Zone Sketch launcher

The mobile navigation uses the original 256×256 coloured house-and-flame PNG in place of its plain outline icon. The label and external destination remain unchanged. Its 26px logo and reduced gap preserve the existing navigation row height and minimum 44px link target. Source syntax and the production build passed; all four existing engine/licence checks passed. Exact original/bundled logo bytes, matching licence notices and inclusion in the generated offline precache were verified. Browser visual QA for this small change was unavailable in the managed environment because the required cloud-browser tool was not present; earlier screenshots predate this logo update.

## Embedded FINDR Toolbox — 14 November 2026

The current FINDR source and repository instructions were inspected at `8bdd8b03feb8babd6266b80b57dbc5d53efeadb2`. All four core calculators, the complete six-calculator/six-guide on-site pack, Resistor Lab and FESS revision are included in Jobs. Source hashes and unchanged-file boundaries are recorded in the two FINDR vendor provenance manifests. The FINDR checkout and live application were not changed.

`npm test`: **235 passed**. This includes 26 calculator/source-integrity checks and 14 event-driven DOM, engine and storage checks for Toolbox. The latter exercise every calculator form, invalid/zero/missing inputs, saved drafts, failed writes, guides, the mobile Toolbox action, resistor search/sandbox, FESS correction/reopen, full-paper submission and isolated IndexedDB storage. Navigation leaves the app hash unchanged; disposal disables old controls and stops timers. Calculator drafts and practice progress remain separate from job records.

The production build passed. Its lazy Toolbox chunk includes the complete question bank and six embedded SVG guides, and every build asset except the service worker itself is listed in the offline precache. No external download is needed for tool calculations or practice content; source-reference links remain external. Original component notices are included in the build. No customer data was added.

These new interaction checks run in Happy DOM under Node, not a real browser. Fresh mobile visual and browser-offline QA could not run because the managed browser tool was unavailable in this environment. Earlier browser results above concern their stated releases and do not constitute new Toolbox browser verification. Physical-device verification remains outstanding.

## Overview tool chest — 14 November 2026

Toolbox now opens as a bounded, non-modal chest over the existing overview instead of navigating to a full-page tool workspace. The background stays mounted and usable; tools render inside a scrollable tray with a close button, Escape handling, trigger state and focus return. The opening motion respects reduced-motion preferences, and the panel uses available viewport height while reserving space around the overview. Tool navigation resets the tray and focuses the destination; editing answers and inputs does not reset the tray.

`npm test`: **241 passed**. Six new event-driven Happy DOM checks cover retained overview content, close/focus behaviour, unsaved-close rejection, stale lazy-load races, retry/disposal and a real calculator round trip inside the chest. The existing FESS paper check now confirms navigation notification only after the new destination renders and no navigation reset on answering. All **20 focused Toolbox checks** passed before the final full run. The production build passed; all 15 build files were inspected and every application asset remains in the offline precache.

Fresh real-browser animation, layout and mobile keyboard checks were unavailable because this managed environment has no supported browser tool. These DOM tests do not measure visual geometry. Phone visual verification remains outstanding.
