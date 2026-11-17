import {
    TimeFrames,
    type PreAggregateMaterializationSummary,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    describeRefresh,
    getFieldLabel,
    getPreAggregateQuery,
    getPreAggregateStatus,
    summariseUsage,
    type LabelledExplore,
} from './preAggregateSummary';

const summary = (
    overrides: Partial<PreAggregateMaterializationSummary> = {},
): PreAggregateMaterializationSummary => ({
    preAggregateDefinitionUuid: 'definition',
    preAggregateName: 'daily_orders',
    externalTable: null,
    preAggExploreName: '__preagg__orders__daily_orders',
    sourceExploreName: 'orders',
    materializationRole: null,
    dimensions: ['status'],
    metrics: ['order_count'],
    filters: [],
    timeDimension: null,
    granularity: null,
    refreshCron: null,
    materializeOnChange: true,
    definitionError: null,
    resolvedMaxRows: null,
    warnings: [],
    materialization: null,
    ...overrides,
});

describe('getPreAggregateStatus', () => {
    it('puts a definition that is not valid ahead of anything built', () => {
        expect(
            getPreAggregateStatus(summary({ definitionError: 'bad field' }))
                .label,
        ).toBe('Not valid');
        expect(getPreAggregateStatus(summary()).label).toBe('Not built yet');
        expect(
            getPreAggregateStatus(summary({ externalTable: 'analytics.daily' }))
                .label,
        ).toBe('Your own table');
    });
});

describe('getFieldLabel', () => {
    const explore: LabelledExplore = {
        baseTable: 'orders',
        tables: {
            orders: {
                dimensions: { status: { label: 'Status' } },
                metrics: { order_count: { label: 'Order count' } },
            },
            customers: {
                dimensions: { country: { label: 'Country' } },
                metrics: {},
            },
        },
    };

    it('names base and joined fields, and falls back to the reference', () => {
        expect(getFieldLabel(explore, 'status')).toBe('Status');
        expect(getFieldLabel(explore, 'order_count')).toBe('Order count');
        expect(getFieldLabel(explore, 'customers.country')).toBe('Country');
        expect(getFieldLabel(explore, 'gone')).toBe('gone');
        expect(getFieldLabel(undefined, 'status')).toBe('status');
    });
});

describe('describeRefresh', () => {
    it('says when a pre-aggregate is rebuilt', () => {
        expect(describeRefresh(summary())).toBe(
            'Rebuilt when its definition changes',
        );
        expect(describeRefresh(summary({ materializeOnChange: false }))).toBe(
            'Rebuilt only when you ask for it',
        );
        expect(describeRefresh(summary({ refreshCron: '0 * * * *' }))).toBe(
            'Rebuilt every hour, and when its definition changes',
        );
        expect(
            describeRefresh(summary({ externalTable: 'analytics.daily' })),
        ).toBe('Kept up to date outside this app');
    });
});

describe('getPreAggregateQuery', () => {
    it('selects every field at the stored grain, joined ones by their table', () => {
        const { metricQuery } = getPreAggregateQuery(
            summary({
                dimensions: ['status', 'customers.country'],
                metrics: ['order_count'],
                timeDimension: 'created_at',
                granularity: TimeFrames.DAY,
            }),
            'orders',
        );
        expect(metricQuery.dimensions).toEqual([
            'orders_created_at_day',
            'orders_status',
            'customers_country',
        ]);
        expect(metricQuery.metrics).toEqual(['orders_order_count']);
    });
});

describe('summariseUsage', () => {
    const stat = (
        exploreName: string,
        hitCount: number,
        missCount: number,
        missReason: string | null,
        preAggregateName: string | null,
        chart: string | null = null,
    ) => ({
        exploreName,
        hitCount,
        missCount,
        missReason,
        preAggregateName,
        chartUuid: chart,
        chartName: chart,
    });

    it('counts one model, by pre-aggregate and by why queries missed', () => {
        const usage = summariseUsage(
            [
                stat('orders', 5, 0, null, 'daily_orders'),
                stat('orders', 2, 0, null, 'daily_orders'),
                stat('orders', 0, 4, 'dimension_not_in_pre_aggregate', null),
                stat('orders', 0, 1, 'granularity_too_fine', null),
                stat('customers', 9, 9, 'granularity_too_fine', 'other'),
            ],
            'orders',
        );
        expect(usage.hits).toBe(7);
        expect(usage.misses).toBe(5);
        expect(usage.hitsByName.get('daily_orders')).toBe(7);
        expect(usage.topMisses).toEqual([
            ['dimension_not_in_pre_aggregate', 4],
            ['granularity_too_fine', 1],
        ]);
    });

    it('lists the charts that ran on the warehouse, most first, with their main reason', () => {
        const usage = summariseUsage(
            [
                stat('orders', 0, 1, 'granularity_too_fine', null, 'Revenue'),
                stat(
                    'orders',
                    0,
                    3,
                    'dimension_not_in_pre_aggregate',
                    null,
                    'Revenue',
                ),
                stat(
                    'orders',
                    0,
                    2,
                    'metric_not_in_pre_aggregate',
                    null,
                    'Funnel',
                ),
                stat('orders', 4, 0, null, 'daily_orders', 'Served'),
                stat('orders', 0, 7, 'granularity_too_fine', null),
            ],
            'orders',
        );
        expect(usage.missedCharts).toEqual([
            {
                chartUuid: 'Revenue',
                chartName: 'Revenue',
                count: 4,
                reason: 'dimension_not_in_pre_aggregate',
            },
            {
                chartUuid: 'Funnel',
                chartName: 'Funnel',
                count: 2,
                reason: 'metric_not_in_pre_aggregate',
            },
        ]);
    });
});
