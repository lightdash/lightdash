import {
    Compact,
    ComparisonDiffTypes,
    ComparisonFormatTypes,
    CustomFormatType,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    TableCalculationType,
    TimeFrames,
    type ConditionalFormattingConfigWithSingleColor,
    type Dimension,
    type ItemsMap,
    type Metric,
    type ResultRow,
    type TableCalculation,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    formatBigNumberValue,
    formatComparisonValue,
    getAvailableBigNumberFieldIds,
    isBigNumberValue,
    resolveBigNumberChartConfig,
    resolveBigNumberSelectedField,
} from './config';
import { buildBigNumberModel } from './model';

const revenue: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    hidden: false,
};

const orderDate: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    name: 'order_date_month',
    label: 'Order date month',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.order_date',
    hidden: false,
    timeInterval: TimeFrames.MONTH,
    timeIntervalBaseDimensionName: 'order_date',
};

const growth: TableCalculation = {
    name: 'growth',
    displayName: 'Growth',
    sql: '${orders.revenue} * 2',
    type: TableCalculationType.NUMBER,
};

const itemsMap: ItemsMap = {
    orders_order_date_month: orderDate,
    orders_revenue: revenue,
    growth,
};

const row = (
    date: string,
    revenueValue: number,
    growthValue: number,
): ResultRow => ({
    orders_order_date_month: {
        value: { raw: date, formatted: date },
    },
    orders_revenue: {
        value: { raw: revenueValue, formatted: String(revenueValue) },
    },
    growth: {
        value: { raw: growthValue, formatted: String(growthValue) },
    },
});

const rows = [row('2024-02-01', 1500, 3000), row('2024-01-01', 1000, 2000)];

describe('getAvailableBigNumberFieldIds', () => {
    test('puts metrics first, then table calculations, then dimensions', () => {
        expect(getAvailableBigNumberFieldIds(itemsMap)).toEqual([
            'orders_revenue',
            'growth',
            'orders_order_date_month',
        ]);
    });

    test('is empty without items', () => {
        expect(getAvailableBigNumberFieldIds(undefined)).toEqual([]);
    });
});

describe('resolveBigNumberSelectedField', () => {
    const availableFieldsIds = getAvailableBigNumberFieldIds(itemsMap);

    test('keeps the saved field when it exists', () => {
        expect(
            resolveBigNumberSelectedField({
                selectedField: undefined,
                configSelectedField: 'growth',
                itemsMap,
                availableFieldsIds,
            }),
        ).toBe('growth');
    });

    test('falls back to the first available field when the saved one is gone', () => {
        expect(
            resolveBigNumberSelectedField({
                selectedField: 'orders_deleted',
                configSelectedField: 'orders_deleted',
                itemsMap,
                availableFieldsIds,
            }),
        ).toBe('orders_revenue');
    });

    test('follows a renamed table calculation', () => {
        expect(
            resolveBigNumberSelectedField({
                selectedField: 'old_growth',
                configSelectedField: 'old_growth',
                itemsMap,
                availableFieldsIds,
                tableCalculationsMetadata: [
                    { name: 'growth', oldName: 'old_growth' },
                ],
            }),
        ).toBe('growth');
    });

    test('keeps the current selection once set', () => {
        expect(
            resolveBigNumberSelectedField({
                selectedField: 'growth',
                configSelectedField: 'orders_revenue',
                itemsMap,
                availableFieldsIds,
            }),
        ).toBeUndefined();
    });

    test('does nothing without items', () => {
        expect(
            resolveBigNumberSelectedField({
                selectedField: undefined,
                configSelectedField: 'growth',
                itemsMap: undefined,
                availableFieldsIds: [],
            }),
        ).toBeUndefined();
    });
});

describe('resolveBigNumberChartConfig', () => {
    test('fills the editor defaults and picks the first field', () => {
        expect(
            resolveBigNumberChartConfig({ chartConfig: {}, itemsMap }),
        ).toEqual({
            label: undefined,
            style: undefined,
            selectedField: 'orders_revenue',
            showBigNumberLabel: true,
            showTableNamesInLabel: true,
            showComparison: false,
            comparisonFormat: ComparisonFormatTypes.RAW,
            flipColors: false,
            comparisonLabel: undefined,
            conditionalFormattings: [],
            comparisonField: undefined,
        });
    });

    test('keeps the saved settings', () => {
        const resolved = resolveBigNumberChartConfig({
            chartConfig: {
                selectedField: 'growth',
                label: 'Growth {granularity}',
                style: Compact.THOUSANDS,
                showComparison: true,
                comparisonFormat: ComparisonFormatTypes.PERCENTAGE,
                flipColors: true,
                showBigNumberLabel: false,
                showTableNamesInLabel: false,
            },
            itemsMap,
        });
        expect(resolved.selectedField).toBe('growth');
        expect(resolved.style).toBe(Compact.THOUSANDS);
        expect(resolved.showComparison).toBe(true);
        expect(resolved.comparisonFormat).toBe(
            ComparisonFormatTypes.PERCENTAGE,
        );
        expect(resolved.flipColors).toBe(true);
        expect(resolved.showBigNumberLabel).toBe(false);
        expect(resolved.showTableNamesInLabel).toBe(false);
    });

    test('leaves the field unselected without a config', () => {
        expect(
            resolveBigNumberChartConfig({ chartConfig: undefined, itemsMap })
                .selectedField,
        ).toBeUndefined();
    });

    test('keeps the saved field when there are no items yet', () => {
        expect(
            resolveBigNumberChartConfig({
                chartConfig: { selectedField: 'growth' },
                itemsMap: undefined,
            }).selectedField,
        ).toBe('growth');
    });
});

describe('isBigNumberValue', () => {
    test('accepts numbers of numeric items', () => {
        expect(isBigNumberValue(revenue, 12)).toBe(true);
        expect(isBigNumberValue(revenue, '12')).toBe(true);
    });

    test('rejects dates, NaN and non numeric items', () => {
        expect(isBigNumberValue(revenue, new Date())).toBe(false);
        expect(isBigNumberValue(revenue, 'abc')).toBe(false);
        expect(isBigNumberValue(orderDate, 12)).toBe(false);
        expect(isBigNumberValue(undefined, 12)).toBe(false);
    });
});

describe('formatBigNumberValue', () => {
    test('honours the field format without a style', () => {
        expect(
            formatBigNumberValue({ ...revenue, round: 1 }, 1234.56, undefined),
        ).toBe('1,234.6');
    });

    test('applies a compact style over the field format', () => {
        expect(
            formatBigNumberValue(
                { ...revenue, round: 1 },
                1234.56,
                Compact.THOUSANDS,
            ),
        ).toBe('1.2K');
    });

    test('turns a default custom format into a number so the style applies', () => {
        expect(
            formatBigNumberValue(
                {
                    ...revenue,
                    formatOptions: { type: CustomFormatType.DEFAULT },
                },
                1234567,
                Compact.MILLIONS,
            ),
        ).toBe('1.235M');
    });

    test('formats a table calculation with its own format', () => {
        expect(
            formatBigNumberValue(
                {
                    ...growth,
                    format: { type: CustomFormatType.PERCENT, round: 0 },
                },
                0.25,
                Compact.THOUSANDS,
            ),
        ).toBe('25%');
    });
});

describe('formatComparisonValue', () => {
    test('prefixes positive raw values with a plus', () => {
        expect(
            formatComparisonValue(
                ComparisonFormatTypes.RAW,
                ComparisonDiffTypes.POSITIVE,
                revenue,
                500,
                undefined,
            ),
        ).toBe('+500');
    });

    test('formats percentages with no decimals', () => {
        expect(
            formatComparisonValue(
                ComparisonFormatTypes.PERCENTAGE,
                ComparisonDiffTypes.NEGATIVE,
                revenue,
                -0.333,
                undefined,
            ),
        ).toBe('-33%');
    });

    test('shows n/a for an undefined value', () => {
        expect(
            formatComparisonValue(
                ComparisonFormatTypes.RAW,
                ComparisonDiffTypes.UNDEFINED,
                revenue,
                'undefined',
                undefined,
            ),
        ).toBe('n/a');
    });
});

describe('buildBigNumberModel', () => {
    const chartConfig = resolveBigNumberChartConfig({
        chartConfig: { selectedField: 'orders_revenue', showComparison: true },
        itemsMap,
    });

    test('formats the first row and compares it to the second', () => {
        const model = buildBigNumberModel({
            resultsData: { rows },
            itemsMap,
            chartConfig,
        });
        expect(model.value).toBe('1,500');
        expect(model.label).toBe('Orders Revenue');
        expect(model.defaultLabel).toBe('Orders Revenue');
        expect(model.showLabel).toBe(true);
        expect(model.showComparison).toBe(true);
        expect(model.showStyle).toBe(true);
        expect(model.comparison).toEqual({
            formattedValue: '+500',
            direction: ComparisonDiffTypes.POSITIVE,
            label: undefined,
            tooltip: '+500 compared to previous row',
        });
        expect(model.granularityFields).toEqual(['orders_order_date']);
    });

    test('hides the table name and resolves granularity in labels', () => {
        const model = buildBigNumberModel({
            resultsData: { rows },
            itemsMap,
            chartConfig: {
                ...chartConfig,
                showTableNamesInLabel: false,
                label: 'Revenue per ${orders_order_date.granularity}',
                comparisonLabel: 'vs last ${orders_order_date.granularity}',
            },
        });
        expect(model.defaultLabel).toBe('Revenue');
        expect(model.resolvedLabel).toBe('Revenue per month');
        expect(model.label).toBe('Revenue per month');
        expect(model.comparison.label).toBe('vs last month');
    });

    test('compares as a percentage with a compact style', () => {
        const model = buildBigNumberModel({
            resultsData: { rows },
            itemsMap,
            chartConfig: {
                ...chartConfig,
                style: Compact.THOUSANDS,
                comparisonFormat: ComparisonFormatTypes.PERCENTAGE,
            },
        });
        expect(model.value).toBe('1.50K');
        expect(model.comparison.formattedValue).toBe('+50%');
    });

    test('compares against another field of the first row', () => {
        const model = buildBigNumberModel({
            resultsData: { rows },
            itemsMap,
            chartConfig: { ...chartConfig, comparisonField: 'growth' },
        });
        expect(model.comparison).toEqual({
            formattedValue: '-1,500',
            direction: ComparisonDiffTypes.NEGATIVE,
            label: undefined,
            tooltip: '-1,500 compared to comparison field',
        });
    });

    test('reports a missing previous row', () => {
        const model = buildBigNumberModel({
            resultsData: { rows: rows.slice(0, 1) },
            itemsMap,
            chartConfig,
        });
        expect(model.comparison).toEqual({
            formattedValue: 'n/a',
            direction: ComparisonDiffTypes.UNDEFINED,
            label: undefined,
            tooltip: 'There is no previous row to compare to',
        });
    });

    test('shows a non numeric field as formatted, without a style', () => {
        const model = buildBigNumberModel({
            resultsData: { rows },
            itemsMap,
            chartConfig: {
                ...chartConfig,
                selectedField: 'orders_order_date_month',
            },
        });
        expect(model.value).toBe('2024-02-01');
        expect(model.showStyle).toBe(false);
        expect(model.comparison.direction).toBe(ComparisonDiffTypes.NAN);
        expect(model.comparison.formattedValue).toBe('2024-01-01');
    });

    test('colours the value from a matching conditional format', () => {
        const rule: ConditionalFormattingConfigWithSingleColor = {
            target: { fieldId: 'orders_revenue' },
            color: '#ff0000',
            darkColor: '#00ff00',
            rules: [
                {
                    id: 'rule',
                    operator: FilterOperator.GREATER_THAN,
                    values: [1000],
                },
            ],
        };
        const model = buildBigNumberModel({
            resultsData: { rows },
            itemsMap,
            chartConfig: { ...chartConfig, conditionalFormattings: [rule] },
        });
        expect(model.valueColor).toBe('light-dark(#ff0000, #00ff00)');
    });

    test('has no value without results', () => {
        const model = buildBigNumberModel({
            resultsData: undefined,
            itemsMap,
            chartConfig,
        });
        expect(model.value).toBeUndefined();
        expect(model.comparison.direction).toBe(ComparisonDiffTypes.UNDEFINED);
    });
});
