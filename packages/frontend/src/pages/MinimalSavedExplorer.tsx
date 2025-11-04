import { Box, MantineProvider, type MantineThemeOverride } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import {
    createExplorerStore,
    selectSavedChart,
    useExplorerInitialization,
    useExplorerSelector,
} from '../features/explorer/store';
import { useExplorerQuery } from '../hooks/useExplorerQuery';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import { ExplorerSection } from '../providers/Explorer/types';

const themeOverride: MantineThemeOverride = {
    globalStyles: () => ({
        'html, body': {
            backgroundColor: 'white',
        },
    }),
};

const MinimalExplorerContent = memo(() => {
    const { savedQueryUuid } = useParams<{ savedQueryUuid: string }>();
    const { data } = useSavedQuery({ id: savedQueryUuid });

    // Initialize Redux store
    useExplorerInitialization({
        savedChart: data,
        minimal: true,
        expandedSections: [ExplorerSection.VISUALIZATION],
    });

    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects({ minimal: true });

    const { health } = useApp();

    // Get query state from hook
    const { query, queryResults } = useExplorerQuery();

    const resultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
        }),
        [queryResults, query.data],
    );

    // Get savedChart from Redux
    const savedChart = useExplorerSelector(selectSavedChart);

    const isLoadingQueryResults =
        query.isFetching || queryResults.isFetchingRows;

    if (!savedChart || health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            minimal
            chartConfig={savedChart.chartConfig}
            initialPivotDimensions={savedChart.pivotConfig?.columns}
            resultsData={resultsData}
            isLoading={isLoadingQueryResults}
            columnOrder={savedChart.tableConfig.columnOrder}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
            savedChartUuid={savedChart.uuid}
            colorPalette={savedChart.colorPalette}
            parameters={query.data?.usedParametersValues}
        >
            <MantineProvider inherit theme={themeOverride}>
                <Box mih="inherit" h="100%">
                    <LightdashVisualization
                        // get rid of the classNames once you remove analytics providers
                        className="sentry-block ph-no-capture"
                        data-testid="visualization"
                    />
                </Box>
            </MantineProvider>
        </VisualizationProvider>
    );
});

const MinimalSavedExplorer: FC = () => {
    const { savedQueryUuid } = useParams<{
        savedQueryUuid: string;
    }>();

    const { data, isInitialLoading, isError, error } = useSavedQuery({
        id: savedQueryUuid,
    });

    // Create a fresh store instance per chart to prevent state leaking between charts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const store = useMemo(() => createExplorerStore(), [savedQueryUuid]);

    if (isInitialLoading || !data) {
        return null;
    }

    if (isError) {
        return <>{error.error.message}</>;
    }

    return (
        <Provider store={store} key={`minimal-${savedQueryUuid}`}>
            <MantineProvider inherit theme={themeOverride}>
                <MinimalExplorerContent />
            </MantineProvider>
        </Provider>
    );
};

export default MinimalSavedExplorer;
