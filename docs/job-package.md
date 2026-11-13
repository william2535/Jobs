# Jobs package v1

`*.jobs.json` is a self-contained UTF-8 JSON document. There is no server dependency. A package includes the permanent site, every included drawing revision and original Zone Sketch project, the selected job and all results, plus embedded drawing/device/result photographs. Keep exports as backups: browser storage is local to an origin and browser profile and can be cleared by the OS or user.

## Envelope and identities

```json
{
  "format": "JobsPackage",
  "version": 1,
  "packageId": "package-<SHA-256 of canonical payload>",
  "site": {
    "id": "stable-master-site-id",
    "name": "Synthetic example",
    "address": "",
    "sourceKeys": ["source-floor-id"],
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
  }
}
```

The example is structural: a valid package must include the drawing selected by `job.drawingId`. Even a manual site uses an empty manual drawing. Drawing IDs identify immutable imported snapshots; job `revision` counts saved visit edits and is independent of the drawing revision label. Each drawing contains `id`, `revision`, `floors`, `assets`, the original `source`, and (where present) revision history and issued snapshots. A floor has `id`, `name`, and retained `data`. An asset has its own stable `id`, source device/floor mappings, type, reference, coordinates, photographs, retained drawing status and source fields. Unknown source properties are retained, not inferred.

Every selected asset has one visit result, initialized to `Not tested`. A result has stable `id`, `assetId`, `state`, `observations`, `notes`, `defects`, `readings`, and `photos`. States are `Not tested`, `Satisfactory`, `Unsatisfactory`, `Inaccessible`, `Not applicable`. The last three require an explanation in observations, notes or defects. Readings contain `{name, value, unit}`. Photos contain `{id, image, caption?, createdAt?}`, with a base64 `data:image/png`, JPEG, WebP, GIF, AVIF or BMP image. Active photo URLs and SVG attachments are rejected; unsupported original fields may still be retained inside the original source for audit. No remote photo is silently treated as included.

## Import and conflicts

Validation occurs before local mutation. Unknown package versions, invalid JSON, missing references, duplicate IDs, unsupported result states and missing image payloads are rejected. Text imports are limited to 100 MiB. The package is not a signed or authenticated record; its SHA-256 is an identity/deduplication digest, not an authenticity claim.

An identical local job/site snapshot opens the existing job. A SHA-256 import receipt is retained on the imported job so that importing the same package after editing it does not duplicate it. When a matching job ID has different work, the existing job is kept and the incoming visit is saved under a deterministic conflict ID; `sourceJobId` and `sourceResultId` preserve its package IDs. There is no automatic merge or overwrite of engineer results.

An existing master site retains its current metadata. Different imported metadata is retained under `site.importedMetadata` for review. Previously absent drawing revisions are appended. If the same drawing ID has different content, both drawings are kept, the imported drawing gets a distinct ID and `sourceDrawingId`, and the imported job references that preserved version. Source floor mappings are unioned. Conflict resolution and cross-device synchronization are future work.

## Local storage and offline behavior

IndexedDB database `jobs-local` version 2 has separate `sites`, `jobs` and `metadata` object stores. A save replaces the snapshot in one read/write transaction; either all stores commit or none do. A metadata revision is compared inside the transaction to reject a stale browser tab before it can overwrite newer work. The UI must only show a saved state after the transaction completes and expose failures. Cache Storage contains the application shell; IndexedDB contains engineer data and included attachments. Service-worker readiness must be confirmed before promising offline reopening.

Use one editing tab at a time in this milestone. Stale-tab writes are rejected, but automatic merging and synchronization are not implemented. When rejected, copy unsaved form content before reloading the current local records. Export important jobs regularly. Installed apps on iOS still use browser-managed storage; installation is not a guarantee against eviction.
