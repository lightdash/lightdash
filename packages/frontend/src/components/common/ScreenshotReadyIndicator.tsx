import { type FC } from 'react';

type ScreenshotReadyIndicatorProps = {
    tilesTotal: number;
    tilesReady: number;
    tilesErrored: number;
};

/**
 * Hidden DOM element that signals to Playwright when a dashboard/chart is ready for screenshot.
 * The UnfurlService waits for this element to appear before taking a screenshot.
 *
 * Data attributes are included for debugging purposes only.
 */
const ScreenshotReadyIndicator: FC<ScreenshotReadyIndicatorProps> = ({
    tilesTotal,
    tilesReady,
    tilesErrored,
}) => {
    const status = tilesErrored > 0 ? 'completed-with-errors' : 'ready';

    return (
        <div
            id="lightdash-ready-indicator"
            data-status={status}
            data-tiles-total={tilesTotal}
            data-tiles-ready={tilesReady}
            data-tiles-errored={tilesErrored}
            style={{ display: 'none' }}
            aria-hidden="true"
        />
    );
};

export default ScreenshotReadyIndicator;
