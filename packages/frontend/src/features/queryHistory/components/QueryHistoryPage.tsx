import {
    QUERY_HISTORY_WINDOWS_ORDERED,
    QueryHistorySortBy,
    QueryHistoryWindow,
    type QueryHistoryCounts,
    type QueryHistoryListFilters,
    type QueryHistoryListItem,
    type QueryHistoryStatus,
    type QueryLanguage,
    QueryTrigger,
} from '@lightdash/common';
import { Box, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import { type ContentTableSortingState } from '../../../components/common/ContentTable';
import Page from '../../../components/common/Page/Page';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import {
    getQueryHistoryHasNextPage,
    useInfiniteQueryHistory,
} from '../hooks/useQueryHistory';
import styles from '../QueryHistory.module.css';
import { formatWarehouseTime } from '../utils/format';
import {
    buildQueryHistoryTableRows,
    isQueryHistoryQueryRow,
    type QueryHistoryWindowMeta,
} from '../utils/tableRows';
import { QueryHistoryDetailPanel } from './QueryHistoryDetailPanel';
import { QueryHistoryTable } from './QueryHistoryTable';
import { QueryHistoryToolbar } from './QueryHistoryToolbar';
import { QueryHistoryWindowSection } from './QueryHistoryWindowSection';

const DETAIL_PANEL_WIDTH = 640;
const FLAT_PAGE_SIZE = 25;

/**
 * Newest three windows start expanded so something loads immediately; the
 * first window that actually has runs is expanded too, so a filter whose
 * only matches are days old never lands on a page of collapsed groups.
 */
const DEFAULT_EXPANDED_WINDOWS = new Set([
    QueryHistoryWindow.LAST_FEW_MINUTES,
    QueryHistoryWindow.LAST_HOUR,
    QueryHistoryWindow.LAST_24_HOURS,
]);

const DEFAULT_SORTING: ContentTableSortingState = [
    { id: QueryHistorySortBy.CREATED_AT, desc: true },
];

export const QueryHistoryPage: FC = () => {
    const projectUuid = useProjectUuid();
    const { data: project } = useProject(projectUuid);

    const [trigger, setTrigger] = useState<QueryTrigger | undefined>(
        QueryTrigger.INTERACTIVE,
    );
    const [language, setLanguage] = useState<QueryLanguage | undefined>(
        undefined,
    );
    const [statuses, setStatuses] = useState<QueryHistoryStatus[]>([]);
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [sorting, setSorting] =
        useState<ContentTableSortingState>(DEFAULT_SORTING);
    const [windowOverrides, setWindowOverrides] = useState<
        Partial<Record<QueryHistoryWindow, boolean>>
    >({});
    const [selectedItem, setSelectedItem] =
        useState<QueryHistoryListItem | null>(null);
    const [counts, setCounts] = useState<QueryHistoryCounts | undefined>(
        undefined,
    );
    const [windowItems, setWindowItems] = useState<
        Partial<Record<QueryHistoryWindow, QueryHistoryListItem[]>>
    >({});
    const [windowMeta, setWindowMeta] = useState<
        Partial<Record<QueryHistoryWindow, QueryHistoryWindowMeta>>
    >({});
    const fetchNextByWindowRef = useRef<
        Partial<Record<QueryHistoryWindow, () => void>>
    >({});

    const isFlatSort = sorting[0]?.id === QueryHistorySortBy.RUNTIME;
    const sortBy = isFlatSort
        ? QueryHistorySortBy.RUNTIME
        : QueryHistorySortBy.CREATED_AT;

    const filters: QueryHistoryListFilters = useMemo(
        () => ({
            trigger,
            language,
            statuses: statuses.length > 0 ? statuses : undefined,
            search: debouncedSearch || undefined,
            sortBy,
        }),
        [trigger, language, statuses, debouncedSearch, sortBy],
    );

    const flatQuery = useInfiniteQueryHistory(
        projectUuid,
        filters,
        FLAT_PAGE_SIZE,
        { enabled: isFlatSort, keepPreviousData: true },
    );
    const flatItems = useMemo(
        () => flatQuery.data?.pages.flatMap((page) => page.data) ?? [],
        [flatQuery.data],
    );
    const flatCounts =
        flatQuery.data?.pages[flatQuery.data.pages.length - 1]?.counts;

    const handleCounts = useCallback(
        (newCounts: QueryHistoryCounts) => setCounts(newCounts),
        [],
    );

    const handleWindowItems = useCallback(
        (window: QueryHistoryWindow, items: QueryHistoryListItem[]) => {
            setWindowItems((current) =>
                current[window] === items
                    ? current
                    : { ...current, [window]: items },
            );
        },
        [],
    );

    const handleWindowMeta = useCallback(
        (window: QueryHistoryWindow, meta: QueryHistoryWindowMeta) => {
            setWindowMeta((current) => {
                const previous = current[window];
                if (
                    previous &&
                    previous.hasNextPage === meta.hasNextPage &&
                    previous.isFetching === meta.isFetching &&
                    previous.isFetchingNextPage === meta.isFetchingNextPage &&
                    previous.remaining === meta.remaining
                ) {
                    return current;
                }
                return { ...current, [window]: meta };
            });
        },
        [],
    );

    const firstNonEmptyWindow = counts
        ? QUERY_HISTORY_WINDOWS_ORDERED.find(
              (window) => counts.windows[window] > 0,
          )
        : undefined;

    const expandedWindows = useMemo(
        () =>
            new Set(
                QUERY_HISTORY_WINDOWS_ORDERED.filter(
                    (window) =>
                        windowOverrides[window] ??
                        (DEFAULT_EXPANDED_WINDOWS.has(window) ||
                            window === firstNonEmptyWindow),
                ),
            ),
        [windowOverrides, firstNonEmptyWindow],
    );

    const handleRegisterFetchNext = useCallback(
        (window: QueryHistoryWindow, fetchNext: () => void) => {
            fetchNextByWindowRef.current[window] = fetchNext;
        },
        [],
    );

    const tableData = useMemo(
        () =>
            buildQueryHistoryTableRows({
                isFlatSort,
                flatItems,
                expandedWindows,
                windowItems,
                windowMeta,
                counts: isFlatSort ? flatCounts : counts,
            }),
        [
            isFlatSort,
            flatItems,
            expandedWindows,
            windowItems,
            windowMeta,
            flatCounts,
            counts,
        ],
    );

    const visibleItems = useMemo(
        () => tableData.filter(isQueryHistoryQueryRow).map((row) => row.item),
        [tableData],
    );

    const selectedIndex = selectedItem
        ? visibleItems.findIndex(
              (item) => item.queryUuid === selectedItem.queryUuid,
          )
        : -1;

    const handlePanelNavigate = (direction: -1 | 1) => {
        const nextItem = visibleItems[selectedIndex + direction];
        if (nextItem) setSelectedItem(nextItem);
    };

    const toggleWindow = useCallback(
        (window: QueryHistoryWindow) => {
            setWindowOverrides((current) => ({
                ...current,
                [window]: !expandedWindows.has(window),
            }));
        },
        [expandedWindows],
    );

    const handleShowMore = useCallback((window: QueryHistoryWindow) => {
        fetchNextByWindowRef.current[window]?.();
    }, []);

    const handleClearFilters = useCallback(() => {
        setTrigger(QueryTrigger.INTERACTIVE);
        setLanguage(undefined);
        setStatuses([]);
        setSearch('');
    }, []);

    const activeCounts = isFlatSort ? flatCounts : counts;
    const isPanelOpen = selectedItem !== null;
    const hasActiveFilters =
        trigger !== QueryTrigger.INTERACTIVE ||
        language !== undefined ||
        statuses.length > 0 ||
        Boolean(debouncedSearch);

    const subtitle = [
        project?.name,
        activeCounts
            ? `${formatWarehouseTime(
                  activeCounts.warehouseTimeMsLast7Days,
              )} of warehouse time in the last 7 days`
            : null,
    ]
        .filter(Boolean)
        .join(' · ');

    // Before the first response nothing is known about which windows exist,
    // so the table shows generic skeletons; per-window skeletons take over
    // once counts arrive.
    const isInitialLoading = isFlatSort
        ? flatQuery.isLoading && flatItems.length === 0
        : counts === undefined &&
          QUERY_HISTORY_WINDOWS_ORDERED.some((window) =>
              expandedWindows.has(window),
          );

    const isRefetching = isFlatSort
        ? flatQuery.isFetching
        : Object.values(windowMeta).some(
              (meta) => meta.isFetching && !meta.isFetchingNextPage,
          );

    return (
        <Page
            title="My query history"
            withFullHeight
            noContentPadding
            rightSidebar={
                selectedItem ? (
                    <QueryHistoryDetailPanel
                        projectUuid={projectUuid}
                        item={selectedItem}
                        onClose={() => setSelectedItem(null)}
                        onNavigate={handlePanelNavigate}
                        canNavigateUp={selectedIndex > 0}
                        canNavigateDown={
                            selectedIndex >= 0 &&
                            selectedIndex < visibleItems.length - 1
                        }
                    />
                ) : undefined
            }
            isRightSidebarOpen={isPanelOpen}
            noRightSidebarPadding
            rightSidebarWidthProps={{
                defaultWidth: DETAIL_PANEL_WIDTH,
                minWidth: 480,
                maxWidth: 900,
            }}
        >
            <Box className={styles.page}>
                {!isFlatSort &&
                    QUERY_HISTORY_WINDOWS_ORDERED.map((window) => (
                        <QueryHistoryWindowSection
                            key={window}
                            projectUuid={projectUuid}
                            window={window}
                            filters={filters}
                            isExpanded={expandedWindows.has(window)}
                            counts={counts}
                            onCounts={handleCounts}
                            onItemsChange={handleWindowItems}
                            onMetaChange={handleWindowMeta}
                            onRegisterFetchNext={handleRegisterFetchNext}
                        />
                    ))}

                <Stack gap={2}>
                    <Title order={4}>My query history</Title>
                    <Box className={styles.subtitleLine}>
                        {subtitle ? (
                            <Text fz="sm" c="dimmed">
                                {subtitle}
                            </Text>
                        ) : (
                            <Skeleton h={10} w={320} radius="xl" />
                        )}
                    </Box>
                </Stack>

                <QueryHistoryTable
                    data={tableData}
                    compact={isPanelOpen}
                    selectedQueryUuid={selectedItem?.queryUuid}
                    counts={activeCounts}
                    expandedWindows={expandedWindows}
                    sorting={sorting}
                    onSortingChange={setSorting}
                    isLoading={isInitialLoading}
                    isFetching={isRefetching}
                    hasNextPage={getQueryHistoryHasNextPage(flatQuery.data)}
                    fetchNextPage={() => {
                        void flatQuery.fetchNextPage();
                    }}
                    search={debouncedSearch}
                    onSelect={setSelectedItem}
                    onToggleWindow={toggleWindow}
                    onShowMore={handleShowMore}
                    onClearFilters={handleClearFilters}
                    hasActiveFilters={hasActiveFilters}
                    topToolbar={
                        <QueryHistoryToolbar
                            trigger={trigger}
                            onTriggerChange={setTrigger}
                            language={language}
                            onLanguageChange={setLanguage}
                            statuses={statuses}
                            onStatusesChange={setStatuses}
                            counts={activeCounts}
                            search={search}
                            onSearchChange={setSearch}
                        />
                    }
                />
            </Box>
        </Page>
    );
};
