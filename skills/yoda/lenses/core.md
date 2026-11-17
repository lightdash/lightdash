# Core

## Review

- **Skip when:** types serving another tag, or number and chart formatting (UI).
- **Worst case:** wrong numbers with no error; in a BI tool that is the business-critical failure.
- **Evidence:** read the code and the tests' expected values.
- **does what it says:** the stated problem is solved on the main path.
  This is the source of Fix correctness.
- **existing results unchanged:** saved charts and dashboards retain their SQL and numbers.
- **edges:** null, empty, zero rows, week start, timezones, fiscal periods, pivot totals, non-additive metrics, custom dimensions and metrics.
  A broken edge on a common case is Fix, on a rare one Heads-up.
- **all paths:** every entry point goes through the change: explore, dashboards, SQL runner, scheduler, embeds, MCP and the API, plus cache bypass ("Run fresh").
  One path skipping it is Fix.
- **expected values real:** tests assert computed numbers checked by hand, not output copied from the code under test.
- **load-bearing covered:** a changed load-bearing method (below) has a test that reaches it. None is Heads-up.

### Load-bearing methods

A **load-bearing method** is a public method or exported function in one of these places:

- `packages/backend`, `packages/common`, `packages/formula`, or a shared warehouse client in `packages/warehouses`.
- That covers services, models, the query compiler and builder, ability builders, and export and formatting code.
- A private method counts through the public one that calls it; name the public one instead.

It is load-bearing when at least one of these holds:

- It is reached from two or more kinds of entry point: controller or router, scheduler task, MCP tool, AI agent tool.
- It is called from many places.
- It sits on the path every query, compile or permission check takes.
- It decides what users get in results, exports or deliveries.

Always load-bearing, whatever the caller count:

- A method whose change alters query results.
- A frontend function that chooses query filters, parameters or tile targets.

Judge it from the callers in the code, outside tests.

These get no diff:

- Pure renames and moves (`git diff --color-moved`).
- Extractions that keep caller behaviour.
- Constructor wiring, types and tests.

Other methods with one caller, or a few in one area, are left out.

Load-bearing methods get line-by-line reads whichever lens owns them; that lens also runs its checks.

## Impact

- **breaking:** a load-bearing method now throws, reshapes output or skips work callers require.
- **notable:** changed results, restored expected behaviour, new load-bearing method or caller.
- **minor:** internal changes preserving every caller's behaviour.

## Diff

```ts
type CoreDiff = Diff;
```

- **Name:** exact `Class.method` or `module.function`.
- **Granularity:** one diff per distinct load-bearing behaviour change; forwarding methods share it.
  A new caller of an existing method is `modified`, with the caller in the note.

```json
{ "lens": "Core", "change": "modified", "impact": "notable", "name": "AsyncQueryService.executeAsyncQuery", "note": "merge joins across sources" }
```
