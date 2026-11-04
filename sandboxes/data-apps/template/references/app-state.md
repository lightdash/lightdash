# Saved app state (`useAppState`, `useSharedAppState`)

> Read this when the build prompt says saved app state is available. It covers remembering what a person entered, values every viewer shares, and who changed what.

Lightdash stores values the app saves, so they come back on the next open, on any device. Two hooks, both `useState`-shaped, both JSON values:

```tsx
import { useAppState, useSharedAppState } from '@lightdash/query-sdk';

const [filters, setFilters] = useAppState('filters', DEFAULT_FILTERS);          // this person only
const [targets, setTargets] = useSharedAppState('targets', {});                 // every viewer
```

- **`useAppState(key, default)`** saves per person. Only that person reads it back. Overwrites in place, no history.
- **`useSharedAppState(key, default)`** saves one value every viewer of the app reads. Each write is a version with its author and time; `client.appState.history(key)` lists them newest first.

## Pick the scope from what is being saved

| Saving… | Hook |
| --- | --- |
| A person's own inputs: filters, selections, sort, active tab, collapsed panels, draft text, preferences | `useAppState` |
| Something other people read: comments, targets, annotations, approvals, assignments, notes, AI commentary | `useSharedAppState` |
| "Who changed what", an audit trail, a change log | `useSharedAppState` plus `client.appState.history(key)` |

Prompt words that mean shared: comments, targets, annotations, approvals, "everyone", "the team", "who changed". When it is genuinely unclear whether a value is personal or for everyone ("save the targets"), ask one question before building: *Should everyone see these targets, or only the person who sets them?* That is the only storage question to ask.

## What to do without being asked

- **Remember a person's inputs by default.** Any input a person would be annoyed to lose on refresh goes in `useAppState`. The user does not have to ask for this.
- **Inputs that define the view** (period, active tab, segment, sort) use `useAppState(key, default, { url: true })`: the value also lands in the shareable link, so a colleague who opens the link sees that view, and the person gets their last view back when they open the app from the menu. A value in the link wins until the person changes the control.
- **Global filters stay on `useGlobalFilters()`** (URL state); never wire them through these hooks yourself.
- **Transient UI** (open menus, hover, modal visibility, text being typed before submit) stays in plain `useState`.
- **Add a "Reset" control** next to any filters or selections persisted per person, restoring the defaults with `setFilters(DEFAULT_FILTERS)`.
- **No save button for per-user state.** It saves as the person changes things. Shared edits made in a form may keep an explicit Save or Post.

## Shared values: updater or plain value

```tsx
const [comments, setComments] = useSharedAppState('comments', []);

// Additive edit: use the updater form. If someone else wrote in between, the
// updater is re-applied on their value and retried, so both comments land.
setComments((prev) => [...prev, { id: crypto.randomUUID(), text, at: new Date().toISOString() }]);

// Whole-value replace (a form's Save): pass the value. If it is stale, the
// write is refused, the hook shows what the server has, and `error.code`
// is 'conflict'. Tell the person and let them re-apply their change.
setTargets(nextTargets);
```

The third element of both hooks carries state you should use:

```tsx
const [targets, setTargets, { loading, error, persisted, version, updatedAt, updatedBy }] =
    useSharedAppState('targets', {});
```

- `loading`: true until the saved values have loaded. Render the defaults meanwhile; do not block the page.
- `saved`: true when this key's latest value is confirmed stored. A value you just set shows immediately but is not saved until the server accepts it. For anything a person submits (a note, a form), keep their input visible until `saved` is true or an `error` arrives; never clear a composer on submit alone.
- `error`: the last failure for this key. Handle every code, not just the two you expect:
  - `conflict`: someone else changed the value and you are now seeing theirs. Say so and let the person re-apply their change.
  - `forbidden`: this viewer cannot write (embedded viewers read shared values but never write). Disable the control and say it is read-only here.
  - `invalid`: the server refused the value (too large, bad key). Show the message and keep the person's input so they can shorten it.
  - `unavailable` / `unknown`: the save did not reach the server. Say it was not saved; the SDK retries on the next change or `client.appState.flush()`, so keep the input.
- `persisted`: whether saving is possible at all. False when the feature is off, in local development without an app, or when the first load failed. The app keeps working in memory; show a small "not saved" hint. It says nothing about one key's value; that is `saved`.
- `updatedBy` / `updatedAt` (shared only): show "Last changed by Alice, 2 hours ago" where it helps.

## Sharing views and seeing other people's edits

- **Do not build "copy link" or "share" buttons.** The host page owns the URL; sharing is copying the address bar. `useAppState(key, default, { url: true })` is what puts a view control into that link, including a restored saved value. `document.referrer` and `window.parent.location` do not give the current link inside the sandbox.
- **Shared values are not live.** Other people's edits appear when the app loads, when the tab comes back to the foreground, or when the app calls `client.appState.refresh()`. Put a Refresh control on any shared panel (comments, notes, targets) and never describe it as real-time.

## Change history

```tsx
const client = useLightdashClient();
const versions = await client.appState.history('targets', { limit: 50 });
// [{ version, value, createdAt, author: { kind: 'user', userUuid, name } }, ...] newest first
```

Render the list; diff two versions' values yourself if the user asked for "what changed".

## Limits and keys

- JSON values only. At most 64 KB per key and 200 keys per app per scope; history keeps the last 1,000 versions of a shared key.
- Keys are 1–128 characters of letters, numbers, `_`, `.`, `:` or `-`.
- **One key per concept, never a key per row or per selection.** Commentary per selection, notes per row, flags per item: keep a map inside one key (`{ [selectionId]: {...} }`). A key per item hits the cap.
- Keep generated content with its inputs: AI commentary saved under one shared key as `{ text, generatedAt, inputs }` so the app can show when it was generated and offer a regenerate.
- A saved value whose JSON kind differs from the hook's default (an object where the app now expects an array, a string where it expects a number) is ignored and the default is used. That is the only check: an old object with different fields still comes back, so when you rename or add fields, read the saved value defensively and fill in defaults for what is missing.

## Do not

- Do not use these hooks when the build prompt does not say saved app state is available: values would only live in memory for the session.
- Do not store query results or large datasets. The data lives in the warehouse; save selections and inputs.
- Do not build your own persistence (localStorage, cookies) for the same purpose.
- Do not put a person's private inputs in `useSharedAppState`.
