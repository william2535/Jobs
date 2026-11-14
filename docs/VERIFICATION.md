# Milestone verification

Original milestone verified on 13 November 2026; notes and device-remarks update verified on 14 November 2026 with Node 24.22.1 and Chromium 156.0.8078.79. Automated fixtures and committed screenshots are synthetic. Physical iPhone/Android testing remains outstanding.

## References and repository boundaries

- Zone Sketch reference: `dca2eff063f52a9980c2aed255879a65cc579379`; its actual importer/exporter, engine, documentation and proprietary licence were inspected. No AGENTS.md was present. The source checkout remains unchanged.
- The approved companion receiver is in [Zone Sketch PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40), commit `ea04c0b8a1fad8fef1f649822b51d0d1a8170f3f`. It adds one receiver insertion in the web entry point and documentation. It is not merged or deployed; Android files and licences are unchanged.
- FINDR reference: `8bdd8b03feb8babd6266b80b57dbc5d53efeadb2`; repository instructions and actual local Panel Pal storage/engine were inspected. No FINDR changes were made.
- The owner's Jobs build brief and uploaded files were inspected. The existing customer save was used privately, with no copy added to public assets, automated fixtures or screenshots.

## Automated checks

`npm test`: **163 passed**. Coverage includes the genuine current and legacy Zone Sketch formats, stable mappings, excluded drawing objects, immutable drawing revisions, attachment validation, version 1/2/3 packages, duplicate/conflict protection, atomic save failures, concurrent-tab protection, workflow records, Panel Pal evidence separation, PNG caches, mobile totals and secure drawing handoff. New cases cover optional-site jobs, structured notes, photos, safe rich text, shared site settings and explicit per-job overrides. Device-remark cases cover strict schemas, retained history, actual photo pooling, archive/drawing-history preservation and Panel Pal privacy.

`npm run build`: passed. The production shell has no runtime npm dependencies. Its service worker precaches the built modules/styles, icons, manifest, synthetic demonstration and original licence notices. No customer files enter the build.

`npm run test:e2e`: **41 passed, 1 intentional desktop skip**. After a final change to reduce repeated mobile editor headings and use the persistent save status instead of a duplicate success banner, `npx playwright test tests/device-remarks.spec.js tests/job-notes.spec.js` passed **8 of 8** cases on the final production build. No further runtime changes were made. The production suite uses desktop Chromium and Pixel 7 emulation, including a separate 320px layout check. The mobile dashboard case intentionally runs only on the mobile project. Selectors in earlier workflow tests were updated for the simpler navigation; their original persistence and evidence assertions remain.

The new quick-flow cases verify that Create job works with no sites and creates no stored record until Save; the gear opens job settings; shared site changes appear in all linked jobs while explicit overrides remain; and an unsaved job cannot record work against its plan. Rich-note cases use actual browser formatting commands, an embedded photograph and a caption, then reload offline, edit, print, export, import into a fresh profile and check duplicate detection. They also reject unsafe pasted markup and malformed note packages, protect unsaved navigation and recover from a simulated IndexedDB failure.

Four new device-remark browser cases verify the screenshot-based editor, before/resolution photographs, captions, products, severity, dates and retained history. They save and reopen offline, export/reimport exact data, reject invalid files, keep internal notes out of reports, recover after a failed save and check all device tabs. Discarding a changed quick result restores its actual hidden value as well as its visual selection. Adding or resolving a remark leaves equipment Not tested; an explicit failed result requires an explanation.

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

Current device previews: [mobile remark editor](screenshots/mobile-remark-editor.png), [mobile defects](screenshots/mobile-device-remarks.png) and [desktop remark editor](screenshots/desktop-remark-editor.png).

Current notebook previews: [mobile job](screenshots/mobile-notes-job.png) and [desktop job](screenshots/desktop-notes-job.png). Existing synthetic previews show the unchanged [mobile dashboard](screenshots/mobile-dashboard.png), [desktop home](screenshots/desktop-home.png), [asset grid](screenshots/mobile-device-grid.png) and [included plans](screenshots/mobile-png-plan.png). Older creation screenshots document the previous flow and are not the current job-creation interface.

The public automatic connection becomes available after the companion Zone Sketch PR is merged and deployed. Jobs reports a missing receiver or blocked popup; it does not claim a connection before acknowledgement. Cold-opening the external Zone Sketch editor offline depends on that application's own caching, which the inspected web app does not provide. Jobs' saved PNG viewing, recording and export work independently offline.

Mobile verification uses browser emulation. Physical-device installation, OS share sheets and storage-pressure behaviour still need validation. FINDR's real adapter, validated certificate templates, cloud/team synchronisation and warehouse stock management remain future work. Draft reports do not claim compliance or automatically pass equipment.


## FINDR launcher update

The owner-requested circular FINDR logo sits directly below Toolbox on the mobile dashboard. The production build and existing mobile dashboard browser case passed. A focused browser check verified the original logo bytes, minimum 44px touch target, position below Toolbox, a real click opening `https://findr-fault-finder.floodyyy21.chatgpt.site/app/` with the FINDR app title, offline logo loading after preparation, and no horizontal overflow at 320px. [Mobile preview](screenshots/mobile-findr-launcher.png). This launcher does not transfer job context or implement the future Panel Pal adapter.


## Zone Sketch navigation update

Zone Sketch replaces Stock in the third position of the mobile home navigation. The production build and updated existing mobile dashboard browser test passed. A focused real-browser click opened the verified Zone Sketch v0.64 editor at `https://william2535.github.io/FIRE-ZONE-PLAN-APP/` in another tab, with a minimum 44px target and no horizontal overflow at 320px. FINDR remains underneath Toolbox. Existing per-job product records are unchanged. [Mobile preview](screenshots/mobile-zone-sketch-navigation.png).
