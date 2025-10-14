import { Box, MantineProvider, type MantineThemeOverride } from '@mantine/core';
import { memo, useMemo, type FC } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import { explorerStore } from '../features/explorer/store';
import { useExplorerQuery } from '../hooks/useExplorerQuery';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useApp from '../providers/App/useApp';
import { defaultQueryExecution } from '../providers/Explorer/defaultState';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import { ExplorerSection } from '../providers/Explorer/types';
import useExplorerContext from '../providers/Explorer/useExplorerContext';

const themeOverride: MantineThemeOverride = {
    globalStyles: () => ({
        'html, body': {
            backgroundColor: 'white',
        },
    }),
};

const MinimalExplorerContent = memo(() => {
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

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

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

    if (isInitialLoading) {
        return null;
    }

    if (isError) {
        return <>{error.error.message}</>;
    }

    return (
        <Provider store={explorerStore}>
            <ExplorerProvider
                savedChart={data}
                initialState={
                    data
                        ? {
                              parameterReferences: Object.keys(
                                  data.parameters ?? {},
                              ),
                              parameterDefinitions: {},
                              expandedSections: [ExplorerSection.VISUALIZATION],
                              unsavedChartVersion: {
                                  tableName: data.tableName,
                                  chartConfig: data.chartConfig,
                                  metricQuery: data.metricQuery,
                                  tableConfig: data.tableConfig,
                                  pivotConfig: data.pivotConfig,
                                  parameters: data.parameters,
                              },
                              modals: {
                                  format: {
                                      isOpen: false,
                                  },
                                  additionalMetric: {
                                      isOpen: false,
                                  },
                                  customDimension: {
                                      isOpen: false,
                                  },
                                  writeBack: {
                                      isOpen: false,
                                  },
                                  itemDetail: {
                                      isOpen: false,
                                  },
                              },
                              queryExecution: defaultQueryExecution,
                          }
                        : undefined
                }
            >
                <MantineProvider inherit theme={themeOverride}>
                    <MinimalExplorerContent />
                </MantineProvider>
            </ExplorerProvider>
        </Provider>
    );
};

export default MinimalSavedExplorer;
