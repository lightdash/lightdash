import { useMemo, type FC } from 'react';
import {
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import { type ContentStateChangedPayload } from '../../events/types';
import { useEmbedContentStateEvent } from '../../hooks/useEmbedContentStateEvent';

const EmbedExploreContentStateEvent: FC = () => {
    const chart = useExplorerSelector(selectUnsavedChartVersion);
    // Only set when the explorer edits a saved chart in place
    const chartUuid = useExplorerSelector(
        (state) => selectSavedChart(state)?.uuid ?? null,
    );

    const state = useMemo<ContentStateChangedPayload | null>(() => {
        if (!chart.tableName) return null;
        return chartUuid
            ? { type: 'chart', chartUuid, chart }
            : { type: 'explore', chart };
    }, [chart, chartUuid]);

    useEmbedContentStateEvent(state);

    return null;
};

export default EmbedExploreContentStateEvent;
