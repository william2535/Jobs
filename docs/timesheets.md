# Daily timesheets

Open **Timesheets** for a day-by-day timeline. Use the date picker, previous/next arrows or **Today** to change the day. Timed sessions appear beside the clock scale; overlapping sessions use separate columns. The footer shows session count, locally submitted count and Work time. Work includes Work, Administration, Training and earlier unclassified recorded time. Travel, Break and Custom time remain separate; Recorded totals all session types.

Tap **+ / Add session**, choose **Type**, enter **Start** and **Finish**, optionally select a **Task / job** and add a **Description**, then choose **Save session**. Types are Work, Travel, Break, Administration, Training and Custom; Custom needs an entered name. Start and Finish include a date, with minus/plus buttons adjusting one minute. The form shows the calculated duration. New records can stay Unassigned without creating a job or site.

Tap an existing session to edit it. Cancel protects unsaved changes. A failed save leaves the form available for retry and does not change the saved record. Saving, reopening, editing and exporting work offline once the production app has reported **Ready offline**. Records remain local to this browser profile, so keep exported backups.

## Dates, durations and earlier entries

Timed sessions use the entered local calendar dates and clock times. Choose the following date explicitly for an overnight finish; an earlier clock time on the same date is not silently treated as overnight. Duration uses wall-clock arithmetic without a recorded UTC offset or timezone. It is not a measurement of elapsed time across a daylight-saving change.

An overnight session remains one saved record. The daily view splits its duration at midnight, so each day totals only its own portion. An export retains the complete session and identifies the selected reporting period. Recorded duration does not imply paid hours, an approved break policy or job completion.

Earlier `job.workflow.timesheets` records remain supported. Their explicitly entered hours remain authoritative; duration-only entries appear in **Recorded hours** without invented start or finish times. Their editor offers **Legacy recorded time** and the recorded-hours field. Existing typed hours-only records also retain their entered hours while both times remain blank. Entering Start and Finish for a typed session enables calculated duration.

Old records without a date appear separately under **Undated records** and are excluded from daily totals. Open one and enter **Recorded date** to include its existing hours in a day without inventing start or finish times.

## Local submission and downloads

**Submit timesheet** reviews the selected day's pending sessions; already submitted sessions do not receive another receipt. The review shows each session's full date/time interval and duration alongside the portion counted on the selected day. **Confirm submission** submits the whole session, including its adjacent-day portion when it crosses midnight, saves a local snapshot and prepares a JSON download. Export totals still cover only the selected day. Submission does not send time to an office, contact another person, approve hours or update payroll.

**Export timesheet** downloads the selected day's job-linked and unassigned time without marking it submitted. If the browser download fails after a submission has saved, the committed submission remains intact and the app reports the download failure. Use Export timesheet to retry the download without submitting again.

An amended submitted session returns to draft and retains its earlier submitted snapshot. The editor's **Submitted records** shows that retained information; it also travels in exports. **Trash session** removes a session from active views and totals while retaining its deleted record and submitted history locally. The day's download includes these records separately in `archivedEntries`, excluded from totals; Export remains available even when the day contains only trashed sessions. Job-linked deleted records also remain in the job package. There is no office receipt, server reconciliation or signed audit trail.

Job-linked sessions travel in that job's normal `.jobs.json` export/import. Unassigned sessions belong to the local workspace and are not put in an unrelated job package. The separate `JobsTimesheetPackage` version 1 download covers the selected day's time across jobs and unassigned sessions. A timesheet-file import or office adapter is not implemented in this milestone.

If imported job copies contain the same active time-entry ID, the export flags those entries as conflicts and excludes them from confirmed totals. Local submission is blocked until those conflicting copies are reviewed; they are not silently added together or overwritten.

## Data and integration

`src/timesheets.js` owns session validation, date splitting, collection, edits, local submission and export. `src/timesheets-ui.js` renders the daily workspace and delegates persistence to the main app. The visible selected date and timeline position are retained when saved data refreshes.

Linked records remain in `job.workflow.timesheets`; unassigned records use `state.unassignedTimesheets`, persisted at the `unassigned-timesheets` key in the IndexedDB `metadata` store. Saves use the same atomic snapshot transaction and stale-tab protection as jobs. An older caller omitting the unassigned field preserves the existing collection.

Base entry fields are `id`, `date`, `start`, `end`, `hours`, `note` and `engineer`. Timed sessions add `endDate`, `sessionType`, `customType` and `revision`. Current submission is identified by `submissionId` and `submittedAt`; `submissionHistory` retains `{id, submittedAt, jobId, entry}` snapshots. `deletedAt` marks trashed records. IDs stay stable during edits. The [job package contract](job-package.md) covers portable linked entries.
