import { FC } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
import { useExplore } from '../hooks/useExplore';
import { useQueryResults } from '../hooks/useQueryResults';
import { useSavedQuery } from '../hooks/useSavedQuery';
import {
    ExplorerProvider,
    ExplorerSection,
    useExplorerContext,
} from '../providers/ExplorerProvider';

const StyledLightdashVisualization = styled(LightdashVisualization)`
    min-height: inherit;
`;

const MinimalExplorer: FC = () => {
    const queryResults = useExplorerContext(
        (context) => context.queryResults.data,
    );

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    const isLoadingQueryResults = useExplorerContext(
        (context) => context.queryResults.isLoading,
    );

    const { data: explore } = useExplore(savedChart?.tableName);

    if (!savedChart) {
        return null;
    }

    return (
        <VisualizationProvider
            minimal
            initialChartConfig={savedChart.chartConfig}
            chartType={savedChart.chartConfig.type}
            initialPivotDimensions={savedChart.pivotConfig?.columns}
            explore={explore}
            resultsData={queryResults}
            isLoading={isLoadingQueryResults}
            columnOrder={savedChart.tableConfig.columnOrder}
        >
            <StyledLightdashVisualization
                // get rid of the classNames once you remove analytics providers
                className="sentry-block fs-block cohere-block"
                data-testid="visualization"
            />
        </VisualizationProvider>
    );
};

const MinimalSavedExplorer: FC = () => {
    const { savedQueryUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();

    const { data, isLoading, isError, error } = useSavedQuery({
        id: savedQueryUuid,
    });
    const queryResults = useQueryResults({
        chartUuid: savedQueryUuid,
        isViewOnly: true,
    });

    if (isLoading) {
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
                      }
                    : undefined
            }
        >
            <MinimalExplorer />
        </ExplorerProvider>
    );
};

export default MinimalSavedExplorer;
