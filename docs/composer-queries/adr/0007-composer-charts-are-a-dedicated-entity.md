# Composer charts are a dedicated entity

A composer chart is stored in its own tables (`composer_charts`,
`composer_chart_versions`), shown by its own dashboard tile type, uploaded as
its own content-as-code kind and written under its own scope
(`manage:ComposerChart`). Nothing writes to the saved chart or SQL chart
tables. A pipeline is not a metric query: a chart whose definition is a set of
nodes has no explore, no fields and no single query, so every reader of a
saved chart would need a branch for it. Kept apart, classic chart, dashboard
and query code changes only where the new type registers itself, and the
feature can be removed by deleting its tiles, dropping its tables and removing
its scope.

A version row holds two documents, each with its own `schemaVersion` and
parsed strictly: the pipeline, and the stored chart (a column list beside the
classic chart, pivot and table configs). An unknown version fails that one
tile, never the dashboard. A new shape ships its reader one release before its
writer.

## Considered Options

- Storing the pipeline on a saved chart version, as a merged chart stores its
  merge: rejected. A merged chart keeps the chart's own metric query as its
  first input, so it fits that row; a pipeline replaces the metric query,
  which leaves the row's required columns empty and makes every consumer of a
  saved chart decide what a chart without an explore means.

## Consequences

- A second chart tile type, a second chart kind in content as code and a
  second scope exist beside the classic ones.
- Slugs are unique per project within composer charts only, so a composer
  chart and a saved chart may share a slug and any reference by slug must say
  which kind it names.
- Bringing saved charts, SQL charts and merged charts into the pipeline shape
  is a conversion, not a rename. To keep it possible, a composer chart accepts
  a supplied uuid, is referenced only by uuid or slug, and can be owned by a
  dashboard or a space from its first migration.
