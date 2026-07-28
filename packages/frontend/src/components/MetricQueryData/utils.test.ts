/// <reference types="vitest/globals" />
import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type EChartsSeries,
    type ItemsMap,
} from '@lightdash/common';
import { type EchartsSeriesClickEvent } from '../SimpleChart';
import { getDataFromChartClick } from './utils';

const weekDimension: CompiledDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name: 'order_date_week',
    label: 'Order date week',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    compiledSql: '',
    tablesReferences: ['orders'],
    hidden: false,
};

const priorityDimension: CompiledDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'order_priority',
    label: 'Order priority',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    compiledSql: '',
    tablesReferences: ['orders'],
    hidden: false,
};

const countMetric: CompiledMetric = {
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT_DISTINCT,
    name: 'unique_order_count',
    label: 'Unique order count',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    compiledSql: '',
    tablesReferences: ['orders'],
    hidden: false,
};

const itemsMap: ItemsMap = {
    orders_order_date_week: weekDimension,
    orders_order_priority: priorityDimension,
    orders_unique_order_count: countMetric,
};

const series: EChartsSeries[] = [
    {
        type: 'bar',
        encode: {
            x: 'orders_order_date_week',
            y: 'orders_unique_order_count',
            tooltip: [],
            seriesName: 'orders_unique_order_count',
        },
    } as unknown as EChartsSeries,
];

const baseClickEvent = {
    componentType: 'series' as const,
    seriesIndex: 0,
    dataIndex: 0,
    dimensionNames: ['orders_order_date_week', 'orders_unique_order_count'],
    event: { event: {} as MouseEvent },
} as EchartsSeriesClickEvent;

describe('getDataFromChartClick', () => {
    test('tuple-mode click restores non-plotted columns from the dataset row', () => {
        const result = getDataFromChartClick(
            {
                ...baseClickEvent,
                value: ['2024-12-30', 4],
                data: { value: ['2024-12-30', 4] },
                datasetRow: {
                    orders_order_date_week: '2024-12-30',
                    orders_order_priority: 'urgent',
                    orders_unique_order_count: 4,
                },
            },
            itemsMap,
            series,
        );

        expect(result.fieldValues.orders_order_date_week?.raw).toBe(
            '2024-12-30',
        );
        expect(result.fieldValues.orders_order_priority?.raw).toBe('urgent');
        expect(result.item).toBe(countMetric);
        expect(result.value.raw).toBe(4);
    });

    test('tuple values win over dataset row values for plotted columns', () => {
        const result = getDataFromChartClick(
            {
                ...baseClickEvent,
                value: ['2024-12-30', 4],
                data: { value: ['2024-12-30', 4] },
                datasetRow: {
                    orders_order_date_week: 'some-other-week',
                    orders_unique_order_count: 999,
                },
            },
            itemsMap,
            series,
        );

        expect(result.fieldValues.orders_order_date_week?.raw).toBe(
            '2024-12-30',
        );
        expect(result.value.raw).toBe(4);
    });

    test('tuple-mode click without a dataset row keeps plotted columns only', () => {
        const result = getDataFromChartClick(
            {
                ...baseClickEvent,
                value: ['2024-12-30', 4],
                data: { value: ['2024-12-30', 4] },
            },
            itemsMap,
            series,
        );

        expect(result.fieldValues.orders_order_date_week?.raw).toBe(
            '2024-12-30',
        );
        expect(result.fieldValues.orders_order_priority).toBeUndefined();
    });

    test('converts ∅ placeholders to null in dataset row values', () => {
        const result = getDataFromChartClick(
            {
                ...baseClickEvent,
                value: ['2024-12-30', 4],
                data: { value: ['2024-12-30', 4] },
                datasetRow: {
                    orders_order_date_week: '2024-12-30',
                    orders_order_priority: '∅',
                },
            },
            itemsMap,
            series,
        );

        expect(result.fieldValues.orders_order_priority?.raw).toBeNull();
    });

    test('object-mode click (non-stacked) reads fields from event data', () => {
        const result = getDataFromChartClick(
            {
                ...baseClickEvent,
                value: 4,
                data: {
                    orders_order_date_week: '2024-12-30',
                    orders_order_priority: 'urgent',
                    orders_unique_order_count: 4,
                },
            },
            itemsMap,
            series,
        );

        expect(result.fieldValues.orders_order_priority?.raw).toBe('urgent');
        expect(result.value.raw).toBe(4);
    });
});
