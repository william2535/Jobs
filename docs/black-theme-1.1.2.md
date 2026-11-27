# Jobs web 1.1.2 — black surfaces and fading banner accents

Dark-mode canvas, ordinary panels, navigation, toolbox and dialog surfaces now use opaque black. The browser theme colour also switches to black. Status notices are opaque in both light and dark mode; dismissal and save/recovery behaviour are unchanged. Selected controls and warnings retain their semantic colours, and photographs, drawings, saved note colours and printed reports remain faithful to their content.

The shared banner uses static SVG curves with a separate fading gradient on each path. The curves and background glow finish before the banner's edges, without blur filters, animation or changes to heading geometry. The dark banner base matches the black page. No new mode or preference is required.

All 340 unit/DOM tests passed. The production build and existing release gate passed for 30 distributable files, including content hashes and the complete offline precache. Build ID: `e6ca5f69075b36e6c003`.

The 18 targeted appearance/theme browser tests passed (desktop Chromium, mobile Chromium and WebKit). The reusable `tests/verify-solid-dark-browser.mjs` checks actual computed black/opaque surfaces, unchanged light surfaces, heading geometry, banner-edge pixels and offline theme persistence at phone and iPad widths. Use `JOBS_QA_URL` for the built preview, `JOBS_QA_BROWSER=webkit` for WebKit, and the documented executable/environment overrides when using existing browsers.

Final-build visual and offline checks passed in Chromium 154.0.8037.57 and WebKit 27.2: 24 samples per browser at 390px phone and 820px iPad widths. All four outer banner edge strips were exactly RGB(0,0,0), with visible blue inside; ordinary surfaces were opaque black without backdrop blur. The zero-progress track remained visible and the counter had 19.30:1 contrast on black. Actual final-build offline reload retained the saved theme.

Battery consumption was not measured; a black theme is not a promise of a particular saving, especially on LCD displays. No physical iPad/iPhone or native Android build was tested or published for this web-only change.
