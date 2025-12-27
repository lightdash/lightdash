/**
 * CSS selectors and IDs used by the screenshot/unfurl service.
 * These are shared between the frontend (where elements are rendered) and backend (where Playwright waits for them).
 *
 * IMPORTANT: Changes to these constants must be coordinated between frontend and backend deployments.
 */

/**
 * ID of the element that signals when a dashboard/chart is ready for screenshot.
 * The UnfurlService waits for this element to appear before taking a screenshot.
 *
 * Usage:
 * - Frontend: Rendered by ScreenshotReadyIndicator component
 * - Backend: Waited for by UnfurlService.saveScreenshot()
 */
export const SCREENSHOT_READY_INDICATOR_ID = 'lightdash-ready-indicator';

/**
 * Class name for tile loading skeleton overlays.
 * The UnfurlService waits for these elements to be hidden (loading complete).
 *
 * Usage:
 * - Frontend: Applied by TileBaseV2 LoadingSkeletonOverlay
 * - Backend: Waited for by UnfurlService.saveScreenshot()
 */
export const LOADING_CHART_OVERLAY_CLASS = 'loading_chart_overlay';

/**
 * Class name for chart loading state.
 * The UnfurlService waits for these elements to be hidden (loading complete).
 *
 * Usage:
 * - Frontend: Applied by chart components during loading
 * - Backend: Waited for by UnfurlService.saveScreenshot()
 */
export const LOADING_CHART_CLASS = 'loading_chart';

/**
 * Class name for markdown tile content.
 * The UnfurlService waits for these elements to be attached to the DOM.
 *
 * Usage:
 * - Frontend: Applied to MarkdownPreview in DashboardMarkdownTile
 * - Backend: Waited for by UnfurlService.saveScreenshot()
 */
export const MARKDOWN_TILE_CLASS = 'markdown-tile';

/**
 * Class name for the dashboard grid layout container.
 * This is the screenshot target for dashboard screenshots.
 *
 * Usage:
 * - Frontend: Applied to ResponsiveGridLayout in MinimalDashboard
 * - Backend: Screenshot selector in UnfurlService.saveScreenshot()
 */
export const DASHBOARD_GRID_CLASS = 'react-grid-layout';

/**
 * CSS Selectors (with prefix for direct use in querySelector/CSS)
 */
export const SCREENSHOT_SELECTORS = {
    /** ID selector: #lightdash-ready-indicator */
    READY_INDICATOR: `#${SCREENSHOT_READY_INDICATOR_ID}`,
    /** Class selector: .loading_chart_overlay */
    LOADING_OVERLAY: `.${LOADING_CHART_OVERLAY_CLASS}`,
    /** Class selector: .loading_chart */
    LOADING_CHART: `.${LOADING_CHART_CLASS}`,
    /** Class selector: .markdown-tile */
    MARKDOWN_TILE: `.${MARKDOWN_TILE_CLASS}`,
    /** Class selector: .react-grid-layout */
    DASHBOARD_GRID: `.${DASHBOARD_GRID_CLASS}`,
} as const;
