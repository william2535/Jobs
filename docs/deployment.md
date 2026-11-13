# Jobs website

Live address: **https://jobs-field-workspace.floodyyy21.chatgpt.site**

The first publication uses Sites hosting, with access private to the owner's account. The hosting gate is separate from Jobs: the application itself stores its records locally in IndexedDB, has no account/API dependency, and can still be run independently using the README setup commands. After preparation, its included plans, photographs, work records and exports work offline. Records do not synchronize between browsers or devices.

## Publication record

- Site project: `appgprj_6af79deede5c8191be60addd5d6bedc0`
- Saved version: `appgprj_6af79deede5c8191be60addd5d6bedc0~appgver_691f925603fc819182b4e67eb2584cd2` (version 1)
- Successful deployment: `appgdep_6af79ecde5b48191ae0a5f302a385da6`
- Application source: Jobs commit `65e22276f48183df57373052d75e6e65c486df8a`
- Sanitized hosting-source commit: `10c8e8f69de7cb1c5b72b1d8bfe6dbc7a010a51c`
- Hosting checkout in the build workspace: `/workspace/sites/jobs-field-workspace`

GitHub Pages is disabled for this private repository, and the connected GitHub credential cannot enable Pages. The repository was not made public. Sites provided the website without changing that visibility.

## Deployment contents and updates

Only the compiled `dist/` is served: application JS/CSS, index, service worker, manifest/icons, original component licence notices and the synthetic demonstration. The deployment archive was checked byte-for-byte against the verified production build. It contains no uploaded customer example or repository history.

The separate hosting source was prepared from an explicit allowlist: `src`, `public`, `vendor`, `tests`, package manifests, Vite/Playwright configuration, `index.html` and `.gitignore`, plus its own hosting manifest and source provenance. It does not contain the customer example stored in the canonical repository root. For later publication, use this sanitized source checkout or regenerate it with the same allowlist; do not copy or publish the canonical repository root wholesale. Keep the existing Site identity and audience unless the user requests a change.

The optional Zone Sketch receiver is in [companion PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40). Commit `ea04c0b8a1fad8fef1f649822b51d0d1a8170f3f` adds this exact hosted Jobs origin alongside GitHub Pages and passed the real-engine cross-origin loading/return test. That PR remains unmerged and undeployed, so the public Zone Sketch application cannot yet accept automatic loading. File import, local job editing, saved PNG viewing and package export work independently of that connection.

Physical-device installation and the hosting sign-in flow still require owner testing. Do not describe the external Zone Sketch web editor as ready for a cold offline launch: it has no offline service worker in the inspected source.
