import {
    AiResultType,
    formatRows,
    type AiDeepResearchChartData,
    type ApiAiAgentThreadMessageVizQuery,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { Badge, Box, Button, Group, Text, Tooltip } from '@mantine-8/core';
import { IconCamera, IconRefresh } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import EmptyStateLoader from '../../../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../../../components/common/InlineErrorState';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useInfiniteQueryResults,
    type InfiniteQueryResults,
} from '../../../../../hooks/useQueryResults';
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

const noop = () => {};
const asyncNoop = async () => {};

export const DeepResearchChartTile = ({
    chartKey,
    chart,
    projectUuid,
    runUuid,
}: Props) => {
    const hasSnapshot = chart.snapshot !== null;
    const canRefresh = chart.source === 'warehouse';
    const [view, setView] = useState<'snapshot' | 'live'>(
        hasSnapshot ? 'snapshot' : 'live',
    );
    const isLive = view === 'live' && canRefresh;

    const liveQuery = useDeepResearchChartLiveQuery({
        projectUuid,
        runUuid,
        chartKey,
        enabled: isLive,
    });
    const liveResults = useInfiniteQueryResults(
        projectUuid,
        isLive ? liveQuery.data?.query.queryUuid : undefined,
        chart.title,
    );

    const snapshotVizQueryData = useMemo<ApiAiAgentThreadMessageVizQuery>(
        () => ({
            type: AiResultType.QUERY_RESULT,
            query: {
                queryUuid: chart.queryUuid ?? chartKey,
                cacheMetadata: { cacheHit: false },
                metricQuery: chart.metricQuery,
                fields: chart.fields,
                warnings: [],
                parameterReferences: [],
                usedParametersValues: {},
                resolvedTimezone: chart.metricQuery.timezone ?? null,
            },
            metadata: { title: chart.title, description: null },
        }),
        [chart, chartKey],
    );
    const snapshotResults = useMemo<InfiniteQueryResults>(() => {
        const snapshot = chart.snapshot;
        const rawRows =
            snapshot?.rows.map((row) =>
                Object.fromEntries(
                    snapshot.columnOrder.map((columnId, index) => [
                        columnId,
                        row[index],
                    ]),
                ),
            ) ?? [];
        return {
            rows: formatRows(rawRows, chart.fields),
            totalResults: snapshot?.rowCount ?? 0,
            isInitialLoading: false,
            isFetchingFirstPage: false,
            isFetchingRows: false,
            isFetchingAllPages: false,
            fetchMoreRows: noop,
            refetchRows: asyncNoop,
            setFetchAll: noop,
            fetchAll: true,
            hasFetchedAllRows: !snapshot?.truncated,
            totalClientFetchTimeMs: undefined,
            error: null,
        };
    }, [chart]);

    const vizQueryData = isLive ? liveQuery.data : snapshotVizQueryData;
    const results = isLive ? liveResults : snapshotResults;

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
    const isLoadingLive =
        isLive && (liveQuery.isLoading || liveResults.isFetchingRows);
    const appliedFilters = chart.metricQuery.filters;
    const displayFilterPills =
        shouldDisplayVisualizationFilters(appliedFilters);
    const snapshotTakenAt = chart.snapshot
        ? new Date(chart.snapshot.takenAt)
        : null;

    return (
        <Box
            component="figure"
            className={styles.chartTile}
            aria-label={chart.title}
        >
            <Group gap="xs" justify="space-between" mb="xs" wrap="wrap">
                <Group gap="xs">
                    {chart.source === 'inline' ? (
                        <Tooltip
                            label="The research agent computed this dataset itself; it is not backed by a single warehouse query."
                            multiline
                            maw={280}
                        >
                            <Badge size="xs" variant="light" color="grape">
                                Agent-computed
                            </Badge>
                        </Tooltip>
                    ) : null}
                    {!isLive && snapshotTakenAt ? (
                        <Group gap={4}>
                            <MantineIcon
                                icon={IconCamera}
                                size={12}
                                color="gray.6"
                            />
                            <Text size="xs" c="dimmed">
                                Snapshot from{' '}
                                {snapshotTakenAt.toLocaleDateString()}
                            </Text>
                        </Group>
                    ) : null}
                    {isLive ? (
                        <Text size="xs" c="dimmed">
                            Live data
                        </Text>
                    ) : null}
                </Group>
                {canRefresh ? (
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="ldGray"
                        leftSection={
                            <MantineIcon
                                icon={isLive ? IconCamera : IconRefresh}
                                size={12}
                            />
                        }
                        onClick={() =>
                            setView(isLive && hasSnapshot ? 'snapshot' : 'live')
                        }
                        disabled={isLive && !hasSnapshot}
                    >
                        {isLive ? 'View snapshot' : 'View live data'}
                    </Button>
                ) : null}
            </Group>
            <Box flex="1" mih={0} miw={0} w="100%">
                {isLive && liveError ? (
                    <InlineErrorState
                        message="The live data for this chart could not be loaded."
                        onRetry={() => {
                            void liveQuery.refetch();
                            if (liveResults.error) {
                                void liveResults.refetchRows();
                            }
                        }}
                    />
                ) : isLoadingLive || !vizQueryData ? (
                    <EmptyStateLoader title="Loading live chart data" />
                ) : (
                    <AiVisualizationRenderer
                        vizQueryData={vizQueryData}
                        results={results}
                        chartConfig={visualizationConfig}
                        selectedChartType={chart.chartConfig.defaultVizType}
                        displayFields={false}
                        displayFilters={false}
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
