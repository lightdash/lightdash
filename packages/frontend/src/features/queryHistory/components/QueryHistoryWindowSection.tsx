import {
    type QueryHistoryCounts,
    type QueryHistoryListFilters,
    type QueryHistoryListItem,
    type QueryHistoryWindow,
} from '@lightdash/common';
import clsx from 'clsx';
import { useEffect, useMemo, type FC } from 'react';
import { useInfiniteQueryHistory } from '../hooks/useQueryHistory';
import styles from '../QueryHistory.module.css';
import { getWindowLabel, getWindowRangeLabel } from '../utils/format';
import { QueryHistoryRow } from './QueryHistoryRow';

const WINDOW_PAGE_SIZE = 10;

type Props = {
    projectUuid: string | undefined;
    window: QueryHistoryWindow;
    filters: QueryHistoryListFilters;
    isExpanded: boolean;
    onToggle: (window: QueryHistoryWindow) => void;
    counts: QueryHistoryCounts | undefined;
    onCounts: (counts: QueryHistoryCounts) => void;
    compact: boolean;
    selectedQueryUuid: string | undefined;
    onSelect: (item: QueryHistoryListItem) => void;
    onItemsChange: (
        window: QueryHistoryWindow,
        items: QueryHistoryListItem[],
    ) => void;
};

/**
 * One disjoint time window: a toggleable header with count and range, and —
 * when expanded — its own paginated slice of rows with "Show more".
 */
export const QueryHistoryWindowSection: FC<Props> = ({
    projectUuid,
    window,
    filters,
    isExpanded,
    onToggle,
    counts,
    onCounts,
    compact,
    selectedQueryUuid,
    onSelect,
    onItemsChange,
}) => {
    const { data, isFetching, hasNextPage, fetchNextPage } =
        useInfiniteQueryHistory(
            projectUuid,
            { ...filters, window },
            WINDOW_PAGE_SIZE,
            { enabled: isExpanded, keepPreviousData: true },
        );

    const lastPage = data?.pages[data.pages.length - 1];
    const items = useMemo(
        () => data?.pages.flatMap((page) => page.data) ?? [],
        [data],
    );

    useEffect(() => {
        if (lastPage) onCounts(lastPage.counts);
    }, [lastPage, onCounts]);

    useEffect(() => {
        onItemsChange(window, items);
    }, [window, items, onItemsChange]);

    const windowCount = counts?.windows[window];
    const totalInWindow = lastPage?.pagination?.totalResults ?? windowCount;
    const remaining =
        totalInWindow !== undefined
            ? Math.max(totalInWindow - items.length, 0)
            : 0;

    if (windowCount === 0 && !isFetching && items.length === 0) {
        // An empty window earns no header — the design only shows windows
        // that have runs (or ones we can't know about yet).
        return null;
    }

    return (
        <div>
            <button
                type="button"
                className={clsx(
                    styles.windowHeader,
                    !isExpanded && styles.windowHeaderCollapsed,
                )}
                onClick={() => onToggle(window)}
            >
                <span className={styles.windowTitle}>
                    {getWindowLabel(window)}
                    {windowCount !== undefined && (
                        <span className={styles.windowCount}>
                            {` · ${windowCount.toLocaleString()} ${
                                windowCount === 1 ? 'run' : 'runs'
                            }`}
                        </span>
                    )}
                </span>
                <span className={styles.windowRange}>
                    {getWindowRangeLabel(window)}
                </span>
            </button>
            {isExpanded && (
                <>
                    {items.map((item) => (
                        <QueryHistoryRow
                            key={item.queryUuid}
                            item={item}
                            compact={compact}
                            isSelected={item.queryUuid === selectedQueryUuid}
                            onSelect={onSelect}
                        />
                    ))}
                    {hasNextPage && (
                        <button
                            type="button"
                            className={styles.showMore}
                            disabled={isFetching}
                            onClick={() => fetchNextPage()}
                        >
                            {isFetching
                                ? 'Loading…'
                                : `Show ${Math.min(
                                      remaining,
                                      WINDOW_PAGE_SIZE,
                                  )} more from this window`}
                        </button>
                    )}
                </>
            )}
        </div>
    );
};
