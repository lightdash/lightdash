import {
    DATA_APP_VIZ_TEMPLATE,
    getAppDisplayName,
    type DataAppActivityEvent,
    type DataAppGenerationUsage,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Group,
    Stack,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import { IconAppWindow, IconPuzzle } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../components/common/ContentTable';
import ErrorState from '../../../components/common/ErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import { useIsTruncated } from '../../../hooks/useIsTruncated/index';
import { useInfiniteDataAppActivity } from '../hooks/useDataAppActivity';
import { useDataAppActivityFilters } from '../hooks/useDataAppActivityFilters';
import { DataAppActivityTopToolbar } from './DataAppActivityTopToolbar';

const STATUS_COLORS: Record<string, string> = {
    ready: 'green',
    error: 'red',
};

const compactTokens = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
});
const exactTokens = new Intl.NumberFormat();

const formatCost = (costUsd: number) =>
    `$${costUsd.toFixed(costUsd < 0.01 ? 4 : 2)}`;

/**
 * Blank rather than zero when nothing was recorded: versions that predate spend
 * tracking, and those that never called the model, are unknown — not free.
 */
const NotRecorded: FC = () => (
    <Text fz="sm" c="ldGray.5">
        -
    </Text>
);

const TokensCell: FC<{ usage: DataAppGenerationUsage | null }> = ({
    usage,
}) => {
    const { t } = useTranslation('queryHistory');
    if (!usage) return <NotRecorded />;
    // Cached tokens dominate an agentic run — every turn re-sends the system
    // prompt and conversation so far, served from Anthropic's cache. Leaving
    // them out understated a generation by ~30x, so the total counts them and
    // the tooltip shows them (read and write combined) to keep it reconcilable.
    const cached = usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
    const total = usage.inputTokens + usage.outputTokens + cached;
    return (
        <Tooltip
            label={
                <Stack gap={2}>
                    <Text fz="xs">
                        {t('dataAppActivity.tokens.input', {
                            value: exactTokens.format(usage.inputTokens),
                        })}
                    </Text>
                    <Text fz="xs">
                        {t('dataAppActivity.tokens.output', {
                            value: exactTokens.format(usage.outputTokens),
                        })}
                    </Text>
                    <Text fz="xs">
                        {t('dataAppActivity.tokens.cached', {
                            value: exactTokens.format(cached),
                        })}
                    </Text>
                    <Text fz="xs">
                        {t('dataAppActivity.tokens.turns', {
                            count: usage.numTurns,
                        })}
                    </Text>
                    <Text fz="xs">
                        {usage.costUsd === null
                            ? t(
                                  'dataAppActivity.tokens.estimatedCostUnavailable',
                              )
                            : t('dataAppActivity.tokens.estimatedCost', {
                                  cost: formatCost(usage.costUsd),
                              })}
                    </Text>
                </Stack>
            }
        >
            <Text fz="sm">{compactTokens.format(total)}</Text>
        </Tooltip>
    );
};

const PromptCell: FC<{ prompt: string }> = ({ prompt }) => {
    const { t } = useTranslation('queryHistory');
    const { ref, isTruncated } = useIsTruncated<HTMLDivElement>();
    const text = prompt.trim();
    if (text === '') {
        return (
            <Text fz="sm" fs="italic" c="dimmed">
                {t('dataAppActivity.noPrompt')}
            </Text>
        );
    }
    return (
        <Tooltip label={text} disabled={!isTruncated} maw={400}>
            <Text ref={ref} fz="sm" truncate>
                {text}
            </Text>
        </Tooltip>
    );
};

export const DataAppActivityTable: FC = () => {
    const { t } = useTranslation('queryHistory');
    const theme = useMantineTheme();
    const filters = useDataAppActivityFilters();

    const {
        data,
        error,
        isError,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteDataAppActivity(filters.apiFilters, {
        keepPreviousData: true,
    });

    const flatData = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    const totalResults =
        data?.pages[data.pages.length - 1]?.pagination?.totalResults ?? 0;

    const { containerRef: tableContainerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: hasNextPage ?? false,
    });

    const columns = useMemo<ContentTableColumnDef<DataAppActivityEvent>[]>(
        () => [
            {
                id: 'createdAt',
                accessorFn: (row) => row.createdAt,
                header: t('dataAppActivity.columns.when'),
                size: 118,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Tooltip
                        label={dayjs(row.original.createdAt).format(
                            'YYYY-MM-DD HH:mm:ss',
                        )}
                    >
                        <Text fz="sm" truncate>
                            {dayjs(row.original.createdAt).format(
                                'MMM D, HH:mm',
                            )}
                        </Text>
                    </Tooltip>
                ),
            },
            {
                id: 'user',
                accessorFn: (row) =>
                    row.user
                        ? `${row.user.firstName} ${row.user.lastName}`
                        : t('dataAppActivity.unknownUser'),
                header: t('dataAppActivity.columns.user'),
                size: 138,
                enableSorting: false,
                Cell: ({ row }) =>
                    row.original.user ? (
                        <Text fz="sm" truncate>
                            {`${row.original.user.firstName} ${row.original.user.lastName}`}
                        </Text>
                    ) : (
                        <Text fz="sm" fs="italic" c="dimmed">
                            {t('dataAppActivity.deletedUser')}
                        </Text>
                    ),
            },
            {
                id: 'app',
                accessorFn: (row) => row.appName,
                header: t('dataAppActivity.columns.name'),
                size: 150,
                enableSorting: false,
                Cell: ({ row }) => {
                    const displayName = getAppDisplayName(
                        row.original.appName,
                        row.original.appUuid,
                    );
                    const isChartType =
                        row.original.template === DATA_APP_VIZ_TEMPLATE;
                    return (
                        <Group gap="xs" wrap="nowrap">
                            <Tooltip
                                label={
                                    isChartType
                                        ? t('dataAppActivity.customChartType')
                                        : t('dataAppActivity.dataApp')
                                }
                            >
                                <MantineIcon
                                    icon={
                                        isChartType ? IconPuzzle : IconAppWindow
                                    }
                                    color="dimmed"
                                    style={{ flex: '0 0 auto' }}
                                />
                            </Tooltip>
                            {row.original.appDeleted ? (
                                // Deleted apps have nothing to open.
                                <Text fz="sm" truncate>
                                    {displayName}
                                </Text>
                            ) : (
                                <Anchor
                                    component={Link}
                                    to={
                                        isChartType
                                            ? `/projects/${row.original.projectUuid}/chart-studio/${row.original.appUuid}`
                                            : `/projects/${row.original.projectUuid}/apps/${row.original.appUuid}`
                                    }
                                    fz="sm"
                                    c="inherit"
                                    underline="hover"
                                    truncate="end"
                                >
                                    {displayName}
                                </Anchor>
                            )}
                            {row.original.appDeleted && (
                                <Badge size="xs" flex="0 0 auto">
                                    {t('dataAppActivity.deleted')}
                                </Badge>
                            )}
                        </Group>
                    );
                },
            },
            {
                id: 'project',
                accessorFn: (row) => row.projectName,
                header: t('dataAppActivity.columns.project'),
                size: 100,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Text fz="sm" truncate>
                        {row.original.projectName}
                    </Text>
                ),
            },
            {
                id: 'version',
                accessorFn: (row) => row.version,
                header: t('dataAppActivity.columns.type'),
                size: 114,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Group gap="xs" wrap="nowrap">
                        <Text fz="sm" truncate>
                            {row.original.version === 1
                                ? t('dataAppActivity.created')
                                : t('dataAppActivity.iteration')}
                        </Text>
                        <Text fz="xs" c="dimmed" ff="monospace" flex="0 0 auto">
                            {`v${row.original.version}`}
                        </Text>
                    </Group>
                ),
            },
            {
                id: 'codingAgentModel',
                accessorFn: (row) => row.codingAgentModel,
                header: t('dataAppActivity.columns.model'),
                size: 140,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Text fz="sm">{row.original.codingAgentModel}</Text>
                ),
            },
            {
                id: 'status',
                accessorFn: (row) => row.status,
                header: t('dataAppActivity.columns.status'),
                size: 112,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Badge
                        size="sm"
                        color={STATUS_COLORS[row.original.status] ?? 'blue'}
                    >
                        {row.original.status}
                    </Badge>
                ),
            },
            {
                id: 'tokens',
                accessorFn: (row) => row.usage?.inputTokens ?? null,
                header: t('dataAppActivity.columns.tokens'),
                size: 80,
                enableSorting: false,
                mantineTableBodyCellProps: { ta: 'right' },
                mantineTableHeadCellProps: { ta: 'right' },
                Cell: ({ row }) => <TokensCell usage={row.original.usage} />,
            },
            {
                id: 'prompt',
                accessorFn: (row) => row.prompt,
                header: t('dataAppActivity.columns.prompt'),
                size: 190,
                grow: true,
                enableSorting: false,
                Cell: ({ row }) => <PromptCell prompt={row.original.prompt} />,
            },
        ],
        [t],
    );

    const table = useContentTable({
        columns,
        data: flatData,
        enableColumnResizing: true,
        enableRowVirtualization: true,
        enablePagination: false,
        enableSorting: false,
        enableTopToolbar: true,
        getRowId: (row) => `${row.appUuid}:${row.version}`,
        state: {
            showProgressBars: false,
            showSkeletons: isInitialLoading,
        },
        rowVirtualizerProps: { estimateSize: () => 72, overscan: 40 },
        // Row metrics copied from the sibling admin tables (agents, threads,
        // memories) so the settings tables stay visually consistent.
        mantineTableBodyCellProps: {
            h: 72,
            style: {
                padding: theme.spacing.md,
                borderRight: 'none',
                borderLeft: 'none',
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                borderTop: 'none',
            },
        },
        emptyState: {
            entityName: t('dataAppActivity.emptyState.entityName'),
            emptyMessage: t('dataAppActivity.emptyState.emptyMessage'),
            filteredMessage: t('dataAppActivity.emptyState.filteredMessage'),
            hasActiveFilters: filters.hasActiveFilters,
            onClearFilters: filters.resetFilters,
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: {
                maxHeight: 'calc(100dvh - 350px)',
                minHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
            },
            onScroll,
        },
        mantineTableProps: {
            highlightOnHover: true,
            withColumnBorders: Boolean(flatData.length),
            sx: {
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        renderTopToolbar: () => (
            <DataAppActivityTopToolbar
                selectedProjectUuids={filters.selectedProjectUuids}
                selectedUserUuids={filters.selectedUserUuids}
                selectedModels={filters.selectedModels}
                selectedPeriod={filters.selectedPeriod}
                selectedKind={filters.selectedKind}
                setSelectedProjectUuids={filters.setSelectedProjectUuids}
                setSelectedUserUuids={filters.setSelectedUserUuids}
                setSelectedModels={filters.setSelectedModels}
                setSelectedPeriod={filters.setSelectedPeriod}
                setSelectedKind={filters.setSelectedKind}
                hasActiveFilters={filters.hasActiveFilters}
                resetFilters={filters.resetFilters}
                totalResults={totalResults}
                currentResultsCount={flatData.length}
                isFetching={isFetching}
                hasNextPage={Boolean(hasNextPage)}
            />
        ),
    });

    // Without this a failed request falls through to the table's empty state,
    // which would claim the org has never generated an app.
    if (isError) {
        return <ErrorState error={error?.error} />;
    }

    return <ContentTable table={table} />;
};
