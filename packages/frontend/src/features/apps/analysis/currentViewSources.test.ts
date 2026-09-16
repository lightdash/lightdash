import { type QueryEvent } from '../hooks/useAppSdkBridge';
import {
    hasInFlightQueries,
    selectCurrentViewSources,
    selectMountedViewSources,
    sourcesSignature,
} from './currentViewSources';

const event = (overrides: Partial<QueryEvent>): QueryEvent => ({
    id: 'req-1',
    timestamp: 1,
    label: 'Orders',
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: null,
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 500,
    queryUuid: 'q-1',
    status: 'ready',
    rowCount: 1,
    durationMs: 1,
    error: null,
    rawMetricQuery: { exploreName: 'orders', metrics: ['orders_count'] },
    ...overrides,
});

describe('selectCurrentViewSources', () => {
    it('keeps the latest ready query per source and drops the rest', () => {
        const sources = selectCurrentViewSources([
            event({ id: 'a', queryUuid: 'q-old', timestamp: 1 }),
            event({ id: 'b', queryUuid: 'q-new', timestamp: 2 }),
            event({
                id: 'c',
                queryUuid: 'q-other',
                timestamp: 3,
                label: 'Revenue',
                rawMetricQuery: {
                    exploreName: 'payments',
                    metrics: ['payments_total'],
                },
            }),
            event({
                id: 'd',
                queryUuid: null,
                status: 'pending',
                timestamp: 4,
            }),
            event({
                id: 'e',
                queryUuid: 'q-err',
                status: 'error',
                timestamp: 5,
            }),
        ]);
        expect(sources).toEqual([
            { queryUuid: 'q-new', label: 'Orders' },
            { queryUuid: 'q-other', label: 'Revenue' },
        ]);
    });

    it('treats the host-stamped fields as the same source', () => {
        const sources = selectCurrentViewSources([
            event({ id: 'a', queryUuid: 'q-1', timestamp: 1 }),
            event({
                id: 'b',
                queryUuid: 'q-2',
                timestamp: 2,
                rawMetricQuery: {
                    exploreName: 'orders',
                    metrics: ['orders_count'],
                    invalidateCache: true,
                },
            }),
        ]);
        expect(sources).toEqual([{ queryUuid: 'q-2', label: 'Orders' }]);
    });

    it('keeps every mounted execution of the same source', () => {
        const sources = selectMountedViewSources(
            [
                event({ id: 'a', queryUuid: 'q-1', timestamp: 1 }),
                event({ id: 'b', queryUuid: 'q-2', timestamp: 2 }),
                event({ id: 'c', queryUuid: 'q-gone', timestamp: 3 }),
                event({ id: 'd', queryUuid: null, status: 'pending' }),
            ],
            ['q-1', 'q-2'],
        );
        expect(sources).toEqual([
            { queryUuid: 'q-1', label: 'Orders' },
            { queryUuid: 'q-2', label: 'Orders' },
        ]);
    });

    it('reports in-flight queries and a stable signature', () => {
        expect(hasInFlightQueries([event({ status: 'running' })])).toBe(true);
        expect(hasInFlightQueries([event({})])).toBe(false);
        expect(
            sourcesSignature([
                { queryUuid: 'b', label: null },
                { queryUuid: 'a', label: null },
            ]),
        ).toBe('a|b');
    });
});
