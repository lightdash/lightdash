# The viz config uses the agent chart vocabulary over column references

A composer artifact version (schemaVersion 2) describes its chart in the
agent chart vocabulary that runQuery already speaks (type, x, y, groupBy,
stack, horizontal, y2, labels, or a custom chart type with a field mapping),
with result column references of the presented node where runQuery names
field ids. A shared adapter in common turns the node's result columns and that
config into a synthetic metric query, field map, chart config and pivot
configuration, and the runQuery chart builders draw it. Until now the viz
config used the SQL-runner vocabulary (kind, field config, aggregations) with
its own renderer, so composer charts looked worse than classic ones, could not
use custom chart types, and Slack would have needed a third chart engine.
Keeping the SQL-runner vocabulary was rejected because it would leave two
chart engines and two agent-facing chart contracts; reusing runQuery's
field-id schema verbatim was rejected because composer results have columns,
not explore fields, and a DuckDB or Python node has no field ids. The choice
gives one chart engine for classic, composer and Slack, makes custom chart
types work on pipelines, and keeps a composer chart convertible to a saved
chart later. The cost is accepted: fields are synthesized, so labels and
formats are only as good as the result columns, and field ids are minted
under a synthetic `composer_result` table rather than derived by splitting
references, so the chart reads a renamed (and, for series splits, pivoted)
stage over the node result. schemaVersion 1 versions keep their vocabulary
and panel; the viz config is versioned like runQuery args, an advertised
schema plus a wide persisted alias, and a restructure bumps the artifact
schemaVersion with it.
