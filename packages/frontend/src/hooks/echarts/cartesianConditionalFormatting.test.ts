import {
    createConditionalFormattingConfigWithColorRange,
    createConditionalFormattingConfigWithSingleColor,
    DimensionType,
    FieldType,
    FilterOperator,
    getItemId,
    type ItemsMap,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import { getCartesianConditionalFormattingColor } from './cartesianConditionalFormatting';

const itemsMap: ItemsMap = {
    metric_value: {
        compiledSql: '',
        tablesReferences: [],
        fieldType: FieldType.DIMENSION,
        hidden: false,
        label: 'Metric value',
        name: 'metric_value',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        type: DimensionType.NUMBER,
    } as ItemsMap[string],
    comparison_value: {
        compiledSql: '',
        tablesReferences: [],
        fieldType: FieldType.DIMENSION,
        hidden: false,
        label: 'Comparison value',
        name: 'comparison_value',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        type: DimensionType.NUMBER,
    } as ItemsMap[string],
};

describe('getCartesianConditionalFormattingColor', () => {
    test('returns the last matching conditional formatting color', () => {
        const redConfig = createConditionalFormattingConfigWithSingleColor(
            '#ff0000',
            {
                fieldId: getItemId(itemsMap.metric_value),
            },
        );
        redConfig.rules = [
            {
                id: 'red',
                operator: FilterOperator.LESS_THAN,
                values: [10],
            },
        ];

        const greenConfig = createConditionalFormattingConfigWithSingleColor(
            '#00ff00',
            {
                fieldId: getItemId(itemsMap.metric_value),
            },
        );
        greenConfig.rules = [
            {
                id: 'green',
                operator: FilterOperator.LESS_THAN,
                values: [20],
            },
        ];

        expect(
            getCartesianConditionalFormattingColor({
                itemsMap,
                conditionalFormattings: [redConfig, greenConfig],
                rowValues: { metric_value: 5 },
                series: {
                    encode: {
                        yRef: {
                            field: 'metric_value',
                        },
                    },
                } as any,
            }),
        ).toBe('#00ff00');
    });

    test('returns undefined when no rules match', () => {
        const config = createConditionalFormattingConfigWithSingleColor(
            '#ff0000',
            {
                fieldId: getItemId(itemsMap.metric_value),
            },
        );
        config.rules = [
            {
                id: 'red',
                operator: FilterOperator.GREATER_THAN,
                values: [10],
            },
        ];

        expect(
            getCartesianConditionalFormattingColor({
                itemsMap,
                conditionalFormattings: [config],
                rowValues: { metric_value: 5 },
                series: {
                    encode: {
                        yRef: {
                            field: 'metric_value',
                        },
                    },
                } as any,
            }),
        ).toBeUndefined();
    });

    test('supports compare-target rules using row fields from the same bar', () => {
        const config = createConditionalFormattingConfigWithSingleColor(
            '#ff0000',
            {
                fieldId: getItemId(itemsMap.metric_value),
            },
        );
        config.rules = [
            {
                id: 'compare-target',
                operator: FilterOperator.NOT_EQUALS,
                compareTarget: {
                    fieldId: getItemId(itemsMap.comparison_value),
                },
            },
        ];

        expect(
            getCartesianConditionalFormattingColor({
                itemsMap,
                conditionalFormattings: [config],
                rowValues: {
                    metric_value: 5,
                    comparison_value: 10,
                },
                series: {
                    encode: {
                        yRef: {
                            field: 'metric_value',
                        },
                    },
                } as any,
            }),
        ).toBe('#ff0000');
    });

    test('ignores unsupported config types when selecting the last matching color', () => {
        const singleColorConfig =
            createConditionalFormattingConfigWithSingleColor('#00ff00', {
                fieldId: getItemId(itemsMap.metric_value),
            });
        singleColorConfig.rules = [
            {
                id: 'single-color',
                operator: FilterOperator.LESS_THAN,
                values: [20],
            },
        ];

        const rangeConfig = createConditionalFormattingConfigWithColorRange(
            '#ff0000',
            {
                fieldId: getItemId(itemsMap.metric_value),
            },
        );
        rangeConfig.rule = {
            min: 0,
            max: 50,
        };

        expect(
            getCartesianConditionalFormattingColor({
                itemsMap,
                conditionalFormattings: [singleColorConfig, rangeConfig],
                rowValues: { metric_value: 5 },
                series: {
                    encode: {
                        yRef: {
                            field: 'metric_value',
                        },
                    },
                } as any,
            }),
        ).toBe('#00ff00');
    });
});
