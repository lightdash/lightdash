# Semantic layer nodes persist the metric query

A semanticLayer node persists its metric query in the exact shape saved charts
and charts as code store: a custom metric is an `AdditionalMetric`, a period
comparison is the period-over-period `AdditionalMetric` built by the shared
`buildPopAdditionalMetric`, and comparison ids are listed in `metrics` as
Explore does. The agent's tool args (`customMetrics`, `periodComparisons`,
filter expressions) are an input-only dialect compiled server-side into that
shape and never persisted as the definition. Composer queries will become
saveable and part of content as code, so there must be one definition of a
semantic query; a second vocabulary on the node would have to be translated,
diffed and migrated alongside the chart's forever. Features the node lacks
(table calculations, custom dimensions, raw SQL metrics, comparing a filtered
custom metric) are gaps, never variants: any new metric-query capability on
nodes goes through the `MetricQuery` types first. The lone-node classic
mapping onto runQuery's payload is a temporary presentation until composer
charts can be saved, and runQuery is being deprecated, so it does not shape
the node. Not decided here: the node's `pivotConfiguration` is the
execution-level pivot shape while charts store `pivotConfig` plus
`metricQuery.pivotDimensions`, and `parameters` live on the node rather than
on the chart.

## Considered Options

- Nesting `metricQuery: MetricQuery` inside the node: rejected, it breaks the
  public query-sources API and persisted nodes and snapshots for no gain over
  keeping the flat fields aligned with `MetricQuery`.
