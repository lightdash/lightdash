import {
    type QueryHistoryCounts,
    type QueryHistoryListFilters,
    type QueryHistoryListItem,
    type QueryHistoryWindow,
} from '@lightdash/common';
import { useEffect, useMemo, type FC } from 'react';
import { useInfiniteQueryHistory } from '../hooks/useQueryHistory';
import {
    QUERY_HISTORY_WINDOW_PAGE_SIZE,
    type QueryHistoryWindowMeta,
} from '../utils/tableRows';

type Props = {
    projectUuid: string | undefined;
    window: QueryHistoryWindow;
    filters: QueryHistoryListFilters;
    isExpanded: boolean;
    counts: QueryHistoryCounts | undefined;
    onCounts: (counts: QueryHistoryCounts) => void;
    onItemsChange: (
        window: QueryHistoryWindow,
        items: QueryHistoryListItem[],
    ) => void;
    onMetaChange: (
        window: QueryHistoryWindow,
        meta: QueryHistoryWindowMeta,
    ) => void;
    onRegisterFetchNext: (
        window: QueryHistoryWindow,
        fetchNext: () => void,
    ) => void;
};

/**
 * Loads one disjoint time window and reports its rows/counts. Rendering lives
 * in ContentTable so this component is a data loader only.
 */
export const QueryHistoryWindowSection: FC<Props> = ({
    projectUuid,
    window,
    filters,
    isExpanded,
    counts,
    onCounts,
    onItemsChange,
    onMetaChange,
    onRegisterFetchNext,
}) => {
    const { data, isFetching, hasNextPage, fetchNextPage } =
        useInfiniteQueryHistory(
            projectUuid,
            { ...filters, window },
            QUERY_HISTORY_WINDOW_PAGE_SIZE,
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

    useEffect(() => {
        onMetaChange(window, {
            hasNextPage: Boolean(hasNextPage),
            isFetching,
            remaining,
        });
    }, [window, hasNextPage, isFetching, remaining, onMetaChange]);

    useEffect(() => {
        onRegisterFetchNext(window, () => {
            void fetchNextPage();
        });
    }, [window, fetchNextPage, onRegisterFetchNext]);

    return null;
};
