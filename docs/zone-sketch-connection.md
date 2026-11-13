# Automatic Zone Sketch connection

Companion change: [Zone Sketch PR #40](https://github.com/william2535/FIRE-ZONE-PLAN-APP/pull/40), commit [`9f6728b`](https://github.com/william2535/FIRE-ZONE-PLAN-APP/commit/9f6728bc68fa589a1d69b80643ecbfdd02ea0728). Prepared and tested; not merged or deployed.

Jobs can open the **real Zone Sketch application** in a separate browser window, send the selected editable project automatically, and receive a saved revision back. This requires the companion handoff receiver to be installed in that Zone Sketch deployment. Merely linking to the existing public editor does not provide this connection.

The companion installer/source is prepared in this Jobs repository; it has not been deployed to the public Zone Sketch application as part of the Jobs-only implementation. The original reference checkout is not automatically modified or published. The prepared receiver still needs to be applied and released with the Zone Sketch owner's intended licence and deployment process. Until that happens, Jobs reports that the receiver did not connect; it never displays a false connected/saved state. See [companion installation](../integrations/zone-sketch/README.md) for the exact deployment procedure.

## Deployment configuration

The default editor address is:

```text
https://william2535.github.io/FIRE-ZONE-PLAN-APP/
```

Set `VITE_ZONE_SKETCH_URL` **at build time** to another Zone Sketch deployment containing the receiver:

```sh
VITE_ZONE_SKETCH_URL=https://your-editor.example/ npm run build
```

Only complete HTTPS URLs are accepted, except HTTP on `localhost`, `127.0.0.1` or `[::1]` for development. Embedded credentials, opaque URLs and insecure remote HTTP addresses are rejected. Configure the receiver's allowlist with the exact Jobs origin (scheme, hostname and port); a path is not part of an origin. Wildcard origins are not used.

Editing uses the real application in its own window and storage origin. This handoff does not bundle or relicense the whole Zone Sketch application. Jobs' importer remains independent. Offline editing in the separate application depends on that editor's own offline readiness; Jobs' included previews, records and exports remain usable without the editor connection.

## Protocol v1

Every message has:

```json
{
  "protocol": "jobs-zonesketch",
  "version": 1,
  "session": "random-session-uuid",
  "type": "ready"
}
```

The editor URL fragment contains only `jobsOrigin` and `session` routing fields. No site name, drawing, photograph or work record is placed in the URL. The opener and receiver both check the exact `event.origin`, `event.source`, protocol, version and session before accepting a message. The receiver also checks `window.opener` and its configured origin allowlist.

| Direction          | Type     | Data                                                                                                                                                                                          |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zone Sketch → Jobs | `ready`  | Receiver and engine are ready for a project.                                                                                                                                                  |
| Jobs → Zone Sketch | `load`   | `payload: {siteId, jobId, drawingId, jobRevision, project}`. `project` is the real current/legacy Zone Sketch v1 save envelope. Site-only editing uses `jobId: null` and `jobRevision: null`. |
| Zone Sketch → Jobs | `loaded` | Sent only after the real engine validates and activates the working copy. Jobs now reports connected.                                                                                         |
| Zone Sketch → Jobs | `save`   | `requestId` and `payload: {project, previews?}`. The receiver retains this same ID and project for a retry.                                                                                   |
| Jobs → Zone Sketch | `saved`  | Same `requestId`, with `payload: {result}` containing the caller's small save receipt. Sent only after the local save handler succeeds.                                                       |
| Either side        | `error`  | Optional `requestId` plus a plain `error` message. Existing Jobs records are retained if the local save fails.                                                                                |
| Zone Sketch → Jobs | `cancel` | Ends the active session without a new revision.                                                                                                                                               |

The complete editable envelope is transferred via `postMessage` with an exact target origin. Handoff source size is limited to 32 MiB. The actual receiver validates using Zone Sketch's importer; the Jobs save callback validates returned source independently, reconciles asset IDs and checks the original site/job/drawing revision before committing. A stale edit must become an explicit review/conflict decision, never an automatic overwrite. Optional returned PNG previews are validated separately before inclusion.

## Opener API

`src/zone-handoff.js` exports `parseZoneHandoffConfig()` and `createZoneHandoff()`:

```js
const handoff = createZoneHandoff({
  url: editorUrl,
  // The promise may prepare hashes/context, but window.open runs synchronously.
  payload: prepared.then(({ envelope, context }) => ({
    ...context,
    project: envelope,
  })),
  onSave: async (envelope, context) =>
    saveValidatedReturnedRevision(envelope, context),
  onStatus: ({ state, message, connected, session }) =>
    showStatus(state, message),
  onError: (error) => showFailure(error.message),
});
```

Call this directly inside the user's click handler, before awaiting preparation, so popup permission remains attached to the gesture. A promise rejection reports a preparation error and removes the message listener without closing the user's editor window. `onSave` must return `true`, a small receipt object, or `undefined` after successful persistence; `false` or rejection sends an error. Its context includes the source IDs/revision, `requestId`, `session`, and any returned `previews`.

Controller getters are `session`, `status`, `popup`, `active` and `connected`. Methods are `reconnect()`, `close()` and `dispose()`. Reconnect starts a new session/window, ignores old-window messages and does not automatically close an old window that might contain unsaved work. Dispose removes timers/listeners without closing the editor. Closing cannot undo a local transaction that already started.

The opener sends the initial load once, even if `ready` repeats. Saves are serialized. An identical retry with a completed request ID receives the cached acknowledgement without invoking the save callback again; reusing an ID with different drawing content is rejected. Failed saves can be retried with the same ID. Other requests while a save is pending receive an explicit retry error. Sessions allow up to 100 distinct successful save receipts; reopen the latest saved revision for longer sessions.

Missing receivers and blocked/closed popups have explicit statuses. The default connection timeout is 15 seconds. `connected` is never true before `loaded`; asset previews or the mere existence of a window do not establish a working engine connection.

## Verification

Unit tests use a fake browser window and real Web Crypto to check synchronous opening with asynchronous preparation, source/origin/session spoof rejection, single initial load, save serialization/idempotency, changed-content request-ID rejection, failed-save retry, missing receiver timeout, blocked/closed windows, preparation failure and site-only identity pairs. Companion end-to-end tests against the actual reference engine are separate from these transport tests. Test fixtures contain only synthetic projects.
