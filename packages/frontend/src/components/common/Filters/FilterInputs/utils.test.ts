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
} from './utils';

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

    it('should append (null) for an equals string filter with includeNull', () => {
        const rule: BaseFilterRule = {
            id: 'test-rule-id',
            operator: FilterOperator.EQUALS,
            values: ['a', 'b'],
            includeNull: true,
        };

        const result = getConditionalRuleLabel(
            rule,
            FilterType.STRING,
            'Status',
        );

        expect(result.value).toBe('a, b, (null)');
    });

    it('should show only (null) when an equals string filter has no values but includeNull', () => {
        const rule: BaseFilterRule = {
            id: 'test-rule-id',
            operator: FilterOperator.EQUALS,
            values: [],
            includeNull: true,
        };

        const result = getConditionalRuleLabel(
            rule,
            FilterType.STRING,
            'Status',
        );

        expect(result.value).toBe('(null)');
    });

    it('should not append (null) for a non-equals string filter even if includeNull is set', () => {
        const rule: BaseFilterRule = {
            id: 'test-rule-id',
            operator: FilterOperator.NOT_EQUALS,
            values: ['a'],
            includeNull: true,
        };

        const result = getConditionalRuleLabel(
            rule,
            FilterType.STRING,
            'Status',
        );

        expect(result.value).toBe('a');
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
