import { useMemo, type FC } from 'react';
import {
    selectQueryUuidHistory,
    selectSavedChart,
    selectUnsavedChartVersion,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import { type ContentStateChangedPayload } from '../../events/types';
import { useEmbedContentStateEvent } from '../../hooks/useEmbedContentStateEvent';
import { getChartExportRequest } from '../getChartExportRequest';

const EmbedExploreContentStateEvent: FC = () => {
    const chart = useExplorerSelector(selectUnsavedChartVersion);
    // The last entry is the query whose results are on screen
    const queryUuid = useExplorerSelector(
        (state) => selectQueryUuidHistory(state).at(-1) ?? null,
    );
    // Only set when the explorer edits a saved chart in place
    const chartUuid = useExplorerSelector(
        (state) => selectSavedChart(state)?.uuid ?? null,
    );

    const state = useMemo<ContentStateChangedPayload | null>(() => {
        if (!chart.tableName) return null;
        const exportRequest = getChartExportRequest(chart, queryUuid);
        return chartUuid
            ? { type: 'chart', chartUuid, chart, exportRequest }
            : { type: 'explore', chart, exportRequest };
    }, [chart, chartUuid, queryUuid]);

    useEmbedContentStateEvent(state);

    return null;
};

export default EmbedExploreContentStateEvent;
