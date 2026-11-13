# A result column's field id is its column name

The chart builders take fields, a metric query, rows and a chart config, all
joined by field id, and some of them hold only the field and rebuild its id
from its table and name (`getItemId`). A node result has columns, not explore
fields, and the columns of a SQL, DuckDB or Python node have no table, so the
adapter invented one (`composer_result`) and every id carried it as a prefix.
We decided that a result column's field id is its column name: a field
synthesized from a result column sits under a marker table
(`RESULT_COLUMN_TABLE`, `<composer>`), and `getItemId` returns the name for
that table, as it already does for custom dimensions and table calculations.
A dot in a name still becomes `__`, because pivoted series keys are joined and
split on dots. The reason is what gets stored. A composer chart stores a
classic chart config, which is written in field ids, and content as code holds
the same document. With a minted prefix, every stored chart and every file
would carry a string that exists only to satisfy one function, and removing it
later would mean rewriting every id position of every stored version. With the
name as the id, the stored chart names columns as the node returns them, and
the adapter maps only fields.

## How the mapping works

| Presented node | Fields come from | Rows, chart config, pivot config |
|---|---|---|
| Semantic layer | The run's own fields; a column is named after its field | As stored |
| Merge | The merge's own items, keyed by column name | As stored |
| SQL, DuckDB, Python | Built per column under the marker table: name, type, label | As stored |

A DuckDB node returning `order_month`, `method`, `revenue`, charted as revenue
by month split by method, is stored and drawn with those three names:
`xField: order_month`, `yField: [revenue]`, pivot on `method`, rows keyed
`revenue`, and a field `revenue` whose table is the marker.

## Considered Options

- Minting a prefixed id at save and storing it beside a column list that maps
  it back: rejected. The ids are opaque, so nothing breaks, but the prefix
  stays in every stored chart, and in customers' repositories if files show
  ids, where no migration reaches.
- Keeping the invented table in memory only and rewriting the stored chart
  config to prefixed ids on each render: rejected. It needs a complete map of
  every position a chart config can hold an id, free text included (tooltip
  templates, custom Vega specs). The closest existing walker, the rename
  service's, misses several positions, and a missed position draws a wrong
  chart with no error. Every new chart setting would need the map updated.
- Storing the agent's viz config and building the chart config on each render,
  as composer artifacts do: rejected for stored charts. Nothing is minted, but
  the vocabulary has no series colours, conditional formatting, reference
  lines or column settings.
- An empty table as the marker: rejected. A named marker is explicit and keeps
  the table non-empty, as it was; an empty string could also be a bug in an
  unrelated field, and the rule would silently change that field's id.

## Consequences

- `getItemId`, shared by every chart, has a branch for one table name. Nothing
  validates explore table names against the marker, so a table could in theory
  be named `<composer>`; its fields would then lose their table prefix.
- Code that builds an id by hand as `${table}_${name}` gets the wrong id for a
  result column. New code that can meet one must call `getItemId`.
- A result column can share its id with a real field, such as `orders_status`
  passed through a DuckDB node. Filters, drill and cross-filter resolve through
  a column's provenance, never through the chart's field id.
- Two columns that differ only by `.` and `__` cannot be charted together.
