# Building a public release

Jobs remains a static, local-first application for independent engineers. Publishing the website does not require making the source repository public. The build contains required original component notices; its components are not collectively relicensed as MIT or any other new licence.

Use Node.js **22.12 or later**; CI uses Node.js **24**. Install locked development dependencies with `npm ci`. The application has no npm runtime dependencies. GNU tar is required to create the deterministic release archive. Browser report checks also require Poppler (`poppler-utils` on Ubuntu).

```sh
npm ci
npm test
npm run build
npm run release:verify
npm run test:e2e
npm run release:package
```

`npm run release` is a convenience build-and-package command. It does **not** replace the test commands or establish browser/device validation. The browser suite runs against the completed production build; do not rebuild while it is running. On a clean developer machine, install the configured browsers with `npx playwright install --with-deps chromium webkit` first. Use the managed environment's supported browser workflow where applicable; missing local browser tooling must be reported as a verification limitation, not bypassed or recorded as a pass.

The release verifier checks the actual `dist/` contents against an explicit distributable allowlist, local entry-page references, PWA installation metadata and PNG icon dimensions. It verifies original public assets against source bytes, all offline-manifest file hashes and the complete service-worker precache. It rejects source maps, customer saves and unexpected files rather than silently including them. When intentionally adding a new public asset, review and update the allowlist in `scripts/verify-release.mjs`.

## Version and build identity

`package.json` supplies the displayed version through `src/release-info.js`. `scripts/build-info.mjs` derives a deterministic build ID from `src/`, `public/`, `vendor/`, `scripts/`, package manifests, Vite configuration and `index.html`. It uses no timestamp, Git checkout path or Git commit, so the same application source produces the same ID in the canonical and sanitized hosting repositories. Git commits remain separately recorded in deployment provenance. Tests and documentation do not change the application build ID.

The offline manifest records the actual built file bytes, including the generated HTML. Its cache identity is separate from the source build ID. This detects changed shell files and protects against an HTML-only release retaining an outdated cache.

## Release artifact

Successful packaging creates these ignored files under `release/`:

- `jobs-<version>-<buildId>.tar.gz`: only `dist/`, `RELEASE-MANIFEST.json` and `INSTALL.txt`.
- `jobs-<version>-<buildId>.manifest.json`: version, build ID, every served file's byte count and SHA-256 hash, and completed static checks.
- `jobs-<version>-<buildId>.tar.gz.sha256`: archive SHA-256 checksum.

The archive normalizes paths, timestamps and ownership for repeatable bytes with unchanged source and build tools. The staged copy is verified again to reject a concurrent build. Hashes detect accidental changes; they are not a publisher signature. The archive does not contain the Git repository, customer examples, credentials, local IndexedDB records or a server backend.

Serve the contents of `dist/` from HTTPS. Preserve the existing host and base path when updating a live installation; moving origins creates a separate local workspace. Export a workspace backup before updating. For migration from the pre-1.0 worker, open Jobs online to download the update, then close every Jobs tab/installed window and reopen online to let the new worker activate. Follow the in-app update and offline status guidance, check the displayed version, and confirm **Ready offline** before field use.

## CI and release evidence

The Verify Jobs workflow runs on pushes, pull requests and manual dispatch with read-only repository permissions. It runs unit tests, production build and static verification, installs Poppler plus Chromium and WebKit, then runs the full Chromium desktop/mobile suite and focused iPhone WebKit release cases. Only after those checks succeed does it package and upload the release artifact. Failed runs retain available browser reports/screenshots for diagnosis.

An artifact or deployment is evidence of a successful build, not proof of validated certificates, hardware installation testing or Safari/physical-device compatibility. Record the exact commit, browser results and known verification limits in `docs/VERIFICATION.md` and the deployed application/build identity in `docs/deployment.md` before describing a release as verified.
