# Visit certificates and customer PDFs

Available from release **1.1.0** for every saved visit: Fire, Intruder, CCTV, Access control, Security and Custom. Maintenance, Small works, Install, Take over visit, Call out, Custom and older visit classifications can all use the same workflow. A standalone job can also produce a certificate; enter its customer and premises details without creating a placeholder site.

The certificate records the engineer's stated work, findings, outcome and declaration. It is a generic visit certificate, not a third-party branded or validated standards-specific form. Issuing never passes devices, clears defects or changes recorded test results. The existing draft service report remains a separate output and supplies the certificate's supporting evidence appendix.

## Create and edit a draft

1. Open the saved job and choose **Finalisation → Create certificate**. Jobs creates and saves a draft for this job.
2. Check **Document**: certificate title and number, issue date and actual visit/work date. A new number and today's issue date are offered; the app does not invent a visit date.
3. Check **System and visit**, then **Site and customer**. Current shared site settings and this job's explicit overrides prefill known values. Include the actual premises/location and customer. Customer contact, email, telephone and a separate customer address are optional.
4. Enter the **Issuer** details and declaring engineer's name. Company address and contact details can be included in the customer document.
5. Under **Work and findings**, state the agreed scope, work actually carried out, findings/outstanding defects, limitations/exclusions and outcome/condition left. State “None” only when it is true. Record an applicable standard and edition when relevant; selecting a discipline does not choose a standard or establish compliance.
6. Read and edit the **Engineer declaration** so it matches the work and your actual responsibility. The engineer name is a typed declaration record; the app does not add a handwritten signature, accreditation or independent approval.
7. Choose **Save draft** to return later. Incomplete drafts can be saved. Asterisks identify fields required for issue; a malformed date or email must be corrected.

Certificate fields belong to this document. Editing them does not rewrite the site's shared setup, job notes or device outcomes. To correct those source records, save them in their normal job tools and then review the certificate again. Unsaved form changes must be saved or explicitly discarded before leaving.

## Review and issue

Choose **Review certificate** to see the document and captured supporting visit records. Missing required fields are listed. Not tested, Unsatisfactory and Inaccessible device results remain visible as review warnings; they are not converted into successful results. Explain any limited scope, outstanding findings and exclusions in the certificate itself.

After checking the full preview, tick the confirmation and choose **Issue certificate**. The app saves the certificate fields, declaring engineer, review/issue times, source job revision, selected drawing and supporting evidence together. A failed save leaves the last saved issue intact. The issued document is available under **Issued certificates**.

Review applies to the exact certificate and saved supporting evidence. Editing the certificate, site information, drawing or visit evidence requires a fresh review. Saving certificate-only metadata does not invent a new inspection or change outcomes.

## Download, print and email

- **Download PDF** creates a portable PDF from the selected issued snapshot. It contains the certificate and supporting visit evidence, including included photographs. Save it to Files/Downloads and attach it to your customer email.
- **Share PDF** offers the generated PDF to the device's sharing options when file sharing is supported. Choose your email application and recipient yourself. If sharing is unavailable, use the downloaded PDF as an attachment.
- **Print certificate** prepares the selected issued document and opens the device's print options. Opening or closing a print/share sheet does not establish that the customer received a document.

Jobs does not send email automatically. A recorded customer email helps identify the intended recipient; it does not attach a file or send a message by itself. Check the chosen issue and recipient before sending. Preparing PDFs works locally once the app is available offline; sending email depends on the email application and connection.

## Correct an issued certificate

Select the issue and choose **Revise certificate**. A new editable draft starts from its fields, with a new number and an explicit reference to the earlier issue. Make the correction, review the current supporting evidence, then issue the revision. The earlier issued copy remains selectable and unchanged. Finish or discard an existing draft before starting another revision.

An issued PDF is a fixed document. Correct the draft in Jobs and generate the newly issued revision's PDF; editing the current job does not silently alter a previously issued certificate. There is no standards-template designer in this release: certificate field editing and issue revisions do not edit a certification scheme's form.

## Backup and retained records

**Finalisation → Export job** includes editable certificate drafts, every retained issue and its captured evidence in the normal `.jobs.json`. Workspace backups contain the same records. Use those exports for editing/recovery on another prepared device; the customer PDF is not an editable Jobs backup.

`job.certificates` is an optional version-1 collection with one draft and an ordered `issued` array. Issued IDs and document numbers are unique within the job. A revision refers to an earlier retained issue. Historical supporting IDs remain original provenance when a conflicting package import gives the live job or drawing a different ID. Saving a retained job cannot remove or rewrite its issued entries; explicit whole-job deletion still deletes that job's local records.

Snapshots contain the selected drawing and saved evidence; the drawing's original import backup is not copied into each certificate appendix. Original source backups remain in the normal site/job package. Text, dates, embedded images and references are validated before import or storage changes. Records are bounded at 100 issues and 96 MiB per certificate collection; reaching a limit does not silently delete history.

## Release 1.1.0 changes

This release adds all-discipline certificate drafts, explicit review and issue, immutable supporting snapshots, retained corrections, PDF download/share and inclusion in existing job/workspace backups. It preserves the existing draft service-report, notes, maintenance and device-result workflows.
