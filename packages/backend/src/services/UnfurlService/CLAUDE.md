# UnfurlService

The UnfurlService handles taking screenshots of dashboards and charts using a headless browser (Playwright). It's used for scheduled deliveries, Slack unfurls, and PDF exports.

## Screenshot Readiness Indicator

A two-phase architecture where the frontend signals when content is ready, and the backend detects this signal before taking a screenshot.

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

| Page                     | Component                  | URL Pattern                                                | Notes                                              |
| ------------------------ | -------------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| Dashboards               | `MinimalDashboard.tsx`     | `/minimal/projects/:projectUuid/dashboards/:dashboardUuid` | Uses minimal page                                  |
| Single Charts            | `MinimalSavedExplorer.tsx` | `/minimal/projects/:projectUuid/saved/:savedQueryUuid`     | Uses minimal page                                  |
| Explore (unsaved charts) | `Explorer/index.tsx`       | `/projects/:projectUuid/tables/:tableName`                 | Uses full page, screenshots only the visualization |

For EXPLORE pages, the indicator is rendered in the regular `Explorer` component (not a minimal page). The UnfurlService screenshots only the `[data-testid="visualization"]` element, so the sidebar and other UI elements are excluded from the screenshot.

**Tile types that signal readiness:**

| Tile Type    | Component                   | Ready Signal              | Error Signal                                              |
| ------------ | --------------------------- | ------------------------- | --------------------------------------------------------- |
| Saved Charts | `DashboardChartTile.tsx`    | `markTileScreenshotReady` | `markTileScreenshotErrored` (includes deleted charts)     |
| SQL Charts   | `DashboardSqlChartTile.tsx` | `markTileScreenshotReady` | `markTileScreenshotErrored` (includes deleted SQL charts) |

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
- `packages/frontend/src/providers/Dashboard/DashboardProvider.tsx` - Tracks tile counts for dashboards
- `packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx` - Saved chart tiles
- `packages/frontend/src/components/DashboardTiles/DashboardSqlChartTile.tsx` - SQL chart tiles
- `packages/frontend/src/pages/MinimalDashboard.tsx` - Dashboard page (minimal)
- `packages/frontend/src/pages/MinimalSavedExplorer.tsx` - Single chart page (minimal)
- `packages/frontend/src/components/Explorer/index.tsx` - Explore page (full page, indicator for Slack unfurls)

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

## Slack Unfurls vs Scheduled Deliveries

The UnfurlService handles screenshots for two different use cases with different image storage mechanisms:

### Scheduled Deliveries

Used for dashboard/chart schedulers that send emails or Slack messages on a schedule.

- Triggered by `SchedulerService` → `SlackClient.postImageToSlack()` or email delivery
- Image is uploaded directly to Slack via `files.uploadV2` API (for Slack deliveries)
- For email, images are attached to the email or hosted temporarily

### Slack Unfurls (Link Previews)

When a user shares a Lightdash URL in Slack, Slack requests a preview image.

- Triggered by `SlackController.getUnfurl()` → `UnfurlService.unfurlImage()`
- Slack needs a publicly accessible URL to fetch the image

**Image Storage:**

1. **With S3 enabled** (`FileStorageClient` configured):
    - Image uploaded to storage: `fileStorageClient.uploadImage(buffer, imageId)`
    - Returns storage URL for Slack to fetch

2. **Without S3** (local storage):
    - Image saved to `/tmp/${imageId}.png`
    - Served via `/api/v1/slack/image/${downloadFileId}`
    - Uses `DownloadFileModel.createDownloadFile()` to create a temporary download token
    - Token has expiration for security

**Key Methods:**

- `unfurlImage()` - Creates screenshot and returns image URL for Slack unfurls
- `unfurlDetails()` - Returns metadata (title, description) without screenshot

**Files:**

- `SlackController.ts` - `/api/v1/slack/image/:nanoId` endpoint serves local images
- `S3Service.ts` - Handles S3 uploads when configured
- `DownloadFileModel.ts` - Manages temporary download tokens for local images
