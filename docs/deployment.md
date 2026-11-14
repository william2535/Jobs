# Jobs website

Live address: **https://jobs-field-workspace.floodyyy21.chatgpt.site**

The website uses Sites hosting, with access private to the owner's account. The hosting gate is separate from Jobs: the application itself stores its records locally in IndexedDB, has no account/API dependency, and can still be run independently using the README setup commands. After preparation, its included plans, photographs, work records and exports work offline. Records do not synchronize between browsers or devices.

## Publication record

- Site project: `appgprj_6af79deede5c8191be60addd5d6bedc0`
- Saved version: `appgprj_6af79deede5c8191be60addd5d6bedc0~appgver_99f3d8d62c14819195d89768d7a2396a` (Zone Sketch navigation)
- Successful deployment: `appgdep_6af864e04ff08191a2b7c57b2c882559`
- Application source: Jobs commit `2a2464f3278947551650eb565f1396ce322a1631`
- Sanitized hosting-source commit: `29af4359be1bc065a66c33a68ffcf3174222a3f9`
- Hosting checkout in the build workspace: `/workspace/sites/jobs-field-workspace`

GitHub Pages is disabled for this private repository, and the connected GitHub credential cannot enable Pages. The repository was not made public. Sites provided the website without changing that visibility.

The notes and device-remarks update keeps the home layout and makes jobs open directly into a formatted notebook. Create job works without a site and is saved explicitly. Card/settings gears hold optional details, linked jobs share reusable site settings, and each visit retains its own map and results. Notes, Plan and Finalisation form the main navigation. Device defects use a grouped remark editor with before/resolved photographs, severity, recommendations, local products and retained history. Finalisation includes recorded evidence in the draft report and self-contained export. Checklists and detailed work tools remain available through settings; no compliance certificate or AI connection is implied.

The latest update replaces Stock in the mobile bottom navigation with Zone Sketch. It opens the existing editor at `https://william2535.github.io/FIRE-ZONE-PLAN-APP/` in a separate tab; per-job product records are retained. FINDR remains immediately beneath Toolbox and continues to open its existing app. Neither launcher transfers job context.

The native deployment reported **succeeded**, and all 12 published files matched the production build byte-for-byte. The updated existing mobile dashboard browser case passed. A focused browser click opened the actual Zone Sketch v0.64 editor and verified the third navigation position, a 44px touch target, retained FINDR shortcut and 320px layout.

The preceding milestone passed 163 unit tests and 41 applicable browser cases, followed by all 8 affected Notes/remarks checks after its final layout adjustment. See [the full test results](VERIFICATION.md). If an already-open offline app still shows the earlier version, refresh online to install the new cache, then reload once more.

## Deployment contents and updates

Only the compiled `dist/` is served: application JS/CSS, index, service worker, manifest/icons, original component licence notices, the FINDR launcher icon and the synthetic demonstration. The deployment archive was checked byte-for-byte against the verified production build. It contains no uploaded customer example or repository history.

The separate hosting source was prepared from an explicit allowlist: `src`, `public`, `vendor`, `tests`, package manifests, Vite/Playwright configuration, `index.html` and `.gitignore`, plus its own hosting manifest and source provenance. It does not contain the customer example stored in the canonical repository root. For later publication, use this sanitized source checkout or regenerate it with the same allowlist; do not copy or publish the canonical repository root wholesale. Keep the existing Site identity and audience unless the user requests a change.

The optional Zone Sketch receiver is in [companion PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40). Commit `ea04c0b8a1fad8fef1f649822b51d0d1a8170f3f` adds this exact hosted Jobs origin alongside GitHub Pages and passed the real-engine cross-origin loading/return test. That PR remains unmerged and undeployed, so the public Zone Sketch application cannot yet accept automatic loading. File import, local job editing, saved PNG viewing and package export work independently of that connection.

Physical-device installation and the hosting sign-in flow still require owner testing. Do not describe the external Zone Sketch web editor as ready for a cold offline launch: it has no offline service worker in the inspected source.
