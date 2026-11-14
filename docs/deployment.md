# Jobs website

Live address: **https://jobs-field-workspace.floodyyy21.chatgpt.site**

The website uses Sites hosting and is public to anyone with the link, following the owner's request to share it with friends on 14 November 2026. The source repository remains private. Each visitor has their own browser-local IndexedDB workspace; sharing the website does not expose another person's jobs or photographs. Jobs has no account/API dependency and can also run independently using the README setup commands. After preparation, its included plans, photographs, work records and exports work offline. Records do not synchronize between browsers or devices.

## Publication record

- Site project: `appgprj_6af79deede5c8191be60addd5d6bedc0`
- Current audience: **public**, confirmed by Sites access policy revision 2. Future publication must use the public-compatible publishing operation, not owner-only deployment.
- Saved version: `appgprj_6af79deede5c8191be60addd5d6bedc0~appgver_6db84a7584f88191935575584745ef3b` (version 14, overview tool chest)
- Successful deployment: `appgdep_6af8e8add1588191ba289b4c475db81f`
- Application source: Jobs commit `c63a88444222db3c6621365d549a8eef3ff85642`
- Sanitized hosting-source commit: `d138064f889810123fb3ddc2fea6bea0d7ecf0b7`
- Hosting checkout in the build workspace: `/workspace/sites/jobs-field-workspace`

GitHub Pages is disabled for this private repository, and the connected GitHub credential cannot enable Pages. The repository was not made public. Sites provided the website without changing that visibility.

The notes and device-remarks update keeps the home layout and makes jobs open directly into a formatted notebook. Create job works without a site and is saved explicitly. Card/settings gears hold optional details, linked jobs share reusable site settings, and each visit retains its own map and results. Notes, Plan and Finalisation form the main navigation. Device defects use a grouped remark editor with before/resolved photographs, severity, recommendations, local products and retained history. Finalisation includes recorded evidence in the draft report and self-contained export. Checklists and detailed work tools remain available through settings; no compliance certificate or AI connection is implied.

The mobile home navigation replaces Stock in the mobile bottom navigation with Zone Sketch. It opens the existing editor at `https://william2535.github.io/FIRE-ZONE-PLAN-APP/` in a separate tab; per-job product records are retained. FINDR remains immediately beneath Toolbox and continues to open its existing app. Neither launcher transfers job context.

Plan asset controls place Pass / Fail / N/A directly in the middle of each working row under Plan → Assets on this floor, with an icon-only edit pencil at the far right replacing the arrow. Saving retains the selected floor, asset page, zoom and pan. Issued snapshots and site-only plans remain read-only. The separate Devices grid retains its quick controls. Missing Fail/N/A explanations are requested before saving. Saved remarks have a star for reusable wording, available through Add remark → Saved quick defects. The local library keeps title, description, severity and recommendation; applying a shortcut creates a fresh Open finding without previous visit photos, location, private notes, products or test outcomes.

Fire maintenance includes 21 PDF-derived prompt types, saved answers and readings, repeatable panel/battery records and retained maintenance revisions. Finalisation produces an A4 draft report with actual servicing/defect summaries, maintenance answers, device evidence, repairs, notes and included photographs. Printing prepares images before opening the browser dialog and retains its snapshot through mobile print/cancel handling. No supplied customer records or accreditation claims enter the app.

Timesheets provides an editable daily timeline on mobile and desktop. Sessions can belong to a job or remain unassigned, with Work, Travel, Break, Administration, Training and Custom types, Start/Finish dates, minute adjustments, descriptions and calculated durations. Daily totals split overnight sessions at midnight. Local submissions retain snapshots; amendments and trashed records preserve their history. Submit saves locally and downloads JSON without sending time to an office. Job-linked sessions also travel in the normal job package. The mobile Timesheets heading is compact, with totals and Export above the bottom navigation; other home tabs retain their layout.

The preceding timesheets deployment reported **succeeded**, and all **12 published files matched the verified production build byte-for-byte**. **195 unit tests passed**. The complete browser run passed 62 cases with one intentional skip and exposed one first-install offline-startup race. After fixing active-worker claiming, all **18 affected desktop/mobile cases passed**, including the failing case and two new recovery regressions. All **65 applicable browser cases passed across these runs**. Checks include offline saves/reopening, timed and legacy entries, job reassignment, local receipts, download-failure recovery, retained deletion evidence, package round trips and 320px layout. See [the full test results](VERIFICATION.md) and [timesheet instructions](timesheets.md). If an already-open offline app still shows the earlier version, refresh online to install the new cache, then reload once more.

The preceding logo update uses Zone Sketch's original coloured 256×256 house-and-flame artwork in the mobile navigation. The original bytes and proprietary licence are preserved; the image is included in the offline precache. Source syntax, the build and all four existing engine/licence checks passed. The 13-file deployment build matched the verified local build byte-for-byte, and native public publication of version 12 reported **succeeded**. Fresh browser visual QA was unavailable because the managed cloud-browser tool was not present.

The preceding Toolbox update embeds FINDR's four core calculators, six extra calculators, six picture guides, Resistor Lab and FESS revision (31 subject quizzes, 20 mocks and 10 full papers). All pack content is bundled locally. Separate tool storage retains inputs and practice progress without writing to job results. Original source provenance, ownership notices, formulas and practice-only labels are retained. The FINDR app itself is unchanged.

**235 automated unit/DOM tests passed**, followed by a final **14/14 focused interaction checks with network requests denied**. The production build passed, all **15 build files matched** the sanitized hosting build byte-for-byte, and every app asset is included in its offline precache. Native public publication of **version 13 succeeded**. Fresh real-browser visual/offline testing was unavailable because the managed browser tool was not present; Happy DOM checks are not represented as browser QA. See [Toolbox instructions](toolbox.md) and [verification](VERIFICATION.md).

The current update opens Toolbox as a compact animated chest over the overview. It keeps the dashboard mounted and visible, with calculations, guides and practice tools inside the scrolling tray. Closing, Escape and the Toolbox toggle preserve the overview; unsaved tool changes still receive their existing protection. Tool navigation resets tray scrolling and focus, and reduced-motion preferences remove the opening animation.

**241 automated unit/DOM tests passed**, including six chest lifecycle/integration cases. The production build passed and all **15 hosting build files matched** the verified app build. Native public publication of **version 14 succeeded**. Fresh phone/browser visual testing of the animation, geometry and keyboard remains unavailable; the DOM tests do not claim those checks.

## Deployment contents and updates

Only the compiled `dist/` is served: application JS/CSS, index, service worker, manifest/icons, original component licence notices, the FINDR and Zone Sketch launcher icons and the synthetic demonstration. The deployment archive was checked byte-for-byte against the verified production build. It contains no uploaded customer example or repository history.

The separate hosting source was prepared from an explicit allowlist: `src`, `public`, `vendor`, `tests`, package manifests, Vite/Playwright configuration, `index.html` and `.gitignore`, plus its own hosting manifest and source provenance. It does not contain the customer example stored in the canonical repository root. For later publication, use this sanitized source checkout or regenerate it with the same allowlist; do not copy or publish the canonical repository root wholesale. Keep the existing Site identity and audience unless the user requests a change.

The optional Zone Sketch receiver is in [companion PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40). Commit `ea04c0b8a1fad8fef1f649822b51d0d1a8170f3f` adds this exact hosted Jobs origin alongside GitHub Pages and passed the real-engine cross-origin loading/return test. That PR remains unmerged and undeployed, so the public Zone Sketch application cannot yet accept automatic loading. File import, local job editing, saved PNG viewing and package export work independently of that connection.

Physical-device installation still requires owner testing. Do not describe the external Zone Sketch web editor as ready for a cold offline launch: it has no offline service worker in the inspected source.

## Shareable link verification

The native Sites access operation confirmed `public` with access policy revision 2. The static build and sanitized source were checked again: no customer example is served, and visitor records remain local. A command-line anonymous HTTP probe was blocked by Cloudflare bot protection (403 / 1010), so it is not recorded as a successful fresh-browser test. No runtime source change or redeployment was needed for the access change.
