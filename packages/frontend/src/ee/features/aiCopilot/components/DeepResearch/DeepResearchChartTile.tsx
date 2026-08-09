import {
    type AiDeepResearchChartData,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { Box, Group, Text } from '@mantine/core';
import { useMemo } from 'react';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useDeepResearchChartLiveQuery } from '../../hooks/useDeepResearch';
import AgentVisualizationFilters from '../ChatElements/AgentVisualizationFilters';
import { AiVisualizationRenderer } from '../ChatElements/AiVisualizationRenderer';
import { shouldDisplayVisualizationFilters } from '../ChatElements/AiVisualizationRenderer.utils';
import styles from './DeepResearchReport.module.css';

type Props = {
    chartKey: string;
    chart: AiDeepResearchChartData;
    projectUuid: string;
    runUuid: string;
    reportRunAt: string;
};

export const DeepResearchChartTile = ({
    chartKey,
    chart,
    projectUuid,
    runUuid,
    reportRunAt,
}: Props) => {
    const liveQuery = useDeepResearchChartLiveQuery({
        projectUuid,
        runUuid,
        chartKey,
    });
    const liveResults = useInfiniteQueryResults(
        projectUuid,
        liveQuery.data?.query.queryUuid,
        chart.title,
    );

    const visualizationConfig = useMemo<ToolRunQueryArgs>(() => {
        const metricQuery = chart.metricQuery;
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
    }, [chart]);

    const liveError = liveQuery.error ?? liveResults.error;
    const isLoadingLive = liveQuery.isFetching || liveResults.isFetchingRows;
    const appliedFilters = chart.metricQuery.filters;
    const displayFilterPills =
        shouldDisplayVisualizationFilters(appliedFilters);
    const reportRunDate = new Date(reportRunAt).toLocaleDateString();

    return (
        <Box
            component="figure"
            className={styles.chartTile}
            aria-label={chart.title}
        >
            <Group gap="xs" justify="space-between" mb="xs" wrap="wrap">
                <Text size="xs" c="dimmed">
                    Report data as of {reportRunDate}; chart shows live data
                </Text>
            </Group>
            <Box>
                {liveError ? (
                    <InlineErrorState
                        message="The live data for this chart could not be loaded."
                        onRetry={() => {
                            void liveQuery.refetch();
                            if (liveResults.error) {
                                void liveResults.refetchRows();
                            }
                        }}
                    />
                ) : isLoadingLive || !liveQuery.data ? (
                    <EmptyStateLoader title="Loading live chart data" />
                ) : (
                    <AiVisualizationRenderer
                        vizQueryData={liveQuery.data}
                        results={liveResults}
                        chartConfig={visualizationConfig}
                        selectedChartType={chart.chartConfig.defaultVizType}
                        displayFields={false}
                        displayFilters={false}
                        loadExplore={chart.source === 'warehouse'}
                        headerContent={
                            displayFilterPills ? (
                                <AgentVisualizationFilters
                                    compact
                                    filters={appliedFilters}
                                    fieldsMap={chart.fields}
                                />
                            ) : undefined
                        }
                    />
                )}
            </Box>
        </Box>
    );
};
