import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
} from '../types/field';
import { type ResultColumns } from '../types/results';
import { TimeFrames } from '../types/timeFrames';
import { VizAggregationOptions, VizIndexType } from '../visualizations/types';
import {
    buildResultColumnItems,
    getResultColumnRole,
    pivotConfigurationToColumns,
    rekeyPivotDetails,
    rekeyRawRows,
} from './resultColumnItems';

const columns = {
    month: {
        reference: 'month',
        type: DimensionType.DATE,
        label: 'Order month',
        timeInterval: TimeFrames.MONTH,
    },
    status: { reference: 'status', type: DimensionType.STRING },
    revenue: {
        reference: 'revenue',
        type: DimensionType.NUMBER,
        label: 'Revenue',
        format: '[$$]#,##0.00',
    },
    order_count: {
        reference: 'order_count',
        type: DimensionType.NUMBER,
        provenance: {
            fieldId: 'orders_order_count',
            fieldType: FieldType.METRIC,
        },
    },
    customer_rank: {
        reference: 'customer_rank',
        type: DimensionType.NUMBER,
        provenance: { fieldId: 'orders_rank', fieldType: FieldType.DIMENSION },
    },
} satisfies ResultColumns;

describe('getResultColumnRole', () => {
    it('reads the role the producer declared before anything else', () => {
        expect(getResultColumnRole(columns.customer_rank, {})).toBe(
            'dimension',
        );
        expect(getResultColumnRole(columns.order_count, {})).toBe('metric');
    });

    it('lets an explicit role win over the declared one', () => {
        expect(
            getResultColumnRole(columns.order_count, {
                roles: { order_count: 'dimension' },
            }),
        ).toBe('dimension');
    });

    it('reads the pivot the result came from', () => {
        const pivotConfiguration = {
            indexColumn: { reference: 'month', type: VizIndexType.TIME },
            valuesColumns: [
                { reference: 'status', aggregation: VizAggregationOptions.ANY },
            ],
            groupByColumns: [{ reference: 'revenue' }],
        };
        expect(
            getResultColumnRole(columns.status, { pivotConfiguration }),
        ).toBe('metric');
        expect(
            getResultColumnRole(columns.revenue, { pivotConfiguration }),
        ).toBe('dimension');
    });

    it('falls back to the column type: numbers are metrics, the rest dimensions', () => {
        expect(getResultColumnRole(columns.revenue, {})).toBe('metric');
        expect(getResultColumnRole(columns.status, {})).toBe('dimension');
        expect(getResultColumnRole(columns.month, {})).toBe('dimension');
    });
});

describe('buildResultColumnItems', () => {
    const items = buildResultColumnItems(columns, {
        table: 'final',
        tableLabel: 'Final result',
    });

    it('keys items by <table>_<reference> and maps both ways', () => {
        expect(Object.keys(items.itemsMap)).toEqual([
            'final_month',
            'final_status',
            'final_revenue',
            'final_order_count',
            'final_customer_rank',
        ]);
        expect(items.fieldIdByColumn.revenue).toBe('final_revenue');
        expect(items.columnByFieldId.final_revenue).toBe('revenue');
    });

    it('synthesizes dimensions and metrics that carry the column metadata', () => {
        expect(items.itemsMap.final_month).toMatchObject({
            fieldType: FieldType.DIMENSION,
            type: DimensionType.DATE,
            name: 'month',
            table: 'final',
            tableLabel: 'Final result',
            label: 'Order month',
            timeInterval: TimeFrames.MONTH,
        });
        expect(items.itemsMap.final_revenue).toMatchObject({
            fieldType: FieldType.METRIC,
            type: MetricType.NUMBER,
            label: 'Revenue',
            format: '[$$]#,##0.00',
        });
        expect((items.itemsMap.final_status as Dimension).label).toBe('Status');
    });

    it('implies a query of dimensions then metrics in column order', () => {
        expect(items.metricQuery).toMatchObject({
            exploreName: 'final',
            dimensions: ['final_month', 'final_status', 'final_customer_rank'],
            metrics: ['final_revenue', 'final_order_count'],
            filters: {},
            sorts: [],
            tableCalculations: [],
        });
    });
});

describe('rekeying', () => {
    const fieldIdByColumn = { month: 'final_month', revenue: 'final_revenue' };

    it('rekeys rows and keeps keys without a field', () => {
        expect(
            rekeyRawRows(
                [{ month: '2024-01-01', revenue: 10, revenue_any_web: 4 }],
                fieldIdByColumn,
            ),
        ).toEqual([
            {
                final_month: '2024-01-01',
                final_revenue: 10,
                revenue_any_web: 4,
            },
        ]);
    });

    it('rekeys every reference of pivot details but the pivot column names', () => {
        const rekeyed = rekeyPivotDetails(
            {
                totalColumnCount: 2,
                indexColumn: { reference: 'month', type: VizIndexType.TIME },
                valuesColumns: [
                    {
                        referenceField: 'revenue',
                        pivotColumnName: 'revenue_any_web',
                        aggregation: VizAggregationOptions.ANY,
                        pivotValues: [
                            { referenceField: 'channel', value: 'web' },
                        ],
                    },
                ],
                groupByColumns: [{ reference: 'channel' }],
                sortBy: [{ reference: 'month', direction: 'ASC' }],
                originalColumns: columns,
            } as never,
            { ...fieldIdByColumn, channel: 'final_channel' },
        );
        expect(rekeyed.indexColumn).toEqual({
            reference: 'final_month',
            type: VizIndexType.TIME,
        });
        expect(rekeyed.valuesColumns[0]).toMatchObject({
            referenceField: 'final_revenue',
            pivotColumnName: 'revenue_any_web',
            pivotValues: [{ referenceField: 'final_channel', value: 'web' }],
        });
        expect(rekeyed.groupByColumns).toEqual([
            { reference: 'final_channel' },
        ]);
        expect(rekeyed.originalColumns.final_revenue.reference).toBe(
            'final_revenue',
        );
    });

    it('addresses a pivot configuration by result column for the engine', () => {
        expect(
            pivotConfigurationToColumns(
                {
                    indexColumn: {
                        reference: 'final_month',
                        type: VizIndexType.TIME,
                    },
                    valuesColumns: [
                        {
                            reference: 'final_revenue',
                            aggregation: VizAggregationOptions.ANY,
                        },
                    ],
                    groupByColumns: [{ reference: 'final_channel' }],
                    sortBy: undefined,
                },
                {
                    final_month: 'month',
                    final_revenue: 'revenue',
                    final_channel: 'channel',
                },
            ),
        ).toEqual({
            indexColumn: { reference: 'month', type: VizIndexType.TIME },
            valuesColumns: [
                {
                    reference: 'revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            groupByColumns: [{ reference: 'channel' }],
            sortBy: undefined,
        });
    });
});
