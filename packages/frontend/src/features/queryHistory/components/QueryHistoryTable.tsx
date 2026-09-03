import {
    QueryHistorySortBy,
    QueryHistoryStatus,
    QueryLanguage,
    type QueryHistoryCounts,
    type QueryHistoryListItem,
    type QueryHistoryWindow,
} from '@lightdash/common'; // pragma: allowlist secret
import { Badge, Group, Text, UnstyledButton } from '@mantine/core';
import { type FC, useMemo } from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
} from '../../../components/common/ContentTable';
import contentTableClasses from '../../../components/common/ContentTable/ContentTable.module.css';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import styles from '../QueryHistory.module.css';
import {
    formatRowCount,
    formatRunTime,
    formatWhen,
    getTriggerLabel,
    getWindowLabel,
    getWindowRangeLabel,
} from '../utils/format';
import {
    QUERY_HISTORY_WINDOW_PAGE_SIZE,
    type QueryHistoryTableRow,
} from '../utils/tableRows';
import { QueryHistoryQueryCell } from './QueryHistoryQueryCell';

type Props = {
    data: QueryHistoryTableRow[];
    compact: boolean;
    selectedQueryUuid: string | undefined;
    counts: QueryHistoryCounts | undefined;
    sorting: ContentTableSortingState;
    onSortingChange: (sorting: ContentTableSortingState) => void;
    isLoading: boolean;
    isFetching: boolean;
    hasNextPage: boolean;
    fetchNextPage: () => void;
    search: string;
    onSelect: (item: QueryHistoryListItem) => void;
    onToggleWindow: (window: QueryHistoryWindow) => void;
    onShowMore: (window: QueryHistoryWindow) => void;
    onClearFilters: () => void;
    hasActiveFilters: boolean;
};

const isRuntimeSort = (sorting: ContentTableSortingState) =>
    sorting[0]?.id === QueryHistorySortBy.RUNTIME;

export const QueryHistoryTable: FC<Props> = ({
    data,
    compact,
    selectedQueryUuid,
    counts,
    sorting,
    onSortingChange,
    isLoading,
    isFetching,
    hasNextPage,
    fetchNextPage,
    search,
    onSelect,
    onToggleWindow,
    onShowMore,
    onClearFilters,
    hasActiveFilters,
}) => {
    const isFlatSort = isRuntimeSort(sorting);
    const { containerRef, onScroll } = useInfiniteScroll({
        fetchNextPage,
        isFetching,
        hasMore: isFlatSort && hasNextPage,
    });

    const columns = useMemo<ContentTableColumnDef<QueryHistoryTableRow>[]>(
        () => [
            {
                id: 'query',
                accessorFn: (row) =>
                    row.kind === 'query' ? row.item.title : '',
                header: 'Query',
                enableSorting: false,
                size: 420,
                Cell: ({ row }) => {
                    const original = row.original;
                    if (original.kind === 'window') {
                        const windowCount = counts?.windows[original.window];
                        return (
                            <Group gap="xs" wrap="nowrap">
                                <Text fw={600} fz="sm" truncate>
                                    {getWindowLabel(original.window)}
                                </Text>
                                {windowCount !== undefined ? (
                                    <Text
                                        c="dimmed"
                                        fz="sm"
                                        className="ld-nowrap"
                                    >
                                        {`· ${windowCount.toLocaleString()} ${
                                            windowCount === 1 ? 'run' : 'runs'
                                        }`}
                                    </Text>
                                ) : null}
                            </Group>
                        );
                    }
                    if (original.kind === 'showMore') {
                        const nextCount = Math.min(
                            original.remaining,
                            QUERY_HISTORY_WINDOW_PAGE_SIZE,
                        );
                        return (
                            <UnstyledButton
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onShowMore(original.window);
                                }}
                                disabled={original.isFetching}
                            >
                                <Text fz="sm" c="dimmed" fw={500}>
                                    {original.isFetching
                                        ? 'Loading…'
                                        : `Show ${nextCount} more from this window`}
                                </Text>
                            </UnstyledButton>
                        );
                    }
                    return <QueryHistoryQueryCell item={original.item} />;
                },
            },
            {
                id: 'language',
                accessorFn: (row) =>
                    row.kind === 'query' ? row.item.language : '',
                header: 'Language',
                enableSorting: false,
                size: 110,
                Cell: ({ row }) => {
                    if (row.original.kind !== 'query') return null;
                    const { language } = row.original.item;
                    return (
                        <Badge size="xs" tt="uppercase">
                            {language === QueryLanguage.SQL
                                ? 'SQL'
                                : 'Semantic'}
                        </Badge>
                    );
                },
            },
            {
                id: 'trigger',
                accessorFn: (row) =>
                    row.kind === 'query' ? row.item.trigger : '',
                header: 'Trigger',
                enableSorting: false,
                size: 120,
                Cell: ({ row }) => {
                    if (row.original.kind !== 'query') return null;
                    return (
                        <Text fz="sm" c="dimmed">
                            {getTriggerLabel(row.original.item.trigger)}
                        </Text>
                    );
                },
            },
            {
                id: QueryHistorySortBy.RUNTIME,
                accessorFn: (row) =>
                    row.kind === 'query'
                        ? row.item.warehouseExecutionTimeMs
                        : null,
                header: 'Run time',
                enableSorting: true,
                size: 110,
                mantineTableHeadCellProps: { ta: 'right' },
                mantineTableBodyCellProps: { ta: 'right' },
                Cell: ({ row }) => {
                    if (row.original.kind !== 'query') return null;
                    const { warehouseExecutionTimeMs, status } =
                        row.original.item;
                    const muted =
                        status === QueryHistoryStatus.ERROR ||
                        status === QueryHistoryStatus.PENDING ||
                        status === QueryHistoryStatus.QUEUED ||
                        status === QueryHistoryStatus.EXECUTING;
                    return (
                        <Text
                            fz="sm"
                            ff="monospace"
                            c={muted ? 'dimmed' : undefined}
                        >
                            {formatRunTime(warehouseExecutionTimeMs)}
                        </Text>
                    );
                },
            },
            {
                id: 'rows',
                accessorFn: (row) =>
                    row.kind === 'query' ? row.item.totalRowCount : null,
                header: 'Rows',
                enableSorting: false,
                size: 90,
                mantineTableHeadCellProps: { ta: 'right' },
                mantineTableBodyCellProps: { ta: 'right' },
                Cell: ({ row }) => {
                    if (row.original.kind !== 'query') return null;
                    return (
                        <Text
                            fz="sm"
                            ff="monospace"
                            c={
                                row.original.item.totalRowCount === null
                                    ? 'dimmed'
                                    : undefined
                            }
                        >
                            {formatRowCount(row.original.item.totalRowCount)}
                        </Text>
                    );
                },
            },
            {
                id: QueryHistorySortBy.CREATED_AT,
                accessorFn: (row) =>
                    row.kind === 'query'
                        ? row.item.createdAt
                        : row.kind === 'window'
                          ? getWindowRangeLabel(row.window)
                          : '',
                header: 'When',
                enableSorting: true,
                size: 120,
                mantineTableHeadCellProps: { ta: 'right' },
                mantineTableBodyCellProps: { ta: 'right' },
                Cell: ({ row }) => {
                    if (row.original.kind === 'window') {
                        return (
                            <Text fz="xs" c="dimmed">
                                {getWindowRangeLabel(row.original.window)}
                            </Text>
                        );
                    }
                    if (row.original.kind !== 'query') return null;
                    return (
                        <Text fz="sm" c="dimmed" className="ld-nowrap">
                            {formatWhen(row.original.item.createdAt)}
                        </Text>
                    );
                },
            },
        ],
        [counts, onShowMore],
    );

    const table = useContentTable({
        columns,
        data,
        getRowId: (row) => row.id,
        enableSorting: true,
        enableMultiSort: false,
        manualSorting: true,
        enablePagination: false,
        enableTopToolbar: false,
        enableBottomToolbar: isFlatSort,
        enableColumnResizing: false,
        enableStickyHeader: true,
        enableRowVirtualization: isFlatSort,
        rowVirtualizerProps: { estimateSize: () => 64, overscan: 20 },
        onSortingChange: (updater) => {
            const next =
                typeof updater === 'function' ? updater(sorting) : updater;
            if (next.length === 0) {
                onSortingChange([
                    { id: QueryHistorySortBy.CREATED_AT, desc: true },
                ]);
                return;
            }
            onSortingChange([next[0]]);
        },
        state: {
            sorting,
            showSkeletons: isLoading,
            showProgressBars: isFetching && !isLoading,
            columnVisibility: {
                trigger: !compact,
                rows: !compact,
            },
        },
        emptyState: {
            entityName: 'queries',
            emptyMessage: 'No queries match these filters.',
            filteredMessage: 'No queries match these filters.',
            search,
            hasActiveFilters,
            onClearFilters,
        },
        mantinePaperProps: {
            className: styles.tablePaper,
        },
        mantineTableContainerProps: {
            ref: containerRef,
            onScroll: isFlatSort ? onScroll : undefined,
            className: styles.tableContainer,
        },
        mantineTableProps: {
            highlightOnHover: true,
        },
        mantineTableBodyRowProps: ({ row }) => {
            const original = row.original;
            if (original.kind === 'window') {
                return {
                    className: styles.windowRow,
                    onClick: () => onToggleWindow(original.window),
                };
            }
            if (original.kind === 'showMore') {
                return { className: styles.showMoreRow };
            }
            return {
                className:
                    original.item.queryUuid === selectedQueryUuid
                        ? contentTableClasses.rowSelected
                        : undefined,
                onClick: () => onSelect(original.item),
            };
        },
        renderBottomToolbar: () =>
            isFlatSort ? (
                <Group px="md" py="sm">
                    <Text fz="xs" c="dimmed">
                        {isFetching
                            ? 'Loading more…'
                            : hasNextPage
                              ? 'Scroll for more results'
                              : 'All results loaded'}
                    </Text>
                </Group>
            ) : null,
    });

    return <ContentTable table={table} />;
};
