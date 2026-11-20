# Data apps

## Review

- **Skip when:** only the generating agent's prompts (AI Agent) or the sandbox runtime and its metering (Sandbox).
- **Worst case:** apps already built break, or an app reads data its viewer can't.
- **Evidence:** read the SDK contract diff.
  Run a generated app end to end when generation, build or runtime behaviour changes; wrapper-only forwarding follows `../testing.md`, **right kind**.
- **existing apps run:** apps generated before the change still build and render; a breaking `query-sdk` change without a version is Fix.
- **viewer's access:** every query an app runs goes through the viewer's permissions, not the author's or a service account's.
- **errors shown:** a failed query or build shows in the app, not a blank page.
- **SDK typed:** the SDK's public types match what the backend returns.

## Impact

- **breaking:** existing apps fail to build/render or must adapt to query-sdk changes.
- **notable:** new SDK call or capability.
- **minor:** internals apps can't notice.

## Diff

```ts
type DataAppsDiff = Diff;
```

- **Name:** the SDK export, or the capability (`duplicate app`).
- **Note:** what an app or its author can do now.
- **Granularity:** one diff per SDK export or capability.

```json
{ "lens": "Data apps", "change": "added", "impact": "notable", "name": "duplicate app", "note": "copies an app into a personal draft" }
```
