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
          kind: 'showMore';
          window: QueryHistoryWindow;
          remaining: number;
          isFetching: boolean;
      };

export const isQueryHistoryQueryRow = (
    row: QueryHistoryTableRow,
): row is Extract<QueryHistoryTableRow, { kind: 'query' }> =>
    row.kind === 'query';

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

        if (meta?.hasNextPage) {
            rows.push({
                id: `more-${window}`,
                kind: 'showMore',
                window,
                remaining: meta.remaining,
                isFetching: meta.isFetching,
            });
        }

        return rows;
    });
};
