/** A model's pre-aggregates: what each one covers, whether it is built, and how often it answered a query. */
import {
    preAggregateMissReasonLabels,
    type ApiExploreResults,
    type PreAggregateMaterializationSummary,
    type PreAggregateMissReason,
} from '@lightdash/common';
import { Badge, Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { useExploreByProjectUuid } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { usePreAggregateMaterializations } from '../../hooks/usePreAggregateMaterializations';
import { useRefreshPreAggregateByDefinitionName } from '../../hooks/usePreAggregateRefresh';
import { usePreAggregateStats } from '../../hooks/usePreAggregateStats';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import { formatDuration, formatFileSize } from '../../utils/formatters';
import { VIEW_PARAM } from './modelCode';
import classes from './ModelPreAggregates.module.css';
import {
    describeRefresh,
    getFieldLabel,
    getPreAggregateQuery,
    getPreAggregateStatus,
    PRE_AGGREGATES_PAGE_SIZE as PAGE_SIZE,
    summariseUsage,
} from './preAggregateSummary';

const STATS_DAYS = 7;

const isMissReason = (reason: string): reason is PreAggregateMissReason =>
    reason in preAggregateMissReasonLabels;

const plural = (count: number, one: string, many: string) =>
    `${count.toLocaleString()} ${count === 1 ? one : many}`;

const exploreHref = (
    projectUuid: string,
    summary: PreAggregateMaterializationSummary,
    baseTable: string,
) => {
    const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
        projectUuid,
        getPreAggregateQuery(summary, baseTable),
    );
    // The link builder keeps this page's own search params, which mean nothing to Explore.
    const params = new URLSearchParams(search);
    params.delete(VIEW_PARAM);
    return `${pathname}?${params.toString()}`;
};

const BuiltAgo: FC<{ date: Date | string }> = ({ date }) => {
    const ago = useTimeAgo(date);
    return <>Built {ago}</>;
};

const PreAggregateCard: FC<{
    projectUuid: string;
    summary: PreAggregateMaterializationSummary;
    explore: ApiExploreResults | undefined;
    hits: number;
}> = ({ projectUuid, summary, explore, hits }) => {
    const refresh = useRefreshPreAggregateByDefinitionName(projectUuid);
    const status = getPreAggregateStatus(summary);
    const { materialization } = summary;
    const isBuilding = materialization?.status === 'in_progress';
    const facts = [
        materialization?.rowCount != null
            ? plural(materialization.rowCount, 'row', 'rows')
            : null,
        materialization?.totalBytes != null
            ? formatFileSize(materialization.totalBytes)
            : null,
        materialization?.durationMs != null
            ? `took ${formatDuration(materialization.durationMs)}`
            : null,
    ].filter((fact): fact is string => fact !== null);
    const dimensions = [
        ...(summary.timeDimension && summary.granularity
            ? [
                  `${getFieldLabel(explore, summary.timeDimension)} by ${summary.granularity.toLowerCase()}`,
              ]
            : []),
        ...summary.dimensions.map((reference) =>
            getFieldLabel(explore, reference),
        ),
    ];
    const error = summary.definitionError ?? materialization?.errorMessage;
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Group gap="xs" wrap="nowrap" miw={0}>
                        <Text fw={500} truncate>
                            {summary.preAggregateName}
                        </Text>
                        <Badge color={status.color} flex="none">
                            {status.label}
                        </Badge>
                    </Group>
                    <Group gap="xs" wrap="nowrap" flex="none">
                        {explore && status.label === 'Ready' ? (
                            <Button
                                component="a"
                                href={exploreHref(
                                    projectUuid,
                                    summary,
                                    explore.baseTable,
                                )}
                                target="_blank"
                                size="xs"
                                variant="subtle"
                                color="gray"
                            >
                                Try in Explore
                            </Button>
                        ) : null}
                        {summary.externalTable ||
                        summary.definitionError ? null : (
                            <Button
                                size="xs"
                                variant="default"
                                flex="none"
                                loading={refresh.isLoading || isBuilding}
                                onClick={() =>
                                    refresh.mutate(summary.preAggregateName)
                                }
                            >
                                {materialization ? 'Rebuild' : 'Build'}
                            </Button>
                        )}
                    </Group>
                </Group>
                <Box className={classes.facts}>
                    <Text fz="xs" c="dimmed">
                        Answers
                    </Text>
                    <Text fz="sm">
                        {summary.metrics
                            .map((reference) =>
                                getFieldLabel(explore, reference),
                            )
                            .join(', ')}
                        {dimensions.length > 0 ? (
                            <Text span inherit c="dimmed">
                                {' '}
                                split by{' '}
                            </Text>
                        ) : null}
                        {dimensions.join(', ')}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Data
                    </Text>
                    <Text fz="sm">
                        {materialization?.materializedAt ? (
                            <BuiltAgo date={materialization.materializedAt} />
                        ) : summary.externalTable ? (
                            summary.externalTable
                        ) : (
                            'Nothing built yet'
                        )}
                        {facts.length > 0 ? (
                            <Text span inherit c="dimmed">
                                {' '}
                                · {facts.join(' · ')}
                            </Text>
                        ) : null}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Refresh
                    </Text>
                    <Text fz="sm">{describeRefresh(summary)}</Text>
                    <Text fz="xs" c="dimmed">
                        Used
                    </Text>
                    <Text fz="sm">
                        {hits > 0
                            ? `Answered ${plural(hits, 'query', 'queries')} in the last ${STATS_DAYS} days`
                            : `No queries answered in the last ${STATS_DAYS} days`}
                    </Text>
                </Box>
                {error ? (
                    <Callout variant="danger" title="This could not be built">
                        {error}
                    </Callout>
                ) : null}
                {summary.warnings.map((warning) => (
                    <Callout key={warning.type} variant="warning">
                        {warning.message}
                    </Callout>
                ))}
            </Stack>
        </Paper>
    );
};

export const ModelPreAggregates: FC<{
    projectUuid: string;
    exploreName: string;
}> = ({ projectUuid, exploreName }) => {
    const materializations = usePreAggregateMaterializations(
        projectUuid,
        PAGE_SIZE,
    );
    const stats = usePreAggregateStats(projectUuid, STATS_DAYS, PAGE_SIZE);
    const { data: explore } = useExploreByProjectUuid(exploreName, projectUuid);
    if (materializations.isInitialLoading) return <EmptyStateLoader />;
    if (materializations.isError) {
        return (
            <InlineErrorState
                message="The pre-aggregates of this model could not be loaded."
                onRetry={() => void materializations.refetch()}
            />
        );
    }
    const summaries = (materializations.data?.pages ?? [])
        .flatMap((page) => page.data.materializations)
        .filter((summary) => summary.sourceExploreName === exploreName);
    const usage = summariseUsage(
        (stats.data?.pages ?? []).flatMap((page) => page.data.stats),
        exploreName,
    );
    const total = usage.hits + usage.misses;
    return (
        <Stack gap="md">
            <Text fz="sm" c="dimmed" maw={640}>
                A pre-aggregate is a summary of this model that is built ahead
                of time. A query that fits inside one is answered from it, and
                every other query runs on the warehouse as usual.
            </Text>
            {total > 0 ? (
                <Paper p="md">
                    <Group gap="xl" align="flex-start">
                        <Box>
                            <Text fz="xs" c="dimmed">
                                Last {STATS_DAYS} days
                            </Text>
                            <Text fz="sm">
                                {plural(usage.hits, 'query', 'queries')} of{' '}
                                {total.toLocaleString()} answered from a
                                pre-aggregate
                                <Text span inherit c="dimmed">
                                    {' '}
                                    ({Math.round((usage.hits / total) * 100)}
                                    %)
                                </Text>
                            </Text>
                        </Box>
                        {usage.topMisses.length > 0 ? (
                            <Box>
                                <Text fz="xs" c="dimmed">
                                    Ran on the warehouse because
                                </Text>
                                {usage.topMisses.map(([reason, count]) => (
                                    <Text key={reason} fz="sm">
                                        {isMissReason(reason)
                                            ? preAggregateMissReasonLabels[
                                                  reason
                                              ]
                                            : reason}
                                        <Text span inherit c="dimmed">
                                            {' '}
                                            · {count.toLocaleString()}
                                        </Text>
                                    </Text>
                                ))}
                            </Box>
                        ) : null}
                    </Group>
                </Paper>
            ) : null}
            {summaries.length === 0 ? (
                <Paper variant="dotted" p="md">
                    <Text fz="sm">This model has no pre-aggregates yet.</Text>
                    <Text fz="sm" c="dimmed">
                        Add a <code>pre_aggregates</code> block to the model to
                        answer its most common queries without the warehouse.
                    </Text>
                </Paper>
            ) : (
                summaries.map((summary) => (
                    <PreAggregateCard
                        key={summary.preAggregateDefinitionUuid}
                        projectUuid={projectUuid}
                        summary={summary}
                        explore={explore}
                        hits={
                            usage.hitsByName.get(summary.preAggregateName) ?? 0
                        }
                    />
                ))
            )}
        </Stack>
    );
};
