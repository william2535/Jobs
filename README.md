# Jobs

**[Open the Jobs website](https://william2535.github.io/Jobs/)** · [Hosting and access details](docs/deployment.md)

An independent, local-first job workspace for fire and security engineers. Release 1.3.1: import a Zone Sketch drawing, review equipment, create a visit, record evidence, issue a reviewed visit certificate, save locally, export a complete package and reopen it on another prepared device. No account, backend, paid API or AI service is required.

[Desktop notes](docs/screenshots/desktop-notes-job.png) · [Mobile notes](docs/screenshots/mobile-notes-job.png) · [Mobile dashboard](docs/screenshots/mobile-dashboard.png) · [Mobile plans](docs/screenshots/mobile-png-plan.png) · [Verification results](docs/VERIFICATION.md)

## Run locally

Requires Node.js 22.12+ (Node 24 recommended) and npm.

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

## Public release and recovery

Open **Help & data** from the desktop sidebar or mobile **About** for install instructions, verified offline readiness, updates, privacy and recovery. App version and build identity are shown there. Opening/saving errors keep existing records intact; a failed save offers **Download unsaved recovery** without closing the editor.

An already installed app checks its saved offline files without waiting for a network registration check. If initial installation finishes late, readiness is checked again automatically. The status banner's **×**, horizontal swipe or Escape can hide offline notices when your work is saved; vertical swipes keep scrolling normally. Dismissal does not change offline readiness, which remains visible in Help & data. Unsaved work and failed local saves still bring the status back.

Use **Export workspace backup** to preserve all saved sites, jobs, drawings, photos, quick defects and timesheets, including sites without visits and unassigned sessions. **Restore workspace backup** validates and reviews the file before saving it into an empty workspace; it never replaces differing existing work. Identical restores do nothing. Use individual job imports to combine records instead. Toolbox convenience drafts/practice progress remain separate. See [backup format and recovery](docs/workspace-backup.md).

Updates wait until you choose **Apply update** after saving. Other Jobs windows must be closed before activation. When upgrading from the earlier prototype, open Jobs online to download the update, then close all Jobs tabs/installed windows and reopen online so the waiting release can activate. Check the displayed version and wait for **Ready offline** before going to site; the app verifies its included shell files instead of assuming a controller is sufficient.

Create a distributable build with `npm run release`; this validates and packages only compiled public files, with a file manifest and SHA-256 checksum. It excludes repository history and the supplied customer example. See [release build instructions](docs/release-build.md), [public release guide](docs/public-release.md) and [verification results](docs/VERIFICATION.md). Draft service reports and reviewed visit certificates are separate outputs. The FINDR job adapter and automatic Zone Sketch receiver remain separate future/deployment work.

## Desktop office overview

Opening Jobs on a PC now shows **Engineer days** above the saved-job workspace. Use **Receive day packs** or drop received `.jobsday.json` / `.jobs.json` files into the dashboard. You can select up to 20 files (100 MiB each, 200 MiB total). Every file is validated before the complete upload is saved; a rejected file leaves that upload unsaved. The PC never starts an engineer's timer just by receiving a pack.

Packs group automatically under their engineer name tag. Names ignore casing and repeated spaces for grouping; use a consistent, distinct name for each person. Existing unnamed jobs remain separately visible. Tap the office NFC sticker, enter or confirm **Your name**, then collect the pack. That confirmed name travels in day packs, individual job exports and newly recorded time. A running day keeps its original engineer. Receiving an already-tagged ordinary job preserves its existing tag.

Choose an engineer and date range to review their recorded start/finish, jobs, sessions, travel, breaks, other time and unallocated time. **Open timesheets** opens the editable timeline for that engineer/date; its exports and submissions keep the same engineer filter. **Export office CSV** downloads the currently selected day summaries. Job and certificate buttons continue to open the actual saved work.

**Job time / attendance** means recorded Work sessions assigned to jobs divided by recorded attendance. It is a time-allocation measure, not a performance rating or payroll approval. Missing attendance, overlapping sessions, ambiguous time ownership or conflicting time make the percentage unavailable. Repeated imports do not add another day; only the latest received version counts, while earlier copies remain reviewable. Date filters clip overnight time to the selected period, and the CSV identifies clipped rows.

This overview shows records received or saved on the PC, not live phone locations or a remote timer feed. Receive the engineer's updated file to update the office view. Mobile keeps its existing field dashboard and share chest. Everything remains usable offline after each device is prepared.

**Sites awaiting Zone Sketch** lists saved sites with no retained Zone Sketch source plan. A blank drawing or a PNG on its own does not mark a site ready. **Assets added** counts distinct saved asset identities, including manual equipment and imported devices, with a source breakdown and links to their site or job. Revisions and repeated job copies do not add the same asset again. These are totals across all saved records, including retained history; older assets have no reliable creation date, so the engineer/date filters do not label them as additions made that day.

## Quick Transfer and offline office days

Use the existing **Share** button on a saved job card. Quick Transfer keeps its two main choices: **Nearby / share job pack** and **Receive job pack**. Mobile **About** and the desktop sidebar also open Quick Transfer, including on an empty phone.

- To send several jobs, expand **Day pack**, select the jobs and optionally enter the engineer/date, then **Prepare day pack → Share day pack**. The second tap opens the phone's available sharing options with the prepared file.
- On the receiving phone, save the shared file in Files and choose **Receive job pack**. **Collect & start day** saves the pack and starts that engineer's day. Managers can choose **Save pack only**, then prepare and share selected jobs onward without starting their own timer.
- Continue working normally in Jobs. **Review & finish day → Finish day** closes the day and any running job timer. Recorded work, travel and breaks are retained; uncovered intervals become clearly labelled unallocated Work sessions, editable in Timesheets.
- **Share finished day** sends the saved work and time back. The office phone chooses **Save returned day**, reviews **Office returns**, and shares its receipt back. Importing that matching receipt confirms that particular returned copy was saved on the receiving phone. Cancelling a share or merely opening a share sheet never confirms delivery. Changed work needs a new return and matching receipt.

A repeated pack does not duplicate jobs/time or overwrite later local edits. Differing job versions remain separate for review; conflicting unassigned time is retained in Office returns without being added twice to the calendar. Failed saves retain the exact attempted records for retry or recovery export. Workspace backups include office days and receipts.

Under **Sticker & sharing help → Set up an NFC sticker**, copy an office URL or write it on supported Android browsers. The sticker opens this same chest; it does not contain job files or silently start/stop a timer. Prepare each phone online until **Ready offline** first. Transfer files using an available offline phone-sharing method, then import them. iPhone and Android browsers do not provide universal browser-to-browser NFC file transfer; AirDrop and Quick Share availability depends on the devices, and mixed-platform offline delivery needs a compatible method. Physical NFC routing (including Safari versus an installed iPhone app) and real phone share sheets still require device testing.

Day packs are self-contained `.jobsday.json` files (up to 100 jobs / 100 MiB); receipts are `.jobsreceipt.json`. Ordinary `.jobs.json` sharing remains supported. Receipts use content checksums for matching, not identity authentication or a digital signature. Nothing is automatically uploaded, emailed to customers or approved for payroll.

## Workflow

1. Choose **Create job** to open blank **Notes**. From Home, a site, title, discipline, job type and description are optional; from a site folder the site is already linked. Write immediately, add pictures or leave the note blank, then press **Save**. Nothing is added to saved jobs until an explicit save succeeds; **Save settings** or adding its first asset also saves the job.
2. Open a job card to return to its notes. Use the visible **Checklist**, **Underline**, **Text colour** and **Highlight** controls as you write. Checklists work before the first save; press Return for the next item, or Return on an empty item to continue normal notes. **More** offers headings, text sizes and alignment. Pictures and captions are included in local storage and exports. Save failures keep the editor open for retry.
3. Use the **gear icon** on a job card or inside the job for optional site selection, title, status and **More details**. Discipline choices are Fire, Security, Intruder, CCTV, Access control and Custom; job types are Maintenance, Small works, Install, Take over visit, Call out and Custom. Only a selected Custom option requires a custom name.
4. Set up a reusable site through **Sites** or **Import Zone Sketch**. Its contact, access and work settings apply to linked jobs; changes to shared settings appear across those jobs unless a field has a job-specific override. **Use site settings for this job** restores inheritance. Linking a standalone job adds the site's current drawing and fresh **Not tested** results without replacing its notes. Plans and recorded results are never automatically replaced when site settings change.
5. Open **Assets** to see imported equipment or **Create asset** without needing a plan or site. **Quick add** offers common equipment such as smoke detectors. Choose **Quantity** with the 1–100 slider or number field, check the numbered reference preview, then add the whole batch in one save. References keep their prefix and number padding, skipping existing tags. Use **☆ Favourite** to save reusable equipment details, **Use** to add them to another job, or **Duplicate** to keep the selected equipment's details and location with the next unused reference already filled in. Each starts **Not tested** with its own identity and no copied inspection evidence. **View plan** opens the job's saved drawing and its floor list. Working rows have **Pass / Fail / N/A** in the middle and a pencil at the far right to open **Defects**. Missing explanations are requested before Fail or N/A saves; saving keeps the floor, page and zoom. The **Devices** grid retains these controls too. Issued snapshots and site-only plans have no visit-result controls. Defects include before/resolution photographs, severity, recommendations and products. Save a remark, then tap **☆** to reuse its wording through **Add remark → Saved quick defects** on later jobs in this browser. Prior visit evidence and test outcomes are never copied by the shortcut. Full device records retain observations, readings with units, notes and all result states.
6. Open **Finalisation** for the A4 draft report, **Print report** and **Export job**. The report brings together saved notes, pictures, device results, findings and recorded repairs. Fire maintenance jobs also offer **Maintenance questions** for system, panel and battery checks. Save a partial record and return later; unanswered checks remain Not recorded. The `.jobs.json` includes saved notes, pictures and any site, drawing and work evidence. Standalone jobs export without a fabricated site. **Import job** validates the complete package before saving; identical reimports reopen the existing job and conflicts preserve both versions. Export works offline after the app is prepared.

7. To provide a customer certificate, choose **Finalisation → Create certificate**. Edit the prefilled site and visit details, enter the actual work, findings, limitations, outcome and engineer declaration, then **Save draft** or **Review certificate**. After checking the preview and confirming the review, choose **Issue certificate**. **Download PDF**, **Share PDF** and **Print certificate** use that saved issue. Use **Revise certificate** for a correction; the earlier issue remains unchanged. This flow is available for every visit and all six disciplines, including standalone jobs. See [certificate creation, editing and customer PDFs](docs/certificates.md).

The main job sections are **Notes**, **Assets** and **Finalisation**. After saving, the gear's **More job tools** keeps Work, Products, POs and Visit records available; site-linked jobs also have Details and Quick checklist; saved asset registers offer Results. **Fire maintenance questions** is available there for explicit selection on any saved job. The maintenance prompts were derived from the supplied report example, not a complete standard or validated certificate specification. Neither checklist passes equipment or issues a certificate. See [fire maintenance and printing](docs/fire-maintenance.md) and the [standards reference notes](docs/checklist-standards.md).

Use the app's **Print report** button for reports with pictures: it prepares the included images before opening the browser's print / Save as PDF sheet. Browser-menu printing refreshes saved report data but cannot wait for image decoding. Native iPhone printing still needs device validation.

**Timesheets** provides a daily timeline with editable Work, Travel, Break, Administration, Training and Custom sessions. Add a type, start and finish, with an optional job and description, then save locally. Overnight sessions contribute only their portion on the selected day. Earlier duration-only records remain separately visible. Submitting records a local snapshot and downloads a timesheet file; it does not send time to an office or approve payroll. See [timesheets](docs/timesheets.md) for exports, amendments and time calculations.

**Toolbox** opens from the mobile dashboard button or desktop sidebar. It brings FINDR's four core calculators, six on-site calculators, six original picture guides, Resistor Lab and FESS practice into Jobs' deep-blue interface. Everything is bundled for offline use after preparation, including the small on-site pack; there is no pack download step. Calculator drafts and learning progress stay separate from job results. See the [tool inventory and storage details](docs/toolbox.md).

Inside a job, **‹ Home** returns to the dashboard. For a linked job, the **site name in the header** opens its site folder. Both routes protect unsaved changes. Detailed records retain their three-second hold-to-edit shortcut and visible Edit/Add controls. Empty optional fields and report sections stay hidden.

Home offers **Explore demonstration site** when there are no jobs. `public/demo.zonesketch.json` is a synthetic save verified by importing it into the actual Zone Sketch application and using its real exporter. The customer example added by the repository owner was used only for local validation; it is not copied into `public/`, the build or test fixtures.

## Interface direction

On the mobile workspace, tap the **sun/moon button** below the banner to switch between Light and Dark. Desktop and job headers also offer **System**, which follows the device setting. Your choice is saved on this device and works offline. Switching does not reload the page or discard an unfinished job. Dark mode covers the current dashboard, jobs, equipment, timesheets and Toolbox. Drawings, photographs, formatted notebook paper and printed reports retain their original colours. See [appearance and current GitHub build](docs/appearance.md).

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
- `src/certificates.js`, `src/certificate-renderer.js`, `src/certificates-ui.js`, `src/certificate-pdf.js`: editable certificate drafts, explicit review and issue, retained revisions, frozen evidence and customer PDF download/share.
- `src/storage.js`: versioned IndexedDB, atomic writes and concurrent-tab protection.
- `src/zone-import.js`: independently implemented current/legacy importer and drawing comparison.
- `src/plan-preview.js`: embedded PNG floor previews, issued records and device navigation; `src/plan.js` independently renders imported drawings when a Zone Sketch PNG is unavailable.
- `src/zone-handoff.js`, `src/zone-return.js`: automatic Zone Sketch launch/return protocol and safe revision reconciliation.
- `src/revisions.js`: permanent asset mapping and retained visit history; `src/drawing-editor.js` retains the actual-schema export utility and earlier editing helpers for compatibility.
- `src/job-workflow.js`: editable job metadata, actions, materials, local POs, time and finalisation.
- `src/timesheets.js`, `src/timesheets-ui.js`: daily timed sessions, optional job links, local submission snapshots and timesheet export.
- `src/toolbox.js`, `src/toolbox-extras.js`, `vendor/findr-tools/`, `vendor/findr-extras/`: Jobs navigation and local storage around the reused FINDR calculators, guides, Resistor Lab and FESS practice.
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

- FINDR's local Toolbox tools are included. The **Panel Pal integration remains an export contract only**: no adapter, AI connection, model download or Panel Pal job loader exists in this build. Toolbox calculations and learning results do not change engineer-confirmed job results.
- Service reports remain drafts. Separately issued visit certificates contain an explicit engineer declaration, certificate number and immutable supporting snapshot. Typed names are not cryptographic signatures; generic visit certificates do not claim a validated standards-specific form or third-party accreditation. Reviewed statutory or scheme-specific templates remain separate work.
- Initial imports use an independent PNG renderer; connected saves can include PNGs from the actual Zone Sketch renderer. Original data and snapshots remain in packages. Jobs can view included plans, record work and export offline. Cold-opening the external Zone Sketch web editor offline depends on that app’s own caching; the inspected public Zone Sketch app has no service worker.
- A site-linked visit retains one selected drawing and its complete equipment set; a standalone note job has neither until a site is chosen. Rich system registers, asset selection/exclusion, cross-visit defect resolution, validated task templates, acceptance/merge of conflict versions, office scheduling and multi-engineer synchronization remain future work.
- Job package v3 supports standalone jobs and stores repeated image payloads once, restoring their exact paths on import; v1 and v2 remain accepted. Local drawing history retains complete snapshots. Streaming ZIP packages and local blob-store deduplication are future work. Zone Sketch imports are limited to 32 MiB; job imports to 100 MiB.
- Headless Chromium mobile emulation is tested; physical iPhone/Android installation, storage-pressure behavior and platform share sheets still require device validation.

## Licensing

No new project-wide open-source licence is imposed by this implementation. The owner can select one deliberately. The complete Zone Sketch application and proprietary symbol artwork were not copied. Focused geometry routines are reused at the owner's explicit request in `vendor/zonesketch/`, with the original proprietary licence and source provenance retained, including notices in the production build. Zone Sketch's unchanged coloured app logo is included for its owner-requested launcher under the same proprietary licence. Selected FINDR Toolbox code, original guides and FESS learning content are reused at the owner's request, with source ownership and publisher references retained in [calculator/guide provenance](vendor/findr-tools/PROVENANCE.json) and [Resistor Lab/FESS provenance](vendor/findr-extras/PROVENANCE.json). Its unchanged app icon remains bundled for the Dashboard launcher. Existing licences in the reference projects remain unchanged; this work does not change or release FINDR itself. The certificate PDF runtime and embedded fonts ship with their original third-party notices; development dependency licence notices remain with their npm packages. See [third-party notes](docs/THIRD_PARTY.md).
