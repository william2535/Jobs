# Jobs package v2 (v1 import supported)

`*.jobs.json` is a self-contained UTF-8 JSON document. There is no server dependency. A package includes the permanent site, every included drawing revision and original Zone Sketch project, the selected job and all results, and actual embedded drawing/device/result photographs. Version 2 pools repeated images so multiple edited revisions of a large plan remain portable. Legacy version-1 packages with inline images are still accepted.

Keep exports as backups: browser storage is local to an origin and browser profile and can be cleared by the OS or user.

## Envelope and identities

```json
{
  "format": "JobsPackage",
  "version": 2,
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
    "workType": "Fire alarm maintenance",
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

The example is structural: a valid package must include the drawing selected by `job.drawingId`. Even a manual site uses an empty manual drawing. Drawing IDs identify immutable snapshots; job `revision` counts saved visit edits independently of the drawing revision label. Each drawing contains `id`, `revision`, `floors`, `assets`, original `source`, and any revision history or issued snapshots. A floor has `id`, `name`, and retained `data`. An asset has its own stable `id`, source device/floor mappings, type, reference, coordinates, photographs, retained drawing status and source fields. Unknown source properties are retained, not inferred.

Every active asset has one visit result, initialized to `Not tested`. A result has stable `id`, `assetId`, `state`, `observations`, `notes`, `defects`, `readings`, and `photos`. States are `Not tested`, `Satisfactory`, `Unsatisfactory`, `Inaccessible`, `Not applicable`. The last three require an explanation in observations, notes or defects. Readings contain `{name, value, unit}`. Decoded photos contain `{id, image, caption?, createdAt?}`. Images are complete base64 PNG, JPEG, WebP, GIF, AVIF or BMP data URIs. Active online photo URLs and SVG attachments are rejected. No remote photo is silently treated as included.

## Attachment pool and decoding

Version 2 replaces repeated image strings in the wire `site` and `job` with `null`, and lists their exact locations separately:

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

`validateJobPackage` synchronously checks bounds, pool/path structure and expanded records, returning a normal expanded **version-1 envelope** suitable for existing data consumers. `importJobPackage` additionally verifies attachment content hashes before changing state. Repeated, unsafe (`__proto__`, `prototype`, `constructor`), missing, non-null or invalid paths are rejected. Missing/unused attachments and remote image payloads are rejected. Maximum file size is 100 MiB; maximum expanded content is 256 MiB, measured without concatenating all repeated images into a giant JSON string.

The package is not signed or authenticated. Digests establish content identity and accidental-tamper checks, not who authored evidence or signed a certificate.

## Import and conflicts

Validation and decoding finish before local mutation. Unknown versions, invalid JSON, missing references, duplicate IDs, unsupported result states and missing image payloads are rejected. Unchanged local visits reopen rather than duplicating, even after unrelated site changes.

A content fingerprint of the normalized pooled representation is retained as an import receipt, so reopening the same package after local edits does not duplicate it. Equivalent v1/v2 content has the same new receipt; old v1 receipt fingerprints remain recognized when importing legacy files. When a matching job ID has different work, the existing job is kept and the incoming visit gets a distinct conflict ID. `sourceJobId` and `sourceResultId` preserve source identities. There is no automatic overwrite of engineer results.

An existing master site retains its metadata. Different incoming metadata stays under `site.importedMetadata` for review. Previously absent drawing revisions are appended. Drawing-ID/content conflicts preserve both drawings and remap the imported visit to the preserved incoming version. Drawing changes, archived results and edited-drawing ancestry are remapped consistently; source drawing IDs remain recorded. Source floor mappings are unioned. Accepting/merging conflicting versions and live multi-device synchronization remain future work.

## Editable jobs and drawing revisions

Optional core extensions are preserved in both wire versions:

- `job.workflow` is separately versioned (`version: 1`), storing editable job details, appointments, work actions, products/labour, local purchase-order records, timesheets, finalisation and edit timeline. `validateWorkflow` checks it; collections require stable IDs. Product/PO completion never changes equipment results. PO status is a local record, not a supplier submission.
- `job.drawingChanges[]` records each explicitly applied drawing with stable change ID, `fromDrawingId`, `toDrawingId`, timestamp, prior job revision and complete `previousResults`. Earlier drawings stay in the site.
- `job.archivedResults[]` preserves removed equipment as `{id, assetId, drawingId, changeId, removedAt, asset, result}`. Photographs and readings remain available even when equipment is absent from the current drawing.
- Edited drawings identify `basedOnDrawingId`; original imported `source` and issued snapshots remain unchanged. Drawing-ID conflicts remap local history/archive/ancestry references and preserve their source IDs.

`applyDrawingToJob(state, jobId, newDrawing)` returns a detached next state. Unchanged asset IDs retain result IDs and findings. New or reintroduced equipment starts Not tested. Removed equipment is archived, not erased. Applying the same drawing again is a no-op. Existing drawing IDs with different content are rejected. Other visits remain linked to their original drawings/results. No drawing revision or import automatically passes equipment.

## Local storage and offline behavior

IndexedDB database `jobs-local` version 2 has separate `sites`, `jobs` and `metadata` stores. A save replaces the application snapshot transactionally; all stores commit or none do. A metadata revision rejects stale tabs before they overwrite newer work. Save state is shown only after commit, and failures are visible. Cache Storage contains the application shell; IndexedDB contains expanded engineer data and attachments. The export pool reduces package size; shared Blob storage and on-device media deduplication remain future work.

Use one editing tab at a time. Stale-tab writes are rejected; automatic merging is not implemented. When rejected, keep a copy of unsaved form content before reloading. Export regularly. Installed apps still use browser-managed storage and can be evicted. Service-worker readiness must be confirmed before offline reopening.
