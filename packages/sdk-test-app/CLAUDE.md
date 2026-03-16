# SDK Test App

Test harness for the `@lightdash/sdk` package. Runs on port 3030 via PM2 (`lightdash-sdk-test`).

## Generate an embed token

```bash
cd packages/sdk-test-app
node --import tsx generate-embed-token.ts
```

Outputs an embed URL with a JWT. Auto-loaded from `localStorage('embedUrl')` or `VITE_EMBED_URL`.

## Token Refresh Debug Panel

The panel shows two values side by side:

- **React prop token** — what the SDK component receives as a prop
- **In-memory store token** — what `api.ts` actually attaches to request headers

These should match after a token swap. If they don't, the in-memory store is stale and API calls will use the old token.

### Workflow

1. **Swap Token** — paste a new JWT to update the SDK prop without remounting
2. **Read In-Memory Store** — reads the live `inMemoryStorage` Map to check if the `useEffect` synced the new token (shows "synced" or "STALE")
3. **Force Refetch** — remounts the SDK to trigger fresh API calls (verify in Network tab)

The debug panel imports `getFromInMemoryStorage` directly from `packages/frontend/src/utils/inMemoryStorage.ts`, so it reads the same Map instance the SDK writes to.
