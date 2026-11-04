# Slack chart images

Slack agent answers post a PNG drawn server-side with ECharts, not the web app's chart renderer, so a chart can be right in the app and wrong in Slack.

Pipeline for a composer `visualize` chart:

- `getComposerSlackEchartsConfig` → `getRunQueryEchartsConfig` → `runQueryTool/viz/*` builds the ECharts option.
- `groupBy` charts pivot in `packages/backend/src/ee/services/ai/utils/getPivotedResults.ts` (DuckDB). The MCP path pivots in the warehouse instead (`getWarehousePivotedResults.ts`).
- `packages/backend/src/ee/services/ai/utils/renderEcharts.ts` draws the PNG.

## Reproduce a Slack chart without Slack

`POST /api/v1/projects/{projectUuid}/aiAgents/visualize/slack-preview` runs that pipeline on rows you send and returns the PNG. It needs Copilot enabled and `manage` on `AiAgent` in the project (admins). `vizConfig` is the `visualize` tool's viz config, of a type Slack posts as an image: `bar`, `line`, `area`, `scatter`, `pie` or `funnel`. Slack sends `table` as CSV and `big_number` as text, and draws `custom` types in the headless browser, so those return 400.

```bash
curl -b cookies -H 'Content-Type: application/json' -o chart.png \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/aiAgents/visualize/slack-preview" \
  --data '{
    "title": "Orders by status",
    "columns": [
      { "reference": "month", "type": "date" },
      { "reference": "status", "type": "string" },
      { "reference": "orders", "type": "number" }
    ],
    "rows": [{ "month": "2026-05-01", "status": "placed", "orders": 12 }],
    "vizConfig": { "type": "line", "x": "month", "y": ["orders"], "y2": null,
      "groupBy": ["status"], "stack": null, "horizontal": null, "labels": null }
  }'
```

For a Slack chart bug, rebuild the thread's rows and `vizConfig` from the agent's `visualize` call, render a red image first, then render the same body after the fix for a before/after.
