# Chunk Error Handler

<summary>
Handles automatic recovery when users encounter stale JavaScript chunks after a deployment.

When Lightdash deploys a new version:

1. Vite generates new JS chunks with content-hashed filenames (e.g., `ExplorePanel-abc123.js`)
2. Old chunks are deleted from the server
3. Users with cached HTML still reference old chunk URLs
4. When React.lazy() tries to load the old chunk → 404 → error

This module detects these "Failed to fetch dynamically imported module" errors and auto-reloads
the page to fetch fresh HTML with correct chunk references.

</summary>

<howToUse>
This module is already integrated into:
- `@/features/errorBoundary/ErrorBoundary.tsx` - Auto-reload on chunk errors
- `@/hooks/thirdPartyServices/useSentry.ts` - Filters chunk errors from Sentry until auto-reload fails
- `@/components/SimpleTable/index.tsx` - Manual refresh UI for pivot table worker errors (no auto-reload)

You typically don't need to use this directly unless handling chunk errors in a new location.
</howToUse>

<codeExample>

```typescript
import {
    isChunkLoadErrorObject,
    hasRecentChunkReload,
    triggerChunkErrorReload,
} from '../chunkErrorHandler';

// In an error boundary fallback:
if (isChunkLoadErrorObject(error)) {
    if (!hasRecentChunkReload()) {
        triggerChunkErrorReload(); // Auto-reload once
        return null;
    }
    // Show manual refresh UI (auto-reload already failed)
}
```

</codeExample>

<importantToKnow>
- Uses sessionStorage to prevent infinite reload loops (60s cooldown)
- `isChunkLoadError(message: string)` - checks error message strings
- `isChunkLoadErrorObject(error: unknown)` - checks Error objects
- Sentry integration: errors are only reported if auto-reload fails
</importantToKnow>

<links>
- @/features/errorBoundary/ErrorBoundary.tsx - Primary integration point
- @/hooks/thirdPartyServices/useSentry.ts - Sentry filtering logic
- @/components/SimpleTable/index.tsx - Manual refresh UI for pivot table worker errors
</links>
