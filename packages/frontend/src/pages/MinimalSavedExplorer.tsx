import { MantineProvider, MantineThemeOverride } from '@mantine/core';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import { useDateZoomGranularitySearch } from '../hooks/useExplorerRoute';
import { useQueryResults } from '../hooks/useQueryResults';
import { useSavedQuery } from '../hooks/useSavedQuery';
import { useApp } from '../providers/AppProvider';
import {
    ExplorerProvider,
    ExplorerSection,
    useExplorerContext,
} from '../providers/ExplorerProvider';

const StyledLightdashVisualization = styled(LightdashVisualization)`
    min-height: inherit;
`;
const themeOverride: MantineThemeOverride = {
    globalStyles: () => ({
        'html, body': {
            backgroundColor: 'white',
        },
    }),
};
const MinimalExplorer: FC = () => {
    const { health } = useApp();

    const queryResults = useExplorerContext(
        (context) => context.queryResults.data,
    );

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    const isLoadingQueryResults = useExplorerContext(
        (context) => context.queryResults.isLoading,
    );

    if (!savedChart || health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            minimal
            chartConfig={savedChart.chartConfig}
            initialPivotDimensions={savedChart.pivotConfig?.columns}
            resultsData={queryResults}
            isLoading={isLoadingQueryResults}
            columnOrder={savedChart.tableConfig.columnOrder}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
            savedChartUuid={savedChart.uuid}
            colorPalette={savedChart.colorPalette}
        >
            <MantineProvider inherit theme={themeOverride}>
                <StyledLightdashVisualization
                    // get rid of the classNames once you remove analytics providers
                    className="sentry-block ph-no-capture"
                    data-testid="visualization"
                />
            </MantineProvider>
        </VisualizationProvider>
    );
};

const MinimalSavedExplorer: FC = () => {
    const { savedQueryUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();

    const { data, isInitialLoading, isError, error } = useSavedQuery({
        id: savedQueryUuid,
    });

    const dateZoomGranularity = useDateZoomGranularitySearch();

    const queryResults = useQueryResults({
        chartUuid: savedQueryUuid,
        isViewOnly: true,
        dateZoomGranularity,
    });

    if (isInitialLoading) {
        return null;
    }

    if (isError) {
        return <>{error.error.message}</>;
    }

    return (
        <ExplorerProvider
            queryResults={queryResults}
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
                              additionalMetric: {
                                  isOpen: false,
                              },
                              customDimension: {
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
