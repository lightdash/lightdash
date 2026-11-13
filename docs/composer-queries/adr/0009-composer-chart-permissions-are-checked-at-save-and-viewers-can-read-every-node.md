# Composer chart permissions are checked at save, and viewers can read every node

A composer chart's pipeline can hold raw SQL, transformations and custom SQL
that a dashboard viewer may not write. We check the author's permissions once,
when the chart is saved. A viewer's run is a bound run: the server loads the
stored pipeline and skips the write-permission gates, while the viewer's user
attributes still apply to semantic-layer nodes. Every node's query row is
stamped with the chart, and anyone who can view the chart can run it and read
each node's SQL, error text and rows. Each viewer reads the nodes of their own
run: query results stay with the account that ran them, as for every query.
This matches saved SQL charts and document charts.

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
- The stamp is re-checked against the chart's current owner on every result,
  stream and status read, so rows become unreadable when the chart is deleted
  or the viewer loses access. The viewer's own query history list keeps the
  SQL and error text of runs they already made, as it does for every chart.
- A semantic-layer node skips the view-Explore check, as a classic dashboard
  tile does; the viewer's user attributes still filter the explore it loads.
