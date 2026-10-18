import { type SavedChart } from '@lightdash/common';
import { Box } from '@mantine/core';
import { useEffect, useRef, useState, type FC } from 'react';
import ScreenshotProgressIndicator from '../../components/common/ScreenshotProgressIndicator';
import ScreenshotReadyIndicator from '../../components/common/ScreenshotReadyIndicator';
import { SavedPipelineVisualization } from './SavedPipelineVisualization';
import { useSavedPipelineChartResults } from './useSavedPipelineChartResults';

/** The screenshot page of a saved pipeline chart: the chart alone, with the readiness signals the headless browser waits for. */
export const MinimalSavedPipelineChart: FC<{ chart: SavedChart }> = ({
    chart,
}) => {
    const { resultsData, isLoading, error } =
        useSavedPipelineChartResults(chart);
    const [isReady, setIsReady] = useState(false);
    const hasSignaled = useRef(false);
    const hasError = error !== null;
    useEffect(() => {
        if (hasSignaled.current) return;
        if (isLoading && !hasError) return;
        hasSignaled.current = true;
        setIsReady(true);
    }, [isLoading, hasError]);
    return (
        <Box mih="inherit" h="100%">
            <SavedPipelineVisualization
                chart={chart}
                resultsData={resultsData}
                isLoading={isLoading}
                minimal
            />
            <ScreenshotProgressIndicator
                expectedTileUuids={[chart.uuid]}
                readyTileUuids={isReady && !hasError ? [chart.uuid] : []}
                erroredTileUuids={isReady && hasError ? [chart.uuid] : []}
            />
            {isReady && (
                <ScreenshotReadyIndicator
                    tilesTotal={1}
                    tilesReady={hasError ? 0 : 1}
                    tilesErrored={hasError ? 1 : 0}
                />
            )}
        </Box>
    );
};
