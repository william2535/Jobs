# Mobile workspace

Below 700px, Jobs uses a deep-blue mobile dashboard with circular summaries, schedule cards, compact action tiles and fixed bottom navigation. The existing desktop workspace stays separate. The mobile job screens retain the Details, Work, Products, POs and Finalisation navigation.

`src/mobile-shell.js` renders the mobile home screen from the saved local state; `src/mobile-shell.css` is scoped to the mobile workspace. `renderMobileWorkspace({state,onAction,now})` returns the DOM and delegates job opening, imports and site creation to the main app. The optional `now` makes date-dependent summaries deterministic in tests.

## Local records shown

- **Dashboard:** completed visits out of all saved jobs, time recorded today, overdue open visits, and the four core actions: Create job, Import Zone Sketch, Import job and Sites.
- **Tasks:** saved jobs with site/reference search. Today, Tomorrow and Calendar filter actual appointment dates or the job's visit date. All shows one card per saved job. With multiple appointments, the card shows the next scheduled appointment, or the most recent past one when no future appointment exists.
- **Stock:** products and labour entered against jobs, including planned/used state and quantities. This is not a warehouse balance or connected stock service.
- **Timesheets:** dated time records with recorded durations. Explicit entered hours take precedence over a start/end-time calculation. Opening a record opens its job, where Finalisation contains the editable timesheet.
- **About:** local/offline workflow information, core actions and the request for persistent browser storage.

Overdue means an open job with a past appointment or visit date. Completing work actions or entering satisfactory device results does not automatically complete a job. Dashboard completion uses only the engineer-selected job status. The work ring shows recorded time, not an assumed daily target. Empty workspaces show zero recorded progress. No remote notifications, account details or appointments are invented.

The shell uses actual text DOM nodes for source content, 44px minimum controls, native date selection and safe-area spacing for fixed navigation. Saved job cards keep their stable IDs and open the same job records used by the desktop interface.

## Verification

`tests/mobile-shell.test.js` checks actual completion and time totals, overdue date handling, old records without workflow data, empty states and explicit-hours precedence. `tests/mobile-workspace.spec.js` covers the responsive dashboard, schedule filters, search, product/time summaries, navigation and narrow-screen layout against the production app.
