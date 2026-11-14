# Jobs website

Live address: **https://jobs-field-workspace.floodyyy21.chatgpt.site**

The website uses Sites hosting, with access private to the owner's account. The hosting gate is separate from Jobs: the application itself stores its records locally in IndexedDB, has no account/API dependency, and can still be run independently using the README setup commands. After preparation, its included plans, photographs, work records and exports work offline. Records do not synchronize between browsers or devices.

## Publication record

- Site project: `appgprj_6af79deede5c8191be60addd5d6bedc0`
- Saved version: `appgprj_6af79deede5c8191be60addd5d6bedc0~appgver_3bb0454391688191b3197ff0656b6b84` (job navigation and quick checklist update)
- Successful deployment: `appgdep_6af7b226c3e88191919e385169fdfb4a`
- Application source: Jobs commit `7d69f3be3bdcdf957ff8410916619022cf74387f`
- Sanitized hosting-source commit: `d7af8e1580574c6ebc01039f383c4f13e5326fd6`
- Hosting checkout in the build workspace: `/workspace/sites/jobs-field-workspace`

GitHub Pages is disabled for this private repository, and the connected GitHub credential cannot enable Pages. The repository was not made public. Sites provided the website without changing that visibility.

The latest 14 November update makes the job's back control return Home and the header site name open its site folder. Quick checklist selects recording prompts by discipline and job type, retains saved drawing references and history, and feeds the offline draft report and self-contained job export. Known details prefill the draft; unrecorded facts and excluded work remain visible. The independent forms are not validated compliance certificates. Site-first creation, the requested dropdowns, hold editing and each job's pinned map remain available.

The native deployment reported **succeeded**. All 11 published build files matched the verified production output byte-for-byte. Verification includes 134 passing unit tests and all 31 applicable desktop/mobile browser cases passing across the full run and final creation rerun; one mobile-only case is intentionally skipped on desktop. See [the full test results](VERIFICATION.md). If a previously open offline app still shows the earlier version, refresh online to install the new cache, then reload once more.

## Deployment contents and updates

Only the compiled `dist/` is served: application JS/CSS, index, service worker, manifest/icons, original component licence notices and the synthetic demonstration. The deployment archive was checked byte-for-byte against the verified production build. It contains no uploaded customer example or repository history.

The separate hosting source was prepared from an explicit allowlist: `src`, `public`, `vendor`, `tests`, package manifests, Vite/Playwright configuration, `index.html` and `.gitignore`, plus its own hosting manifest and source provenance. It does not contain the customer example stored in the canonical repository root. For later publication, use this sanitized source checkout or regenerate it with the same allowlist; do not copy or publish the canonical repository root wholesale. Keep the existing Site identity and audience unless the user requests a change.

The optional Zone Sketch receiver is in [companion PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40). Commit `ea04c0b8a1fad8fef1f649822b51d0d1a8170f3f` adds this exact hosted Jobs origin alongside GitHub Pages and passed the real-engine cross-origin loading/return test. That PR remains unmerged and undeployed, so the public Zone Sketch application cannot yet accept automatic loading. File import, local job editing, saved PNG viewing and package export work independently of that connection.

Physical-device installation and the hosting sign-in flow still require owner testing. Do not describe the external Zone Sketch web editor as ready for a cold offline launch: it has no offline service worker in the inspected source.
