import {
    buildMergeQueryFromSaved,
    ChartType,
    FilterOperator,
    MergeJoinType,
    type ChartAsCode,
    type SavedMergeQuery,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { chartMergeForDownload, chartMergeForUpload } from './chartMergeAsCode';

const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_month'],
    metrics: ['orders_total'],
    filters: {},
    sorts: [{ fieldId: 'b_payments_total', descending: true }],
    limit: 37,
    tableCalculations: [],
};
const merge: SavedMergeQuery = {
    primarySourceId: 'a',
    sources: [
        { id: 'a', kind: 'chart' },
        {
            id: 'b',
            kind: 'query',
            metricQuery: {
                ...metricQuery,
                exploreName: 'payments',
                dimensions: ['payments_month'],
                metrics: ['payments_total'],
                sorts: [],
                timezone: 'Europe/London',
            },
        },
    ],
    joinKey: [
        {
            name: 'month',
            fieldIdBySourceId: { a: 'orders_month', b: 'payments_month' },
        },
    ],
    joinType: MergeJoinType.LEFT,
    tableCalculations: [
        {
            name: 'ratio',
            displayName: 'Ratio',
            // eslint-disable-next-line no-template-curly-in-string
            sql: '${a.orders_total} / ${b.payments_total}',
        },
    ],
    repeatValuesSourceIds: ['b'],
};
const chart: ChartAsCode = {
    name: 'Orders and payments',
    description: '',
    slug: 'orders-payments',
    tableName: 'orders',
    metricQuery,
    merge,
    chartConfig: { type: ChartType.TABLE },
    tableConfig: {
        columnOrder: [
            'merge_month',
            'a_orders_total',
            'b_payments_total',
            'ratio',
        ],
    },
    dashboardSlug: undefined,
    spaceSlug: 'shared',
    version: 1,
};

describe('merge content-as-code compatibility', () => {
    it('writes named YAML but uploads the v2 wire contract with the same execution', () => {
        const downloaded = chartMergeForDownload(chart);
        expect(downloaded.merge).toMatchObject({
            chartAs: 'a',
            queries: {
                b: {
                    explore: 'payments',
                    repeat: true,
                    timezone: 'Europe/London',
                },
            },
            keys: { orders_month: ['b.payments_month'] },
            keyNames: { orders_month: 'month' },
            sort: [{ by: 'b.payments_total', direction: 'desc' }],
            limit: 37,
        });
        const uploaded = chartMergeForUpload(
            yaml.load(yaml.dump(downloaded)) as ChartAsCode,
        );
        expect(uploaded.merge).toEqual(merge);
        expect(uploaded.tableConfig).toEqual(chart.tableConfig);
        if (!uploaded.merge || !('sources' in uploaded.merge))
            throw new Error('Expected v2 API payload');
        expect(
            buildMergeQueryFromSaved(
                { ...uploaded.metricQuery, filters: metricQuery.filters },
                uploaded.merge,
            ),
        ).toEqual(buildMergeQueryFromSaved(metricQuery, merge));
    });

    it('takes an edited YAML sort and limit over the old chart query settings', () => {
        const downloaded = chartMergeForDownload(chart);
        if (!downloaded.merge || !('queries' in downloaded.merge))
            throw new Error('Expected named YAML');
        const uploaded = chartMergeForUpload({
            ...downloaded,
            merge: {
                ...downloaded.merge,
                sort: [{ by: 'ratio', direction: 'asc' }],
                limit: 12,
            },
        });
        expect(uploaded.metricQuery.sorts).toEqual([
            { fieldId: 'ratio', descending: false },
        ]);
        expect(uploaded.metricQuery.limit).toBe(12);
    });

    it('preserves chart filters without requiring generated ids in YAML', () => {
        const filtered = {
            ...chart,
            metricQuery: {
                ...metricQuery,
                filters: {
                    dimensions: {
                        and: [
                            {
                                target: { fieldId: 'orders_status' },
                                operator: FilterOperator.EQUALS,
                                values: ['completed'],
                            },
                        ],
                    },
                },
            },
        };
        const uploaded = chartMergeForUpload(chartMergeForDownload(filtered));
        expect(uploaded.metricQuery.filters).toEqual(
            filtered.metricQuery.filters,
        );
    });

    it('keeps a v2 merge with a different primary source lossless', () => {
        const unusual = { ...chart, merge: { ...merge, primarySourceId: 'b' } };
        expect(chartMergeForUpload(chartMergeForDownload(unusual))).toEqual(
            unusual,
        );
    });

    it('keeps older YAML uploads and ordinary charts unchanged', () => {
        expect(chartMergeForUpload(chart)).toBe(chart);
        const ordinary = { ...chart, merge: null };
        expect(chartMergeForDownload(ordinary)).toBe(ordinary);
        expect(chartMergeForUpload(ordinary)).toBe(ordinary);
    });

    it('rejects invalid named YAML instead of uploading a chart without its merge', () => {
        expect(() =>
            chartMergeForUpload({
                ...chart,
                merge: {
                    queries: {},
                    keys: {},
                    join: MergeJoinType.LEFT,
                    limit: 10,
                },
            }),
        ).toThrow('Invalid saved merge definition');
    });
});
