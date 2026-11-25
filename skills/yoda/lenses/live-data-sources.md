# Live data sources

## Review

- **Skip when:** warehouse adapters or dbt (Warehouse).
- **Worst case:** wrong or missing rows from one source, or a source call that hangs a query.
- **Evidence:** run it against the source, and check how source fields map to Lightdash fields.
- **mapping right:** source fields map to the right Lightdash names and types, nulls and dates included, and the capabilities a connector declares match what its compiler does.
- **complete:** pagination, rate limits and partial responses return every row or say they didn't.
- **bounded:** calls have timeouts and row limits; a slow source never blocks other queries, and a provider quota shared by every customer can't be used up by one.
- **credentials:** connection secrets are scoped to the project; Security covers keeping them out of logs and responses.
- **naming:** product copy says "live data source" and "integration", never "connection".

## Impact

- **breaking:** supported query/saved chart is refused.
- **notable:** new integration/capability or changed results.
- **minor:** wording.

## Diff

```ts
type LiveDataSourceDiff = Diff & {
    kind: "integration" | "explore" | "field";
};
```

- **Name:** an integration by its product name (`Meta Ads`, `Search Console`); an explore by its key (`meta_ads_campaigns`); a field as `<explore key>.<field key>` (`meta_ads_campaigns.spend`).
- **Kind:** the extra beside the name, so explores and fields read apart at a glance.
- **Note:** what a user of that integration, explore or field now sees.
- **Granularity:**
  - One `integration` row per integration whose behaviour changes; name each even when the code is shared, and `All` only when every integration behaves differently.
  - One `explore` row per explore added, removed or changed (label, grain, required filters, capabilities), and one `field` row per field added, removed or changed (label, type, description, filterability, operators), read from the explore definitions in the diff, not the PR description.
  - A new integration is an `added` integration row plus an `added` row for each of its explores and fields, so the whole surface it ships is visible.
  - A renamed explore or field is a `deleted` row for the old key and an `added` row for the new one.
- **Impact:** removing or renaming an explore or field is breaking (saved charts lose it); adding an explore is notable; adding a field, or changing a label or description, is minor.
- An integration with only internal edits (a rename, code moved to shared) gets no diff.
- **Order:** within each impact group, each integration's row first, then its explores, each followed by its fields, keys alphabetical.

```json
[
  { "lens": "Live data sources", "change": "modified", "impact": "breaking", "name": "Meta Ads", "kind": "integration", "note": "refuses grouping by an attribute without its ID" },
  { "lens": "Live data sources", "change": "deleted", "impact": "breaking", "name": "meta_ads_campaigns.cpm", "kind": "field", "note": "saved charts using it lose the column" },
  { "lens": "Live data sources", "change": "added", "impact": "notable", "name": "meta_ads_ad_sets", "kind": "explore", "note": "ad set spend and reach by day" },
  { "lens": "Live data sources", "change": "added", "impact": "minor", "name": "meta_ads_ad_sets.reach", "kind": "field", "note": "unique people reached, summed per day" }
]
```
