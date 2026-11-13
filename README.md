# Jobs

An independent, local-first job workspace for fire and security engineers. First working milestone: import a Zone Sketch drawing, review equipment, create a visit, record evidence, save locally, export a complete package and reopen it on another prepared device. No account, backend, paid API or AI service is required.

[Desktop preview](docs/screenshots/desktop-details.png) · [Mobile workflow](docs/screenshots/mobile-work.png) · [Drawing editor](docs/screenshots/mobile-drawing-editor.png) · [Verification results](docs/VERIFICATION.md)

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

1. **Import Zone Sketch** and review the site mapping, floors, devices and warnings; choose **Save site**. Alternatively open **Sites**, create a site and add equipment manually.
2. Choose **Create job**. Enter the system reference, scope, instructions and engineer. This milestone includes all equipment in the chosen drawing; every result starts **Not tested**.
3. Use **Plan** for floors, working drawings and issued snapshots; tap working devices to open **Devices**. Or choose a card in the searchable **Devices** grid (eight per page), filter by result, and move between records with Previous/Next or Choose device. Issued views remain historical evidence.
4. Record outcomes, observations, readings with units, notes, defects and photographs. Save each form explicitly. Unsaved changes and save failures are visible. Non-satisfactory/access/exclusion states require an explanation.
5. **Export job** creates a `.jobs.json` containing stable IDs, drawing data and embedded media. **Import job** validates it before saving. Identical reimports reopen the existing job; conflicts preserve both versions for review.
6. **Draft service report** prints the actual recorded visit. It is not a validated certificate. **Original drawing** exports the preserved Zone Sketch JSON content.

Home offers **Explore demonstration site** when there are no jobs. `public/demo.zonesketch.json` is a synthetic save verified by importing it into the actual Zone Sketch application and using its real exporter. The customer example added by the repository owner was used only for local validation; it is not copied into `public/`, the build or test fixtures.

## Interface direction

Warm-neutral charcoal, stone and bronze are the default palette. Prefer compact responsive grids to long stacked option lists: Home has four action tiles (two columns on phones), saved jobs/sites/results use cards, and devices open individually from a paged grid. Drawing photographs stay available in a collapsible details section. Keep touch targets comfortable, source drawing colours intact, and the site/save status visible while recording.

[Mobile device grid](docs/screenshots/mobile-device-grid.png) · [Desktop device grid](docs/screenshots/desktop-device-grid.png)

## Architecture and contracts

- `src/main.js`, `src/style.css`: touch-friendly application, explicit save flow and printable report.
- `src/model.js`: stable site/job/result identities and new-visit defaults.
- `src/storage.js`: versioned IndexedDB, atomic writes and concurrent-tab protection.
- `src/zone-import.js`: independently implemented current/legacy importer and drawing comparison.
- `src/plan.js`: read-only SVG viewer, including raster plans, geometry, zones and circuits.
- `src/drawing-editor.js`, `src/revisions.js`: editable working drawings, shared geometry, immutable revisions, permanent asset mapping and retained visit history.
- `src/job-workflow.js`: editable job metadata, actions, materials, local POs, time and finalisation.
- `src/packages.js`: validated versioned package export/import, duplicate receipts and preserved conflicts.
- `src/panel-context.js`: future Panel Pal handoff contract, separate engineer evidence and AI proposals.
- `vite.config.js`: self-contained, build-versioned offline application cache.

See [Zone Sketch schema](docs/zone-sketch.md), [job package contract](docs/job-package.md), [Panel Pal contract](docs/panel-pal-context.md), [viewer scope](docs/plan-viewer.md), and [verification](docs/VERIFICATION.md). The owner's [full build brief](docs/BUILD_BRIEF.md) describes later milestones too; it is not a claim that those later features are implemented.

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

**Plan → Import Zone Sketch plan** attaches a reviewed drawing revision directly to an existing visit. **Edit working drawing** supports device positions/types/references, adding/removing equipment, wall polylines, rooms, labels and floor changes. New revisions retain matching visit results, start added equipment as Not tested, and archive removed-device evidence. Issued snapshots remain read-only. **Export editable drawing** produces an actual Zone Sketch v1 save; **Original drawing** retains the imported original.

Fire, intruder, CCTV and access use the same drawing/editor path. Jobs reuses focused original Zone Sketch geometry routines for snapping and circuit coordinate handling, under its unchanged proprietary licence. The independent importer and Jobs interface remain separate; the complete Zone Sketch application is not bundled. See [engine provenance](docs/zone-engine.md), [editor scope](docs/drawing-editor.md) and [workflow contract](docs/job-workflow.md).

## Limits and next milestone

- FINDR integration is **export contract only**. No adapter, AI connection, model download or Panel Pal job loader exists in this build. No AI output changes engineer results.
- Reports are drafts, with no signatures, issued certificate numbers or compliance claims. Template validation and document issuance are future work.
- The plan is a simplified independent viewer, not a pixel-identical Zone Sketch renderer. Original data and snapshots remain in packages.
- One drawing and its complete equipment set define a visit. Rich system registers, asset selection/exclusion, cross-visit defect resolution, validated task templates, acceptance/merge of conflict versions, office scheduling and multi-engineer synchronization remain future work.
- Job package v2 stores repeated image payloads once and restores them to their exact paths on import; v1 remains accepted. Local drawing history retains complete snapshots. Streaming ZIP packages and local blob-store deduplication are future work. Zone Sketch imports are limited to 32 MiB; job imports to 100 MiB.
- Headless Chromium mobile emulation is tested; physical iPhone/Android installation, storage-pressure behavior and platform share sheets still require device validation.

## Licensing

No new project-wide open-source licence is imposed by this implementation. The owner can select one deliberately. The complete Zone Sketch application and proprietary symbol artwork were not copied. Focused geometry routines are reused at the owner's explicit request in `vendor/zonesketch/`, with the original proprietary licence and source provenance retained, including notices in the production build. FINDR was inspected only as an integration reference. Existing licences in the reference projects remain unchanged. Runtime application code uses browser APIs; development dependency licence notices remain with their npm packages. See [third-party notes](docs/THIRD_PARTY.md).
