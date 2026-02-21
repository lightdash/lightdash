## Screenshot Ready System

The screenshot system allows `UnfurlService` (backend) to know when a dashboard is fully rendered.

### Architecture

```
UnfurlService (backend)
    │
    ▼ navigates to
MinimalDashboard
    │
    ├── renders DashboardChartTile(s)
    │       │
    │       ▼ on load success
    │   markTileScreenshotReady(tileUuid)
    │       │
    │       ▼ on error (incl. orphaned charts)
    │   markTileScreenshotErrored(tileUuid)
    │
    ▼ when all tiles ready/errored
ScreenshotReadyIndicator
    │
    ▼ attaches hidden div with id
SCREENSHOT_READY_INDICATOR_ID
    │
    ▼ detected by
UnfurlService.waitForSelector()
```

### Flow

1. `UnfurlService` opens MinimalDashboard URL in headless browser
2. `DashboardProvider` tracks expected tile count via `expectedScreenshotTilesCount`
3. Each tile calls `markTileScreenshotReady` or `markTileScreenshotErrored` when done
4. When `screenshotReadyTilesCount + screenshotErroredTilesCount >= expectedScreenshotTilesCount`, `isReadyForScreenshot` becomes true
5. `MinimalDashboard` renders `ScreenshotReadyIndicator` (hidden div)
6. `UnfurlService` detects the indicator via `page.waitForSelector(SCREENSHOT_SELECTORS.READY_INDICATOR)`
7. Screenshot is taken

### Key Files

- `ScreenshotReadyIndicator.tsx` - Hidden DOM element signaling readiness
- `DashboardProvider.tsx` - Tracks tile ready/error counts
- `DashboardChartTile.tsx` - Calls `markTileScreenshotReady`/`markTileScreenshotErrored`
- `MinimalDashboard.tsx` - Renders indicator when ready
- `@lightdash/common` - `SCREENSHOT_READY_INDICATOR_ID`, `SCREENSHOT_SELECTORS`
- `UnfurlService.ts` - `waitForSelector()` waits for the indicator
