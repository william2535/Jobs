# Zone Sketch engine reuse

Jobs reuses a focused subset of the actual Zone Sketch geometry engine in `vendor/zonesketch/geometry.js`. This follows the owner's explicit request to use the Zone Sketch engine where possible. It is not a claim that the complete Zone Sketch application or editor has become a standalone library.

## Provenance and licence

Source: [FIRE-ZONE-PLAN-APP, commit `dca2eff063f52a9980c2aed255879a65cc579379`](https://github.com/william2535/FIRE-ZONE-PLAN-APP/tree/dca2eff063f52a9980c2aed255879a65cc579379), `index.html`.

Zone Sketch's existing `LICENSE` remains **unchanged and proprietary** in `vendor/zonesketch/LICENSE`. A byte-identical copy and source notice are also shipped as `public/zonesketch-LICENSE.txt` and `public/zonesketch-NOTICE.txt` so that the static distribution retains them. No new open-source licence or licence exception is asserted. Third-party components from the reference application have not been copied.

The extracted function bodies are verbatim. The only integration changes are ES-module exports and separate declarations of the original `CB_INSET` and `CB_SPAN` constants. `PROVENANCE.json` records each source line and SHA-256. Do not run formatters over the vendor module: source-line equality is deliberately tested.

| Export | Original source line | Purpose |
| --- | ---: | --- |
| `clamp` | 1731 | Bound normalized coordinates |
| `lerp` | 1952 | Interpolate points |
| `proj` | 1953 | Project a point onto a finite line segment |
| `segmentIntersection` | 2014 | Locate intersecting wall segments |
| `pointInPoly` | 2119 | Test a point against a polygon |
| `cbPlanToBoard` | 2710 | Preserve actual plan-to-circuit coordinate convention |
| `cbBoardToPlan` | 2711 | Restore plan coordinates from circuit-board coordinates |
| `cbEditProjectToSegment` | 2774 | Nearest segment point and distance for editing/snapping |

Circuit constants retain the source values at line 2593: inset `0.045`, span `0.91`.

## Integration boundary

The in-Jobs editor uses these original coordinate/geometry helpers for its focused editing tools. Its controls, state management, revision creation and SVG interaction are Jobs code. Jobs' Zone Sketch importer remains an **independent data reader**, using the real current/legacy v1 save schema. Imported geometry, circuits, photos and issued snapshots remain in their original representation.

The entire Zone Sketch monolithic application, proprietary symbol artwork, drawing renderer, auto-fill tools and advanced routing UI are not copied. Those are possible later shared-engine work, with deliberate licensing and integration decisions. Preserve this boundary in product descriptions: say “uses Zone Sketch geometry helpers”, not “the complete Zone Sketch engine is embedded”.

## Verification

`node --test tests/zone-engine.test.js` checks wall projections including degenerate segments, polygon/intersection behavior, actual circuit coordinate round trips, exact source-line hashes and the byte-identical distributed licence. The drawing-editor tests cover the integrated tools and actual-schema export separately.
