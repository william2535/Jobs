# Mobile workspace

Below 700px, Jobs uses a deep-blue mobile dashboard with circular summaries, schedule cards, compact action tiles and fixed bottom navigation. The existing desktop workspace stays separate. Job screens use **Notes, Plan and Finalisation**; the gear opens optional settings and More job tools. Home styling, schedule cards and the desktop workspace remain in place.

`src/mobile-shell.js` renders the mobile home screen from the saved local state; `src/mobile-shell.css` is scoped to the mobile workspace. `renderMobileWorkspace({state,onAction,now})` returns the DOM and delegates job opening, imports and site creation to the main app. The optional `now` makes date-dependent summaries deterministic in tests.

## Local records shown

- **Dashboard:** completed visits out of all saved jobs, time recorded today, overdue open visits, and the four core actions: Create job, Import Zone Sketch, Import job and Sites.
- **Tasks:** saved jobs with site/reference search. Today, Tomorrow and Calendar filter actual appointment dates or the job's visit date. All shows one card per saved job. With multiple appointments, the card shows the next scheduled appointment, or the most recent past one when no future appointment exists.
- **Zone Sketch:** replaces Stock in the bottom navigation and opens the existing Zone Sketch editor in a separate tab. Product records remain available inside each job through its settings and More job tools.
- **Timesheets:** a daily timeline with a date selector, recorded sessions and Add session. Sessions record a type, start and finish, optional job and description; duration follows the entered times. Overnight sessions are split across the days shown. Earlier duration-only entries remain separately visible without invented start or finish times; Undated records can receive an explicit Recorded date. See [timesheets](timesheets.md) for local submissions, exports and amendments.
- **About:** local/offline workflow information, core actions and the request for persistent browser storage.

Overdue means an open job with a past appointment or visit date. Completing work actions or entering satisfactory device results does not automatically complete a job. Dashboard completion uses only the engineer-selected job status. The work ring shows recorded time, not an assumed daily target. Empty workspaces show zero recorded progress. No remote notifications, account details or appointments are invented.

Timesheet sessions can be saved without choosing a job. Job-linked entries stay with that job; unassigned entries stay in this browser's local workspace. Submitting creates a local snapshot and download, with no office delivery or approval connection. Editing submitted time retains its earlier snapshot and requires a new local submission for the amended record.

The shell uses actual text DOM nodes for source content, 44px minimum controls, native date selection and safe-area spacing for fixed navigation. Saved job cards keep their stable IDs and open the same job records used by the desktop interface. Tapping a card opens Notes; its separate gear opens Settings without opening a different job.

The small circular FINDR logo sits immediately below Toolbox on Dashboard and opens the existing FINDR app in a separate tab. The logo is included locally; opening FINDR uses its own website and offline preparation. This is a launcher, without automatic job-context transfer.

## Quick job flow

**Create job** is always available. From Home it opens a blank standalone note, with no site or classifications required. From a site folder it opens blank notes linked to that site. Write, format text, add pictures and press **Save**; a job is not persisted until an explicit save succeeds. **Save settings** also persists a new job. The visible save status distinguishes an unsaved draft from saved work.

The gear can assign an optional site and edit job-specific metadata. Reusable site setup applies to linked jobs unless explicitly overridden; map revisions and test results remain with their own job. Optional Work, Products, POs and Visit records remain under **More job tools** after saving, with device/checklist tools for site-linked jobs. Finalisation presents the saved report and export buttons. No certificate or working AI connection is implied.

## Verification

`tests/mobile-shell.test.js` checks actual completion and time totals, overdue date handling, old records without workflow data, empty states and explicit-hours precedence. `tests/mobile-workspace.spec.js` covers the responsive dashboard, schedule filters, search, product/time summaries, navigation and narrow-screen layout against the production app.
