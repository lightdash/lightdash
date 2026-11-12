import {
    ChartType,
    DimensionType,
    getComposerMergeSavedChart,
    MergeJoinType,
    QuerySourceType,
    type SemanticLayerSourceQuery,
    type SavedChart,
    type SavedMergeQuery,
    upgradeSavedMergeQuery,
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

const savedV2: SavedMergeQuery = {
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

const merge = upgradeSavedMergeQuery(savedV2, chart.metricQuery)!;

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
            // The chart was saved under schema v2, so its ids ride along
            primarySourceName: 'a',
            additionalSources: [
                {
                    id: 'b',
                    name: 'b',
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
                    name: 'order_month',
                    fieldIdBySourceId: {
                        a: 'orders_order_month',
                        b: 'payments_payment_month',
                    },
                },
            ],
            joinType: MergeJoinType.LEFT,
            repeatValuesSourceIds: [],
            tableCalculations: [],
        });
    });

    it('falls back to the primary query when the stored merge is unreadable', () => {
        const url = getExploreFromHereUrl({
            ...chart,
            merge: { ...merge, keys: {} },
        });

        expect(url.pathname).toBe('/projects/project-uuid/tables/orders');
        expect(new URLSearchParams(url.search).has(MERGE_URL_PARAM)).toBe(
            false,
        );
    });

    it('opens a composer merge node with every source, key name, calc, repeat, sort and limit', () => {
        const node = (
            nodeId: string,
            exploreName: string,
        ): SemanticLayerSourceQuery => ({
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId,
            exploreName,
            dimensions: [`${exploreName}_month`],
            metrics: [`${exploreName}_total`],
        });
        const calc = {
            name: 'gap',
            displayName: 'Gap',
            sql: '',
            formula: '=${orders_m_orders_total} - ${payments_m_payments_total}',
        };
        const saved = getComposerMergeSavedChart({
            config: {
                source: 'composer',
                schemaVersion: 2,
                queries: [
                    node('orders_m', 'orders'),
                    node('payments_m', 'payments'),
                    node('customers_m', 'customers'),
                    {
                        sourceType: QuerySourceType.MERGE,
                        nodeId: 'merged',
                        sources: [
                            { nodeId: 'orders_m' },
                            { nodeId: 'payments_m' },
                            { nodeId: 'customers_m', repeatValues: true },
                        ],
                        joinKey: [
                            {
                                name: 'month',
                                fieldIdBySourceId: {
                                    orders_m: 'orders_month',
                                    payments_m: 'payments_month',
                                    customers_m: 'customers_month',
                                },
                            },
                        ],
                        joinType: MergeJoinType.INNER,
                        tableCalculations: [calc],
                        sorts: [{ fieldId: 'merge_gap', descending: true }],
                        limit: 25,
                    },
                ],
                terminalNodeId: 'merged',
                vizConfig: null,
            },
            columns: [
                { reference: 'merge_month', type: DimensionType.DATE },
                { reference: 'merge_gap', type: DimensionType.NUMBER },
            ],
            metadata: { title: 'Gap', description: '' },
        })!;

        const url = getExploreFromHereUrl({
            ...saved,
            projectUuid: 'project-uuid',
        });
        const params = new URLSearchParams(url.search);

        expect(url.pathname).toBe('/projects/project-uuid/tables/orders');
        expect(parseChartParam(url.search).metricQuery).toMatchObject({
            sorts: [{ fieldId: 'merge_gap', descending: true }],
            limit: 25,
        });
        const state = parseMergeState(params.get(MERGE_URL_PARAM));
        expect(state).toMatchObject({
            primarySourceName: 'orders_m',
            additionalSources: [
                { name: 'payments_m', exploreName: 'payments' },
                { name: 'customers_m', exploreName: 'customers' },
            ],
            joinType: MergeJoinType.INNER,
            tableCalculations: [calc],
        });
        const [payments, customers] = state!.additionalSources;
        expect(state!.repeatValuesSourceIds).toEqual([customers.id]);
        expect(state!.joinParts).toEqual([
            {
                name: 'month',
                fieldIdBySourceId: {
                    a: 'orders_month',
                    [payments.id]: 'payments_month',
                    [customers.id]: 'customers_month',
                },
            },
        ]);
    });
});
