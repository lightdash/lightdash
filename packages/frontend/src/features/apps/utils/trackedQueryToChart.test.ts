import { ChartType } from '@lightdash/common';
import type { QueryEvent } from '../hooks/useAppSdkBridge';
import {
    trackedQueryToChartVersion,
    trackedQueryToCreateChart,
} from './trackedQueryToChart';

const makeQuery = (overrides: Partial<QueryEvent> = {}): QueryEvent => ({
    id: 'q1',
    timestamp: 0,
    label: 'Weekly revenue',
    exploreName: 'orders',
    dimensions: ['orders_order_date'],
    metrics: ['orders_total_revenue'],
    filters: { dimensions: { id: 'g', and: [] } },
    sorts: [{ fieldId: 'orders_total_revenue', descending: true }],
    tableCalculations: [{ name: 'growth', displayName: 'Growth', sql: '1' }],
    additionalMetrics: [],
    limit: 500,
    queryUuid: 'uuid-1',
    status: 'ready',
    rowCount: 10,
    durationMs: 5,
    error: null,
    rawMetricQuery: null,
    ...overrides,
});

describe('trackedQueryToChartVersion', () => {
    it('maps a plain table chart version with derived column order', () => {
        const v = trackedQueryToChartVersion(makeQuery());
        expect(v.tableName).toBe('orders');
        expect(v.chartConfig).toEqual({ type: ChartType.TABLE, config: {} });
        // dimensions, then metrics, then table-calc names
        expect(v.tableConfig.columnOrder).toEqual([
            'orders_order_date',
            'orders_total_revenue',
            'growth',
        ]);
        expect(v.metricQuery.exploreName).toBe('orders');
        expect(v.metricQuery.limit).toBe(500);
        expect(v.metricQuery.tableCalculations).toEqual([
            { name: 'growth', displayName: 'Growth', sql: '1' },
        ]);
    });

    it('defaults missing filters/sorts to empty', () => {
        const v = trackedQueryToChartVersion(
            makeQuery({
                filters: undefined,
                sorts: [],
            }),
        );
        expect(v.metricQuery.filters).toEqual({});
        expect(v.metricQuery.sorts).toEqual([]);
    });
});

describe('trackedQueryToCreateChart', () => {
    const rawMetricQuery = {
        exploreName: 'orders',
        dimensions: ['orders_order_date'],
        metrics: ['orders_total_revenue'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [
            { name: 'growth', displayName: 'Growth', sql: '1' },
        ],
        additionalMetrics: [{ name: 'adhoc' }],
        customDimensions: [],
    };

    it('adds name + space and persists the exact raw metric query', () => {
        const c = trackedQueryToCreateChart(makeQuery({ rawMetricQuery }), {
            name: 'My chart',
            spaceUuid: 'space-1',
        });
        expect(c).not.toBeNull();
        expect(c?.name).toBe('My chart');
        expect(c?.description).toBe('');
        expect(c?.spaceUuid).toBe('space-1');
        expect(c?.dashboardUuid).toBeNull();
        expect(c?.tableName).toBe('orders');
        // faithful: the app's exact query, keeping additionalMetrics
        expect(c?.metricQuery).toBe(rawMetricQuery);
    });

    it('omits space when not provided (backend picks the default space)', () => {
        const c = trackedQueryToCreateChart(makeQuery({ rawMetricQuery }), {
            name: 'X',
        });
        expect(c?.spaceUuid).toBeUndefined();
    });

    it('returns null without a captured query (e.g. linked-chart rows)', () => {
        expect(
            trackedQueryToCreateChart(makeQuery({ rawMetricQuery: null }), {
                name: 'X',
            }),
        ).toBeNull();
    });
});
