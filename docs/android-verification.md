# Jobs Android release verification

## Build identity

Verified on 18 November 2026. Initial Android release: `com.willflood.jobs`, version `1.0.0`, version code `1`, minimum API `24`, target API `36`.

The Android source is based on Jobs app commit `8888a0fbaf8c8a963ebbd871b05d605ba9cd40eb` from `feat/offline-jobs-mvp`, with the Android wrapper and native integration saved separately on `release/jobs-android`. The original app branch and hosted web deployment are unchanged by this work. The exact Android source commit is recorded in the delivered `BUILD-RECORD.json`.

Bundled web build ID: `1dea7ef040705c3485cf`.

## Checks completed

- All **281 Node unit tests passed**, including native bridge origin checks, export acknowledgement/cancellation/failure, Unicode and chunked exports, native offline build-ID verification, print completion and Android help content.
- Vite production build and the existing release verifier passed. All **17 packaged web assets** match the verified distribution byte-for-byte by length and SHA-256.
- The final signed Gradle build completed successfully: `bundleRelease` and `assembleRelease`, including release lint checks. JDK 21, Gradle 8.14.3, Android Gradle Plugin 8.13.2, Android platform/build tools 36.
- Google bundletool 1.18.3 validated the `.aab` successfully.
- JAR signature verification passed for the `.aab`; Android `apksigner verify` passed for the `.apk`.
- The signer matches the recorded upload certificate: SHA-256 `acf91c1eec7e09ace7e48468c68c4e9581f70a6ff4f11405465bcee3c574616f`.
- The built manifest contains the intended package/version/API values, `debuggable=false` and `allowBackup=false`. It requests no Internet, broad storage, camera or microphone permission. AndroidX contributes an app-specific signature-level receiver permission.
- No native `.so` libraries or private signing files are in the bundle. The repository's real customer example and source directories are excluded. Only allowlisted release assets are bundled.
- Focused independent source review checked the native message origin, export byte accounting, Android save cancellation, Activity recreation and retained export recovery. The identified lifecycle issues were fixed and rechecked before the final build.

## Artifact hashes

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Jobs-1.0.0-1.aab | 3,565,039 | `c061a1e0d930d935a9dad970b4a46ed6a5175998dd500a9a0a4b2d0117f507c8` |
| Jobs-1.0.0-1.apk | 3,775,215 | `6600f76515c4a540d10ebc6fc9609be463ef10df69e98523ae6b2c956c08427f` |

The public certificate is in `android-play/upload-certificate.pem`. The private upload key is provided separately to the owner and must never be committed.

## Runtime checks still required

Local browser regression tests could not start: the environment denied Chromium's process-singleton socket operation before any test body ran. This is an environment limitation, not a recorded browser test pass. The existing `Verify Jobs` GitHub Actions workflow can run the browser suite on a normal runner; check its result for the Android release branch.

An API 36 software emulator was attempted without hardware virtualization. Android did not finish booting within the bounded five-minute attempt. The APK was therefore not installed or launched in that emulator. No native device test is claimed.

Before public rollout, test the APK on a real Android device or use Google Play internal testing:

1. Launch with airplane mode enabled, create a test job, save it, close/reopen and confirm it persists.
2. Import a drawing and photo using the Android picker; cancel another import and confirm no false success.
3. Export a workspace backup to a local folder, find the saved JSON file, and restore it in an empty test workspace. Try cancel and failure paths. Keep a separate backup of real data.
4. Exercise completed-export recovery after Activity recreation, including Save copy, cancel, Later and explicit discard.
5. Create a report and use Android Print / Save as PDF; inspect the resulting PDF.
6. Exercise Android Back, unsaved edits, rotation, keyboard/insets and large imported data on the intended device.
7. Install a later build signed with the same key and a higher version code over this one; confirm workspace data survives. Export before any uninstall or switch to a Play-signed installation.

The browser workspace and Android workspace use separate storage. Transfer work with Jobs backup export/restore. Android's automatic cloud backup is disabled; user-triggered backup exports remain available.

## Release boundary

This is a signed, structurally validated upload bundle for Google Play testing/review. No Play Console app record, listing, policy declaration, tester requirement, production submission or approval is implied by the build. The manual build workflow creates downloadable files only and never publishes an app.
