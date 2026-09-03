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
import { Box, Text, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import {
    ContentTableSearchInput,
    type ContentTableSortingState,
} from '../../../components/common/ContentTable';
import Page from '../../../components/common/Page/Page';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useInfiniteQueryHistory } from '../hooks/useQueryHistory';
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

/** Newest three windows start expanded; 7d/30d load on demand. */
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
    const [expandedWindows, setExpandedWindows] = useState(
        DEFAULT_EXPANDED_WINDOWS,
    );
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
                    previous.remaining === meta.remaining
                ) {
                    return current;
                }
                return { ...current, [window]: meta };
            });
        },
        [],
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

    const toggleWindow = useCallback((window: QueryHistoryWindow) => {
        setExpandedWindows((current) => {
            const next = new Set(current);
            if (next.has(window)) {
                next.delete(window);
            } else {
                next.add(window);
            }
            return next;
        });
    }, []);

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

    const subtitleParts = [
        project?.name,
        activeCounts
            ? `${formatWarehouseTime(
                  activeCounts.warehouseTimeMsLast7Days,
              )} of warehouse time in the last 7 days`
            : null,
    ].filter(Boolean);

    const isInitialLoading = isFlatSort
        ? flatQuery.isLoading && flatItems.length === 0
        : !counts &&
          QUERY_HISTORY_WINDOWS_ORDERED.some((window) =>
              expandedWindows.has(window),
          ) &&
          tableData.every((row) => row.kind !== 'query');

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
                <Box className={styles.header}>
                    <Box>
                        <Title order={2} className={styles.title}>
                            My query history
                        </Title>
                        {subtitleParts.length > 0 && (
                            <Text className={styles.subtitle}>
                                {subtitleParts.join(' · ')}
                            </Text>
                        )}
                    </Box>
                    <ContentTableSearchInput
                        className={styles.search}
                        value={search}
                        onChange={setSearch}
                        placeholder="Search fields, tables or SQL…"
                    />
                </Box>

                <QueryHistoryToolbar
                    trigger={trigger}
                    onTriggerChange={setTrigger}
                    language={language}
                    onLanguageChange={setLanguage}
                    statuses={statuses}
                    onStatusesChange={setStatuses}
                    counts={activeCounts}
                />

                <Box className={styles.tableWrap}>
                    <QueryHistoryTable
                        data={tableData}
                        compact={isPanelOpen}
                        selectedQueryUuid={selectedItem?.queryUuid}
                        counts={activeCounts}
                        sorting={sorting}
                        onSortingChange={setSorting}
                        isLoading={isInitialLoading}
                        isFetching={isFlatSort && flatQuery.isFetching}
                        hasNextPage={Boolean(flatQuery.hasNextPage)}
                        fetchNextPage={() => {
                            void flatQuery.fetchNextPage();
                        }}
                        search={debouncedSearch}
                        onSelect={setSelectedItem}
                        onToggleWindow={toggleWindow}
                        onShowMore={handleShowMore}
                        onClearFilters={handleClearFilters}
                        hasActiveFilters={hasActiveFilters}
                    />
                </Box>
            </Box>
        </Page>
    );
};
