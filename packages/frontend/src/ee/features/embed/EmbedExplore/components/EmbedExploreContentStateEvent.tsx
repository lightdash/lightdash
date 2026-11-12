import { useMemo, type FC } from 'react';
import {
    selectChartConfig,
    selectColumnOrder,
    selectMetricQuery,
    selectParameters,
    selectPivotConfig,
    selectSavedChart,
    selectTableName,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import { type ContentStateChangedPayload } from '../../events/types';
import { useEmbedContentStateEvent } from '../../hooks/useEmbedContentStateEvent';

const EmbedExploreContentStateEvent: FC = () => {
    const exploreName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const parameters = useExplorerSelector(selectParameters);
    const chartConfig = useExplorerSelector(selectChartConfig);
    const columnOrder = useExplorerSelector(selectColumnOrder);
    const pivotConfig = useExplorerSelector(selectPivotConfig);
    // Only set when the explorer edits a saved chart in place
    const chartUuid = useExplorerSelector(
        (state) => selectSavedChart(state)?.uuid ?? null,
    );

    const state = useMemo<ContentStateChangedPayload | null>(() => {
        if (!exploreName) return null;
        const explorerState = {
            exploreName,
            metricQuery,
            parameters,
            chartConfig,
            tableConfig: { columnOrder },
            pivotConfig: pivotConfig ?? null,
        };
        return chartUuid
            ? { type: 'chart', chartUuid, ...explorerState }
            : { type: 'explore', ...explorerState };
    }, [
        chartConfig,
        chartUuid,
        columnOrder,
        exploreName,
        metricQuery,
        parameters,
        pivotConfig,
    ]);

    useEmbedContentStateEvent(state);

    return null;
};

export default EmbedExploreContentStateEvent;
