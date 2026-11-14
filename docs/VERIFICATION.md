# Milestone verification

Original milestone verified on 13 November 2026; site-folder and hold-edit update verified on 14 November 2026 with Node 24.22.1 and Chromium 156.0.8078.79. Automated fixtures and committed screenshots are synthetic. Physical iPhone/Android testing remains outstanding.

## References and repository boundaries

- Zone Sketch reference: `dca2eff063f52a9980c2aed255879a65cc579379`; its actual importer/exporter, engine, documentation and proprietary licence were inspected. No AGENTS.md was present. The source checkout remains unchanged.
- The approved companion receiver is in [Zone Sketch PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40), commit `ea04c0b8a1fad8fef1f649822b51d0d1a8170f3f`. It adds one receiver insertion in the web entry point and documentation. It is not merged or deployed; Android files and licences are unchanged.
- FINDR reference: `8bdd8b03feb8babd6266b80b57dbc5d53efeadb2`; repository instructions and actual local Panel Pal storage/engine were inspected. No FINDR changes were made.
- The owner's Jobs build brief and uploaded files were inspected. The existing customer save was used privately, with no copy added to public assets, automated fixtures or screenshots.

## Automated checks

`npm test`: **122 passed**. Coverage includes current and legacy Zone Sketch import, source identities, non-equipment exclusions, issued snapshots, no-zone layouts, immutable drawing revisions, attachments, package v1/v2, duplicate/conflict detection, atomic save failures, stale-tab rejection, workflow records, Panel Pal evidence separation, PNG cache validation, mobile dashboard calculations and secure handoff/return reconciliation. Site-folder cases verify required site identity, independent inheritance of recorded defaults, profile validation and package preservation. Unfilled workflow/report fields are omitted. Classification tests cover required selections, custom names, canonical package validation, legacy types and duplicate detection on the first export/reimport. Fourteen gesture cases cover the full three-second threshold, early release, movement, scrolling, multiple pointers, hidden/inert screens, keyboard editing and cleanup.

`npm run build`: passed. The production shell has no runtime npm dependencies. Its service worker precaches the built modules/styles, icons, manifest, synthetic demonstration and original licence notices. No customer files enter the build.

`npm run test:e2e`: **27 passed, 1 intentional desktop skip**. The production suite covers desktop Chromium and Pixel 7 emulation, including a separate 320px layout check. Six new cases cover site-first creation, inherited recorded details, omission of empty fields, three-second and keyboard editing, offline reopen, package reimport and saved per-job maps that remain unchanged after site plan updates. The mobile dashboard case intentionally runs only on the mobile project.

The final targeted rerun covers the creation flow and complete offline/package workflows after classification normalization and header editing fixes. Creation tests check that every Create job entry is disabled without a site; the three dropdowns contain the specified choices; custom names and description are required; only the requested creation fields are shown; and exports reopen without duplicate jobs. `npx playwright test tests/job-creation.spec.js tests/workflow.spec.js` passed **8 of 8** cases on the final production build, including immediate same-profile deduplication and custom header editing.

Completed-job export was also checked through **Finalisation → Export job**, after an offline reload and another offline save. `npx playwright test tests/new-workflow.spec.js -g "editable visit sections"` passed **2 of 2** desktop/mobile cases on that production build. The downloaded `.jobs.json` retained Complete status, work records, unchanged Not tested results, embedded PNG plans and photographs; importing into a fresh browser profile and exporting again preserved the drawing records exactly.

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
| Job creation | Create job is greyed out until a site exists; choose Site, Discipline, Job type and enter Description; Custom reveals its required name field |
| Site folders and hold editing | Create a named site first, then its job file; recorded site details are copied, empty boxes are hidden, and filled fields open after a three-second hold or Edit/keyboard |
| Each job’s saved map | Existing job retains original drawing and exact PNG bytes after a newer plan is saved to the site; offline export/import includes that job’s map |
| Save-time input protection | A deliberately delayed local save makes the editable area inert until completion, preventing late typing from being discarded by the saved render |
| Concurrent site/equipment drafts | Saving one form warns before discarding the other unfinished form; cancelling retains both drafts and saved records |
| Mobile workspace | Deep-blue dashboard shows actual completion/time, date filters, job search, products and timesheets; fixed navigation; no horizontal page overflow at 320px |
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

Synthetic previews: [mobile creation](screenshots/mobile-create-job.png), [disabled creation](screenshots/mobile-create-disabled.png), [desktop creation](screenshots/desktop-create-job.png), [mobile site-folder job](screenshots/mobile-site-job-screen.png), [hold editor](screenshots/mobile-hold-editor-screen.png), [desktop site-folder job](screenshots/desktop-site-job.png), [mobile dashboard](screenshots/mobile-dashboard.png), [mobile assets](screenshots/mobile-device-grid.png), [mobile plans](screenshots/mobile-png-plan.png), [desktop workspace](screenshots/desktop-home.png).

The public automatic connection becomes available after the companion Zone Sketch PR is merged and deployed. Jobs reports a missing receiver or blocked popup; it does not claim a connection before acknowledgement. Cold-opening the external Zone Sketch editor offline depends on that application's own caching, which the inspected web app does not provide. Jobs' saved PNG viewing, recording and export work independently offline.

Mobile verification uses browser emulation. Physical-device installation, OS share sheets and storage-pressure behaviour still need validation. FINDR's real adapter, validated certificate templates, cloud/team synchronisation and warehouse stock management remain future work. Draft reports do not claim compliance or automatically pass equipment.
