import { DimensionType, FieldType } from '../types/field';
import { FilterOperator } from '../types/filter';
import {
    createConditionalFormattingConfigWithSingleColor,
    createConditionalFormattingRuleWithValues,
    hasMatchingConditionalRules,
} from './conditionalFormatting';

// Mock field for testing
const mockNumericField = {
    name: 'test_field',
    table: 'test_table',
    type: DimensionType.NUMBER,
    fieldType: FieldType.DIMENSION,
    sql: 'test_sql',
    tableLabel: 'Test Table',
    label: 'Test Field',
    hidden: false,
};

describe('hasMatchingConditionalRules', () => {
    describe('LESS_THAN_OR_EQUAL operator', () => {
        it('should return true when field value is less than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                5, // less than 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return true when field value equals rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // equals 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return false when field value is greater than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                15, // greater than 10
                {},
                config,
            );

            expect(result).toBe(false);
        });
    });

    describe('GREATER_THAN_OR_EQUAL operator', () => {
        it('should return true when field value is greater than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                15, // greater than 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return true when field value equals rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // equals 10
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should return false when field value is less than rule value', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [10];
            config.rules = [rule];

            const result = hasMatchingConditionalRules(
                mockNumericField,
                5, // less than 10
                {},
                config,
            );

            expect(result).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('should handle multiple values with LESS_THAN_OR_EQUAL', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.LESS_THAN_OR_EQUAL;
            rule.values = [5, 15];
            config.rules = [rule];

            // Should match if value is <= any of the rule values
            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // <= 15 (second value)
                {},
                config,
            );

            expect(result).toBe(true);
        });

        it('should handle multiple values with GREATER_THAN_OR_EQUAL', () => {
            const config =
                createConditionalFormattingConfigWithSingleColor('#ff0000');
            const rule = createConditionalFormattingRuleWithValues();
            rule.operator = FilterOperator.GREATER_THAN_OR_EQUAL;
            rule.values = [5, 15];
            config.rules = [rule];

            // Should match if value is >= any of the rule values
            const result = hasMatchingConditionalRules(
                mockNumericField,
                10, // >= 5 (first value)
                {},
                config,
            );

            expect(result).toBe(true);
        });
    });
});
