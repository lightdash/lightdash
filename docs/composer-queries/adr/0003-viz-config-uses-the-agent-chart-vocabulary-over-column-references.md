# The viz config uses the agent chart vocabulary over column references

A composer artifact version (schemaVersion 2) describes its chart in the
agent chart vocabulary that runQuery already speaks, as a union on type:
a builtin type with x, y, groupBy, stack, horizontal, y2 and labels, or a
custom chart type with its slug, field mapping and options (stored with the
version the server pinned), with result column references of the presented node where runQuery names
field ids. The artifact stays declarative (queries, terminal node and viz
config, no stored columns): a shared adapter in common turns the columns of the
render-time run and that config into a synthetic metric query, field map and
chart config where the results are read, and the runQuery chart builders draw
it. Until now the viz
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
references, so the chart reads the node result with its rows renamed to field
ids in memory. Only a series split (groupBy or a custom chart type series slot)
adds a stage: a DuckDB query renaming and pivoting the node result, derived from
the viz config's references alone, so a split needs explicit x and y. schemaVersion 1 versions keep their vocabulary
and panel; the viz config is versioned like runQuery args, an advertised
schema plus a wide persisted alias, and a restructure bumps the artifact
schemaVersion with it.
