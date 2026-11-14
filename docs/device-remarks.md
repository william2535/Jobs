# Device remarks and defects

Each device card has **Pass / Fail / N/A** controls and a pencil **Edit** button. Edit opens **Defects** directly; the device name opens its full record. You can also open a device from its job plan. The layout follows the supplied mobile reference with grouped remark details, photograph strips and a separate resolution section. The rest of the job stays in Notes, Plan and Finalisation.

On a card, **Pass** saves that device's result immediately. **Fail** and **N/A** use an existing recorded explanation or open a short explanation field with **Save result** and **Cancel**. An explicit Fail selection can also reuse the description of an existing open remark when no other explanation is recorded. An incomplete explanation or failed save leaves the previous saved result intact. Changing a result preserves its other observations, readings, photographs and remarks.

The full **Today's result** form also offers Not tested and Inaccessible. Pass and Fail save the existing Satisfactory and Unsatisfactory result states. The engineer explicitly selects the outcome; unsatisfactory, inaccessible and not-applicable results require an explanation. This records a visit result; it does not certify compliance. Adding, starring or resolving a remark never changes that result.

**Add remark** offers Battery backup, Critical defect, Custom note and Customer advice given. These are starting labels, not completed findings. The editor records:

- Before photographs, location, title and description.
- Explicit severity, an internal note and optional last-verified date.
- Resolution photographs, recommendation and an explicit Open/Resolved state.
- Local product lines with description, quantity and unit.

Save remark commits the complete record locally. Navigation protects unsaved edits, and a failed write keeps the editor open. The result control is hidden while editing a remark so the two forms cannot overwrite one another's drafts. Products, Photos and History tabs show the device's recorded information. Products do not send an order or update external stock.

After saving a remark, tap its **☆** to keep it as a quick defect. **Add remark → Saved quick defects → Add** reuses its title, description, severity and recommendation in a new editable remark. Save the new remark when ready. The library works across jobs in this browser and remains available offline. Identical reusable content is saved once; tap **★** to remove the shortcut without deleting any recorded remark.

A reused quick defect has a fresh ID and creation timestamp and starts **Open**. It does not copy a previous visit's location, photos, internal note, verification date, products, resolution state or test outcome. Those stay with the original visit. The new device's result remains unchanged.

Finalisation includes the saved remark, location, severity, recommendation, products and before/resolution photographs in the draft report. Internal notes remain in the job package but are omitted from the client report and Panel Pal context. Earlier remark versions remain in local history and export, including their photographs. A resolved remark does not erase its earlier evidence.

## Data contract

The optional `result.remarks` extension is `{version: 1, items: [], history: []}`. Each item has a stable ID, title, location, description, severity, internalNote, lastVerified, recommendation, status, beforePhotos, resolvedPhotos, products, createdAt and updatedAt. Dates are entered explicitly; timestamps describe record creation/saving, not proof of a site inspection. Products and photographs have stable IDs. Photographs contain actual raster bytes and optional captions.

Severity is Unclassified, Observation, Minor defect, Major defect or Critical defect. Status is Open or Resolved. A saved change retains the preceding item in `history` with a stable history ID, remarkId and savedAt. The same unchanged item does not add another history entry. History is an editable local record, not a signed audit trail.

Validation covers current results, archived device evidence and previous drawing results before package import writes data. Unknown versions/fields, unsupported severities, duplicate IDs, invalid dates, external image URLs and malformed image signatures are rejected. Limits are 100 current remarks, 200 prior versions, 12 pictures per photo group, 100 products per item, 40 MiB of unique pictures and one million text characters per device's remarks and retained history. Text fields have individual bounds. The UI shares the supported raster formats with job notes.

The existing version-3 job package pools these images with other included attachments. Import/export retains the complete structured remarks, internal notes and history; it needs no online image links and does not invent a new drawing format. Version-1/2 packages without remarks still import.

## Local quick-defect library

`state.quickDefects` is a separate array, persisted under the `quick-defects` key in the IndexedDB `metadata` store. Each template contains only `id`, `title`, `description`, `severity`, `recommendation` and `createdAt`. Validation allows at most 200 templates, rejects duplicate IDs or identical reusable content, and bounds each text field. Saving the library uses the same atomic transaction and stale-tab protection as jobs. Existing databases with no library start empty; callers omitting the field preserve the stored library.

The shortcut library belongs to this browser profile and is not included in a job package or synchronized to another device. Once a shortcut is applied and saved as a remark, that recorded remark and any newly added evidence travel in the normal job export. Importing a job does not replace the receiving browser's shortcut library.
