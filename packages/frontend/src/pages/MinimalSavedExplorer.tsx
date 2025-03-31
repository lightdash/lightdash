import { Box, MantineProvider, type MantineThemeOverride } from '@mantine/core';
import { type FC, useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import { useDateZoomGranularitySearch } from '../hooks/useExplorerRoute';
import { useSavedQuery } from '../hooks/useSavedQuery';
import useSearchParams from '../hooks/useSearchParams';
import useApp from '../providers/App/useApp';
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
const MinimalExplorer: FC = () => {
    const { health } = useApp();
    const setFetchAll = useExplorerContext(
        (context) => context.queryResults.setFetchAll,
    );
    const queryResults = useExplorerContext((context) => context.queryResults);
    const resultsData = useMemo(
        () =>
            queryResults.hasFetchedAllRows
                ? {
                      metricQuery: queryResults.metricQuery,
                      cacheMetadata: {
                          cacheHit: false,
                      },
                      rows: queryResults.rows,
                      fields: queryResults.fields,
                  }
                : undefined,
        [queryResults],
    );

    useEffect(() => {
        // TODO: next PR should support pagination for table viz
        // Forcing to fetch all rows for now
        setFetchAll(true);
    }, [setFetchAll]);

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    const isLoadingQueryResults = useExplorerContext(
        (context) =>
            context.query.isFetching || context.queryResults.isFetchingRows,
    );

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
};

const MinimalSavedExplorer: FC = () => {
    const { savedQueryUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();
    const context = useSearchParams('context') || undefined;

    const { data, isInitialLoading, isError, error } = useSavedQuery({
        id: savedQueryUuid,
    });

    const dateZoomGranularity = useDateZoomGranularitySearch();

    if (isInitialLoading) {
        return null;
    }

    if (isError) {
        return <>{error.error.message}</>;
    }

    return (
        <ExplorerProvider
            viewModeQueryArgs={
                savedQueryUuid
                    ? { chartUuid: savedQueryUuid, context }
                    : undefined
            }
            dateZoomGranularity={dateZoomGranularity}
            savedChart={data}
            initialState={
                data
                    ? {
                          shouldFetchResults: true,
                          expandedSections: [ExplorerSection.VISUALIZATION],
                          unsavedChartVersion: {
                              tableName: data.tableName,
                              chartConfig: data.chartConfig,
                              metricQuery: data.metricQuery,
                              tableConfig: data.tableConfig,
                              pivotConfig: data.pivotConfig,
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
                          },
                      }
                    : undefined
            }
        >
            <MantineProvider inherit theme={themeOverride}>
                <MinimalExplorer />
            </MantineProvider>
        </ExplorerProvider>
    );
};

export default MinimalSavedExplorer;
