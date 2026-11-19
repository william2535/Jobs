# Fire maintenance questions and draft report

For a saved Fire / Maintenance job, open **Finalisation → Maintenance questions**. This shortcut also remains available when the job already has a maintenance record. **Job settings → More job tools → Fire maintenance questions** provides explicit access from any saved job, including a standalone job. Choosing this form does not establish that every question applies to the installation.

The form starts with eight system questions. Use **Add panel checks** or **Add battery checks** for equipment actually checked. Choose an existing drawing asset, or choose **Not listed** and enter an identifying label for this visit. A manual label does not create equipment in the drawing or permanent asset register. Additional panels and batteries each receive their own answer set.

Select an answer or enter a reading, add notes where needed, then choose **Save maintenance**. Partial saves are supported: untouched answers remain **Not recorded**, and `0` is a valid recorded number. Fail and N/A require an explanation. Clear returns an answer to Not recorded. Progress counts recorded answers, not passed equipment. Saving maintenance never changes a device's visit result or drawing status.

**Visit / report details** records the actual date, engineer, company, service interval, applicable standard and edition, scope, limitations, condition left and next actions. Optional engineer and client acknowledgement names are typed records, not digital signatures. Dates and unprovided technical details are not invented.

## Prompt source and scope

The 21 prompt types were independently derived from pages 2–4 of the user's supplied PDF. They cover:

| Group | Prompts |
| --- | --- |
| System — 8 | Call-point siting, apparent system category, logbook updated, logbook location, layout/use changes, tested alarm outputs, false alarms in the last 12 months, tested areas/devices. |
| Each panel — 7 | Controls/indicators, tested functions, supply tolerances against manufacturer instructions, quiescent current (mA), alarm current (mA), current zone plan, document availability/storage. |
| Each battery — 6 | Service-life review against manufacturer criteria, charge voltage (V), voltage under load (V), capacity (Ah), quiescent current (mA), inspection date marking. |

The PDF is an example report, not the full text of BS 5839 or a complete compliance specification. Its three-year battery check is not a universal replacement rule; Jobs asks for assessment against the actual manufacturer's criteria. The engineer records the applicable requirements, test scope and limitations. No thresholds or passed answers are inferred. Sample customer data, logos, accreditation marks and terms are not committed to the app or embedded in generated reports. See the [standards reference](checklist-standards.md).

## Saved record

Optional `job.fireMaintenance` version 1 retains a stable maintenance ID, a template version, revision, supporting job and drawing references, saved timestamp, visit fields, system answers and equipment records. Equipment records have stable IDs, an explicit linked asset ID or null, an entered label and answers keyed by question ID. Answers contain `{value, notes}`; `null` means not recorded. Text, numeric values, dates, choices and references are validated before save or import.

Edits retain preceding snapshots in `history`; unchanged saves do not add history. A changed drawing starts fresh answers while retaining earlier saved evidence on the next save. Limits include 100 equipment records and 100 historical snapshots, with bounded text. These records travel in the existing job package, including standalone jobs and conflict copies. The [package contract](job-package.md) describes validation and drawing-reference remapping.

## Finalisation and printing

The A4 **Draft service report** follows the supplied report's broad arrangement: property and job details, scope, defect and servicing summaries, maintenance answers, device results, findings and recorded repairs. It uses the job's actual saved notes, readings, photographs, remarks and work records. Unanswered maintenance questions appear as Not recorded. Summary totals distinguish recorded test outcomes from drawing status. Resolved remarks appear under Repairs without changing device results. Earlier drawing and maintenance evidence stays separately identified. Fields explicitly marked Internal note, and invoice notes, are excluded from the client report.

Use **Print report** to open the browser's print / Save as PDF sheet. The app prepares a separate report snapshot, expands report details and waits for included photographs and fonts before printing. A missing or undecodable photograph produces an error rather than silently printing without it. The prepared report stays mounted through print/cancel handling because some mobile browsers capture it after `window.print()` returns.

Browser-menu printing and Ctrl+P refresh the snapshot from the current saved job through `beforeprint`. That browser event is synchronous and cannot await image decoding, so use the app button when photographs need preparation. Native iPhone print/share behavior has not yet been verified on a physical device. Opening a print sheet does not confirm that a PDF was saved or a printer completed the job.

The document remains a draft service report. It is not a compliant certificate, an issued scheme document or an authenticated signature record.
