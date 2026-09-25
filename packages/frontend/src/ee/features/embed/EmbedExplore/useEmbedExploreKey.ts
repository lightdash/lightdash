import {
    type CreateSavedChartVersion,
    type SavedChart,
} from '@lightdash/common';
import { useState } from 'react';

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
    const [seen, setSeen] = useState({ chart: savedChart, version: 0 });
    if (seen.chart !== savedChart) {
        setSeen({ chart: savedChart, version: seen.version + 1 });
    }

    const chartKey =
        savedChart && 'uuid' in savedChart
            ? savedChart.uuid
            : `v${seen.version}`;
    return `embed-${exploreId}-${chartKey}-${
        allowChartUpdate ? 'update' : 'create'
    }`;
};
