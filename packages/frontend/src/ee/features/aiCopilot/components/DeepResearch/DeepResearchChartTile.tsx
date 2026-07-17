import {
    type AiDeepResearchChartBlock,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { Box } from '@mantine-8/core';
import { useMemo } from 'react';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useDeepResearchChartVizQuery } from '../../hooks/useDeepResearch';
import AgentVisualizationFilters from '../ChatElements/AgentVisualizationFilters';
import { AiVisualizationRenderer } from '../ChatElements/AiVisualizationRenderer';
import { shouldDisplayVisualizationFilters } from '../ChatElements/AiVisualizationRenderer.utils';
import styles from './DeepResearchReport.module.css';

type Props = {
    chart: AiDeepResearchChartBlock;
    projectUuid: string;
    runUuid: string;
};

export const DeepResearchChartTile = ({
    chart,
    projectUuid,
    runUuid,
}: Props) => {
    const query = useDeepResearchChartVizQuery({
        projectUuid,
        runUuid,
        queryUuid: chart.queryUuid,
    });
    const queryResults = useInfiniteQueryResults(
        projectUuid,
        query.data?.query.queryUuid,
        chart.title,
    );
    const visualizationConfig = useMemo<ToolRunQueryArgs | null>(() => {
        if (!query.data) {
            return null;
        }

        const metricQuery = query.data.query.metricQuery;
        return {
            title: chart.title,
            description: '',
            queryConfig: {
                exploreName: metricQuery.exploreName,
                dimensions: metricQuery.dimensions,
                metrics: metricQuery.metrics,
                sorts: metricQuery.sorts.map((sort) => ({
                    ...sort,
                    nullsFirst: sort.nullsFirst ?? null,
                })),
                limit: metricQuery.limit,
                customMetrics: null,
                tableCalculations: null,
                filters: null,
            },
            chartConfig: chart.chartConfig,
        };
    }, [chart, query.data]);
    const isLoading = query.isLoading || queryResults.isFetchingRows;
    const appliedFilters = query.data?.query.metricQuery.filters;
    const displayFilterPills =
        appliedFilters && shouldDisplayVisualizationFilters(appliedFilters);

    return (
        <Box
            component="figure"
            className={styles.chartTile}
            aria-label={chart.title}
        >
            {isLoading ? (
                <EmptyStateLoader title="Loading evidence chart" />
            ) : query.isError || queryResults.error || !visualizationConfig ? (
                <InlineErrorState
                    message="This evidence chart could not be loaded."
                    onRetry={() => {
                        void query.refetch();
                        if (queryResults.error) {
                            void queryResults.refetchRows();
                        }
                    }}
                />
            ) : (
                <AiVisualizationRenderer
                    vizQueryData={query.data}
                    results={queryResults}
                    chartConfig={visualizationConfig}
                    selectedChartType={chart.chartConfig.defaultVizType}
                    displayFields={false}
                    displayFilters={false}
                    headerContent={
                        displayFilterPills && query.data ? (
                            <AgentVisualizationFilters
                                compact
                                filters={appliedFilters}
                                fieldsMap={query.data.query.fields}
                            />
                        ) : undefined
                    }
                />
            )}
        </Box>
    );
};
