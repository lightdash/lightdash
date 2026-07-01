# Chunk Error Handler

<summary>
Detects stale JavaScript/CSS chunk load failures so the UI can show a clear
"file not found, please refresh" message.

When Lightdash deploys a new version:

1. Vite generates new JS chunks with content-hashed filenames (e.g., `ExplorePanel-abc123.js`)
2. Old chunks are deleted from the server
3. Users with cached HTML still reference old chunk URLs
4. When React.lazy() tries to load the old chunk → 404 → error

This module only provides detection helpers (`isChunkLoadError`,
`isChunkLoadErrorObject`). The error boundaries use them to render a
manual-refresh fallback.

</summary>

<importantToKnow>
- **We never reload automatically.** A programmatic `window.location.reload()`
  bypasses the editors' unsaved-changes guards and silently discards in-progress
  chart/dashboard work (see PROD-8618). Instead, the error boundaries show
  `ChunkErrorFallback` with a "Refresh page" button the user clicks themselves,
  so the `beforeunload` guard can warn them and they can save first.
- `isChunkLoadError(message: string)` - checks error message strings
- `isChunkLoadErrorObject(error: unknown)` - checks Error objects
- Sentry integration (`useSentry.ts`) drops chunk load errors — they're benign
  stale-deploy artifacts resolved by refreshing.
</importantToKnow>

<howToUse>
This module is integrated into:
- `@/features/errorBoundary/ErrorBoundary.tsx` - shows the refresh fallback on chunk errors
- `@/features/errorBoundary/ChunkErrorRouteBoundary.tsx` - same, for react-router lazy-route failures
- `@/hooks/thirdPartyServices/useSentry.ts` - filters chunk errors from Sentry
- `@/components/SimpleTable/index.tsx` - manual refresh UI for pivot table worker errors
</howToUse>

<links>
- @/features/errorBoundary/ErrorBoundary.tsx
- @/features/errorBoundary/ChunkErrorRouteBoundary.tsx
- @/features/errorBoundary/ErrorFallbacks.tsx - the ChunkErrorFallback UI
- @/hooks/thirdPartyServices/useSentry.ts
</links>
