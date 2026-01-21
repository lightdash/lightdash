# UnfurlService

The UnfurlService handles taking screenshots of dashboards and charts using a headless browser (Playwright). It's used for scheduled deliveries, Slack unfurls, and PDF exports.

## Screenshot Readiness Indicator

A two-phase architecture where the frontend signals when content is ready, and the backend detects this signal before taking a screenshot.

### Feature Flags

The feature is behind **two** feature flags:

1. **PostHog Feature Flag**: `FeatureFlags.ScreenshotReadyIndicator` (`screenshot-ready-indicator`)
   - Checked via `featureFlagModel.get()` in `saveScreenshot()`
   - Can be enabled per organization

2. **Environment Variable**: The PostHog flag evaluation determines if the indicator is used

When disabled, the service falls back to legacy behavior (waiting for API responses and loading overlays to disappear).

### How It Works

```
Frontend                                    Backend (UnfurlService)
────────                                    ───────────────────────
MinimalDashboard/MinimalSavedExplorer
    │
    ▼ renders tiles
DashboardChartTile / DashboardSqlChartTile
    │
    ▼ when loaded/errored
markTileScreenshotReady(tileUuid)
markTileScreenshotErrored(tileUuid)
    │
    ▼ when all tiles ready/errored
ScreenshotReadyIndicator                    page.waitForSelector(
    │                                           SCREENSHOT_SELECTORS.READY_INDICATOR
    ▼ attaches hidden div                   )
<div id="lightdash-ready-indicator"             │
     data-status="ready|completed-with-errors"  ▼ detected
     data-tiles-total="N"                   Screenshot is taken
     data-tiles-ready="N"
     data-tiles-errored="N" />
```

### Frontend Coverage

**Pages that render the indicator:**

| Page | Component | Location |
|------|-----------|----------|
| Dashboards | `MinimalDashboard.tsx` | `/minimal/projects/:projectUuid/dashboards/:dashboardUuid` |
| Single Charts | `MinimalSavedExplorer.tsx` | `/minimal/projects/:projectUuid/saved/:savedQueryUuid` |

**Tile types that signal readiness:**

| Tile Type | Component | Ready Signal | Error Signal |
|-----------|-----------|--------------|--------------|
| Saved Charts | `DashboardChartTile.tsx` | `markTileScreenshotReady` | `markTileScreenshotErrored` (includes deleted charts) |
| SQL Charts | `DashboardSqlChartTile.tsx` | `markTileScreenshotReady` | `markTileScreenshotErrored` (includes deleted SQL charts) |

**Non-chart tiles** (Markdown, Loom, Heading) don't affect screenshot readiness - only chart tiles are tracked.

### Error Handling

Deleted charts are handled as errors:

- **Regular charts**: When `savedChartUuid === null`, `orphanedChartError` is created and `markTileScreenshotErrored` is called
- **SQL charts**: When `savedSqlUuid` is falsy, `markTileScreenshotErrored` is called

The indicator shows `data-status="completed-with-errors"` when any tile has errored, but the screenshot is still taken showing the error state.

### Key Files

**Backend:**
- `UnfurlService.ts` - Main service, calls `page.waitForSelector(SCREENSHOT_SELECTORS.READY_INDICATOR)`

**Frontend:**
- `packages/frontend/src/components/common/ScreenshotReadyIndicator.tsx` - Hidden DOM element
- `packages/frontend/src/providers/Dashboard/DashboardProvider.tsx` - Tracks tile counts
- `packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx` - Saved chart tiles
- `packages/frontend/src/components/DashboardTiles/DashboardSqlChartTile.tsx` - SQL chart tiles
- `packages/frontend/src/pages/MinimalDashboard.tsx` - Dashboard page
- `packages/frontend/src/pages/MinimalSavedExplorer.tsx` - Single chart page

**Common:**
- `packages/common/src/constants/screenshot.ts` - `SCREENSHOT_READY_INDICATOR_ID`, `SCREENSHOT_SELECTORS`
- `packages/common/src/types/featureFlags.ts` - `FeatureFlags.ScreenshotReadyIndicator`

### Known Issues / Race Conditions

**Fixed:** There was a race condition in `MinimalDashboard` where tiles could render and call `markTileScreenshotErrored` before `dashboardTiles` was set in context, then the reset effect would clear that status. Fixed by adding an early return to wait for `dashboardTiles` before rendering tiles.

### Adding New Tile Types

If adding a new chart tile type that should be tracked for screenshot readiness:

1. Include it in `expectedScreenshotTileUuids` filtering in `DashboardProvider.tsx`
2. Call `markTileScreenshotReady(tile.uuid)` when the tile finishes loading successfully
3. Call `markTileScreenshotErrored(tile.uuid)` when the tile encounters an error (including deleted state)
4. Handle the deleted state explicitly (when the underlying resource UUID is null/undefined)
