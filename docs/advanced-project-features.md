# Jobs — Programme and Advanced Reports integration plan

The advanced project features are divided between apps:
- FINDR owns Cause & Effect testing and Site Tracker, including local evidence and basic backup/test-register exports.
- Jobs owns Programme Tracker + Gantt and Reports & Advanced Exports.

## Jobs programme module
Tasks, dependencies, start/end dates, milestones, progress, engineer assignment and work packages. Offer a compact mobile list and horizontal Gantt. Detect cyclic dependencies, invalid dates and schedule conflicts. Save locally first.

## Jobs reporting module
Client-ready commissioning summaries, C&E witness results, site tracker snag reports, programme progress, handover packs, and document exports. Certificates require correct jurisdiction-specific templates, mandatory fields, sign-off and explicit human review. Never infer compliance from test status alone.

## Interoperability
Accept a user-selected, versioned FINDR project export. Import preview must show source app, project ID, schema version, export date, number of test cases, passed/failed/blocked, open actions and asset references. Match or create the Jobs project explicitly; never silently overwrite. Retain original source IDs for deduplication and repeat imports. Data stays on device unless the user explicitly exports/shares it.

## Engineering sequence
1. Inspect existing Jobs routing, persistence, and current project model before editing application code.
2. Introduce versioned task/milestone model and local migrations.
3. Build schedule list and Gantt with keyboard/mobile access.
4. Build reporting engine and templates.
5. Add FINDR import adapter and fixtures, export tests, offline regression and release verification.

See FINDR branch `feature/project-tools-foundation` and `docs/project-tools-plan.md` for the companion scope.
