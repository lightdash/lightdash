import {
    QueryHistoryWindow,
    QueryTrigger,
    type QueryHistoryCounts,
    type QueryHistoryListItem,
} from '@lightdash/common'; // pragma: allowlist secret
import { describe, expect, it } from 'vitest';
import {
    buildQueryHistoryTableRows,
    isQueryHistoryQueryRow,
} from './tableRows';

const item = (queryUuid: string): QueryHistoryListItem =>
    ({
        queryUuid,
        title: queryUuid,
    }) as QueryHistoryListItem;

const counts = (
    windows: Partial<Record<QueryHistoryWindow, number>>,
): QueryHistoryCounts => ({
    triggers: {
        [QueryTrigger.INTERACTIVE]: 0,
        [QueryTrigger.APPS]: 0,
        [QueryTrigger.SCHEDULED]: 0,
    },
    windows: {
        [QueryHistoryWindow.LAST_FEW_MINUTES]: 0,
        [QueryHistoryWindow.LAST_HOUR]: 0,
        [QueryHistoryWindow.LAST_24_HOURS]: 0,
        [QueryHistoryWindow.LAST_7_DAYS]: 0,
        [QueryHistoryWindow.LAST_30_DAYS]: 0,
        ...windows,
    },
    total: Object.values(windows).reduce((sum, count) => sum + count, 0),
    warehouseTimeMsLast7Days: 0,
});

describe('buildQueryHistoryTableRows', () => {
    it('flattens query rows when sorting by runtime', () => {
        const rows = buildQueryHistoryTableRows({
            isFlatSort: true,
            flatItems: [item('a'), item('b')],
            expandedWindows: new Set(),
            windowItems: {},
            windowMeta: {},
            counts: undefined,
        });

        expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
        expect(rows.every(isQueryHistoryQueryRow)).toBe(true);
    });

    it('hides empty windows and inserts headers plus show-more rows', () => {
        const rows = buildQueryHistoryTableRows({
            isFlatSort: false,
            flatItems: [],
            expandedWindows: new Set([QueryHistoryWindow.LAST_HOUR]),
            windowItems: {
                [QueryHistoryWindow.LAST_HOUR]: [item('q1')],
            },
            windowMeta: {
                [QueryHistoryWindow.LAST_HOUR]: {
                    hasNextPage: true,
                    isFetching: false,
                    remaining: 4,
                },
            },
            counts: counts({
                [QueryHistoryWindow.LAST_FEW_MINUTES]: 0,
                [QueryHistoryWindow.LAST_HOUR]: 5,
            }),
        });

        expect(rows.map((row) => [row.kind, row.id])).toEqual([
            ['window', `window-${QueryHistoryWindow.LAST_HOUR}`],
            ['query', 'q1'],
            ['showMore', `more-${QueryHistoryWindow.LAST_HOUR}`],
        ]);
    });

    it('keeps a collapsed window as a header-only row', () => {
        const rows = buildQueryHistoryTableRows({
            isFlatSort: false,
            flatItems: [],
            expandedWindows: new Set(),
            windowItems: {
                [QueryHistoryWindow.LAST_24_HOURS]: [item('hidden')],
            },
            windowMeta: {},
            counts: counts({
                [QueryHistoryWindow.LAST_24_HOURS]: 1,
            }),
        });

        expect(rows).toEqual([
            {
                id: `window-${QueryHistoryWindow.LAST_24_HOURS}`,
                kind: 'window',
                window: QueryHistoryWindow.LAST_24_HOURS,
            },
        ]);
    });
});

describe('isQueryHistoryQueryRow', () => {
    it('narrows query rows', () => {
        expect(
            isQueryHistoryQueryRow({
                id: 'q',
                kind: 'query',
                item: item('q'),
            }),
        ).toBe(true);
        expect(
            isQueryHistoryQueryRow({
                id: 'w',
                kind: 'window',
                window: QueryHistoryWindow.LAST_HOUR,
            }),
        ).toBe(false);
    });
});
