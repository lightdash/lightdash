import { FC } from 'react';
import { useParams } from 'react-router-dom';
import styled from 'styled-components';
import LightdashVisualization from '../components/LightdashVisualization';
import VisualizationProvider from '../components/LightdashVisualization/VisualizationProvider';
// import MetricQueryDataProvider from '../components/MetricQueryData/MetricQueryDataProvider';
import { useExplore } from '../hooks/useExplore';
import { useSavedQuery } from '../hooks/useSavedQuery';
import {
    ExplorerProvider,
    ExplorerSection,
    useExplorerContext,
} from '../providers/ExplorerProvider';

const StyledLightdashVisualization = styled(LightdashVisualization)`
    min-height: inherit;
`;

const MinimalExplorer: FC = ({}) => {
    // const unsavedChartVersionTableName = useExplorerContext(
    //     (context) => context.state.unsavedChartVersion.tableName,
    // );
    // const unsavedChartVersionMetricQuery = useExplorerContext(
    //     (context) => context.state.unsavedChartVersion.metricQuery,
    // );

    // const unsavedChartVersion = useExplorerContext(
    //     (context) => context.state.unsavedChartVersion,
    // );

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

    console.log(explore, savedChart);

    return (
        // <MetricQueryDataProvider
        //     metricQuery={unsavedChartVersionMetricQuery}
        //     tableName={unsavedChartVersionTableName}
        // >
        <VisualizationProvider
            isMinimal
            initialChartConfig={savedChart.chartConfig}
            chartType={savedChart.chartConfig.type}
            initialPivotDimensions={savedChart.pivotConfig?.columns}
            explore={explore}
            resultsData={queryResults}
            isLoading={isLoadingQueryResults}
            columnOrder={savedChart.tableConfig.columnOrder}
        >
            <StyledLightdashVisualization
                className="sentry-block fs-block cohere-block"
                data-testid="visualization"
            />
        </VisualizationProvider>
        // </MetricQueryDataProvider>
    );
};

const MinimalSavedExplorer = () => {
    const { savedQueryUuid } = useParams<{
        savedQueryUuid: string;
        projectUuid: string;
    }>();

    const { data, isLoading, error } = useSavedQuery({ id: savedQueryUuid });

    if (isLoading) {
        return null;
    }

    if (error) {
        return <>{error.error}</>;
    }

    return (
        <ExplorerProvider
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
