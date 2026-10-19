import {
    DimensionType,
    FieldType,
    MetricType,
    type ItemsMap,
} from '../../../../types/field';
import { TimeFrames } from '../../../../types/timeFrames';
import { VizAggregationOptions } from '../../../../visualizations/types';
import { getWarehousePivotedResults } from './getWarehousePivotedResults';

const fieldsMap = Object.fromEntries(
    [
        ['status', 'Status', FieldType.DIMENSION, DimensionType.STRING],
        [
            'created_week',
            'Created week',
            FieldType.DIMENSION,
            DimensionType.DATE,
        ],
        ['count', 'Count', FieldType.METRIC, MetricType.COUNT],
        ['revenue', 'Revenue', FieldType.METRIC, MetricType.SUM],
    ].map(([name, label, fieldType, type]) => [
        `orders_${name}`,
        {
            fieldType,
            type,
            name,
            label,
            table: 'orders',
            sql: '',
            ...(name === 'created_week' && { timeInterval: TimeFrames.WEEK }),
        },
    ]),
) as unknown as ItemsMap;

const column = (
    referenceField: string,
    pivotValues: {
        referenceField?: string;
        value: unknown;
        formatted?: string;
    }[],
) => ({
    referenceField,
    pivotColumnName: `${referenceField}_any_${pivotValues
        .map(({ value }) => String(value))
        .join('_')}`,
    aggregation: VizAggregationOptions.ANY,
    pivotValues: pivotValues.map((pivotValue) => ({
        referenceField: 'orders_status',
        ...pivotValue,
    })),
    columnIndex: 0,
});
const statusColumn = (referenceField: string, status: string) =>
    column(referenceField, [{ value: status }]);

const rows = [{ orders_order_date: '2024-01-01', orders_count_any_a: 1 }];

const pivotWith = (
    valuesColumns: ReturnType<typeof column>[],
    metrics: string[],
    secondaryMetrics: string[] = [],
) =>
    getWarehousePivotedResults({
        rows,
        fieldsMap,
        valuesColumns,
        parameters: null,
        timezone: null,
    })([], fieldsMap, ['orders_status'], metrics, secondaryMetrics, []);

describe('getWarehousePivotedResults', () => {
    it('returns the warehouse rows, joins pivot values and only plots the requested metrics', async () => {
        await expect(
            pivotWith(
                [
                    statusColumn('orders_count', 'a'),
                    column('orders_count', [{ value: 'b' }, { value: 'c' }]),
                    statusColumn('orders_revenue', 'a'),
                ],
                ['orders_count'],
            ),
        ).resolves.toEqual({
            results: [{ ...rows[0], orders_count_any_b_c: null }],
            metrics: ['orders_count_any_a', 'orders_count_any_b_c'],
            secondaryMetrics: [],
            labels: {
                orders_count_any_a: 'a',
                orders_count_any_b_c: 'b - c',
            },
        });
    });

    it('gives every row each plotted key, since warehouse rows omit empty pivot cells', async () => {
        const sparseRows = [
            { orders_created_week: '2024-01-01', orders_count_any_a: 1 },
            { orders_created_week: '2024-01-08', orders_count_any_b: 2 },
        ];
        const { results } = await getWarehousePivotedResults({
            rows: sparseRows,
            fieldsMap,
            valuesColumns: [
                statusColumn('orders_count', 'a'),
                statusColumn('orders_count', 'b'),
            ],
            parameters: null,
            timezone: null,
        })([], fieldsMap, ['orders_status'], ['orders_count'], [], []);

        expect(results).toEqual([
            {
                orders_created_week: '2024-01-01',
                orders_count_any_a: 1,
                orders_count_any_b: null,
            },
            {
                orders_created_week: '2024-01-08',
                orders_count_any_a: null,
                orders_count_any_b: 2,
            },
        ]);
    });

    it.each([
        {
            plotted: 'several primary metrics',
            metrics: ['orders_count', 'orders_revenue'],
            secondaryMetrics: [],
            expectedMetrics: [
                'orders_count_any_a',
                'orders_revenue_any_a',
                'orders_revenue_any_b',
            ],
            expectedSecondaryMetrics: [],
        },
        {
            plotted: 'one primary and a secondary metric',
            metrics: ['orders_count'],
            secondaryMetrics: ['orders_revenue'],
            expectedMetrics: ['orders_count_any_a'],
            expectedSecondaryMetrics: [
                'orders_revenue_any_a',
                'orders_revenue_any_b',
            ],
        },
    ])(
        'prefixes labels with the metric when $plotted are plotted',
        async ({
            metrics,
            secondaryMetrics,
            expectedMetrics,
            expectedSecondaryMetrics,
        }) => {
            await expect(
                pivotWith(
                    [
                        statusColumn('orders_count', 'a'),
                        statusColumn('orders_revenue', 'a'),
                        statusColumn('orders_revenue', 'b'),
                    ],
                    metrics,
                    secondaryMetrics,
                ),
            ).resolves.toMatchObject({
                metrics: expectedMetrics,
                secondaryMetrics: expectedSecondaryMetrics,
                labels: {
                    orders_count_any_a: '[a] Count',
                    orders_revenue_any_a: '[a] Revenue',
                    orders_revenue_any_b: '[b] Revenue',
                },
            });
        },
    );

    it.each([
        {
            name: 'a date like the app, not with the stored formatted value',
            pivotValue: {
                referenceField: 'orders_created_week',
                value: '2024-01-01T00:00:00.000Z',
                formatted: 'stale',
            },
            label: '2024-01-01',
        },
        {
            name: 'a null value the way the app does',
            pivotValue: { value: null, formatted: 'null' },
            label: '∅',
        },
    ])('labels $name', async ({ pivotValue, label }) => {
        const result = await pivotWith(
            [column('orders_count', [pivotValue])],
            ['orders_count'],
        );

        expect(Object.values(result.labels)).toEqual([label]);
    });
});
