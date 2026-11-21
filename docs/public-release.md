# Jobs for independent engineers

Jobs is a browser-local field workspace for an independent engineer. You can keep permanent site records, import Zone Sketch plans, create visits, record notes and photographs, record device outcomes, print draft service reports, record time and export your work. An account, paid API or cloud AI service is not needed for the core workflow.

The public website is https://jobs-field-workspace.floodyyy21.chatgpt.site. Each browser profile has its own workspace. Sharing the website link does not share your saved jobs. Records do not synchronize automatically between browsers or devices.

## First use and installation

1. Open Jobs while connected to the internet. Wait for **Ready offline** before relying on it at a site without a connection.
2. Create a job, or create a reusable site first. Save the job before recording work against its plan. Use a small demonstration record to familiarize yourself with the workflow before adding live customer records.
3. Reopen the saved job and check that its included plan and photographs are present. Export a backup and confirm that the downloaded file reached your chosen folder.

Installation is optional. On iPhone or iPad, open the website in Safari and choose **Share → Add to Home Screen**. Choose **Open as Web App** if offered. On Android, use Chrome's **Install app** or **Add to Home screen** option. On desktop, use the browser's install option when available. Menu labels can differ by browser.

Use the same website address and browser profile to return to the same records. A different browser, profile or device can have separate storage. Check that saved jobs are visible in the installed app before relying on it offline. Self-hosted installations need HTTPS, except for localhost development.

Included plans, photographs, calculators, picture guides and FESS practice content are available locally after offline preparation. External reference links and the separate Zone Sketch and FINDR websites may still need a connection.

## Save, backup and recovery

The save status reports whether the latest work reached local storage. A failed save leaves the editor available to retry and keeps the last saved copy. Do not close a tab containing unsaved work until you have saved it or otherwise preserved that work.

Use **Help & data → Export workspace backup** to keep a recovery file independently of the browser. Save open jobs and timesheets first. Workspace backups contain saved sites, jobs, drawing data, attachments, timesheets and saved quick defects. Unsaved edits and separate Toolbox calculator inputs or practice progress are not included.

Restore a workspace backup into an empty Jobs workspace. Existing records are not overwritten. For individual transfers into a workspace that already contains work, use **Finalisation → Export job**, then **Import job** on Home. Identical package imports reuse the existing job; conflicting imported versions retain existing work for review.

**Protect local storage** requests browser persistence. It cannot protect against deliberate deletion, device loss or every storage failure. Keep regular exported backups, especially before changing device, browser, website address or clearing site data.

If local records cannot be opened, do not clear website data as a first troubleshooting step. The error does not mean previous records were deleted. Use **Retry opening records**. If a save fails, **Download unsaved recovery** preserves the attempted workspace in the validated backup format, clearly marked as an unsaved recovery snapshot. It can be reviewed and restored into an empty workspace; it does not mean the original save succeeded. Keep it securely, free space if needed, and retry saving in the same editor.

## Updates

**Help & data** identifies the app version and build and shows local storage and offline readiness. Use **Check for updates** while online. When an update is available, save your current work before applying it. Export a workspace backup before a significant update. An update is not a backup or a cloud synchronization operation.

For the first upgrade from the earlier prototype, open Jobs online so it can download the update, then close every Jobs tab and installed Jobs window and reopen online. This lets the new offline worker activate. Check that Help & data shows version **1.0.0** and wait for **Ready offline** before disconnecting. Later updates can use **Apply update** after saving and closing other Jobs windows.

## Privacy and sharing

The core app does not upload customer job records, and it includes no analytics or advertising scripts. Normal website requests go to Sites hosting, which may process basic request metadata such as IP address, browser information and request time to serve and protect the website. This describes the app's data boundary; it does not replace the hosting provider's own terms or privacy information.

Anyone able to use the same browser profile may be able to read its jobs. Jobs does not provide a separate sign-in or encrypted local vault. Use the device lock and your own browser profile on shared equipment. Avoid private or incognito browsing for records you need to keep: that mode can discard local data when the session ends.

Exported job packages, workspace backups and recovery copies contain the included site data, notes and photographs. They are not encrypted. Check the intended recipient before sending a file and keep backup files secure.

## Release boundaries

- Reports are **Draft service reports**, not validated compliance certificates. Checklists record engineer actions; completion never automatically passes equipment or certifies a system.
- Zone Sketch is a separate editor. Automatic loading and saving back require a compatible receiver and configuration. Editable drawing export and reviewed file reimport are available independently.
- FINDR's included tools run locally. The Panel Pal export contract is available, but the actual Panel Pal job adapter remains future work. Calculator outputs and FESS practice scores are separate from engineer-confirmed results.
- Timesheet submission creates a local snapshot and download. It does not send time to an office or approve payroll. Local purchase-order records do not place orders with a supplier.
- There is no team synchronization, account recovery or remote backup service in this release.

For the precise checks performed on each build and outstanding device/browser verification, see [verification](VERIFICATION.md). Source setup and local test commands are in the [README](../README.md); release publication details are in [deployment](deployment.md).
