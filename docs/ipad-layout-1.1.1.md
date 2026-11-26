# Jobs 1.1.1: consistent banners and tablet workspace

This website update is based on the live `release/jobs-android` source at `1223986cf3151895c9fa9ae93ebf4a94c408e107`. The supported address remains https://william2535.github.io/Jobs/. The historical private Sites workspace is unchanged; this release does not build or publish an APK/AAB.

## Behaviour

- A shared, real-text header replaces the four bitmap title designs. Dashboard, Tasks, Timesheets and About retain the same logo, title anchor, 32px type and 36px line height at each viewport. Phone headers stay 112px high; larger headers stay 128px high. Desktop Home, Sites, Timesheets and Help use the same design. Individual job/site context labels remain available.
- Touch layouts extend through 1440px, including newer iPad Pro landscape widths. `any-pointer: coarse` retains the tablet workspace when both touch and a pointing device are reported. Tablet dashboards use two content columns; split view and phones use the narrower layout. Safe-area spacing and the existing Apple touch icon are retained, with standalone Apple web-app metadata added.
- The saved/offline status can be dismissed with a horizontal touch/pen swipe, its 44px close button or Escape while focused. Vertical scrolling and multi-touch are not intercepted. Only this presentation preference is saved in sessionStorage; saves, offline preparation and records are unaffected.
- Unsaved edits, failed saves, recovery information and unknown/failed offline readiness remain visible. Full readiness is still available in Help & data.
- Existing database schemas, job records, exports, certificates, photographs and update machinery are unchanged.

## Verification

- All **340** Node unit/DOM tests passed, including ten focused dismissal tests.
- Production build passed. The existing release verifier checked all **30** distributable files, local shell references, installation metadata, licence notices, content hashes and complete offline precache. Final build ID: `47b6d3ca5277f7cff608`.
- The reusable `tests/verify-ipad-shell-browser.mjs` checks nine touch viewport widths from 390 to 1440px, including 540px split view and 1376px iPad Pro landscape, plus 1024/1440px fine-pointer layouts. It measures actual header/title geometry through 24 rapid tab changes and verifies accessible navigation, dismissal and storage-failure recovery.
- Chromium **154.0.8037.57**, Linux: focused checks passed, including native vertical touch scrolling, swipe/close dismissal, dirty/failed-save recovery export and retry, a real verified service worker and network-disabled reload with saved job data.
- WebKit **27.2**, Linux with the lockfile's Playwright **1.65.1**: all eight focused checks passed, including networking disabled, saved notes, dismissal, recovery and consistent headings. The final publication build additionally passed a fresh phone/iPad/offline smoke check with no JavaScript errors.
- The older available WebKit **26.0** passed layout, dismissal and storage-failure checks, but its network-emulation reload produced an internal engine error reproduced with an independent one-page fixture. It successfully reopened Jobs and saved notes, including in a new tab, when the actual local HTTP server was stopped. Testing then moved to the compatible current runtime above; the older engine error was not hidden or worked around in application code.
- The existing resize regression now crosses the actual touch-layout boundary (1536px desktop, 1280px tablet); it no longer assumes a desktop sidebar at 1280px on a touch device.

No physical iPad, iPhone, attached trackpad or installed iOS PWA was available. Emulated viewport/pointer checks cannot establish their hardware-specific behaviour. No Android release is claimed.

## Repeating the focused checks

Build and serve the production output, then run the browser harness with `JOBS_QA_URL` pointing to that server. Browser executable and evidence-directory options are documented at the top of the script. Use `npm test`, `npm run build` and `npm run release:verify` for the normal release checks. The optional `PLAYWRIGHT_WEBKIT_EXECUTABLE` setting in the Playwright configuration uses an existing compatible WebKit installation without changing CI's default browser selection.
