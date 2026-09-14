# Developing charts with Autopilot

Use only the tools listed in this run. Project policy may disable creation or fixing; skip those workflows when their action tool is unavailable.

## Create a chart

1. Call `grepFields` and `getMetadata` to discover the exact explore and field identifiers.
2. Call `get_chart_schema` for the chart-as-code structure. Read the matching chart-type resource using `loadSkill` with this skill's name and the resource name.
3. Call `runMetricQuery` with the proposed fields and filters to verify the data. Follow that tool's input schema; query arguments differ from the persisted metricQuery shape.
4. Call `create_content_from_code` with a complete chart_as_code JSON object and a description. The handler chooses the suggestions space; do not choose another destination.

## Fix a broken chart

1. Call `get_broken_content`, then `get_chart_details` for the selected chart UUID.
2. Use `grepFields` and `getMetadata` to resolve missing fields. Read the chart-type resource through `loadSkill`.
3. Preserve unrelated fields. Validate the proposed query with `runMetricQuery`.
4. Call `fix_broken_chart` with the chart UUID/name, description, and complete metric_query and chart_config objects. These are full replacements, not JSON patches.

## Chart conventions

- Use exact field IDs from discovery; never infer IDs from labels.
- `chartConfig.type` is `cartesian` for line, bar, area, and scatter charts. Configure their visual marks inside the cartesian configuration.
- Include `contentType: chart`, the valid tableName/exploreName, and every required property from `get_chart_schema`.
- Every selected dimension must appear in the chart's axes or grouping.
- Verify filter values with `searchFieldValues` before querying.
- Prefix new chart slugs with `agent-`.
- Use `findContent` and `getDashboardCharts` for discovery. Autopilot creates and fixes charts; this skill does not provide dashboard editing or custom chart-type installation.
