# Mobile workspace

Below 700px, Jobs uses a deep-blue mobile dashboard with circular summaries, schedule cards, compact action tiles and fixed bottom navigation. The existing desktop workspace stays separate. Job screens use **Notes, Plan and Finalisation**; the gear opens optional settings and More job tools. Home styling, schedule cards and the desktop workspace remain in place.

`src/mobile-shell.js` renders the mobile home screen from the saved local state; `src/mobile-shell.css` is scoped to the mobile workspace. `renderMobileWorkspace({state,onAction,now})` returns the DOM and delegates job opening, imports and site creation to the main app. The optional `now` makes date-dependent summaries deterministic in tests.

## Local records shown

- **Dashboard:** completed visits out of all saved jobs, time recorded today, overdue open visits, and the four core actions: Create job, Import Zone Sketch, Import job and Sites.
- **Tasks:** saved jobs with site/reference search. Today, Tomorrow and Calendar filter actual appointment dates or the job's visit date. All shows one card per saved job. With multiple appointments, the card shows the next scheduled appointment, or the most recent past one when no future appointment exists.
- **Stock:** products and labour entered against jobs, including planned/used state and quantities. This is not a warehouse balance or connected stock service.
- **Timesheets:** dated time records with recorded durations. Explicit entered hours take precedence over a start/end-time calculation. Opening a record opens its job notes; **gear → More job tools → Visit records** contains the editable timesheet.
- **About:** local/offline workflow information, core actions and the request for persistent browser storage.

Overdue means an open job with a past appointment or visit date. Completing work actions or entering satisfactory device results does not automatically complete a job. Dashboard completion uses only the engineer-selected job status. The work ring shows recorded time, not an assumed daily target. Empty workspaces show zero recorded progress. No remote notifications, account details or appointments are invented.

The shell uses actual text DOM nodes for source content, 44px minimum controls, native date selection and safe-area spacing for fixed navigation. Saved job cards keep their stable IDs and open the same job records used by the desktop interface. Tapping a card opens Notes; its separate gear opens Settings without opening a different job.

## Quick job flow

**Create job** is always available. From Home it opens a blank standalone note, with no site or classifications required. From a site folder it opens blank notes linked to that site. Write, format text, add pictures and press **Save**; a job is not persisted until an explicit save succeeds. **Save settings** also persists a new job. The visible save status distinguishes an unsaved draft from saved work.

The gear can assign an optional site and edit job-specific metadata. Reusable site setup applies to linked jobs unless explicitly overridden; map revisions and test results remain with their own job. Optional Work, Products, POs and Visit records remain under **More job tools** after saving, with device/checklist tools for site-linked jobs. Finalisation presents the saved report and export buttons. No certificate or working AI connection is implied.

## Verification

`tests/mobile-shell.test.js` checks actual completion and time totals, overdue date handling, old records without workflow data, empty states and explicit-hours precedence. `tests/mobile-workspace.spec.js` covers the responsive dashboard, schedule filters, search, product/time summaries, navigation and narrow-screen layout against the production app.
