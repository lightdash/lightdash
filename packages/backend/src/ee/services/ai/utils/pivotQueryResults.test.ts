import {
    DimensionType,
    FieldType,
    MetricType,
    VizAggregationOptions,
    type Dimension,
    type ItemsMap,
    type Metric,
    type PivotConfiguration,
} from '@lightdash/common';
import { pivotQueryResults } from './pivotQueryResults';

const dimension = (name: string): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: name,
    hidden: false,
});

const metric = (name: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: name,
    hidden: false,
});

const fields: ItemsMap = {
    orders_region: dimension('region'),
    orders_quarter: dimension('quarter'),
    orders_year: dimension('year'),
    orders_revenue: metric('revenue'),
    orders_orders: metric('orders'),
};

const configuration = (
    overrides: Partial<PivotConfiguration> = {},
): PivotConfiguration => ({
    indexColumn: { reference: 'orders_region', type: 'category' as never },
    valuesColumns: [
        {
            reference: 'orders_revenue',
            aggregation: VizAggregationOptions.ANY,
        },
    ],
    groupByColumns: [{ reference: 'orders_quarter' }],
    sortBy: undefined,
    ...overrides,
});

describe('pivotQueryResults', () => {
    it('pivots one group-by column into named value columns', () => {
        const { rows, pivotDetails } = pivotQueryResults({
            rows: [
                {
                    orders_region: 'US',
                    orders_quarter: 'Q1',
                    orders_revenue: 100,
                },
                {
                    orders_region: 'US',
                    orders_quarter: 'Q2',
                    orders_revenue: 200,
                },
                {
                    orders_region: 'EU',
                    orders_quarter: 'Q1',
                    orders_revenue: 150,
                },
                {
                    orders_region: 'EU',
                    orders_quarter: 'Q2',
                    orders_revenue: 250,
                },
            ],
            fields,
            pivotConfiguration: configuration(),
        });

        expect(rows).toEqual([
            {
                orders_region: 'US',
                orders_revenue_any_Q1: 100,
                orders_revenue_any_Q2: 200,
            },
            {
                orders_region: 'EU',
                orders_revenue_any_Q1: 150,
                orders_revenue_any_Q2: 250,
            },
        ]);
        expect(pivotDetails.valuesColumns).toEqual([
            {
                referenceField: 'orders_revenue',
                pivotColumnName: 'orders_revenue_any_Q1',
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [
                    {
                        referenceField: 'orders_quarter',
                        value: 'Q1',
                        formatted: 'Q1',
                    },
                ],
                columnIndex: 0,
            },
            {
                referenceField: 'orders_revenue',
                pivotColumnName: 'orders_revenue_any_Q2',
                aggregation: VizAggregationOptions.ANY,
                pivotValues: [
                    {
                        referenceField: 'orders_quarter',
                        value: 'Q2',
                        formatted: 'Q2',
                    },
                ],
                columnIndex: 1,
            },
        ]);
        expect(pivotDetails.totalColumnCount).toBe(2);
        expect(pivotDetails.originalColumns).toEqual({
            orders_region: {
                reference: 'orders_region',
                type: DimensionType.STRING,
            },
            orders_quarter: {
                reference: 'orders_quarter',
                type: DimensionType.STRING,
            },
            orders_revenue: {
                reference: 'orders_revenue',
                type: DimensionType.NUMBER,
            },
        });
    });

    it('joins several group-by values into the column name and leaves missing cells null', () => {
        const { rows, pivotDetails } = pivotQueryResults({
            rows: [
                {
                    orders_region: 'US',
                    orders_year: '2024',
                    orders_quarter: 'Q1',
                    orders_revenue: 100,
                },
                {
                    orders_region: 'US',
                    orders_year: '2024',
                    orders_quarter: 'Q2',
                    orders_revenue: 200,
                },
                {
                    orders_region: 'EU',
                    orders_year: '2024',
                    orders_quarter: 'Q1',
                    orders_revenue: 150,
                },
            ],
            fields,
            pivotConfiguration: configuration({
                groupByColumns: [
                    { reference: 'orders_year' },
                    { reference: 'orders_quarter' },
                ],
            }),
        });

        expect(rows).toEqual([
            {
                orders_region: 'US',
                orders_revenue_any_2024_Q1: 100,
                orders_revenue_any_2024_Q2: 200,
            },
            {
                orders_region: 'EU',
                orders_revenue_any_2024_Q1: 150,
                orders_revenue_any_2024_Q2: null,
            },
        ]);
        expect(pivotDetails.valuesColumns[1].pivotValues).toEqual([
            { referenceField: 'orders_year', value: '2024', formatted: '2024' },
            { referenceField: 'orders_quarter', value: 'Q2', formatted: 'Q2' },
        ]);
    });

    it('pivots every value column and aggregates repeated cells', () => {
        const { rows } = pivotQueryResults({
            rows: [
                {
                    orders_region: 'US',
                    orders_quarter: 'Q1',
                    orders_revenue: 100,
                    orders_orders: 1,
                },
                {
                    orders_region: 'US',
                    orders_quarter: 'Q1',
                    orders_revenue: 50,
                    orders_orders: 2,
                },
            ],
            fields,
            pivotConfiguration: configuration({
                valuesColumns: [
                    {
                        reference: 'orders_revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                    {
                        reference: 'orders_orders',
                        aggregation: VizAggregationOptions.ANY,
                    },
                ],
            }),
        });

        expect(rows).toEqual([
            {
                orders_region: 'US',
                orders_revenue_sum_Q1: 150,
                orders_orders_any_Q1: 1,
            },
        ]);
    });

    it('keeps the rows in query order and names null group-by values', () => {
        const { rows } = pivotQueryResults({
            rows: [
                {
                    orders_region: 'EU',
                    orders_quarter: null,
                    orders_revenue: 1,
                },
                {
                    orders_region: 'US',
                    orders_quarter: 'Q1',
                    orders_revenue: 2,
                },
            ],
            fields,
            pivotConfiguration: configuration(),
        });

        expect(rows.map((row) => row.orders_region)).toEqual(['EU', 'US']);
        expect(Object.keys(rows[0])).toEqual([
            'orders_region',
            'orders_revenue_any_<null>',
            'orders_revenue_any_Q1',
        ]);
    });
});
