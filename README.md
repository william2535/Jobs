# Jobs

**[Open the Jobs website](https://jobs-field-workspace.floodyyy21.chatgpt.site)** · [Hosting and access details](docs/deployment.md)

An independent, local-first job workspace for fire and security engineers. First working milestone: import a Zone Sketch drawing, review equipment, create a visit, record evidence, save locally, export a complete package and reopen it on another prepared device. No account, backend, paid API or AI service is required.

[Desktop notes](docs/screenshots/desktop-notes-job.png) · [Mobile notes](docs/screenshots/mobile-notes-job.png) · [Mobile dashboard](docs/screenshots/mobile-dashboard.png) · [Mobile plans](docs/screenshots/mobile-png-plan.png) · [Verification results](docs/VERIFICATION.md)

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm ci
npm run dev
```

For **offline use**, use the production build, not Vite development mode:

```sh
npm run build
npm run preview -- --port 4173
```

Open `http://localhost:4173`. Wait for **Ready offline**, then save a job. The service worker caches the built application; IndexedDB stores sites, drawings, jobs and embedded photographs. Offline reopen, included plan/photo viewing, recording, report printing and JSON export then work without the server. The first preparation requires loading the app while the server is available.

To install on phones, serve `dist/` over **HTTPS** (ordinary HTTP LAN addresses do not enable service workers). On iPhone use Safari → Share → Add to Home Screen; on Android/Desktop use the browser’s install option. This is a static app, including when hosted. No customer data is sent to a server. Keep exported backups: browser storage can be cleared or evicted. “Protect local storage” requests persistence but cannot guarantee it.

## Workflow

1. Choose **Create job** to open blank **Notes**. From Home, a site, title, discipline, job type and description are optional; from a site folder the site is already linked. Write immediately, add pictures or leave the note blank, then press **Save**. Nothing is added to saved jobs until an explicit save succeeds; **Save settings** also saves the job.
2. Open a job card to return to its notes. Use headings, lists, bold, italic, underline, text sizes, colours, highlights and alignment. Pictures and captions are included in local storage and exports. Save failures keep the editor open for retry.
3. Use the **gear icon** on a job card or inside the job for optional site selection, title, status and **More details**. Discipline choices are Fire, Security, Intruder, CCTV, Access control and Custom; job types are Maintenance, Small works, Install, Take over visit, Call out and Custom. Only a selected Custom option requires a custom name.
4. Set up a reusable site through **Sites** or **Import Zone Sketch**. Its contact, access and work settings apply to linked jobs; changes to shared settings appear across those jobs unless a field has a job-specific override. **Use site settings for this job** restores inheritance. Linking a standalone job adds the site's current drawing and fresh **Not tested** results without replacing its notes. Plans and recorded results are never automatically replaced when site settings change.
5. Open **Plan → Assets on this floor** for the job's saved drawing and equipment. Working rows have **Pass / Fail / N/A** in the middle and a pencil at the far right to open **Defects**. Missing explanations are requested before Fail or N/A saves; saving keeps the floor, page and zoom. The **Devices** grid retains these controls too. Issued snapshots and site-only plans have no visit-result controls. Defects include before/resolution photographs, severity, recommendations and products. Save a remark, then tap **☆** to reuse its wording through **Add remark → Saved quick defects** on later jobs in this browser. Prior visit evidence and test outcomes are never copied by the shortcut. Full device records retain observations, readings with units, notes and all result states.
6. Open **Finalisation** for the A4 draft report, **Print report** and **Export job**. The report brings together saved notes, pictures, device results, findings and recorded repairs. Fire maintenance jobs also offer **Maintenance questions** for system, panel and battery checks. Save a partial record and return later; unanswered checks remain Not recorded. The `.jobs.json` includes saved notes, pictures and any site, drawing and work evidence. Standalone jobs export without a fabricated site. **Import job** validates the complete package before saving; identical reimports reopen the existing job and conflicts preserve both versions. Export works offline after the app is prepared.

The main job sections are **Notes**, **Plan** and **Finalisation**. After saving, the gear's **More job tools** keeps Work, Products, POs and Visit records available; site-linked jobs also have Details, Devices, Results and Quick checklist. **Fire maintenance questions** is available there for explicit selection on any saved job. The maintenance prompts were derived from the supplied report example, not a complete standard or validated certificate specification. Neither checklist passes equipment or issues a certificate. See [fire maintenance and printing](docs/fire-maintenance.md) and the [standards reference notes](docs/checklist-standards.md).

Use the app's **Print report** button for reports with pictures: it prepares the included images before opening the browser's print / Save as PDF sheet. Browser-menu printing refreshes saved report data but cannot wait for image decoding. Native iPhone printing still needs device validation.

**Timesheets** provides a daily timeline with editable Work, Travel, Break, Administration, Training and Custom sessions. Add a type, start and finish, with an optional job and description, then save locally. Overnight sessions contribute only their portion on the selected day. Earlier duration-only records remain separately visible. Submitting records a local snapshot and downloads a timesheet file; it does not send time to an office or approve payroll. See [timesheets](docs/timesheets.md) for exports, amendments and time calculations.

Inside a job, **‹ Home** returns to the dashboard. For a linked job, the **site name in the header** opens its site folder. Both routes protect unsaved changes. Detailed records retain their three-second hold-to-edit shortcut and visible Edit/Add controls. Empty optional fields and report sections stay hidden.

Home offers **Explore demonstration site** when there are no jobs. `public/demo.zonesketch.json` is a synthetic save verified by importing it into the actual Zone Sketch application and using its real exporter. The customer example added by the repository owner was used only for local validation; it is not copied into `public/`, the build or test fixtures.

## Interface direction

Deep contrasting blue provides the headers and accents. The mobile workspace follows the supplied field-service layout: a compact dashboard, actual local work totals, scheduled job cards and fixed bottom navigation. Job cards open a compact notes editor; optional settings and detailed records stay behind their controls. The desktop sidebar, grids and workspace layout stay in place. Create/import/site choices remain compact grids; devices stay paged, with included photographs available on each record. The linked site name or job title and save status remain visible.

[Mobile device grid](docs/screenshots/mobile-device-grid.png) · [Desktop device grid](docs/screenshots/desktop-device-grid.png)

## Architecture and contracts

- `src/main.js`, `src/style.css`: touch-friendly application, explicit save flow and printable report.
- `src/model.js`: stable identities, optional-site drafts and safe first site assignment.
- `src/job-options.js`: shared discipline/job-type choices, custom names and compatibility with earlier job types.
- `src/site-profile.js`, `src/job-settings.js`: reusable site setup, live shared defaults and explicit per-job overrides; drawing and result history remain separate.
- `src/job-notes.js`: structured rich notes, embedded pictures, validation and report rendering.
- `src/device-remarks.js`, `src/device-remarks-ui.js`: validated device remarks, before/resolution evidence, products and retained history.
- `src/device-results.js`, `src/quick-defects.js`: explicit single-device outcomes and a local library of reusable defect wording, separate from visit evidence.
- `src/fire-maintenance.js`, `src/fire-maintenance-ui.js`: versioned system, panel and battery answers, readings and retained maintenance revisions.
- `src/service-report.js`, `src/print-report.js`: saved-evidence report layout and prepared-image print lifecycle.
- `src/storage.js`: versioned IndexedDB, atomic writes and concurrent-tab protection.
- `src/zone-import.js`: independently implemented current/legacy importer and drawing comparison.
- `src/plan-preview.js`: embedded PNG floor previews, issued records and device navigation; `src/plan.js` independently renders imported drawings when a Zone Sketch PNG is unavailable.
- `src/zone-handoff.js`, `src/zone-return.js`: automatic Zone Sketch launch/return protocol and safe revision reconciliation.
- `src/revisions.js`: permanent asset mapping and retained visit history; `src/drawing-editor.js` retains the actual-schema export utility and earlier editing helpers for compatibility.
- `src/job-workflow.js`: editable job metadata, actions, materials, local POs, time and finalisation.
- `src/timesheets.js`, `src/timesheets-ui.js`: daily timed sessions, optional job links, local submission snapshots and timesheet export.
- `src/hold-to-edit.js`: cancellable three-second hold shortcut, with explicit editing and keyboard alternatives.
- `src/packages.js`: validated versioned package export/import, duplicate receipts and preserved conflicts.
- `src/panel-context.js`: future Panel Pal handoff contract, separate engineer evidence and AI proposals.
- `vite.config.js`: self-contained, build-versioned offline application cache.

See [job notes](docs/job-notes.md), [device remarks](docs/device-remarks.md), [mobile workspace](docs/mobile-workspace.md), [PNG previews](docs/plan-previews.md), [Zone Sketch schema](docs/zone-sketch.md), [job package contract](docs/job-package.md), [Panel Pal contract](docs/panel-pal-context.md), [viewer scope](docs/plan-viewer.md), and [verification](docs/VERIFICATION.md). The owner's [full build brief](docs/BUILD_BRIEF.md) describes later milestones too; it is not a claim that those later features are implemented.

## Verify

```sh
npm test
npm run build
npm run test:e2e
```

Browser tests use Chromium at `/usr/bin/chromium` when present, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when set, or Playwright's Chromium. On a new development machine run `npx playwright install chromium` once if needed. The browser suite runs against a production build on port 4173, with desktop and mobile viewport projects. Do not rebuild `dist/` during a browser run.

The report browser tests also use Poppler's `pdfinfo`, `pdftotext` and `pdftoppm` to inspect the generated PDF. Install `poppler-utils` on Debian/Ubuntu or `poppler` with Homebrew on macOS. These are test tools only; the app prints through the browser without them.

Optional compatibility check against your separate checkout of Zone Sketch:

```sh
ZONE_SKETCH_REFERENCE=/path/to/FIRE-ZONE-PLAN-APP/index.html node tests/verify-zone-source.mjs
```

That check uses the reference application's actual import and backup export UI; the proprietary application is not distributed with Jobs.

## Editable job workflow and drawings

The primary workspace is **Notes, Plan and Finalisation**. The gear opens optional job settings and **More job tools**. Detailed tools still support client/contact/access information, authorisation, scope/assignment, appointments, safety/service requirements and visit records in focused forms. Work actions, products, local purchase-order records, timesheets and typed client acknowledgements save with the job and travel in its export. PO records do not send orders to suppliers; acknowledgement records are not digital signatures or certificates.

**Plan** and **Sites** show a saved PNG for each floor, alongside equipment. Working drawings and issued records stay separate. **Edit site** opens the actual Zone Sketch app in another window and sends the selected editable project automatically; **Save to Jobs** returns the drawing and updates the PNG/equipment list. There is no file picker in the connected flow. Matching results stay intact, added equipment begins Not tested, and removed-device evidence is archived. Existing visits retain their drawing revisions. Manual assets without plan positions remain in the Jobs register without invented coordinates.

The automatic connection requires the small companion receiver on the Zone Sketch deployment. Its independent code and pinned-source installer are in `integrations/zone-sketch/`; the proprietary Zone Sketch application is not bundled with Jobs. Configure `VITE_ZONE_SKETCH_URL` at build time for that deployment and allow the Jobs origin in the receiver. Until the receiver is deployed, the public Zone Sketch site cannot accept automatic loading; Jobs reports a connection failure. See [automatic connection setup](docs/zone-sketch-connection.md).

**Import Zone Sketch plan** remains available to attach a reviewed file to a visit. **Export editable drawing** produces an actual Zone Sketch v1 save; **Original drawing** retains the imported original. The earlier in-Jobs drawing editor is no longer exposed: fire, intruder, CCTV and access editing all use the real Zone Sketch app. Focused geometry helpers remain under their unchanged proprietary licence for source coordinate compatibility. See [engine provenance](docs/zone-engine.md) and [workflow contract](docs/job-workflow.md).

## Limits and next milestone

- FINDR integration is **export contract only**. No adapter, AI connection, model download or Panel Pal job loader exists in this build. No AI output changes engineer results.
- Reports are drafts, with no signatures, issued certificate numbers or compliance claims. Template validation and document issuance are future work.
- Initial imports use an independent PNG renderer; connected saves can include PNGs from the actual Zone Sketch renderer. Original data and snapshots remain in packages. Jobs can view included plans, record work and export offline. Cold-opening the external Zone Sketch web editor offline depends on that app’s own caching; the inspected public Zone Sketch app has no service worker.
- A site-linked visit retains one selected drawing and its complete equipment set; a standalone note job has neither until a site is chosen. Rich system registers, asset selection/exclusion, cross-visit defect resolution, validated task templates, acceptance/merge of conflict versions, office scheduling and multi-engineer synchronization remain future work.
- Job package v3 supports standalone jobs and stores repeated image payloads once, restoring their exact paths on import; v1 and v2 remain accepted. Local drawing history retains complete snapshots. Streaming ZIP packages and local blob-store deduplication are future work. Zone Sketch imports are limited to 32 MiB; job imports to 100 MiB.
- Headless Chromium mobile emulation is tested; physical iPhone/Android installation, storage-pressure behavior and platform share sheets still require device validation.

## Licensing

No new project-wide open-source licence is imposed by this implementation. The owner can select one deliberately. The complete Zone Sketch application and proprietary symbol artwork were not copied. Focused geometry routines are reused at the owner's explicit request in `vendor/zonesketch/`, with the original proprietary licence and source provenance retained, including notices in the production build. FINDR was inspected as an integration reference; its unchanged app icon is bundled for the owner-requested Dashboard launcher. Existing licences in the reference projects remain unchanged. Runtime application code uses browser APIs; development dependency licence notices remain with their npm packages. See [third-party notes](docs/THIRD_PARTY.md).
