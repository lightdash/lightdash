import {
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
});
