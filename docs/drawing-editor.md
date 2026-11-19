# Working drawing edits in Jobs

**Historical implementation:** the in-Jobs editor described below is no longer exposed in the application. The current workflow uses PNG plans and the actual Zone Sketch application through [Edit site](zone-sketch-connection.md). Its actual-schema export and draft helpers remain for compatibility and automatic handoff preparation.
The Jobs drawing editor uses the same normalized floor/object data model for fire alarm, intruder alarm, CCTV and access control drawings. An explicit **Drawing system** choice preserves the imported discipline and requires a deliberate choice for a manual drawing. Equipment choices come from the independently mapped current Zone Sketch catalogue; labels/references do not become manufacturer, model, loop or address claims.

## What is editable

- Select a floor, rename it or add another floor.
- Select equipment on the plan or in the object list; change its reference, type and position.
- Add equipment by tapping or entering normalized X/Y coordinates; delete selected equipment.
- Add wall polylines point by point, finish a wall, draw a rectangular room, edit a wall's point list, or delete a selected wall.
- Add, move, edit or delete text labels.
- Zoom the plan, optionally snap new points to nearby walls, and undo the last eight drawing operations.

Existing manual equipment with no recorded position remains explicitly unplaced in the object picker; opening or saving a drawing does not invent a centre position. The engineer can place it by tapping or supplying both coordinates. An editable Zone Sketch export requires all included equipment to be placed.

Positions are normalized from 0 to 1 against the complete floor image. The numerical coordinate controls provide an alternative to touch placement. Existing plan images, zones, symbols, circuits, connection routes, photographs and unknown source data remain preserved. The editor displays simplified device markers; it does not reproduce every Zone Sketch editing tool or symbol artwork.

Door/window/stair details, zone polygon editing, circuit rerouting, cable design, perspective correction and background-image editing are not included in this editor milestone. Routes remain as supplied when equipment or walls move; a visible review note explains that they must be checked. Deleting equipment removes direct relationships to it from the working drawing, while the original source and earlier drawing snapshots remain unchanged.

## Actual engine reuse and licensing

The interface, state handling and importer are independently written. The editor reuses focused **actual Zone Sketch geometry functions** from `vendor/zonesketch/geometry.js`: `clamp` for input limits, `cbEditProjectToSegment` for wall snapping, and `cbBoardToPlan` for circuit coordinates. That module retains its original proprietary licence and provenance. This is limited shared geometry, not a claim that the complete Zone Sketch application or all of its tools are embedded.

## Revision and evidence safety

`createDrawingDraft()` makes a detached working copy. Issued drawings reject editing. Saving with `createDrawingRevision()` produces a new drawing ID, revision label, `basedOnDrawingId`, edit sequence, edit time and change notes. Existing asset IDs stay stable; new equipment receives a new ID. `drawing.source` remains the exact original parsed import, and issued snapshots remain unchanged.

The caller applies the new drawing to the visit and preserves the prior drawing/results. The editor does not mark any equipment tested or erase recorded visit evidence. Removed equipment must be archived by the caller's revision-reconciliation code, not silently discard its results.

Typed selected-device fields are applied when saving; failed saves keep the draft open. The parent receives `onDirty(true)` and must guard navigation/cancellation. Pending wall/room points require a completed shape before saving. The original source is available separately from an edited drawing export.

## Editable export

`buildEditableZoneSketch()` produces the actual current envelope:

```json
{"format":"ZoneSketchByWill","version":1,"project":{}}
```

It starts with the original project, replaces the edited floors, synchronizes the active-floor fields used by Zone Sketch, updates revision history and retains issued records. It runs the independent schema validator before download. Unsupported manual equipment types require an explicit catalogue choice before export; they are never silently relabelled.

A Jobs job package retains both the original imported project and the edited normalized drawing. An **edited Zone Sketch export** is a separate file, clearly distinguished from the original source.

## Verification

Seven editor unit tests cover immutable originals/issued snapshots, stable asset mappings, device add/remove/move, walls/rooms/labels/floors, current-schema export/reimport, invalid geometry, explicit manual discipline selection, shared editing across fire/intruder/CCTV/access while retaining circuit data, and unplaced manual equipment remaining unknown until explicitly positioned. The synthetic edited example is also checked against the actual reference Zone Sketch importer/exporter; its provenance is recorded with the engine-compatibility verification.
