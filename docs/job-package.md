# Jobs package v3 (v1 and v2 import supported)

`*.jobs.json` is a self-contained UTF-8 JSON document. There is no server dependency. A package includes the selected job, formatted notes and actual photographs. When the job belongs to a site, it also includes that permanent site, its drawing revisions and original Zone Sketch projects, and the visit results. Versions 2 and 3 pool repeated images so multiple edited revisions of a large plan remain portable. Version 3 additionally supports standalone jobs with no invented site. Legacy version-1 inline and version-2 pooled packages remain accepted.

Keep exports as backups: browser storage is local to an origin and browser profile and can be cleared by the OS or user.

## Envelope and identities

```json
{
  "format": "JobsPackage",
  "version": 3,
  "packageId": "package-<SHA-256 of canonical payload>",
  "site": {
    "id": "stable-master-site-id",
    "name": "Synthetic example",
    "address": "",
    "sourceKeys": ["zonesketch:floor:source-floor-id"],
    "drawings": []
  },
  "job": {
    "id": "stable-job-id",
    "siteId": "stable-master-site-id",
    "drawingId": "included-drawing-id",
    "revision": 1,
    "system": "Fire alarm",
    "discipline": "Fire",
    "customDiscipline": "",
    "workType": "Maintenance",
    "customWorkType": "",
    "scope": "",
    "instructions": "",
    "engineer": "",
    "status": "Open",
    "createdAt": "2026-01-01T12:00:00Z",
    "updatedAt": "2026-01-01T12:00:00Z",
    "results": [],
    "aiProposals": []
  },
  "attachments": [],
  "attachmentRefs": []
}
```

The example is structural: a site-associated package must include the drawing selected by `job.drawingId`. Even a manual site uses an empty manual drawing. Drawing IDs identify immutable snapshots; job `revision` counts saved visit edits independently of the drawing revision label. Each drawing contains `id`, `revision`, `floors`, `assets`, original `source`, and any revision history or issued snapshots. A floor has `id`, `name`, and retained `data`. An asset has its own stable `id`, source device/floor mappings, type, reference, coordinates, photographs, retained drawing status and source fields. Unknown source properties are retained, not inferred.

Every active asset has one visit result, initialized to `Not tested`. A result has stable `id`, `assetId`, `state`, `observations`, `notes`, `defects`, `readings`, and `photos`. States are `Not tested`, `Satisfactory`, `Unsatisfactory`, `Inaccessible`, `Not applicable`. The last three require an explanation in observations, notes or defects. Readings contain `{name, value, unit}`. Decoded photos contain `{id, image, caption?, createdAt?}`. Images are complete base64 PNG, JPEG, WebP, GIF, AVIF or BMP data URIs. Active online photo URLs and SVG attachments are rejected. No remote photo is silently treated as included.

### Device remarks

Optional `result.remarks` version 1 contains `items` and `history`. Each item has a stable `id`, `title`, `location`, `description`, `severity`, `internalNote`, `lastVerified`, `recommendation`, `status`, `beforePhotos`, `resolvedPhotos`, `products`, `createdAt` and `updatedAt`. Severity is Unclassified, Observation, Minor defect, Major defect or Critical defect. Status is explicitly Open or Resolved; neither changes the device's test result. Last verified is an entered real `YYYY-MM-DD` date or an empty string. Templates supply only a title and, for the selected Critical defect template, its severity; no findings or verification date are invented.

Remark photos use `{id, image, caption}` with included raster data. Products use `{id, description, quantity, unit}` with finite nonnegative quantities. Edits preserve prior items in history entries `{id, remarkId, savedAt, item}`. Historical snapshots retain the same stable item/photo/product identities; unrelated records cannot share them. No deletion helper discards earlier remarks, and hitting a history limit rejects the edit.

Validation permits at most 100 current remarks, 200 history entries, 12 photographs in each before/resolved group and 100 products per item. Each photo is limited to 8 MiB, with 40 MiB of distinct photo payloads across the device's remarks/history; total text is bounded. Unknown keys, unsafe media, invalid dates/versions and ambiguous IDs are rejected for current results, prior drawing results and archived results before import changes storage. The existing attachment pool includes all remark pictures and history, so this optional field does not require a new package version. Internal notes remain in the backup package but are excluded from the client report and Panel Pal context.

### Site folders and job defaults

A job may belong to a named permanent site folder, or remain standalone until the engineer attaches it. Optional `site.profile` version 1 stores only recorded reusable fields: `client`, `contactName`, `contactPhone`, `contactEmail`, `accessHours`, `accessProcedure`, `safetyRequirements`, `serviceRequirements`, `system`, `discipline`, `customDiscipline`, `workType`, `customWorkType`, `engineer`, `scope` and `instructions`. Values are bounded strings; empty values are omitted. Recorded disciplines and job types use the shared classification choices below; existing legacy job types remain supported. The profile is validated before package import changes local records.

New quick jobs use `job.settings` version 1 with an `overrides` object. Shared site values apply to jobs at display/report time; explicitly recorded per-job overrides, including intentional empty values, take precedence. Classification overrides retain the discipline/custom-name or type/custom-name pair together. Changing reusable settings does not replace notes, device results or the pinned drawing. Legacy jobs without this extension retain their saved values until adopted by the shared-settings workflow. Internal empty defaults in the core schema remain accepted for compatibility.

Quick job creation allows a blank draft without a site, discipline, job type or description. Creating the draft does not persist it; explicit Save writes it. Optional classification and job details are edited in job settings. `job.discipline` is Fire, Security, Intruder, CCTV, Access control or Custom. `job.workType` is Maintenance, Small works, Install, Take over visit, Call out or Custom. A Custom value requires `customDiscipline` or `customWorkType` respectively, each at most 120 characters. The entered description is `job.workflow.details.description` (up to 10,000 characters). These choices describe the visit; they do not change the drawing's system, geometry or equipment results. Empty custom-name fields are cleared when a standard choice is selected.

Older job packages without discipline still import. Their existing Fire alarm maintenance and General fault or repair work values stay unchanged and editable. Optional settings use the new lists. Site defaults and quick jobs may remain unclassified.

The job's `drawingId` pins its own saved map revision. That drawing's geometry, source envelope, PNG and photographs are included in the package; they do not depend on the latest site plan or a remote link. Updating the site plan appends a revision and leaves existing visits on their saved map. Importing a revised plan explicitly inside a job creates its reviewed drawing change/history instead.

## Standalone notes jobs

A standalone v3 package has `site: null`, `job.siteId: null`, `job.drawingId: null` and `job.results: []`. It still has a stable job ID, revision, timestamps, notes, photographs and optional settings. Import creates no placeholder site or drawing. Version 1/2 null-site files are rejected rather than silently reinterpreted. Missing associated-site references remain invalid; they are not treated as standalone jobs.

`createQuickJob(site = null, values = {})` produces an in-memory draft. `attachJobToSite(job, site)` preserves the job ID and notes, selects the site's current drawing and creates fresh Not tested results. It does not increment the job revision because the calling save owns that increment. Re-selecting the same site preserves the pinned drawing/results; switching an already associated job to another site is rejected so evidence cannot be silently discarded.

`job.notesDocument` version 1 contains structured `blocks` and `photos`. Text blocks retain stable IDs, paragraph/heading/quote/list type, alignment and bounded formatted text runs. List items also have stable IDs. Run formatting is restricted to supported boolean marks, explicit text sizes and hexadecimal text/highlight colours. The document contains no arbitrary HTML, CSS or remote links. Photographs have stable IDs, captions and actual embedded raster data, and enter the same attachment pool as drawing/device photographs. Notes validation runs before package import writes local records.

## Optional visit checklist

`job.checklist` version 1 contains the saved discipline/job-type checklist, stable checklist ID and revision, prompt-template version, drawing reference and supporting job revision, recorded fields and item states, saved timestamp, and retained earlier classification/drawing records. It is validated before import writes. Older packages without this extension remain supported. Checklist evidence travels alongside the unchanged device results; it never implies a passed result or an issued certificate. See [checklist contract](job-checklist.md) for the workflow and validation boundary.

## Attachment pool and decoding

Versions 2 and 3 replace repeated image strings in the wire `site` and `job` with `null`, and list their exact locations separately:

```json
{
  "attachments": [
    {"id":"image-<sha256>","image":"data:image/png;base64,<actual included bytes>"}
  ],
  "attachmentRefs": [
    {"path":["site","drawings",0,"floors",0,"data","image"],"attachmentId":"image-<sha256>"}
  ]
}
```

The referenced path must already exist and contain `null`. Object path segments are strings; array indices are non-negative integers. The pool ID is the SHA-256 of the canonical JSON value of the complete image data-URI string. Each unique string is stored once even when it occurs in source mirrors, working drawings, photographs, archived evidence or issued snapshots. Explicit path references avoid reserving special marker objects or strings inside the original Zone Sketch content. Decoding restores the original JSON data exactly, apart from documented defaults on Jobs' own optional fields.

`validateJobPackage` synchronously checks bounds, pool/path structure and expanded records, returning an expanded **version-1 envelope** for site-associated jobs. A standalone job returns an expanded **version-3 envelope** with inline images and empty pool/reference arrays, so it remains independently valid without pretending to be a legacy site-associated record. `importJobPackage` additionally verifies attachment content hashes before changing state. Repeated, unsafe (`__proto__`, `prototype`, `constructor`), missing, non-null or invalid paths are rejected. Missing/unused attachments and remote image payloads are rejected. Maximum file size is 100 MiB; maximum expanded content is 256 MiB, measured without concatenating all repeated images into a giant JSON string.

The package is not signed or authenticated. Digests establish content identity and accidental-tamper checks, not who authored evidence or signed a certificate.

## Import and conflicts

Validation and decoding finish before local mutation. Unknown versions, invalid JSON, missing references, duplicate IDs, unsupported result states and missing image payloads are rejected. Unchanged local visits reopen rather than duplicating, even after unrelated site changes.

A content fingerprint of the normalized pooled representation is retained as an import receipt, so reopening the same package after local edits does not duplicate it. Equivalent site-associated v1/v2/v3 content uses the version-2 fingerprint representation, preserving previously stored pooled receipts. Old v1 receipt fingerprints remain recognized when importing legacy files. Standalone v3 jobs use a v3 pooled fingerprint. When a matching job ID has different work, the existing job is kept and the incoming visit gets a distinct conflict ID. `sourceJobId` and `sourceResultId` preserve source identities. There is no automatic overwrite of engineer results.

An existing master site retains its metadata. Different incoming metadata stays under `site.importedMetadata` for review. Previously absent drawing revisions are appended. Drawing-ID/content conflicts preserve both drawings and remap the imported visit to the preserved incoming version. Drawing changes, archived results and edited-drawing ancestry are remapped consistently; source drawing IDs remain recorded. Source floor mappings are unioned. Accepting/merging conflicting versions and live multi-device synchronization remain future work.

## Editable jobs and drawing revisions

Optional core extensions are preserved in supported wire versions:

- `job.workflow` is separately versioned (`version: 1`), storing editable job details, appointments, work actions, products/labour, local purchase-order records, timesheets, finalisation and edit timeline. `validateWorkflow` checks it; collections require stable IDs. Product/PO completion never changes equipment results. PO status is a local record, not a supplier submission.
- `job.drawingChanges[]` records each explicitly applied drawing with stable change ID, `fromDrawingId`, `toDrawingId`, timestamp, prior job revision and complete `previousResults`. Earlier drawings stay in the site.
- `job.archivedResults[]` preserves removed equipment as `{id, assetId, drawingId, changeId, removedAt, asset, result}`. Photographs and readings remain available even when equipment is absent from the current drawing.
- Edited drawings identify `basedOnDrawingId`; original imported `source` and issued snapshots remain unchanged. Drawing-ID conflicts remap local history/archive/ancestry references and preserve their source IDs.

`applyDrawingToJob(state, jobId, newDrawing)` returns a detached next state. Unchanged asset IDs retain result IDs and findings. New or reintroduced equipment starts Not tested. Removed equipment is archived, not erased. Applying the same drawing again is a no-op. Existing drawing IDs with different content are rejected. Other visits remain linked to their original drawings/results. No drawing revision or import automatically passes equipment.

## Local storage and offline behavior

IndexedDB database `jobs-local` version 2 has separate `sites`, `jobs` and `metadata` stores. A save replaces the application snapshot transactionally; all stores commit or none do. A metadata revision rejects stale tabs before they overwrite newer work. Save state is shown only after commit, and failures are visible. Cache Storage contains the application shell; IndexedDB contains expanded engineer data and attachments. The export pool reduces package size; shared Blob storage and on-device media deduplication remain future work.

Use one editing tab at a time. Stale-tab writes are rejected; automatic merging is not implemented. When rejected, keep a copy of unsaved form content before reloading. Export regularly. Installed apps still use browser-managed storage and can be evicted. Service-worker readiness must be confirmed before offline reopening.

## Included PNG preview cache

Optional `drawing.planPreviews` contains `{id, rendererVersion, drawingId, floorId, snapshotId, revision, image, width, height, generatedAt}` plus renderer metadata. `image` is an included PNG (pooled in v2/v3). Dimensions must be positive integers up to 16,384; floor and issued-snapshot references must exist. `planPreviewErrors` records generation failures for valid floor/snapshot pairs, and `planPreviewAttemptedFor` identifies the attempted drawing.

These fields are derived display cache. Adding or regenerating a PNG does not create a drawing-content conflict or a new working revision. Existing saved cache survives an identical plan reimport; missing incoming previews can be retained. A true drawing-ID collision remaps the imported preview's drawing ID while retaining its PNG and renderer provenance, so an actual Zone Sketch rendering is not unnecessarily replaced with a fallback rendering. Working and issued previews remain separate. Original geometry, source data, device positions and evidence photographs remain part of drawing-content comparison.
