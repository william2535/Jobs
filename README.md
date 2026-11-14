# Jobs

**[Open the Jobs website](https://jobs-field-workspace.floodyyy21.chatgpt.site)** · [Hosting and access details](docs/deployment.md)

An independent, local-first job workspace for fire and security engineers. First working milestone: import a Zone Sketch drawing, review equipment, create a visit, record evidence, save locally, export a complete package and reopen it on another prepared device. No account, backend, paid API or AI service is required.

[Desktop preview](docs/screenshots/desktop-details.png) · [Mobile dashboard](docs/screenshots/mobile-dashboard.png) · [Mobile plans](docs/screenshots/mobile-png-plan.png) · [Verification results](docs/VERIFICATION.md)

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

Start with **Sites → Create site manually**, or import a Zone Sketch save to create the site folder. Add the reusable contact, access and work details once, then choose **Create job** inside that site. Recorded details fill the new job automatically; unfilled boxes and empty report sections stay hidden. Hold a filled field for **3 seconds** to edit it, or use **Edit**. Use **Add details** to fill a missing section. Each job keeps its selected plan revision and included PNG through local saving and package export.

1. **Import Zone Sketch** and review the site mapping, floors, devices and warnings; choose **Save site**. Alternatively open **Sites**, create a site and add equipment manually.
2. Choose **Create job**. Enter the system reference, scope, instructions and engineer. This milestone includes all equipment in the chosen drawing; every result starts **Not tested**.
3. Use **Plan** for floors, working drawings and issued snapshots; tap working devices to open **Devices**. Or choose a card in the searchable **Devices** grid (four per page on phones, eight on desktop), filter by result, and move between records with Previous/Next or Choose device. Issued views remain historical evidence.
4. Record outcomes, observations, readings with units, notes, defects and photographs. Save each form explicitly. Unsaved changes and save failures are visible. Non-satisfactory/access/exclusion states require an explanation.
5. **Export job** creates a `.jobs.json` containing stable IDs, drawing data and embedded media. **Import job** validates it before saving. Identical reimports reopen the existing job; conflicts preserve both versions for review.
6. **Draft service report** prints the actual recorded visit. It is not a validated certificate. **Original drawing** exports the preserved Zone Sketch JSON content.

Home offers **Explore demonstration site** when there are no jobs. `public/demo.zonesketch.json` is a synthetic save verified by importing it into the actual Zone Sketch application and using its real exporter. The customer example added by the repository owner was used only for local validation; it is not copied into `public/`, the build or test fixtures.

## Interface direction

Deep contrasting blue provides the headers and accents. The mobile workspace follows the supplied field-service layout: a compact dashboard, actual local work totals, scheduled job cards and fixed bottom navigation. Job sections use clear grouped rows and editable records. The desktop sidebar, grids and workspace layout stay in place. Create/import/site choices remain compact grids; devices stay paged, with included photographs available on each record. Site name and save status remain visible.

[Mobile device grid](docs/screenshots/mobile-device-grid.png) · [Desktop device grid](docs/screenshots/desktop-device-grid.png)

## Architecture and contracts

- `src/main.js`, `src/style.css`: touch-friendly application, explicit save flow and printable report.
- `src/model.js`: stable site/job/result identities, named-site creation guard and inherited visit defaults.
- `src/site-profile.js`: reusable site folder information; recorded values are copied into new jobs without changing earlier visits.
- `src/storage.js`: versioned IndexedDB, atomic writes and concurrent-tab protection.
- `src/zone-import.js`: independently implemented current/legacy importer and drawing comparison.
- `src/plan-preview.js`: embedded PNG floor previews, issued records and device navigation; `src/plan.js` independently renders imported drawings when a Zone Sketch PNG is unavailable.
- `src/zone-handoff.js`, `src/zone-return.js`: automatic Zone Sketch launch/return protocol and safe revision reconciliation.
- `src/revisions.js`: permanent asset mapping and retained visit history; `src/drawing-editor.js` retains the actual-schema export utility and earlier editing helpers for compatibility.
- `src/job-workflow.js`: editable job metadata, actions, materials, local POs, time and finalisation.
- `src/hold-to-edit.js`: cancellable three-second hold shortcut, with explicit editing and keyboard alternatives.
- `src/packages.js`: validated versioned package export/import, duplicate receipts and preserved conflicts.
- `src/panel-context.js`: future Panel Pal handoff contract, separate engineer evidence and AI proposals.
- `vite.config.js`: self-contained, build-versioned offline application cache.

See [mobile workspace](docs/mobile-workspace.md), [PNG previews](docs/plan-previews.md), [Zone Sketch schema](docs/zone-sketch.md), [job package contract](docs/job-package.md), [Panel Pal contract](docs/panel-pal-context.md), [viewer scope](docs/plan-viewer.md), and [verification](docs/VERIFICATION.md). The owner's [full build brief](docs/BUILD_BRIEF.md) describes later milestones too; it is not a claim that those later features are implemented.

## Verify

```sh
npm test
npm run build
npm run test:e2e
```

Browser tests use Chromium at `/usr/bin/chromium` when present, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when set, or Playwright's Chromium. On a new development machine run `npx playwright install chromium` once if needed. The browser suite runs against a production build on port 4173, with desktop and mobile viewport projects. Do not rebuild `dist/` during a browser run.

Optional compatibility check against your separate checkout of Zone Sketch:

```sh
ZONE_SKETCH_REFERENCE=/path/to/FIRE-ZONE-PLAN-APP/index.html node tests/verify-zone-source.mjs
```

That check uses the reference application's actual import and backup export UI; the proprietary application is not distributed with Jobs.

## Editable job workflow and drawings

The job now uses **Details, Work, Products, POs and Finalisation**. Edit reference/title, client/contact/access information, authorisation, scope/assignment, appointments, safety/service requirements and notes in focused card forms. Work actions, products, local purchase-order records, timesheets and typed client acknowledgements save with the job and travel in its export. PO records do not send orders to suppliers; acknowledgement records are not digital signatures or certificates.

**Plan** and **Sites** show a saved PNG for each floor, alongside equipment. Working drawings and issued records stay separate. **Edit site** opens the actual Zone Sketch app in another window and sends the selected editable project automatically; **Save to Jobs** returns the drawing and updates the PNG/equipment list. There is no file picker in the connected flow. Matching results stay intact, added equipment begins Not tested, and removed-device evidence is archived. Existing visits retain their drawing revisions. Manual assets without plan positions remain in the Jobs register without invented coordinates.

The automatic connection requires the small companion receiver on the Zone Sketch deployment. Its independent code and pinned-source installer are in `integrations/zone-sketch/`; the proprietary Zone Sketch application is not bundled with Jobs. Configure `VITE_ZONE_SKETCH_URL` at build time for that deployment and allow the Jobs origin in the receiver. Until the receiver is deployed, the public Zone Sketch site cannot accept automatic loading; Jobs reports a connection failure. See [automatic connection setup](docs/zone-sketch-connection.md).

**Import Zone Sketch plan** remains available to attach a reviewed file to a visit. **Export editable drawing** produces an actual Zone Sketch v1 save; **Original drawing** retains the imported original. The earlier in-Jobs drawing editor is no longer exposed: fire, intruder, CCTV and access editing all use the real Zone Sketch app. Focused geometry helpers remain under their unchanged proprietary licence for source coordinate compatibility. See [engine provenance](docs/zone-engine.md) and [workflow contract](docs/job-workflow.md).

## Limits and next milestone

- FINDR integration is **export contract only**. No adapter, AI connection, model download or Panel Pal job loader exists in this build. No AI output changes engineer results.
- Reports are drafts, with no signatures, issued certificate numbers or compliance claims. Template validation and document issuance are future work.
- Initial imports use an independent PNG renderer; connected saves can include PNGs from the actual Zone Sketch renderer. Original data and snapshots remain in packages. Jobs can view included plans, record work and export offline. Cold-opening the external Zone Sketch web editor offline depends on that app’s own caching; the inspected public Zone Sketch app has no service worker.
- One drawing and its complete equipment set define a visit. Rich system registers, asset selection/exclusion, cross-visit defect resolution, validated task templates, acceptance/merge of conflict versions, office scheduling and multi-engineer synchronization remain future work.
- Job package v2 stores repeated image payloads once and restores them to their exact paths on import; v1 remains accepted. Local drawing history retains complete snapshots. Streaming ZIP packages and local blob-store deduplication are future work. Zone Sketch imports are limited to 32 MiB; job imports to 100 MiB.
- Headless Chromium mobile emulation is tested; physical iPhone/Android installation, storage-pressure behavior and platform share sheets still require device validation.

## Licensing

No new project-wide open-source licence is imposed by this implementation. The owner can select one deliberately. The complete Zone Sketch application and proprietary symbol artwork were not copied. Focused geometry routines are reused at the owner's explicit request in `vendor/zonesketch/`, with the original proprietary licence and source provenance retained, including notices in the production build. FINDR was inspected only as an integration reference. Existing licences in the reference projects remain unchanged. Runtime application code uses browser APIs; development dependency licence notices remain with their npm packages. See [third-party notes](docs/THIRD_PARTY.md).
