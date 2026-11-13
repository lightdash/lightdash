# Composer chart permissions are checked at save, and viewers can read every node

A composer chart's pipeline can hold raw SQL, transformations and custom SQL
that a dashboard viewer may not write. We check the author's permissions once,
when the chart is saved. A viewer's run is a bound run: the server loads the
stored pipeline and skips the write-permission gates, while the viewer's user
attributes still apply to semantic-layer nodes. Every node's query row is
stamped with the chart, and anyone who can view the chart can read each node's
SQL, error text and rows. This matches saved SQL charts and document charts.

## Considered Options

- Only the terminal node's rows readable: rejected, because the terminal row
  still holds transformation source and it adds about four filters on
  query-history reads.
- SQL hidden from viewers without SQL runner permission: rejected, because an
  earlier attempt needed a redaction layer across about ten read paths and
  fifteen leak fixes.

## Consequences

- A non-terminal node's rows are readable by any viewer of the chart, so an
  author must not select data in a node that the dashboard's audience may not
  see.
- If the author later loses a permission, the stored chart keeps running.
- The stamp is re-checked against the chart's current owner on every read, so
  rows become unreadable when the chart is deleted or the viewer loses access.
