import {
    DimensionType,
    FieldType,
    MetricType,
    TableCalculationType,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    getAvailableGaugeFieldIds,
    getEffectiveGaugeSelectedField,
    resolveGaugeChartConfig,
} from './config';

const metric = (name: string): Metric =>
    ({
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name,
        label: name,
        table: 'orders',
        tableLabel: 'Orders',
        sql: `\${TABLE}.${name}`,
        hidden: false,
    }) as Metric;

const numericTableCalculation: TableCalculation = {
    name: 'calc',
    displayName: 'Calc',
    sql: '1',
    type: TableCalculationType.NUMBER,
} as TableCalculation;

const stringDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
} as ItemsMap[string];

const itemsMap: ItemsMap = {
    orders_status: stringDimension,
    calc: numericTableCalculation,
    orders_revenue: metric('revenue'),
};

describe('getAvailableGaugeFieldIds', () => {
    test('lists numeric items, metrics before table calculations', () => {
        expect(getAvailableGaugeFieldIds(itemsMap)).toStrictEqual([
            'orders_revenue',
            'calc',
        ]);
    });

    test('is empty without items', () => {
        expect(getAvailableGaugeFieldIds(undefined)).toStrictEqual([]);
    });
});

describe('getEffectiveGaugeSelectedField', () => {
    test('keeps the selected field', () => {
        expect(getEffectiveGaugeSelectedField('calc', ['a'])).toBe('calc');
    });

    test('falls back to the first available field', () => {
        expect(getEffectiveGaugeSelectedField(undefined, ['a', 'b'])).toBe('a');
        expect(getEffectiveGaugeSelectedField(undefined, [])).toBeUndefined();
    });
});

describe('resolveGaugeChartConfig', () => {
    test('fills the defaults and picks the first numeric field', () => {
        expect(
            resolveGaugeChartConfig({ chartConfig: undefined, itemsMap }),
        ).toStrictEqual({
            selectedField: 'orders_revenue',
            min: 0,
            max: 100,
            maxFieldId: undefined,
            showAxisLabels: false,
            sections: [],
            customLabel: undefined,
            showPercentage: false,
            customPercentageLabel: undefined,
        });
    });

    test('keeps a saved config as is', () => {
        const chartConfig = {
            selectedField: 'calc',
            min: 10,
            max: 50,
            maxFieldId: 'orders_revenue',
            showAxisLabels: true,
            sections: [{ min: 0, max: 20, color: '#f00' }],
            customLabel: 'Label',
            showPercentage: true,
            customPercentageLabel: 'of target',
        };
        expect(
            resolveGaugeChartConfig({ chartConfig, itemsMap }),
        ).toStrictEqual(chartConfig);
    });
});
