# Milestone verification

Verified in the task workspace on 13 November 2026 with Node 24.22.1 and Chromium 156.0.8078.79. Browser tests use isolated profiles, including a mobile viewport. No customer data is part of these automated fixtures.

## Reference inspection

- Zone Sketch: `dca2eff063f52a9980c2aed255879a65cc579379`, actual `index.html` exporter/importer, proprietary `LICENSE`, repository documentation; no AGENTS.md present.
- FINDR: `8bdd8b03feb8babd6266b80b57dbc5d53efeadb2`, AGENTS.md and local Panel Pal storage/engine. No changes to either reference repository.
- Jobs' existing README and newly supplied `docs/BUILD_BRIEF.md` were read. Implementation branch includes the owner's latest files from `cb888523cafffd68b0a02484729db29878e49071` without adding a second copy of customer data.

## Data and storage tests

`npm test`: **23 passed**.

Coverage includes current and supported legacy Zone Sketch formats; all source mappings; non-equipment exclusions; source-content preservation; embedded photographs; issued snapshots; standalone issued records; no-zone additional-work layouts; added/moved/changed/removed drawing comparison; invalid input; new-visit defaults via workflow tests; complete package round trips; idempotent reimports; conflicts preserving work and drawings; optional-field normalization; occupied conflict IDs; atomic write failure; stale-tab write rejection; Panel Pal evidence separation and unsatisfactory faults.

The synthetic demo was imported into the unmodified inspected Zone Sketch application and exported through its actual backup button. Jobs successfully read that genuine output: two floors, four equipment assets, device photograph, pinned image, circuit and issued snapshot.

The supplied real save was validated privately: **1 floor, 40 equipment assets, 3 zones, 3 circuits, 276 revisions**. The importer excluded 190 non-equipment objects. Parsed original-envelope equality was checked. Job export/reimport retained the embedded floor plan and all 40 assets; the resulting package was approximately 33.7 MB. No customer drawing or photograph was copied to the bundled app or fixtures.

## Build

`npm run build` passes. The production application has no runtime npm dependencies and no online asset/API requests. Its service worker precaches hashed application modules, styles, icons, manifest and the synthetic demo. The build contains only the application and public synthetic assets.

## Browser verification

`npm run test:e2e`: **6 passed** across desktop Chromium and Pixel 7 mobile emulation.

| Check | Evidence |
| --- | --- |
| Genuine save import and source mappings | Actual Zone Sketch export/import check; current and legacy parser tests; supplied real save checked independently |
| Save and reopen | IndexedDB unit tests plus browser reload/reopen |
| Offline opening, plans/photos, recording and export | Prepared profile switched offline, reloaded, opened saved job and included images, recorded notes, exported |
| Export/import without attachment loss | Fresh receiving browser profile; stable job/site/result IDs and complete drawings equal after re-export; uploaded visit photo retained |
| Duplicate/conflict handling | Same drawing and job package reimported; unchanged visit stays unique; divergent work retained separately; repeated conflict does not create another copy |
| Invalid input | Malformed package rejection leaves saved jobs intact; untrusted IDs remain escaped text; invalid result leaves typed work intact |
| Mobile layout | Pixel 7 emulation plus 320px checks of Home, Plan and Devices; no page overflow, touch-sized controls, screenshots reviewed |
| Manual site/visit | Site and equipment creation, fault/repair work, explanations enforced, later visit begins Not tested |
| Reports and future integration | Draft/non-certificate report contents; disconnected Panel Pal export with matching job identity |

The supplied real drawing additionally passed an isolated browser check at 390 × 844: site import/save, visit creation, included floor-plan image decode, 40 tappable equipment entries with correct source mappings, exact original-project preservation on export, all new results Not tested, and job/plan reopening after reload.

The offline browser test exposed a static-server `Vary: Origin` issue. The service worker now uses its own public-shell cache with `ignoreVary` for cached static files; the full offline flow passed after this correction. No personalized server responses are cached.

Synthetic previews: [Desktop home](screenshots/desktop-home.png), [Desktop plan](screenshots/desktop-plan.png), [Mobile plan](screenshots/mobile-plan.png), [Mobile devices](screenshots/mobile-devices.png).

## Practical boundaries

Offline tests verify a prepared browser profile using Chromium's network-offline mode, including cold page reload and a fresh receiving profile. They do not establish behavior under every OS storage-eviction policy. Physical iPhone/Android installation and actual OS file-transfer/share sheets have not been tested in this environment. Mobile verification is browser emulation, not physical-device certification.

The renderer is intentionally simplified; source data is preserved rather than claiming a pixel-identical drawing. The real FINDR adapter and validated compliance certificates are not implemented. Conflict imports preserve both versions for manual review; there is no automatic conflict acceptance/merge workflow.
