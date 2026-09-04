import {
    QUERY_HISTORY_WINDOWS_ORDERED,
    type QueryHistoryCounts,
    type QueryHistoryListItem,
    type QueryHistoryWindow,
} from '@lightdash/common'; // pragma: allowlist secret

export const QUERY_HISTORY_WINDOW_PAGE_SIZE = 10;

export type QueryHistoryWindowMeta = {
    hasNextPage: boolean;
    isFetching: boolean;
    isFetchingNextPage: boolean;
    remaining: number;
};

export type QueryHistoryTableRow =
    | {
          id: string;
          kind: 'window';
          window: QueryHistoryWindow;
      }
    | {
          id: string;
          kind: 'query';
          item: QueryHistoryListItem;
      }
    | {
          id: string;
          kind: 'skeleton';
          window: QueryHistoryWindow;
          index: number;
      }
    | {
          id: string;
          kind: 'showMore';
          window: QueryHistoryWindow;
          remaining: number;
          isFetching: boolean;
      };

export const isQueryHistoryQueryRow = (
    row: QueryHistoryTableRow,
): row is Extract<QueryHistoryTableRow, { kind: 'query' }> =>
    row.kind === 'query';

const buildSkeletonRows = (
    window: QueryHistoryWindow,
    count: number,
    offset: number,
): QueryHistoryTableRow[] =>
    Array.from({ length: count }, (_, index) => ({
        id: `skeleton-${window}-${offset + index}`,
        kind: 'skeleton',
        window,
        index: offset + index,
    }));

/**
 * Placeholder rows sized to what the window will render once its page lands,
 * so the table does not grow when the real rows replace them.
 */
const getPendingRowCount = ({
    items,
    meta,
    windowCount,
}: {
    items: QueryHistoryListItem[];
    meta: QueryHistoryWindowMeta | undefined;
    windowCount: number | undefined;
}): number => {
    const isFirstPagePending =
        items.length === 0 && (meta === undefined || meta.isFetching);
    if (isFirstPagePending) {
        return Math.min(
            windowCount ?? QUERY_HISTORY_WINDOW_PAGE_SIZE,
            QUERY_HISTORY_WINDOW_PAGE_SIZE,
        );
    }
    if (meta?.isFetchingNextPage) {
        return Math.min(meta.remaining, QUERY_HISTORY_WINDOW_PAGE_SIZE);
    }
    return 0;
};

export const buildQueryHistoryTableRows = ({
    isFlatSort,
    flatItems,
    expandedWindows,
    windowItems,
    windowMeta,
    counts,
}: {
    isFlatSort: boolean;
    flatItems: QueryHistoryListItem[];
    expandedWindows: ReadonlySet<QueryHistoryWindow>;
    windowItems: Partial<Record<QueryHistoryWindow, QueryHistoryListItem[]>>;
    windowMeta: Partial<Record<QueryHistoryWindow, QueryHistoryWindowMeta>>;
    counts: QueryHistoryCounts | undefined;
}): QueryHistoryTableRow[] => {
    if (isFlatSort) {
        return flatItems.map((item) => ({
            id: item.queryUuid,
            kind: 'query',
            item,
        }));
    }

    return QUERY_HISTORY_WINDOWS_ORDERED.flatMap((window) => {
        const windowCount = counts?.windows[window];
        const items = windowItems[window] ?? [];
        const meta = windowMeta[window];

        if (windowCount === 0 && items.length === 0) {
            return [];
        }

        const rows: QueryHistoryTableRow[] = [
            { id: `window-${window}`, kind: 'window', window },
        ];

        if (!expandedWindows.has(window)) {
            return rows;
        }

        rows.push(
            ...items.map((item) => ({
                id: item.queryUuid,
                kind: 'query' as const,
                item,
            })),
        );

        rows.push(
            ...buildSkeletonRows(
                window,
                getPendingRowCount({ items, meta, windowCount }),
                items.length,
            ),
        );

        // Before the first page lands, the count alone says whether a
        // show-more row will follow, so reserve it rather than let it pop in.
        const isFirstPagePending = items.length === 0;
        const expectsMore =
            isFirstPagePending &&
            windowCount !== undefined &&
            windowCount > QUERY_HISTORY_WINDOW_PAGE_SIZE;

        if (expectsMore) {
            rows.push({
                id: `more-${window}`,
                kind: 'showMore',
                window,
                remaining: windowCount - QUERY_HISTORY_WINDOW_PAGE_SIZE,
                isFetching: true,
            });
        } else if (meta?.hasNextPage) {
            rows.push({
                id: `more-${window}`,
                kind: 'showMore',
                window,
                remaining: meta.remaining,
                isFetching: meta.isFetchingNextPage,
            });
        }

        return rows;
    });
};
