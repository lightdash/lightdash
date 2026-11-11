import { useMemo, type FC } from 'react';
import {
    selectMetricQuery,
    selectParameters,
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
    // Only set when the explorer edits a saved chart in place
    const chartUuid = useExplorerSelector(
        (state) => selectSavedChart(state)?.uuid ?? null,
    );

    const state = useMemo<ContentStateChangedPayload | null>(() => {
        if (!exploreName) return null;
        return chartUuid
            ? {
                  type: 'chart',
                  chartUuid,
                  exploreName,
                  metricQuery,
                  parameters,
              }
            : { type: 'explore', exploreName, metricQuery, parameters };
    }, [chartUuid, exploreName, metricQuery, parameters]);

    useEmbedContentStateEvent(state);

    return null;
};

export default EmbedExploreContentStateEvent;
