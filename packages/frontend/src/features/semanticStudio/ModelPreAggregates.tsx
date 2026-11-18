/** A model's pre-aggregates: what each one covers, whether it is built, and how often it answered a query. */
import {
    preAggregateMissReasonLabels,
    type ApiExploreResults,
    type PreAggregateMaterializationSummary,
    type PreAggregateMissReason,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import dayjs from 'dayjs';
import { Fragment, type FC } from 'react';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MaterializationDetailDrawer from '../../components/PreAggregateMaterializations/MaterializationDetailDrawer';
import { useExploreByProjectUuid } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { usePreAggregateMaterializations } from '../../hooks/usePreAggregateMaterializations';
import { useRefreshPreAggregateByDefinitionName } from '../../hooks/usePreAggregateRefresh';
import { usePreAggregateStats } from '../../hooks/usePreAggregateStats';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import { formatDuration, formatFileSize } from '../../utils/formatters';
import { VIEW_PARAM } from './modelCode';
import { PreAggregateSample, UsageByDayChart } from './PreAggregateInsights';
import classes from './PreAggregateInsights.module.css';
import {
    describeRefresh,
    getFieldLabel,
    getPreAggregateQuery,
    getPreAggregateStatus,
    PRE_AGGREGATES_PAGE_SIZE as PAGE_SIZE,
    coversEveryDimension,
    summariseUsage,
    usageByDay,
} from './preAggregateSummary';

const STATS_DAYS = 7;
const MAX_LISTED = 6;

const isMissReason = (reason: string): reason is PreAggregateMissReason =>
    reason in preAggregateMissReasonLabels;

const missReasonLabel = (reason: string) =>
    isMissReason(reason) ? preAggregateMissReasonLabels[reason] : reason;

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
    const [isDetailOpen, detail] = useDisclosure(false);
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
    ].filter((fact): fact is string => fact !== null);
    const dimensions = [
        ...(summary.timeDimension && summary.granularity
            ? [
                  `${getFieldLabel(explore, summary.timeDimension)} (${summary.granularity.toLowerCase()})`,
              ]
            : []),
        ...summary.dimensions.map((reference) =>
            getFieldLabel(explore, reference),
        ),
    ];
    const error = summary.definitionError ?? materialization?.errorMessage;
    const isWhole = coversEveryDimension(explore, summary);
    const refreshRule = describeRefresh(summary);
    const meta = [
        materialization?.materializedAt ? (
            <BuiltAgo key="built" date={materialization.materializedAt} />
        ) : (
            (summary.externalTable ?? 'Not built yet')
        ),
        ...facts,
        `${refreshRule.charAt(0).toLowerCase()}${refreshRule.slice(1)}`,
        ...(hits > 0
            ? [
                  `served ${plural(hits, 'chart query', 'chart queries')} in the last ${STATS_DAYS} days`,
              ]
            : []),
    ];
    return (
        <Paper p="md">
            <MaterializationDetailDrawer
                summary={summary}
                opened={isDetailOpen}
                onClose={detail.close}
                onRefresh={(name) => refresh.mutate(name)}
                isRefreshing={refresh.isLoading || isBuilding}
            />
            <Stack gap="sm">
                <Box>
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
                            <Button
                                size="xs"
                                variant="subtle"
                                color="gray"
                                onClick={detail.open}
                            >
                                Details
                            </Button>
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
                    <Text
                        fz="xs"
                        c="dimmed"
                        title={
                            materialization?.durationMs != null
                                ? `Took ${formatDuration(materialization.durationMs)} to build`
                                : undefined
                        }
                    >
                        {meta.map((fact, index) => (
                            <Fragment key={index}>
                                {index > 0 ? ' · ' : null}
                                {fact}
                            </Fragment>
                        ))}
                    </Text>
                </Box>
                <Box>
                    <Text fz="sm">
                        {summary.metrics
                            .map((reference) =>
                                getFieldLabel(explore, reference),
                            )
                            .join(', ')}
                    </Text>
                    {isWhole ? (
                        <Tooltip
                            label={dimensions.join(', ')}
                            multiline
                            maw={360}
                        >
                            <Text fz="sm" c="dimmed" w="fit-content">
                                by every dimension of the model
                            </Text>
                        </Tooltip>
                    ) : dimensions.length > MAX_LISTED ? (
                        <Text fz="sm" c="dimmed">
                            by {dimensions.slice(0, MAX_LISTED - 1).join(', ')}{' '}
                            <Tooltip
                                label={dimensions
                                    .slice(MAX_LISTED - 1)
                                    .join(', ')}
                                multiline
                                maw={360}
                            >
                                <Text
                                    span
                                    inherit
                                    td="underline"
                                    className={classes.more}
                                >
                                    and {dimensions.length - MAX_LISTED + 1}{' '}
                                    more
                                </Text>
                            </Tooltip>
                        </Text>
                    ) : dimensions.length > 0 ? (
                        <Text fz="sm" c="dimmed">
                            by {dimensions.join(', ')}
                        </Text>
                    ) : null}
                </Box>
                {isWhole ? (
                    <Callout variant="info">
                        This keeps every dimension, so it holds about as many
                        rows as the model. Sums, counts and averages by any
                        dimension are served from it. Distinct counts, medians
                        and table calculations still run on the warehouse.
                    </Callout>
                ) : null}
                {explore && status.label === 'Ready' ? (
                    <PreAggregateSample
                        projectUuid={projectUuid}
                        summary={summary}
                        baseTable={explore.baseTable}
                    />
                ) : null}
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
        .filter(
            (summary) =>
                summary.sourceExploreName === exploreName &&
                // A pre-aggregate removed from the model keeps its last build; hide it.
                (!explore ||
                    (explore.preAggregates ?? []).some(
                        ({ name }) => name === summary.preAggregateName,
                    )),
        );
    const allStats = (stats.data?.pages ?? []).flatMap(
        (page) => page.data.stats,
    );
    const usage = summariseUsage(allStats, exploreName);
    const total = usage.hits + usage.misses;
    const days = usageByDay(
        allStats,
        exploreName,
        dayjs().format('YYYY-MM-DD'),
        STATS_DAYS,
    );
    // One day of queries makes a single bar, which says nothing a sentence does not.
    const activeDays = days.filter((day) => day.hits + day.misses > 0).length;
    return (
        <Stack gap="md">
            {total > 0 ? (
                <Paper p="md">
                    <Group gap="xl" align="flex-start">
                        <Box>
                            <Text fz="xs" c="dimmed">
                                Saved charts and dashboards, last {STATS_DAYS}{' '}
                                days
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
                            {activeDays >= 2 ? (
                                <Box mt="sm">
                                    <UsageByDayChart days={days} />
                                </Box>
                            ) : null}
                        </Box>
                        {usage.topMisses.length > 0 ? (
                            <Box>
                                <Text fz="xs" c="dimmed">
                                    Ran on the warehouse because
                                </Text>
                                {usage.topMisses.map(([reason, count]) => (
                                    <Text key={reason} fz="sm">
                                        {missReasonLabel(reason)}
                                        <Text span inherit c="dimmed">
                                            {' '}
                                            · {count.toLocaleString()}
                                        </Text>
                                    </Text>
                                ))}
                            </Box>
                        ) : null}
                        {usage.missedCharts.length > 0 ? (
                            <Box>
                                <Text fz="xs" c="dimmed">
                                    Charts that ran on the warehouse
                                </Text>
                                {usage.missedCharts.map((chart) => (
                                    <Text key={chart.chartUuid} fz="sm">
                                        <Anchor
                                            href={`/projects/${projectUuid}/saved/${chart.chartUuid}`}
                                            target="_blank"
                                            inherit
                                        >
                                            {chart.chartName}
                                        </Anchor>
                                        <Text span inherit c="dimmed">
                                            {' '}
                                            ·{' '}
                                            {chart.reason
                                                ? `${missReasonLabel(chart.reason)}, `
                                                : ''}
                                            {plural(
                                                chart.count,
                                                'time',
                                                'times',
                                            )}
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
                    <Text fz="sm" c="dimmed" maw={640}>
                        A pre-aggregate is a summary of this model built ahead
                        of time. Queries that fit inside one are answered from
                        it; every other query runs on the warehouse as usual.
                        Add a <code>pre_aggregates</code> block to the model to
                        make one.
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
