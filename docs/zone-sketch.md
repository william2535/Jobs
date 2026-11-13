# Zone Sketch import contract

Jobs contains an independent data importer, not the Zone Sketch application. The reference repository was inspected at [`dca2eff063f52a9980c2aed255879a65cc579379`](https://github.com/william2535/FIRE-ZONE-PLAN-APP/tree/dca2eff063f52a9980c2aed255879a65cc579379). It contained no `AGENTS.md`. Its `LICENSE` is proprietary, copyright © 2026 Will Flood; the importer remains independent. Following the owner's later explicit request to use the shared engine, focused original geometry routines were extracted under that unchanged licence (see `zone-engine.md`). No complete application, original renderer or symbol artwork was copied. Neither the schema reader nor engine integration relicenses Zone Sketch.

## Actual supported saves

The editable backup exporter in `index.html:2244` emits:

```json
{"format":"ZoneSketchByWill","version":1,"project":{"site":"…","floors":[],"activeFloor":"…"}}
```

`validateProject` at `index.html:2276` accepts the legacy `"format":"ZoneSketch"` with the **same version 1 envelope**. Jobs supports these two markers. Raw project objects, arbitrary GeoJSON, unknown versions and company-specific branded formats are not claimed compatible.

The source project has no persistent site/project ID in its exported envelope. The editor's IndexedDB project ID is external to `project`; inventing one from the filename would not make it a source identity.

Relevant source locations:

- `fresh`, `floorKeys`, `syncFloor` (`index.html:1729–1746`): active floor fields also occur at project level; `project.floors[].data` is the authoritative per-floor drawing.
- Symbol catalogue (`index.html:1790–1810`): nine fire equipment types plus security, CCTV and access equipment. The `you` marker is a drawing object, not equipment.
- `validateProject`, `validateAdditionalWork` (`index.html:2248–2276`): floor arrays, normalized geometry, additional-work cable/joint/circuit data.
- `recordIssue`, `recordValidate`, issued export (`index.html:3211–3223`): immutable `issuedAsFits[].project`, revision history and standalone `issuedAsFit` envelope metadata.
- `validateDevicePhotos`, `attachDevicePhoto` (`index.html:3235–3238`): `symbols[].photos[]` includes `id`, `caption`, `createdAt`, and embedded raster `image`.
- `cbBoardToPlan` (`index.html:2711`): circuit leg points are normalized board coordinates with inset `0.045` and span `0.91`, mapped through circuit `bounds`. They are not raw plan positions.

## Mapping and preservation

`importZoneSketch(input, {siteId})` validates without side effects and returns `{site, drawing, summary, warnings}`. Imports are capped at 32 MiB. Invalid format/version, missing mandatory arrays, duplicate IDs within a collection, invalid geometry, malformed photos and nested issued snapshots are rejected before any local write.

| Source | Jobs |
| --- | --- |
| `project.site` | `site.name` |
| No source master site ID | New stable Jobs UUID, retained on reimport |
| `project.floors[].id` | Source mapping `zonesketch:floor:<id>` and preserved `floor.id` |
| Equipment `floor.data.symbols[]` | Assets keyed by Jobs site ID + source floor ID + source symbol ID |
| `reference`, `type`, `x`, `y`, `photos`, `systemData` | Explicit asset fields; complete symbol retained as `asset.source` |
| `recordState.state` | `asset.drawingStatus`, never a visit test result |
| `project.meta.revision`, `drawingRef` | Drawing revision/reference; empty when absent |
| Every floor `.data` | Entire structure retained: background, geometry, zones, circuits, connections, notes, pinned images, cable joints, additional-work setup and unknown fields |
| `project.revisions` | Preserved revision history |
| `project.issuedAsFits[]` | Issued snapshots with independent floors/assets and full snapshot project |
| Envelope `.issuedAsFit` | Drawing is explicitly identified as issued |
| Complete input envelope | `drawing.source`, including original active-floor mirrors and attachments |

`drawing.id` is a SHA-256 digest of canonical project content and optional issued metadata. The legacy/current marker difference does not create a new drawing. A changed revision creates a separate drawing; asset IDs remain stable. Importing again with the same Jobs site ID gives the same mapping.

The app matches source floor keys to existing sites. A user may explicitly select an existing site when a drawing has regenerated all its source IDs. Name matching alone cannot prove that two sites are the same. Conversely, copied Zone Sketch projects can share floor IDs; the review step must make the selected master site visible. Jobs does not silently overwrite visit results when a drawing changes.

Only recognized equipment symbols become assets. Walls, doors, stairs, zones, labels, notes, photo pins, `you` markers and unrecognized future symbol types stay in the drawing data. Unrecognized symbols generate a review warning. Manufacturers, models, loop numbers and addresses are never guessed from type or reference text. `systemData` is retained when present.

Additional-work (`fireWorkType: "additional"`) imports do **not** require zones. Empty zone arrays are valid. Existing cables, joints, endpoint references, route drafts, layout and additional setup remain intact.

The read-only plan is a simplified visualization. Detailed proprietary symbol artwork, relationship overlays and drawing filters are not reproduced exactly. The original project remains available inside the exported Jobs package for opening in Zone Sketch. The importer reports missing drawing references/revisions and unsupported symbols; it does not certify completeness or compliance.

## Demonstration and verification

`public/demo.zonesketch.json` contains only synthetic data: Westfield Training Centre, two floors, four devices, an embedded synthetic panel illustration, a pinned image, one circuit, working revision B02 and issued snapshot A01. It was imported into the actual inspected Zone Sketch application and **re-exported using its own editable-backup exporter**. This is a genuine supported save generated through the reference application's export path; it is not a customer file.

`tests/verify-zone-source.mjs` repeats that cross-application verification against an external Zone Sketch checkout. The proprietary application is not a dependency or committed test fixture. `tests/zone-import.test.js` tests current and legacy envelopes, complete mapping/preservation, stable IDs, changes of revision, additional layouts without zones, standalone issued records, unknown symbols, and invalid-file rejection.

The separately supplied real save was also validated locally: 1 floor, 40 recognized equipment symbols, 3 zones, 3 circuits and 276 revision entries. There were no unsupported symbols; 190 non-equipment drawing objects were excluded from the asset list. Full original-envelope equality was verified after import. No customer name, drawing, photograph or source file is included in this repository's test fixtures.

`compareDrawings(previous, incoming)` is a non-mutating review helper. It identifies added, removed, moved and changed equipment separately, plus floor additions/removals/renames. Changes to device type, reference, photos, drawing state or other source details are reviewable. Matching uses the established Jobs asset identity; source IDs regenerated upstream appear as removals/additions, never guessed matches. A removed symbol does not delete prior drawings or visit results.

Preservation means exact parsed JSON content, including unknown source fields and embedded image strings. JSON whitespace and key formatting from the uploaded text are not retained as separate original bytes.
