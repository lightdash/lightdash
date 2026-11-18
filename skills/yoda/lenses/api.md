# API

## Review

- **Skip when:** only a controller's body changes with the same statuses and shapes, client plumbing with no shape change, or MCP tools (MCP).
  A new error status is a shape change.
- **Worst case:** callers you can't see break.
- **Evidence:** read the contract diff and check that it is additive or versioned.
- **additive:** removing/renaming a field, route or accepted enum value, or newly requiring input, is Fix unless versioned and the old contract still works.
  Repo-internal exports can change with their callers.
- **release-safety:** the preview determination agrees with the contract; a breaking verdict is Fix unless the PR states it is intended.
- **callers updated:** the frontend, CLI and SDK callers of a changed contract are updated in this diff, or none exist (grep the repo).
- **validated:** new inputs are checked at the edge, not trusted downstream.
- **errors mapped:** failures throw typed errors that return the right HTTP status, never a 500 for bad input.

## Impact

- **breaking:** a route/field removal or required input breaks a supported caller.
- **notable:** new route, optional field, response value, error status or external export.
- **minor:** description wording or repo-internal exports.

## Diff

```ts
type ApiDiff = Diff & {
    field?: string;  // one param or response field, by its leaf name; none for a whole route
};
```

- **Name:** a route: method and path from the controller's `@Route` plus its method decorator; otherwise the contract by its name: an export (`common` `getFieldMap`), a pgwire statement (`SHOW TRANSACTION ISOLATION LEVEL`), a published file (`release-safety.json`), or a type every route returns (`ApiErrorPayload`).
- **Granularity:** one diff per endpoint and field; a field added to a type several routes return is one diff, named by the type.
  An endpoint with a behaviour change and a new field gets two.
  Cut each path to `…` up to the first segment that differs between this PR's endpoints, and always keep at least the last resource name (`POST …/external-connections/{id}/reattach`).
- Field is the leaf name only; no `(request)`, `(query)` or `results.`.

```json
{ "lens": "API", "change": "added", "impact": "notable", "name": "POST …/thread-files/images", "note": "raw PNG/JPEG/WebP body, 3 MiB" }
```
