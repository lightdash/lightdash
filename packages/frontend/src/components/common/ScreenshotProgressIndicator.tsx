import { SCREENSHOT_PROGRESS_INDICATOR_ID } from '@lightdash/common';
import { type FC } from 'react';

type ScreenshotProgressIndicatorProps = {
    expectedTileUuids: string[];
    readyTileUuids: string[];
    erroredTileUuids: string[];
};

/**
 * Hidden DOM element that exposes screenshot readiness *progress* — which
 * tiles are expected, ready, and errored — at any point during rendering.
 *
 * Unlike ScreenshotReadyIndicator (which only mounts once everything is
 * ready), this is mounted from first paint so the UnfurlService can read
 * it on timeout to identify which tiles never reported ready/errored.
 */
const ScreenshotProgressIndicator: FC<ScreenshotProgressIndicatorProps> = ({
    expectedTileUuids,
    readyTileUuids,
    erroredTileUuids,
}) => (
    <div
        id={SCREENSHOT_PROGRESS_INDICATOR_ID}
        data-tiles-expected={JSON.stringify(expectedTileUuids)}
        data-tiles-ready={JSON.stringify(readyTileUuids)}
        data-tiles-errored={JSON.stringify(erroredTileUuids)}
        style={{ display: 'none' }}
        aria-hidden="true"
    />
);

export default ScreenshotProgressIndicator;
