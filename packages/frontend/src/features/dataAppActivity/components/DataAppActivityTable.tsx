import {
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
} from '@mantine-8/core';
import dayjs from 'dayjs';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    type FC,
    type UIEvent,
} from 'react';
import { Link } from 'react-router';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../components/common/ContentTable';
import ErrorState from '../../../components/common/ErrorState';
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
    if (!usage) return <NotRecorded />;
    // Cached tokens dominate an agentic run — every turn re-sends the system
    // prompt and conversation so far, served from Anthropic's cache. Leaving
    // them out understated a generation by ~30x, so the total counts them and
    // the tooltip shows them (read and write combined) to keep it reconcilable.
    const cached = usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
    const total = usage.inputTokens + usage.outputTokens + cached;
    return (
        <Tooltip
            withinPortal
            label={
                <Stack gap={2}>
                    <Text fz="xs">{`Input: ${exactTokens.format(usage.inputTokens)}`}</Text>
                    <Text fz="xs">{`Output: ${exactTokens.format(usage.outputTokens)}`}</Text>
                    <Text fz="xs">{`Cached: ${exactTokens.format(cached)}`}</Text>
                    <Text fz="xs">{`${usage.numTurns} turns`}</Text>
                    <Text fz="xs">{`Estimated cost: ${formatCost(
                        usage.costUsd,
                    )}`}</Text>
                </Stack>
            }
        >
            <Text fz="sm" c="ldGray.9">
                {compactTokens.format(total)}
            </Text>
        </Tooltip>
    );
};

const PromptCell: FC<{ prompt: string }> = ({ prompt }) => {
    const { ref, isTruncated } = useIsTruncated<HTMLDivElement>();
    const text = prompt.trim();
    if (text === '') {
        return (
            <Text fz="sm" fs="italic" c="ldGray.6">
                No prompt
            </Text>
        );
    }
    return (
        <Tooltip
            withinPortal
            label={text}
            disabled={!isTruncated}
            multiline
            maw={400}
        >
            <Text ref={ref} fz="sm" c="ldGray.9" truncate>
                {text}
            </Text>
        </Tooltip>
    );
};

export const DataAppActivityTable: FC = () => {
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

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (!containerRefElement) return;
            const { scrollHeight, scrollTop, clientHeight } =
                containerRefElement;
            if (
                scrollHeight - scrollTop - clientHeight < 200 &&
                !isFetching &&
                hasNextPage
            ) {
                void fetchNextPage();
            }
        },
        [fetchNextPage, isFetching, hasNextPage],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(tableContainerRef.current);
    }, [fetchMoreOnBottomReached]);

    const columns = useMemo<ContentTableColumnDef<DataAppActivityEvent>[]>(
        () => [
            {
                id: 'createdAt',
                accessorFn: (row) => row.createdAt,
                header: 'When',
                size: 118,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Tooltip
                        withinPortal
                        label={dayjs(row.original.createdAt).format(
                            'YYYY-MM-DD HH:mm:ss',
                        )}
                    >
                        <Text fz="sm" c="ldGray.9" truncate>
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
                        : 'Unknown user',
                header: 'User',
                size: 138,
                enableSorting: false,
                Cell: ({ row }) =>
                    row.original.user ? (
                        <Text fz="sm" c="ldGray.9" truncate>
                            {`${row.original.user.firstName} ${row.original.user.lastName}`}
                        </Text>
                    ) : (
                        <Text fz="sm" fs="italic" c="ldGray.6">
                            Deleted user
                        </Text>
                    ),
            },
            {
                id: 'app',
                accessorFn: (row) => row.appName,
                header: 'Name',
                size: 150,
                enableSorting: false,
                Cell: ({ row }) => {
                    const displayName = getAppDisplayName(
                        row.original.appName,
                        row.original.appUuid,
                    );
                    return (
                        <Group gap="xs" wrap="nowrap">
                            {row.original.appDeleted ? (
                                // Deleted apps have nothing to open.
                                <Text fz="sm" c="ldGray.9" truncate>
                                    {displayName}
                                </Text>
                            ) : (
                                <Anchor
                                    component={Link}
                                    to={`/projects/${row.original.projectUuid}/apps/${row.original.appUuid}`}
                                    fz="sm"
                                    c="inherit"
                                    underline="hover"
                                    truncate="end"
                                >
                                    {displayName}
                                </Anchor>
                            )}
                            {row.original.appDeleted && (
                                <Badge
                                    size="xs"
                                    variant="light"
                                    color="gray"
                                    flex="0 0 auto"
                                >
                                    Deleted
                                </Badge>
                            )}
                        </Group>
                    );
                },
            },
            {
                id: 'project',
                accessorFn: (row) => row.projectName,
                header: 'Project',
                size: 100,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.9" truncate>
                        {row.original.projectName}
                    </Text>
                ),
            },
            {
                id: 'version',
                accessorFn: (row) => row.version,
                header: 'Type',
                size: 114,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Group gap="xs" wrap="nowrap">
                        <Text fz="sm" c="ldGray.9" truncate>
                            {row.original.version === 1
                                ? 'Created'
                                : 'Iteration'}
                        </Text>
                        <Text
                            fz="xs"
                            c="ldGray.6"
                            ff="monospace"
                            flex="0 0 auto"
                        >
                            {`v${row.original.version}`}
                        </Text>
                    </Group>
                ),
            },
            {
                id: 'claudeModel',
                accessorFn: (row) => row.claudeModel,
                header: 'Model',
                size: 78,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Text fz="sm" c="ldGray.9">
                        {row.original.claudeModel}
                    </Text>
                ),
            },
            {
                id: 'status',
                accessorFn: (row) => row.status,
                header: 'Status',
                size: 112,
                enableSorting: false,
                Cell: ({ row }) => (
                    <Badge
                        size="sm"
                        variant="light"
                        color={STATUS_COLORS[row.original.status] ?? 'blue'}
                    >
                        {row.original.status}
                    </Badge>
                ),
            },
            {
                id: 'tokens',
                accessorFn: (row) => row.usage?.inputTokens ?? null,
                header: 'Tokens',
                size: 80,
                enableSorting: false,
                mantineTableBodyCellProps: { ta: 'right' },
                mantineTableHeadCellProps: { ta: 'right' },
                Cell: ({ row }) => <TokensCell usage={row.original.usage} />,
            },
            {
                id: 'prompt',
                accessorFn: (row) => row.prompt,
                header: 'Prompt',
                size: 190,
                grow: true,
                enableSorting: false,
                Cell: ({ row }) => <PromptCell prompt={row.original.prompt} />,
            },
        ],
        [],
    );

    const table = useContentTable({
        columns,
        data: flatData,
        enableColumnResizing: true,
        enableRowNumbers: false,
        enableRowVirtualization: true,
        enablePagination: false,
        enableFilters: false,
        enableFullScreenToggle: false,
        enableDensityToggle: false,
        enableColumnActions: false,
        enableColumnFilters: false,
        enableHiding: false,
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
            entityName: 'generations',
            emptyMessage: 'No data apps have been generated yet.',
            filteredMessage: 'No generations match these filters.',
            hasActiveFilters: filters.hasActiveFilters,
            onClearFilters: filters.resetFilters,
        },
        mantinePaperProps: {
            shadow: undefined,
            sx: {
                border: `1px solid ${theme.colors.ldGray[2]}`,
                borderRadius: theme.spacing.sm,
                boxShadow: theme.shadows.subtle,
                display: 'flex',
                flexDirection: 'column',
            },
        },
        mantineTableContainerProps: {
            ref: tableContainerRef,
            sx: {
                maxHeight: 'calc(100dvh - 350px)',
                minHeight: '600px',
                display: 'flex',
                flexDirection: 'column',
            },
            onScroll: (event: UIEvent<HTMLDivElement>) =>
                fetchMoreOnBottomReached(event.target as HTMLDivElement),
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
                setSelectedProjectUuids={filters.setSelectedProjectUuids}
                setSelectedUserUuids={filters.setSelectedUserUuids}
                setSelectedModels={filters.setSelectedModels}
                setSelectedPeriod={filters.setSelectedPeriod}
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
