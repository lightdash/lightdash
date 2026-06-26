import { type SavedChart } from '@lightdash/common';
import { Box, Center, Loader } from '@mantine-8/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Provider } from 'react-redux';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../../../../components/MetricQueryData/MetricQueryDataProvider';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
} from '../../../../../features/explorer/store';
import { useExplorerQueryEffects } from '../../../../../hooks/useExplorerQueryEffects';
import { useExplorerQueryManager } from '../../../../../hooks/useExplorerQueryManager';
import { useResizeObserver } from '../../../../../hooks/useResizeObserver';
import { ExplorerSection } from '../../../../../providers/Explorer/types';

type Props = {
    projectUuid: string;
    savedChart: SavedChart;
};

const AiSavedChartVisualizationContent: FC<Props> = ({
    projectUuid,
    savedChart,
}) => {
    useExplorerQueryEffects({
        minimal: true,
        projectUuid,
        savedQueryUuid: savedChart.uuid,
    });

    const [measureRef, { width: containerWidth, height: containerHeight }] =
        useResizeObserver<HTMLDivElement>();

    const { query, queryResults, explore } = useExplorerQueryManager({
        projectUuid,
        savedQueryUuid: savedChart.uuid,
    });

    const resultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
            resolvedTimezone: query.data?.resolvedTimezone ?? undefined,
        }),
        [queryResults, query.data],
    );

    const isLoading =
        query.isFetching ||
        queryResults.isFetchingRows ||
        !query.data?.queryUuid ||
        queryResults.queryUuid !== query.data.queryUuid;

    return (
        <MetricQueryDataProvider
            metricQuery={query.data?.metricQuery}
            tableName={savedChart.tableName ?? ''}
            explore={explore}
            queryUuid={query.data?.queryUuid}
            parameters={query.data?.usedParametersValues}
            resolvedTimezone={query.data?.resolvedTimezone}
        >
            <VisualizationProvider
                minimal
                chartConfig={savedChart.chartConfig}
                initialPivotDimensions={savedChart.pivotConfig?.columns}
                resultsData={resultsData}
                isLoading={isLoading}
                columnOrder={savedChart.tableConfig.columnOrder}
                savedChartUuid={savedChart.uuid}
                colorPalette={savedChart.colorPalette}
                parameters={query.data?.usedParametersValues}
                containerWidth={containerWidth}
                containerHeight={containerHeight}
            >
                <Box h="100%" mih="inherit">
                    <LightdashVisualization
                        ref={measureRef}
                        className="sentry-block ph-no-capture"
                        data-testid="ai-saved-chart-visualization"
                    />
                </Box>
            </VisualizationProvider>
        </MetricQueryDataProvider>
    );
};

export const AiSavedChartVisualization: FC<Props> = ({
    projectUuid,
    savedChart,
}) => {
    const [store] = useState(() => createExplorerStore());

    useEffect(() => {
        const initialState = buildInitialExplorerState({
            savedChart,
            minimal: true,
            expandedSections: [ExplorerSection.VISUALIZATION],
        });

        store.dispatch(explorerActions.reset(initialState));
    }, [savedChart, store]);

    if (!savedChart) {
        return (
            <Center h="100%">
                <Loader
                    type="dots"
                    color="gray"
                    delayedMessage="Loading chart..."
                />
            </Center>
        );
    }

    return (
        <Provider store={store} key={`ai-saved-chart-${savedChart.uuid}`}>
            <AiSavedChartVisualizationContent
                projectUuid={projectUuid}
                savedChart={savedChart}
            />
        </Provider>
    );
};
