# Included plan previews

Jobs displays an included PNG for each working floor and issued floor record. The drawing selectors keep issued evidence separate from the current drawing. The floor asset grid has eight cards per page; selecting a current asset opens its visit record. Selecting an issued asset shows historical evidence only.

Drawing changes belong in the actual Zone Sketch application, opened through **Edit site**. Jobs does not expose its former drawing editor. The [Zone Sketch connection contract](zone-sketch-connection.md) describes automatic loading and return of the edited project.

## Sources and offline operation

When the Zone Sketch receiver returns a genuine PNG survey sheet, Jobs stores its exact bytes. These sheets include source headers and margins, so Jobs does not overlay normalized device coordinates on them. The separate asset grid provides device navigation.

For a save imported without a PNG, `ensurePlanPreviews` uses Jobs' independent read-only SVG renderer to rasterize each floor. These previews support tappable positioned devices. A preview uses only embedded drawing backgrounds and local fonts; it fetches no online images. Unsupported or undecodable backgrounds produce a visible error instead of a substitute image. A read-only drawing-data fallback remains available if preview preparation fails.

Floors with no included geometry, background or positioned assets show a clear empty state. Assets without coordinates remain unplaced. Jobs does not invent a location to create a preview.

Generated PNGs are embedded in local structured storage and job packages. After preparation, viewing, downloading and exporting them needs no connection. **Download PNG** writes the stored PNG bytes. Preview generation does not modify the imported source, floor geometry or issued snapshots.

## Cache and returned sheets

`drawing.planPreviews` contains entries with these fields:

| Field | Meaning |
| --- | --- |
| `id`, `drawingId`, `floorId` | Stable reference to the drawing record and floor |
| `snapshotId` | Issued snapshot ID, or `null` for the working floor |
| `rendererVersion` | Preview cache schema version, currently `1` |
| `renderer` | `JobsPreview` or `ZoneSketch` |
| `overlayMode` | `normalized` for independent floor previews; `none` for source sheets |
| `revision`, `generatedAt` | Drawing revision and preparation timestamp |
| `image` | Included `data:image/png;base64,...` data |
| `width`, `height` | Actual PNG pixel dimensions |
| `mode` | Source sheet mode, where supplied by Zone Sketch |

Drawing revisions are immutable. `hasPlanPreviews` and `ensurePlanPreviews` reuse a complete cache without cloning the full original project on every result save. Failed preparation is recorded in `planPreviewErrors` with `planPreviewAttemptedFor`; the explicit retry control can try again. Genuine source sheets are preserved during fallback rebuilds.

`acceptZoneSketchPreviews(drawing, previews)` validates receiver sheets before attaching them. It accepts unique known working floors, requires renderer `ZoneSketch`, checks PNG signature/IHDR dimensions and rejects missing floors, duplicates, URLs, mismatched dimensions and issued records. Accepted source modes are `survey`, `zone` and `asfit`. Existing issued previews are retained. The connection layer separately authenticates the message origin and session.

Tests in `tests/plan-preview.test.js` cover exact source-sheet bytes, validation and atomic rejection, cache identity reuse and issued-cache preservation. Browser workflow tests cover PNG decoding, local reload, offline use, downloading, package round trips and working/issued selection.
