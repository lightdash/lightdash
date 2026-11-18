# Custom metric SQL is checked at save, with the same rule as at run time

A custom metric stores SQL. A metric the app builds holds a modelled field's
SQL or a reference to it. Hand-written SQL needs `manage:CustomFields`, as a
custom SQL dimension does.

Since August 2026 this was checked only when a query runs
(`ProjectService.assertCustomSqlAuthorizedForQuery`). That check trusts SQL
already saved on a chart the user can view, so that a user without the
permission can re-run and filter existing charts. Saving a chart was not
checked, on the reasoning that one check at run time covers every way a metric
is created. The two choices do not hold together: trust in saved SQL needs a
check when SQL is saved.

Every writer that stores a custom metric now applies the run-time rule. A user
without `manage:CustomFields` may save a metric when its SQL is, by exact text
match within the same table, one of:

1. a modelled field of the explore as that user sees it, or a reference to one;
2. SQL the chart being edited already saved (for a dashboard's shared metric,
   the SQL the shared metric already had);
3. SQL already saved on a chart the user can view, in the same project and
   explore. Only registered users get this clause, as at run time.

Any other metric is refused, and the error names it. Run time and save decide
through the same code: `getHandWrittenAdditionalMetrics` for clause 1 and one
saved-chart lookup with the space view check for clause 3. Run time behaves as
before.

- **Checked writers:** chart create, new chart version, content-as-code upload,
  dashboard shared custom metrics, restoring a chart or dashboard version
  (checked against the chart's current version).
- **Not checked:** duplicate chart, duplicate dashboard, move, restore from
  trash, promote. They copy a chart's current version and store no new SQL.

## What must keep working

For a user without the permission, on a chart someone else wrote that holds a
hand-written metric, all of these work before and after:

- run, filter, sort, export, schedule
- save a new version with any change that leaves the metric's SQL as it is
  (rename, chart config, fields, filters, the metric's label, format,
  aggregation or filters)
- save as a new chart, save to a dashboard
- duplicate, move, restore from trash, promote
- restore a version whose metric SQL matches the current version
- build a metric from a modelled field in Explore, and save it

The only save that is refused is one that stores hand-written SQL the user
could not already run.

## Considered Options

- **Check at run time only** (the August decision): rejected, see above.
- **Refuse at save without clause 3**, as chart create does for custom SQL
  dimensions and SQL table calculations: rejected. "Save as new chart" from a
  chart holding a hand-written metric works today and would stop. A broader
  round of SQL permission checks was rolled back in April 2026 because users
  were refused on charts they did not write.
- **Validate the SQL's structure** (allow field references and operators,
  block subqueries): rejected in August. It needs a parser, and a blocklist
  can be bypassed.
- **Rebuild the SQL from the field and aggregation, ignoring the SQL sent**:
  the strongest check, rejected in August. It changes the API contract and
  breaks hand-written metrics that migrations created.

## Consequences

- The exact match refuses these for a user without the permission, at save as
  it already does at run time: ratios of two fields, arithmetic across
  columns, `CASE` expressions, inline transforms, and a metric on a custom SQL
  dimension. The app builds a metric on a custom SQL dimension as a reference
  to it, which is not a modelled field, so a user without the permission who
  adds one to someone else's chart is refused at run time and at save. The app
  does not build metrics on bin dimensions.
- The check applies to new saves. Stored charts are not re-validated.
- When a model changes a field's SQL, a metric saved earlier no longer matches
  clause 1. Its chart keeps saving through clause 2.
- When the explore cannot be loaded (missing, or failing to compile), only
  clauses 2 and 3 apply.
- A dashboard's shared metric that no chart uses has no explore, so changing
  its SQL is refused; a label or format change still saves.
- Chart create refuses custom SQL dimensions and SQL table calculations
  without clause 3, as it has since July 2026. So "save as new chart" works
  for a chart holding someone else's hand-written metric and is refused for
  one holding someone else's custom SQL dimension. There is no principled
  reason for the difference. It is left alone here because aligning it
  loosens a live check on two other kinds of field, which is a separate
  change with its own review.
- The saved-chart lookup matches only the current version of each chart that
  is not deleted, and counts a dashboard-owned chart through its
  dashboard's space. Both are as at run time.
- The lookup has no index on the stored SQL. It walks the project's charts and
  their versions for the explore through indexed joins, so its cost grows with
  the project's chart versions, not with the whole instance. It runs only when
  a user without the permission saves SQL that clauses 1 and 2 do not cover.
- A user who can manage content as code skips the check on upload, as for
  custom SQL dimensions and SQL table calculations.
