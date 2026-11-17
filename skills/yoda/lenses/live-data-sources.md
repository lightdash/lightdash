# Live data sources

## Review

- **Skip when:** warehouse adapters or dbt (Warehouse).
- **Worst case:** wrong or missing rows from one source, or a source call that hangs a query.
- **Evidence:** run it against the source, and check how source fields map to Lightdash fields.
- **mapping right:** source fields map to the right Lightdash names and types, nulls and dates included, and the capabilities a connector declares match what its compiler does.
- **complete:** pagination, rate limits and partial responses return every row or say they didn't.
- **bounded:** calls have timeouts and row limits; a slow source never blocks other queries, and a provider quota shared by every customer can't be used up by one.
- **credentials:** connection secrets stay out of logs, errors and responses, and are scoped to the project.
- **naming:** product copy says "live data source" and "integration", never "connection".

## Impact

- **breaking:** supported query/saved chart is refused.
- **notable:** new integration/capability or changed results.
- **minor:** wording.

## Diff

```ts
type LiveDataSourceDiff = Diff;
```

- **Name:** the integration's product name (`Meta Ads`, `Search Console`).
- **Note:** what a user of that integration now sees.
- **Granularity:** one diff per integration whose behaviour changes; name each even when the code is shared, and `All` only when every integration behaves differently.
  A new integration is `added`.
- An integration with only internal edits (a rename, code moved to shared) gets no diff.

```json
{ "lens": "Live data sources", "change": "modified", "impact": "breaking", "name": "Meta Ads", "note": "refuses grouping by an attribute without its ID" }
```
