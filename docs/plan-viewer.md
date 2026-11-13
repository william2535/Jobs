# Read-only plan viewer

`src/plan.js` exports `renderPlan(drawing, {floorId, snapshotId, onSelectAsset})` and returns a DOM element. It has no runtime dependency or remote request. Input objects are never modified. Floor and record selection, zoom and scroll are internal view state.

The renderer was written independently against the data structures observed in Zone Sketch commit `dca2eff063f52a9980c2aed255879a65cc579379` (`ZoneSketch.html`, `floorKeys`/`floorData`, `drawZoneLayer`, `connectionPath`, `cbBoardToPlan`). No Zone Sketch application source, icons, styles or assets were copied. Its proprietary licence remains intact in its own repository.

Supported visual data:

- Embedded PNG/JPEG/WebP/GIF floor background, with image aspect ratio and opacity.
- Normalized wall polylines, zone polygons, doors, windows, shutters, stairs, room labels and notes.
- Existing-cable polylines, system connections and circuit legs. Circuit board coordinates are converted through the recorded bounds (the source format uses inset `0.045`, span `0.91`). Dashed routes indicate incomplete drawing circuits; no route state is interpreted as a visit result.
- Equipment positions and references, with neutral Jobs markers rather than source-owned symbol artwork. The original type, symbol data and source drawings remain in the package.
- Working drawing versus immutable issued-record selection. Issued-record taps show historical evidence, never edit today's results.
- Floors without zones and drawings without a background.

Device markers support mouse, touch and keyboard activation. A 44px-minimum device button list accompanies the drawing for narrow screens and crowded plans. The SVG viewport is scrollable and has 1×–8× zoom controls. Labels are inserted as text, not HTML; only embedded raster image data is rendered. External image URLs are never fetched.

This is a review viewer, not a pixel-identical Zone Sketch renderer. Doors are simplified; specialist symbol artwork, directional coverage cones, circuit bridge humps, draft edit overlays, source layer filters and brightness/contrast filters are not reproduced. Original geometry and all source fields are preserved for future rendering improvements. Drawing lines and symbols are not dimensional survey evidence or test certification.

CSS hooks: `.plan-viewer`, `.plan-controls`, `.plan-status`, `.plan-scroll`, `.plan-legend`, `.plan-details`, `.plan-devices`. Essential responsive layout is self-contained; application button/select styles are inherited.

The subsequent engine integration uses Zone Sketch’s verbatim `cbBoardToPlan` helper for circuit coordinate conversion. Original geometry licensing and provenance are retained under `vendor/zonesketch/`; the SVG renderer itself remains independently implemented.
