<summary>
`@lightdash/query-sdk` is the SDK bundled into generated data apps. It runs in the
browser (usually a sandboxed iframe), queries the Lightdash semantic layer, and
talks to the host page over postMessage. It also self-reports a **capability
manifest** — the list of features baked into a bundle — which the host uses to
detect apps built on an older SDK and offer an upgrade.
</summary>

<howToUse>
Entry points: `createClient` + `LightdashProvider` + `useLightdash` for app code;
`createApiTransport` (direct API, dev/PAT) or `createPostMessageTransport`
(iframe → host proxy) for transports. The postMessage transport announces the
manifest automatically on creation.

**When you add a user-facing SDK capability, you MUST register it** in
`SDK_FEATURES` (`src/features.ts`). The manifest is how deployed bundles are
compared against the current SDK — an unregistered feature is invisible to
upgrade detection and the "What's new" UI, so old apps will never be offered it.

1. Add an entry `{ key, label, description }` to `SDK_FEATURES`. The `key` is a
   stable kebab-case identifier (never rename it — deployed bundles report it
   forever). `label`/`description` render verbatim in the host's What's-new UI
   and guide the upgrade agent's offer, so write the description as "what it
   enables + when to want it".
2. If the capability announces itself with a `lightdash:*:available` message,
   also map that literal in `AVAILABLE_MESSAGE_TO_FEATURE`
   (`src/features.test.ts`). The drift test fails CI if an `:available` literal
   ships unmapped — capabilities without such a message rely on this checklist.
</howToUse>

<codeExample>

```typescript
// src/features.ts — registering a new capability
export const SDK_FEATURES: SdkFeature[] = [
    // ...existing entries...
    {
        key: 'csv-export',
        label: 'CSV export',
        description:
            'Export query results as CSV files from inside the app. Offer it when an app renders tabular data.',
    },
];

// src/features.test.ts — only if the feature posts an :available message
const AVAILABLE_MESSAGE_TO_FEATURE: Record<string, string> = {
    // ...existing mappings...
    'lightdash:csv-export:available': 'csv-export',
};
```

</codeExample>

<importantToKnow>
- **Manifest protocol**: the app sends `lightdash:sdk:manifest`
  `{ sdkVersion, features }` when `createPostMessageTransport` runs and again
  whenever the host posts `lightdash:sdk:ready`. Note the direction gotcha:
  `sdk:ready` is HOST → iframe (transports wait for it); app → host
  announcements are the manifest and the `*:available` messages.
- **Bundles are the source of truth for staleness** — nothing is persisted
  server-side. A bundle that never sends a manifest is classified "legacy" by
  the host after a short silence.
- `src/generated/sdkVersion.ts` is **generated — never hand-edit**. The
  `prebuild`/`pretest` hooks regenerate it from `package.json`, so builds and
  tests are always version-accurate; a stale committed copy after a release
  bump is harmless (commit the regenerated file when you see it).
- **Keep this package browser-lean**: no dependency on `@lightdash/common`
  (it ships inside user app bundles), and the `./features` subpath export must
  stay constants-only — the Lightdash frontend imports it for staleness
  detection without pulling SDK runtime code.
- Commands: `pnpm build` (regenerates version, compiles to `dist/`),
  `pnpm test`, `pnpm typecheck:fast`. The sandbox template image packs this
  package via `pnpm build && pnpm pack` in
  `sandboxes/data-apps/build-sandbox.ts`.
</importantToKnow>

<links>
- @/packages/query-sdk/src/features.ts — the capability registry
- @/packages/query-sdk/src/features.test.ts — drift guard + `AVAILABLE_MESSAGE_TO_FEATURE`
- @/packages/query-sdk/src/manifest.ts — manifest announcement
- @/packages/query-sdk/src/postMessageTransport.ts — iframe ↔ host protocol types
- @/packages/frontend/src/features/apps/hooks/useAppSdkBridge.ts — host side of the bridge
- @/packages/query-sdk/scripts/generateSdkVersion.mjs — version file generator
</links>
