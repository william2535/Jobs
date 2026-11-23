# Job workspace backup and recovery

A job workspace backup is a portable copy of saved sites, jobs and their included evidence. Use **Back up workspace** in Help & data before changing devices, clearing browser storage or making other changes that could remove local records. Keep the downloaded file somewhere separate from this browser and protect it as a copy of your customer information. Browser storage and a persistence request are not backups.

The backup contains all sites, including sites without jobs; all working drawings and issued snapshots; original imported projects; job notes, photographs, device results, retained history and import receipts; reusable quick defects and favourite asset specifications; and unassigned time entries, including submitted snapshots and trashed entries. Job-linked time remains inside its job. Embedded raster photographs and plan images are included and pooled once when their bytes are identical.

FINDR practice progress, calculator convenience drafts, external websites and the application cache are excluded. The feature is labelled **job workspace backup**, not a backup of the entire browser. It does not synchronize devices or send information to another person.

## Restoring

Open the downloaded file through **Restore workspace**, review its date, kind and record counts, then confirm the restore. The application validates the complete file before proposing any storage write. Its existing IndexedDB transaction and stale-tab check commit the restored workspace together or leave the previous copy intact.

A different backup can be restored only into an **empty job workspace**. Existing sites, jobs, quick defects, asset favourites or unassigned timesheets prevent replacement, even if the backup contains fewer records. Restore on a new device or in a separate browser profile when you need to keep both workspaces. Use normal individual job-package imports to combine jobs with an existing workspace and retain their normal conflict handling. There is no automatic overwrite or merge in this recovery flow.

Importing an identical workspace again is a no-op. Comparison tolerates IndexedDB returning sites and jobs in ID order after reopening; drawing revision and evidence order remain significant. Import receipts remain present, so a previously received individual job package still deduplicates after workspace restoration.

## Recovery after a failed save

A **recovery** download contains the validated snapshot from an attempted local save that failed. It is explicitly marked `kind: "recovery"` and must not be described as a verified saved copy. It preserves that attempt so it can be restored in an empty workspace; creating or downloading the file does not mark the editor saved. It is not continuous draft autosaving and does not include edits made after the recorded attempt unless another save is attempted.

## Version 1 contract

`src/workspace-backup.js` exposes:

```js
await createWorkspaceBackup(rawWorkspace, { appVersion, kind: "backup" });
await inspectWorkspaceBackup(fileTextOrObject);
await restoreWorkspaceBackup(currentRawWorkspace, fileTextOrObject);
```

The raw workspace has `sites`, `jobs`, `quickDefects`, `assetTemplates` and `unassignedTimesheets`. It must be the actual stored/candidate state, not a display projection with inherited site defaults applied to jobs. Optional absent metadata collections normalize to empty arrays. JSON object fields whose value is `undefined` are omitted; unsupported non-JSON values are rejected.

The wire envelope contains `format: "JobsWorkspaceBackup"`, `version: 1`, UTC `createdAt`, `appVersion`, `kind`, a pooled `workspace`, `attachments`, `attachmentRefs`, `checksum` and `backupId`. Each attachment contains an `image-<SHA-256>` ID and an included raster data URL. Reference paths begin with `workspace` and point to null placeholders. All referenced images must exist, all attachment bytes must match their IDs, and every attachment must be referenced exactly once or more. Duplicate paths and unsafe object/path keys are rejected.

The top-level checksum is `sha256:<hex>` over canonical JSON of the envelope excluding `checksum` and `backupId`. Canonical JSON sorts object keys and preserves array order. `backupId` is `workspace-<hex>` using the same digest. These checks detect accidental damage or changes; they are **not an authenticated signature**, proof of authorship, encryption or tamper-proof audit evidence. Anyone with the file can read it and calculate a new checksum.

Limits are **100 MiB serialized file**, **256 MiB expanded workspace**, one million structural nodes, 80 nesting levels and the existing record-level limits. Validation bounds structure before cloning or hashing and bounds attachment expansion before inserting each image. Oversized workspaces must use the existing per-job export workflow or reduce the amount of retained media in a deliberate, separately backed-up process; no records are silently dropped to fit.

`inspectWorkspaceBackup()` returns `{workspace, summary, metadata}`. Summary counts sites, jobs, working drawing records, assets in each site's latest working drawing, quick defects, unassigned time records and unique attachments. Issued snapshots and previous evidence are retained inside their parent drawing/job and are not counted as additional sites or visits. Metadata identifies the kind, creation time, app version, format/version, checksum and backup ID. `restoreWorkspaceBackup()` returns `{state, duplicate, summary, metadata, message}` as a validated candidate; it performs no storage write.

Validation reuses the existing job-package, quick-defect and timesheet validators. Sites without visits are checked through a temporary validation envelope referencing their actual drawing data. That temporary visit is never returned, stored, exported or counted as an engineer job. Validation return values that would add defaults or trim legacy evidence are not substituted for the original saved JSON.

The backup module never calls `loadState()` or any browser storage API. A backup-only read must not advance the editing session's concurrency token while keeping an older in-memory workspace. The caller guards unsaved navigation, reviews the candidate, checks the current workspace is still the one reviewed and then uses the normal atomic save function.

## Verification

`node --test tests/workspace-backup.test.js` covers full evidence round trip; unused sites; original imported projects, issued records and PNG previews; attachment pooling; import-receipt preservation; repeated restore after key reordering; nonempty-workspace refusal; recovery labels; malformed JSON and checksums; invalid paths and records; and file/depth/unsafe-key/expanded-image limits. All fixtures are synthetic. Browser download and restore interaction checks belong to the release integration verification.
