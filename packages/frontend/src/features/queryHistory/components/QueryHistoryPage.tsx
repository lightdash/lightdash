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
import { TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import clsx from 'clsx';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import { useProject } from '../../../hooks/useProject';
import { useInfiniteQueryHistory } from '../hooks/useQueryHistory';
import styles from '../QueryHistory.module.css';
import { formatWarehouseTime } from '../utils/format';
import { QueryHistoryDetailPanel } from './QueryHistoryDetailPanel';
import { QueryHistoryRow } from './QueryHistoryRow';
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

export const QueryHistoryPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
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
    const [sortBy, setSortBy] = useState<QueryHistorySortBy>(
        QueryHistorySortBy.CREATED_AT,
    );
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

    const isFlatSort = sortBy === QueryHistorySortBy.RUNTIME;

    // Sorting by run time flattens the windows into one list — the
    // "what's slowest" view.
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

    // The flat, in-order list of everything currently rendered — drives the
    // panel's ↑/↓ navigation.
    const visibleItems = useMemo(() => {
        if (isFlatSort) return flatItems;
        return QUERY_HISTORY_WINDOWS_ORDERED.flatMap((window) =>
            expandedWindows.has(window) ? (windowItems[window] ?? []) : [],
        );
    }, [isFlatSort, flatItems, windowItems, expandedWindows]);

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

    const activeCounts = isFlatSort ? flatCounts : counts;
    const isPanelOpen = selectedItem !== null;

    const subtitleParts = [
        project?.name,
        activeCounts
            ? `${formatWarehouseTime(
                  activeCounts.warehouseTimeMsLast7Days,
              )} of warehouse time in the last 7 days`
            : null,
    ].filter(Boolean);

    return (
        <Page
            title="My query history"
            withFullHeight
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
            rightSidebarWidthProps={{
                defaultWidth: DETAIL_PANEL_WIDTH,
                minWidth: 480,
                maxWidth: 900,
            }}
        >
            <div className={styles.page}>
                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>My query history</h1>
                        {subtitleParts.length > 0 && (
                            <p className={styles.subtitle}>
                                {subtitleParts.join(' · ')}
                            </p>
                        )}
                    </div>
                    <TextInput
                        className={styles.search}
                        value={search}
                        onChange={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                        placeholder="Search fields, tables or SQL…"
                        leftSection={
                            <MantineIcon
                                icon={IconSearch}
                                size={14}
                                color="ldBrandGray.5"
                            />
                        }
                    />
                </div>

                <QueryHistoryToolbar
                    trigger={trigger}
                    onTriggerChange={setTrigger}
                    language={language}
                    onLanguageChange={setLanguage}
                    statuses={statuses}
                    onStatusesChange={setStatuses}
                    counts={activeCounts}
                />

                <div className={styles.list}>
                    <div
                        className={clsx(
                            styles.columnHeader,
                            isPanelOpen && styles.columnHeaderCompact,
                        )}
                    >
                        <span>Query</span>
                        <span>Language</span>
                        {!isPanelOpen && <span>Trigger</span>}
                        <span className={styles.columnRight}>
                            <button
                                type="button"
                                className={clsx(
                                    styles.sortButton,
                                    isFlatSort && styles.sortButtonActive,
                                )}
                                onClick={() =>
                                    setSortBy(
                                        isFlatSort
                                            ? QueryHistorySortBy.CREATED_AT
                                            : QueryHistorySortBy.RUNTIME,
                                    )
                                }
                            >
                                Run time
                                {isFlatSort && (
                                    <MantineIcon
                                        icon={IconChevronDown}
                                        size={9}
                                    />
                                )}
                            </button>
                        </span>
                        {!isPanelOpen && (
                            <span className={styles.columnRight}>Rows</span>
                        )}
                        <span className={styles.columnRight}>When</span>
                    </div>

                    {isFlatSort ? (
                        <>
                            {flatItems.map((item) => (
                                <QueryHistoryRow
                                    key={item.queryUuid}
                                    item={item}
                                    compact={isPanelOpen}
                                    isSelected={
                                        item.queryUuid ===
                                        selectedItem?.queryUuid
                                    }
                                    onSelect={setSelectedItem}
                                />
                            ))}
                            {flatQuery.hasNextPage && (
                                <button
                                    type="button"
                                    className={styles.showMore}
                                    disabled={flatQuery.isFetching}
                                    onClick={() => flatQuery.fetchNextPage()}
                                >
                                    {flatQuery.isFetching
                                        ? 'Loading…'
                                        : 'Show more'}
                                </button>
                            )}
                            {!flatQuery.isFetching &&
                                flatItems.length === 0 && (
                                    <div className={styles.emptyState}>
                                        No queries match these filters.
                                    </div>
                                )}
                        </>
                    ) : (
                        <>
                            {QUERY_HISTORY_WINDOWS_ORDERED.map((window) => (
                                <QueryHistoryWindowSection
                                    key={window}
                                    projectUuid={projectUuid}
                                    window={window}
                                    filters={filters}
                                    isExpanded={expandedWindows.has(window)}
                                    onToggle={toggleWindow}
                                    counts={counts}
                                    onCounts={handleCounts}
                                    compact={isPanelOpen}
                                    selectedQueryUuid={selectedItem?.queryUuid}
                                    onSelect={setSelectedItem}
                                    onItemsChange={handleWindowItems}
                                />
                            ))}
                            {counts && counts.total === 0 && (
                                <div className={styles.emptyState}>
                                    No queries match these filters.
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Page>
    );
};
