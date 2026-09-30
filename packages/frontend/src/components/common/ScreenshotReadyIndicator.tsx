import {
    SCREENSHOT_FAILED_STATUS,
    SCREENSHOT_READY_INDICATOR_ID,
} from '@lightdash/common';
import { type FC } from 'react';

type ScreenshotReadyIndicatorProps = {
    tilesTotal: number;
    tilesReady: number;
    tilesErrored: number;
    /** The page itself could not load, so there is nothing to capture. */
    failed?: boolean;
};

const getSettledStatus = (tilesErrored: number) =>
    tilesErrored > 0 ? 'completed-with-errors' : 'ready';

/**
 * Hidden DOM element that signals to Playwright when a dashboard/chart is ready for screenshot.
 * The UnfurlService waits for this element to appear before taking a screenshot.
 *
 * The backend reads `data-status`, and `data-tiles-errored` to count the
 * charts a Document PDF printed as errors; the rest are for debugging.
 */
const ScreenshotReadyIndicator: FC<ScreenshotReadyIndicatorProps> = ({
    tilesTotal,
    tilesReady,
    tilesErrored,
    failed = false,
}) => {
    const status = failed
        ? SCREENSHOT_FAILED_STATUS
        : getSettledStatus(tilesErrored);

    return (
        <div
            id={SCREENSHOT_READY_INDICATOR_ID}
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
