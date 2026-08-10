import {
    getGroupByDimensions,
    getWebAiChartConfig,
    type AiDeepResearchChartData,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { Anchor, Box, Group } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { getOpenInExploreUrl } from '../../../../../utils/getOpenInExploreUrl';
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
};

export const DeepResearchChartTile = ({
    chartKey,
    chart,
    projectUuid,
    runUuid,
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
    const openInExploreUrl = useMemo(() => {
        const webChartConfig = getWebAiChartConfig({
            vizConfig: visualizationConfig,
            metricQuery: chart.metricQuery,
            fieldsMap: chart.fields,
            overrideChartType: chart.chartConfig.defaultVizType,
        });
        if (!webChartConfig.echartsConfig) {
            return null;
        }

        const { pathname, search } = getOpenInExploreUrl({
            metricQuery: chart.metricQuery,
            projectUuid,
            columnOrder: [
                ...chart.metricQuery.dimensions,
                ...chart.metricQuery.metrics,
                ...chart.metricQuery.tableCalculations.map(
                    (calculation) => calculation.name,
                ),
            ],
            pivotColumns: getGroupByDimensions(webChartConfig),
            chartConfig: webChartConfig.echartsConfig,
        });
        return `${pathname}?${search}`;
    }, [chart, projectUuid, visualizationConfig]);

    return (
        <Box
            component="figure"
            className={styles.chartTile}
            aria-label={chart.title}
        >
            {openInExploreUrl ? (
                <Group justify="flex-end" mb="xs">
                    <Anchor
                        href={openInExploreUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="xs"
                        fw={500}
                        aria-label={`Open ${chart.title} in Explore`}
                    >
                        <Group component="span" gap={4} wrap="nowrap">
                            Open in Explore
                            <MantineIcon icon={IconExternalLink} size={13} />
                        </Group>
                    </Anchor>
                </Group>
            ) : null}
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
                        loadExplore={false}
                        interactionMode="read-only"
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
