import {
    QueryHistorySortBy,
    QueryHistoryStatus,
    type QueryHistoryCounts,
    type QueryHistoryListItem,
    type QueryHistoryWindow,
} from '@lightdash/common';
import { Badge, Button, Group, Text } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { type FC, type ReactNode, useMemo } from 'react';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
    type ContentTableSortingState,
} from '../../../components/common/ContentTable';
import contentTableClasses from '../../../components/common/ContentTable/ContentTable.module.css';
import MantineIcon from '../../../components/common/MantineIcon';
import { useInfiniteScroll } from '../../../hooks/useInfiniteScroll';
import styles from '../QueryHistory.module.css';
import {
    formatRowCount,
    formatRunTime,
    formatWhen,
    getLanguageLabel,
    getTriggerLabel,
    getWindowLabel,
    getWindowRangeLabel,
    isRunningStatus,
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
    expandedWindows: ReadonlySet<QueryHistoryWindow>;
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
    topToolbar: ReactNode;
};

const isRuntimeSort = (sorting: ContentTableSortingState) =>
    sorting[0]?.id === QueryHistorySortBy.RUNTIME;

const ROW_HEIGHT_ESTIMATE = 52;

export const QueryHistoryTable: FC<Props> = ({
    data,
    compact,
    selectedQueryUuid,
    counts,
    expandedWindows,
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
    topToolbar,
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
                size: 380,
                Cell: ({ row }) => {
                    const original = row.original;
                    if (original.kind === 'window') {
                        const windowCount = counts?.windows[original.window];
                        const isExpanded = expandedWindows.has(original.window);
                        return (
                            <Group gap="xs" wrap="nowrap">
                                <MantineIcon
                                    icon={
                                        isExpanded
                                            ? IconChevronDown
                                            : IconChevronRight
                                    }
                                    size="sm"
                                    color="dimmed"
                                />
                                <Text fz="xs" fw={500} truncate>
                                    {getWindowLabel(original.window)}
                                </Text>
                                {windowCount !== undefined ? (
                                    <Text
                                        fz="xs"
                                        c="dimmed"
                                        className="ld-nowrap"
                                    >
                                        {`${windowCount.toLocaleString()} ${
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
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                loading={original.isFetching}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onShowMore(original.window);
                                }}
                            >
                                {`Show ${nextCount} more`}
                            </Button>
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
                size: 100,
                Cell: ({ row }) => {
                    if (row.original.kind !== 'query') return null;
                    return (
                        <Badge size="xs">
                            {getLanguageLabel(row.original.item.language)}
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
                size: 110,
                Cell: ({ row }) => {
                    if (row.original.kind !== 'query') return null;
                    return (
                        <Text c="dimmed">
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
                        isRunningStatus(status);
                    return (
                        <Text
                            fz="xs"
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
                    const { totalRowCount } = row.original.item;
                    return (
                        <Text
                            fz="xs"
                            ff="monospace"
                            c={totalRowCount === null ? 'dimmed' : undefined}
                        >
                            {formatRowCount(totalRowCount)}
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
                size: 140,
                mantineTableHeadCellProps: { ta: 'right' },
                mantineTableBodyCellProps: { ta: 'right' },
                Cell: ({ row }) => {
                    if (row.original.kind === 'window') {
                        return (
                            <Text fz="xs" c="dimmed" className="ld-nowrap">
                                {getWindowRangeLabel(row.original.window)}
                            </Text>
                        );
                    }
                    if (row.original.kind !== 'query') return null;
                    return (
                        <Text c="dimmed" className="ld-nowrap">
                            {formatWhen(row.original.item.createdAt)}
                        </Text>
                    );
                },
            },
        ],
        [counts, expandedWindows, onShowMore],
    );

    const table = useContentTable({
        columns,
        data,
        getRowId: (row) => row.id,
        enableSorting: true,
        enableMultiSort: false,
        manualSorting: true,
        enablePagination: false,
        enableTopToolbar: true,
        enableBottomToolbar: isFlatSort,
        enableColumnResizing: false,
        enableStickyHeader: true,
        enableRowVirtualization: isFlatSort,
        rowVirtualizerProps: {
            estimateSize: () => ROW_HEIGHT_ESTIMATE,
            overscan: 20,
        },
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
            emptyMessage: 'No queries in the last 30 days',
            filteredMessage: 'No queries match these filters',
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
        renderTopToolbar: () => topToolbar,
        renderBottomToolbar: () =>
            isFlatSort ? (
                <Group px="md" py="xs">
                    <Text fz="xs" c="dimmed">
                        {isFetching
                            ? 'Loading more'
                            : hasNextPage
                              ? 'Scroll for more'
                              : 'All results loaded'}
                    </Text>
                </Group>
            ) : null,
    });

    return <ContentTable table={table} />;
};
