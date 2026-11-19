# Zone Sketch companion receiver (prepared, not deployed)

Companion change: [Zone Sketch PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40), commit [`9f6728b`](https://github.com/william2535/FIRE-ZONE-PLAN-APP/commit/9f6728bc68fa589a1d69b80643ecbfdd02ea0728). Prepared and tested; not merged or deployed. The follow-up [`ea04c0b`](https://github.com/william2535/FIRE-ZONE-PLAN-APP/commit/ea04c0b8a1fad8fef1f649822b51d0d1a8170f3f) also allows the published Jobs origin `https://jobs-field-workspace.floodyyy21.chatgpt.site`.

Jobs opens the existing Zone Sketch application in a separate window. The public Zone Sketch deployment currently has no cross-application import/return API. `jobs-bridge.js` is the independent receiver prepared for a separately approved Zone Sketch change. Merely deploying Jobs does **not** install this receiver in Zone Sketch.

The companion uses the real engine to import a working copy, edit the project, save it locally and render survey PNGs. It returns the actual `ZoneSketchByWill` version 1 envelope and the PNGs to Jobs. It does not replace the original format, expose the engine state globally, or embed/copy the Zone Sketch application into the Jobs distribution. The original application's proprietary licence remains unchanged.

## Concrete change to Zone Sketch

Reviewed source: [FIRE-ZONE-PLAN-APP at dca2eff063f52a9980c2aed255879a65cc579379](https://github.com/william2535/FIRE-ZONE-PLAN-APP/tree/dca2eff063f52a9980c2aed255879a65cc579379). Its `index.html` SHA-256 is `27125148d181114db39b8140da57a261d8755d6dd8f2568f0c1a353c0a8f2b55`.

The deployment patch is one insertion in `index.html`: insert the contents of `jobs-bridge.js` inside the main engine closure, immediately after the bootstrap ending `renderZoneMenu();load();draw();` and before that closure's `})();`. Replace the `JOBS_ALLOWED_ORIGINS` empty array with the exact trusted Jobs deployment origin. This location permits calling existing closure functions without new public globals. No other original implementation is changed. Ordinary launches without the validated Jobs fragment execute no bridge UI or project changes.

An origin is a scheme, host and port, **not** a URL path. GitHub Pages repositories on the same `https://william2535.github.io` origin share this browser trust boundary. Use a dedicated Jobs origin if repository-level separation is needed. Never configure `*`.

The installer makes a **new external runtime directory**, verifies the exact reviewed engine hash, inserts this receiver and copies the original runtime files/licence there. It refuses existing outputs, outputs inside Jobs, and outputs overlapping the source checkout. It never edits the reference checkout, publishes, commits, or pushes a Zone Sketch change.

```sh
node integrations/zone-sketch/install-bridge.mjs \
  --source /absolute/path/to/FIRE-ZONE-PLAN-APP \
  --output /absolute/path/to/new-temporary-zone-runtime \
  --jobs-origin http://127.0.0.1:4175
```

Serve that output separately for review. For an approved production change, apply the same single insertion in the Zone Sketch repository, retain its licence, review against the source version, and deploy on its existing origin. Point Jobs at that deployed application at build time:

```sh
VITE_ZONE_SKETCH_URL=https://your-zone-origin.example/ npm run build
```

Jobs defaults to `https://william2535.github.io/FIRE-ZONE-PLAN-APP/`. Until the companion is deployed there, Jobs clearly reports that the receiver did not connect. No automatic upload/return is claimed successful.

## Protocol and saving

The opener creates a random session and opens `#jobsOrigin=<encoded-origin>&session=<random-session>`. Customer/project content is sent through `postMessage`, never in the URL. Both sides pin the exact origin, window identity, session, protocol `jobs-zonesketch` and version `1`. The receiver additionally requires its installed Jobs-origin allowlist.

1. Receiver waits for the original local database to finish loading, then sends `ready`.
2. Jobs sends `load` with `{siteId, jobId, drawingId, jobRevision, project}`. Site-only edits use `jobId: null, jobRevision: null`; visits supply both identifiers. The engine validates the actual envelope, saves the previous local drawing, creates a separate editing copy and confirms `loaded` only after saving that copy.
3. **Save to Jobs** saves the engine copy locally, renders each working floor using the existing `renderModeFloorCanvas(..., 'survey', ...)`, and sends `save` with a new `requestId` and `{project, previews}`.
4. Jobs validates the return, retains revisions/results, saves its transaction, and replies `saved` with the same request ID. Only this acknowledgement displays **Saved in Jobs**. Failure/timeout retains the pending data and offers an identical-request retry.

A preview has `{floorId, kind:'working', mode:'survey', revision, image, width, height, renderer:'ZoneSketch', generatedAt}`. `image` is an included PNG data URL. Engine survey images include legends/headers, so Jobs displays them unchanged without placing normalized device pins over them; the adjacent asset list remains interactive. Working project envelopes are limited to 32 MiB and generated previews to 8 MiB each / 25 MiB total.

Repeated loads for the same session are acknowledged without resetting edits. New identity/content is rejected once a copy is loaded. The receiver pins the newly created engine project ID: opening/importing another Zone Sketch project blocks return to Jobs, including during asynchronous saving or PNG generation. Back to Jobs asks before abandoning unacknowledged edits; the engine's saved local copy remains. Existing engine project switching and autosave remain in use. A failed Jobs save never counts as a successful return.

## Verification

These optional checks require a separate, licensed source checkout; no original application or customer save is committed in Jobs:

```sh
ZONE_SKETCH_REFERENCE=/absolute/path/to/FIRE-ZONE-PLAN-APP/index.html \
  node tests/zone-bridge-source.mjs

ZONE_SKETCH_REFERENCE=/absolute/path/to/FIRE-ZONE-PLAN-APP/index.html \
  node tests/zone-bridge-jobs.mjs
```

The source test prepares and removes a temporary patched runtime, uses two distinct localhost origins, imports the synthetic demonstration automatically, edits through original controls, returns real renderer PNGs, and checks duplicate load, forged-source rejection, dropped-acknowledgement retry and blocking an unrelated project return. The Jobs test builds to a separate temporary directory, exercises actual site and visit handoffs with a 390 px Jobs viewport, retains saved results and revisions, and reopens/exports engine PNGs offline. `tests/verify-zone-source.mjs` separately verifies editable-file compatibility against the unmodified original importer/exporter.

Jobs' saved PNG viewing, results and exports work offline after preparation. The separately hosted Zone Sketch web application currently does not register an offline service worker: cold launching that remote editor offline is not promised. An already loaded editor can edit and return over local browser messaging without a connection. Offline packaging/deployment of the separate editor is a later integration decision.
