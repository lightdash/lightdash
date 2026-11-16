# Slack charts

Slack agent answers post charts as a PNG drawn server-side with ECharts, or as a native Slack chart (below), not with the web app's chart renderer, so a chart can be right in the app and wrong in Slack.

## Native charts

With the `ai-agent-slack-native-charts` flag on, a bar or line chart can post as Slack's native `data_visualization` block instead of the PNG. `getSlackNativeChart.ts` holds every rule and returns `{ route: 'native', block }` or `{ route: 'image', reason }`. Vertical bar and line charts qualify. Area, horizontal, stacked multi-series and secondary-axis charts do not. Neither do charts with more than 20 categories or 12 series, missing values, or labels that collide when truncated to 20 characters.

The backend builds the block when it builds the answer (`withSlackNativeCharts` in `AiAgentService`), at most two per message. A native chart replaces its card: the chart, then an `actions` block with the card's buttons in the default style. Native charts and the blocks after them post as their own message after the answer text, like native tables (`splitSlackDataMessage`); answer text blocks stay with the answer. Chart data in a message with markdown counts toward Slack's text size limit. The image job never sees a native chart. If Slack refuses the message (`invalid_blocks`, `invalid_arguments`, `msg_too_long` or `msg_blocks_too_long`), `sendWithSlackNativeChartFallback` resends it with the original cards and the image job draws them (`packages/backend/src/ee/services/ai/utils/slackNativeCharts.ts`).

Date categories use the x field's time grain the way the image axis does (`2025-06` for months); without a grain, values all on the first of the month or year are shortened to `YYYY-MM` or `YYYY`.

Pipeline for a composer `visualize` chart:

- `getComposerSlackEchartsConfig` → `getRunQueryEchartsConfig` → `runQueryTool/viz/*` builds the ECharts option.
- `groupBy` charts pivot in `packages/backend/src/ee/services/ai/utils/getPivotedResults.ts` (DuckDB). The MCP path pivots in the warehouse instead (`getWarehousePivotedResults.ts`).
- `packages/backend/src/ee/services/ai/utils/renderEcharts.ts` draws the PNG.

## Reproduce a Slack chart without Slack

`POST /api/v1/projects/{projectUuid}/aiAgents/visualize/slack-preview` runs that pipeline on rows you send and returns the PNG. It needs Copilot enabled and `manage` on `AiAgent` in the project (admins). `vizConfig` is the `visualize` tool's viz config, of a type Slack posts as an image: `bar`, `line`, `area`, `scatter`, `pie` or `funnel`. Slack sends `table` as a native `data_table` and `big_number` as card text, and draws `custom` types in the headless browser, so those return 400.

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

## Post a chart to Slack from a dev server

`POST /api/v1/projects/{projectUuid}/aiAgents/visualize/slack-send` takes the `slack-preview` body plus `channel`, `threadTs` (or null) and `route`. It exists only when `LIGHTDASH_MODE=development`. `route: 'auto'` applies the native rules; `'native'` and `'image'` force one route, and a forced native chart that fails the rules posts nothing. It ignores the feature flag, posts with the organization's Slack bot in the agent's layout, and returns `{ route, reason, blocks, ts, permalink }`.

```bash
curl -H "Authorization: ApiKey $LDPAT" -H 'Content-Type: application/json' \
  "$SITE_URL/api/v1/projects/$PROJECT_UUID/aiAgents/visualize/slack-send" \
  --data '{ "channel": "C0123456789", "threadTs": null, "route": "auto",
    "title": "Orders by status",
    "columns": [{ "reference": "status", "type": "string" }, { "reference": "orders", "type": "number" }],
    "rows": [{ "status": "placed", "orders": 12 }, { "status": "shipped", "orders": 9 }],
    "vizConfig": { "type": "bar", "x": "status", "y": ["orders"], "y2": null,
      "groupBy": null, "stack": null, "horizontal": null, "labels": null } }'
```
