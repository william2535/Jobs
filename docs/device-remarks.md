# Device remarks and defects

Open a device from its job plan or equipment grid, then choose **Defects**. The layout follows the supplied mobile reference with grouped remark details, photograph strips and a separate resolution section. The rest of the job stays in Notes, Plan and Finalisation.

**Today's result** offers Not tested, Pass, Fail, Inaccessible and N/A. Pass and Fail save the existing Satisfactory and Unsatisfactory result states. The engineer must explicitly save the outcome, and an unsatisfactory, inaccessible or not-applicable result needs an explanation. This records a visit result; it does not certify compliance. Adding or resolving a remark never changes that result.

**Add remark** offers Battery backup, Critical defect, Custom note and Customer advice given. These are starting labels, not completed findings. The editor records:

- Before photographs, location, title and description.
- Explicit severity, an internal note and optional last-verified date.
- Resolution photographs, recommendation and an explicit Open/Resolved state.
- Local product lines with description, quantity and unit.

Save remark commits the complete record locally. Navigation protects unsaved edits, and a failed write keeps the editor open. The result control is hidden while editing a remark so the two forms cannot overwrite one another's drafts. Products, Photos and History tabs show the device's recorded information. Products do not send an order or update external stock.

Finalisation includes the saved remark, location, severity, recommendation, products and before/resolution photographs in the draft report. Internal notes remain in the job package but are omitted from the client report and Panel Pal context. Earlier remark versions remain in local history and export, including their photographs. A resolved remark does not erase its earlier evidence.

## Data contract

The optional `result.remarks` extension is `{version: 1, items: [], history: []}`. Each item has a stable ID, title, location, description, severity, internalNote, lastVerified, recommendation, status, beforePhotos, resolvedPhotos, products, createdAt and updatedAt. Dates are entered explicitly; timestamps describe record creation/saving, not proof of a site inspection. Products and photographs have stable IDs. Photographs contain actual raster bytes and optional captions.

Severity is Unclassified, Observation, Minor defect, Major defect or Critical defect. Status is Open or Resolved. A saved change retains the preceding item in `history` with a stable history ID, remarkId and savedAt. The same unchanged item does not add another history entry. History is an editable local record, not a signed audit trail.

Validation covers current results, archived device evidence and previous drawing results before package import writes data. Unknown versions/fields, unsupported severities, duplicate IDs, invalid dates, external image URLs and malformed image signatures are rejected. Limits are 100 current remarks, 200 prior versions, 12 pictures per photo group, 100 products per item, 40 MiB of unique pictures and one million text characters per device's remarks and retained history. Text fields have individual bounds. The UI shares the supported raster formats with job notes.

The existing version-3 job package pools these images with other included attachments. Import/export retains the complete structured remarks, internal notes and history; it needs no online image links and does not invent a new drawing format. Version-1/2 packages without remarks still import.
