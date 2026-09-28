import {
    type CreateSavedChartVersion,
    type SavedChart,
} from '@lightdash/common';
import { useRef } from 'react';

type EmbedExploreChart = SavedChart | CreateSavedChartVersion;

/**
 * The explorer store initializes once per key. A drilled chart has no uuid
 * and stays in the same explore, so a new chart object is the only signal
 * that the explorer must start over.
 */
export const useEmbedExploreKey = ({
    exploreId,
    savedChart,
    allowChartUpdate,
}: {
    exploreId: string;
    savedChart: EmbedExploreChart | undefined;
    allowChartUpdate: boolean | undefined;
}): string => {
    const seenChartRef = useRef(savedChart);
    const versionRef = useRef(0);
    if (seenChartRef.current !== savedChart) {
        seenChartRef.current = savedChart;
        versionRef.current += 1;
    }

    const chartKey =
        savedChart && 'uuid' in savedChart
            ? savedChart.uuid
            : `v${versionRef.current}`;
    return `embed-${exploreId}-${chartKey}-${
        allowChartUpdate ? 'update' : 'create'
    }`;
};
