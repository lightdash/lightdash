# Space-owned composer charts are their own content type

A composer chart saved to a space is listed as its own content type,
`composer_chart`, not as a chart with a new chart source the way SQL charts
are. Under a chart source, about 20 checks the compiler cannot see
(`!== SQL`, `?? DBT_EXPLORE`) would send it to classic behaviour without an
error: the delete, rename and duplicate modals, pin, promote, view stats,
content review, the agent's list links and the document chart picker. A
content type fails safe instead. The compiler checks every switch on it, and
every other check leaves it out rather than mislabelling it. That keeps
composer charts out of classic chart branches (ADR 0007). Users still see
them under "Charts": the type filter maps "Charts" to both types.

## Considered Options

- `ChartSourceType.COMPOSER` under `ContentType.CHART`: fewer files change
  and the "Charts" filter works unchanged. Rejected because each silent
  misroute would have to be made exhaustive first, and nothing would stop
  a new one.

## Consequences

- Places that should treat a composer chart as a chart opt in on purpose:
  the "Charts" filter, space chart counts, the delete-space warning and the
  dashboard's add-chart picker.
- The content type changes how the chart is listed, not how access is
  checked. Every composer chart is checked through `SavedChart`, as classic
  and SQL charts are, with the access target following its owner: its space,
  or its dashboard. `manage:ComposerChart` still gates pipeline writes.
