import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    type BaseFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
    getFilterOperatorOptions,
} from './utils';

describe('getFilterOperatorOptions', () => {
    it('returns exactly [NULL, NOT_NULL, INCLUDE, NOT_INCLUDE] for FilterType.ARRAY', () => {
        const options = getFilterOperatorOptions(FilterType.ARRAY);
        expect(options.map((o) => o.value)).toEqual([
            FilterOperator.NULL,
            FilterOperator.NOT_NULL,
            FilterOperator.INCLUDE,
            FilterOperator.NOT_INCLUDE,
        ]);
    });
});

describe('getConditionalRuleLabel', () => {
    it('should return correct labels for a string filter', () => {
        // Arrange
        const rule: BaseFilterRule = {
            id: 'test-rule-id',
            operator: FilterOperator.EQUALS,
            values: ['test-value'],
        };
        const filterType = FilterType.STRING;
        const label = 'Test Field';

        // Act
        const result = getConditionalRuleLabel(rule, filterType, label);

        // Assert
        expect(result).toEqual({
            field: 'Test Field',
            operator: 'is',
            value: 'test-value',
        });
    });

    it('should return correct labels for a number filter', () => {
        // Arrange
        const rule: BaseFilterRule = {
            id: 'test-rule-id',
            operator: FilterOperator.GREATER_THAN,
            values: [100],
        };
        const filterType = FilterType.NUMBER;
        const label = 'Amount';

        // Act
        const result = getConditionalRuleLabel(rule, filterType, label);

        // Assert
        expect(result).toEqual({
            field: 'Amount',
            operator: 'is greater than',
            value: '100',
        });
    });
});

describe('getConditionalRuleLabelFromItem', () => {
    it('should return correct labels for a field item', () => {
        // Arrange
        const rule: BaseFilterRule = {
            id: 'test-rule-id',
            operator: FilterOperator.EQUALS,
            values: ['test-value'],
        };
        const item: FilterableItem = {
            name: 'test_field',
            label: 'Test Field',
            type: DimensionType.STRING,
            table: 'test_table',
            tableLabel: 'Test Table',
            fieldType: FieldType.DIMENSION,
            sql: '',
            hidden: false,
        };

        // Act
        const result = getConditionalRuleLabelFromItem(rule, item);

        // Assert
        expect(result).toEqual({
            field: 'Test Field',
            operator: 'is',
            value: 'test-value',
        });
    });
});
