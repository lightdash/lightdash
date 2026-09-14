import {
    type AiDeepResearchChartData,
    buildDeepResearchVizConfig,
    isApiError,
    isWarehouseResourceLimitError,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { Anchor, Box, Group } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useMemo } from 'react';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useDeepResearchChartLiveQuery } from '../../hooks/useDeepResearch';
import AgentVisualizationFilters from '../ChatElements/AgentVisualizationFilters';
import { AiVisualizationRenderer } from '../ChatElements/AiVisualizationRenderer';
import { shouldDisplayVisualizationFilters } from '../ChatElements/AiVisualizationRenderer.utils';
import styles from './DeepResearchReport.module.css';
import { useDeepResearchOpenInExploreUrl } from './useDeepResearchExploreUrl';

type Props = {
    chartKey: string;
    chart: AiDeepResearchChartData;
    projectUuid: string;
    runUuid: string;
    withExploreLink?: boolean;
};

const getErrorMessage = (error: unknown): string => {
    if (isApiError(error)) return error.error.message;
    if (error instanceof Error) return error.message;
    return '';
};

export const DeepResearchChartTile = ({
    chartKey,
    chart,
    projectUuid,
    runUuid,
    withExploreLink = true,
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

    const visualizationConfig = useMemo<ToolRunQueryArgs>(
        () => buildDeepResearchVizConfig(chart),
        [chart],
    );

    const liveError = liveQuery.error ?? liveResults.error;
    const isResourceLimitError = isWarehouseResourceLimitError(
        getErrorMessage(liveError),
    );
    const isLoadingLive = liveQuery.isFetching || liveResults.isFetchingRows;
    const appliedFilters = chart.metricQuery.filters;
    const displayFilterPills =
        shouldDisplayVisualizationFilters(appliedFilters);
    const openInExploreUrl = useDeepResearchOpenInExploreUrl(
        chart,
        projectUuid,
    );

    return (
        <Box
            component="figure"
            className={styles.chartTile}
            aria-label={chart.title}
        >
            {withExploreLink && openInExploreUrl ? (
                <Group
                    className={styles.chartActions}
                    justify="flex-end"
                    mb="xs"
                >
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
                        message={
                            isResourceLimitError
                                ? 'This chart exceeds the warehouse query limit. Open it in Explore to narrow the query.'
                                : 'The live data for this chart could not be loaded.'
                        }
                        onRetry={
                            isResourceLimitError
                                ? undefined
                                : () => {
                                      void liveQuery.refetch();
                                      if (liveResults.error) {
                                          void liveResults.refetchRows();
                                      }
                                  }
                        }
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
