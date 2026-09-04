import {
    ChartType,
    MergeJoinType,
    type SavedChart,
    type SavedMergeQuery,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { MERGE_URL_PARAM, parseMergeState } from '../context/mergeUrlState';
import { getExploreFromHereUrl } from './getExploreFromHereUrl';

type ChartFixture = Pick<
    SavedChart,
    | 'uuid'
    | 'projectUuid'
    | 'name'
    | 'tableName'
    | 'metricQuery'
    | 'chartConfig'
    | 'tableConfig'
>;

const chartFixture: ChartFixture = {
    uuid: 'chart-uuid',
    projectUuid: 'project-uuid',
    name: 'Orders by month',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_order_month'],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.TABLE },
    tableConfig: { columnOrder: [] },
};
const chart = chartFixture as SavedChart;

const merge: SavedMergeQuery = {
    primarySourceId: 'a',
    sources: [
        { id: 'a', kind: 'chart' },
        {
            id: 'b',
            kind: 'query',
            metricQuery: {
                exploreName: 'payments',
                dimensions: ['payments_payment_month'],
                metrics: ['payments_unique_payment_count'],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
        },
    ],
    joinKey: [
        {
            name: 'order_month',
            fieldIdBySourceId: {
                a: 'orders_order_month',
                b: 'payments_payment_month',
            },
        },
    ],
    joinType: MergeJoinType.LEFT,
    tableCalculations: [],
};

const parseChartParam = (search: string) =>
    JSON.parse(
        new URLSearchParams(search).get('create_saved_chart_version') ?? '',
    ) as SavedChart;

describe('getExploreFromHereUrl', () => {
    it('opens an ordinary chart on its explore without a merge param', () => {
        const url = getExploreFromHereUrl(chart);
        const params = new URLSearchParams(url.search);

        expect(url.pathname).toBe('/projects/project-uuid/tables/orders');
        expect(params.get('isExploreFromHere')).toBe('true');
        expect(params.has(MERGE_URL_PARAM)).toBe(false);
        expect(parseChartParam(url.search).metricQuery).toEqual(
            chart.metricQuery,
        );
    });

    it('opens a merged chart on its primary explore with the merge restored', () => {
        const url = getExploreFromHereUrl({ ...chart, merge });
        const params = new URLSearchParams(url.search);

        expect(url.pathname).toBe('/projects/project-uuid/tables/orders');
        expect(parseChartParam(url.search).metricQuery.exploreName).toBe(
            'orders',
        );
        expect(parseMergeState(params.get(MERGE_URL_PARAM))).toEqual({
            focus: { kind: 'source', sourceId: 'a' },
            additionalSources: [
                {
                    id: 'b',
                    exploreName: 'payments',
                    dimensions: ['payments_payment_month'],
                    metrics: ['payments_unique_payment_count'],
                    filters: {},
                    additionalMetrics: undefined,
                    customDimensions: undefined,
                },
            ],
            joinParts: [
                {
                    fieldIdBySourceId: {
                        a: 'orders_order_month',
                        b: 'payments_payment_month',
                    },
                },
            ],
            joinType: MergeJoinType.LEFT,
        });
    });

    it('falls back to the primary query when the stored merge is unreadable', () => {
        const url = getExploreFromHereUrl({
            ...chart,
            merge: {
                ...merge,
                sources: [{ id: 'a', kind: 'chart' }],
            },
        });

        expect(url.pathname).toBe('/projects/project-uuid/tables/orders');
        expect(new URLSearchParams(url.search).has(MERGE_URL_PARAM)).toBe(
            false,
        );
    });
});
