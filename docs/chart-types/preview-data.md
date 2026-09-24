# Chart type preview data

A chart type can declare an optional `preview` alongside `vizSchema` in
`lightdash-app.yml`. The chart registry's version entry carries the same block.
Lightdash stores it on the installed app version, so previews follow that version
through upgrades, restores, forks, and promotion.

```yaml
preview:
  rows:
    - month: '2026-01-01'
      value: 42
    - month: '2026-02-01'
      value: 55
    - month: '2026-03-01'
      value: 75
  optionValues:
    showTarget: true
    target: 100
```

Use the exact field and option names declared in `vizSchema`. Row values may be
strings, numbers, booleans, or null. Include every required field in each row;
omitted optional fields become null cells. When supplied, `rows` must contain
1–1000 rows. Option values must match the option's type and, for selects, a
declared choice; a gradient takes the whole `{ colors, min, max }` value. Invalid manifests fail upload; invalid registry entries are
handled by the registry's existing per-entry validation.

Rows are flat, including any declared series fields. The preview host maps field
names to result columns and pivots metrics and `column` slots by the declared
series. Duplicate groups use the first value; missing combinations become null.
Numeric and boolean values retain their types. ISO date dimensions are marked as
time indexes in pivot metadata.

`optionValues` overrides only the specified defaults. Builder option edits take
precedence over these demo values. Per-field options have no preview values:
previews use their declared defaults until edited in the builder. The project palette still applies, and demo
rows never enable drill-down or underlying-data actions.

Either `rows` or `optionValues` can be supplied independently. Without rows,
Lightdash generates twelve monthly points with three series where applicable.
Omitting the preview block or using null preserves this fallback for existing
chart versions. Stale demo data that no longer matches a regenerated schema also
falls back to generated data.

## Publishing from the chart library

The chart-library publisher must validate and copy `manifest.preview ?? null`
into the version snapshot and registry entry, preserving it when reconstructing
an index from published snapshots. Publish a new registry version to change its
preview; installed versions keep their own stored data until upgraded.

The publisher and tuned fixtures for individual official charts live in the
separate `lightdash-library` repository. This platform contract does not change
already-published chart versions or their demo data.
