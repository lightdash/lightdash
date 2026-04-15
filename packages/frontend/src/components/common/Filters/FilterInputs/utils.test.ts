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
    formatDisplayValue,
    getConditionalRuleLabel,
    getConditionalRuleLabelFromItem,
} from './utils';

describe('formatDisplayValue', () => {
    it('should replace leading/trailing whitespace with ␣', () => {
        expect(formatDisplayValue('  hello  ')).toBe('␣␣hello␣␣');
    });

    it('should replace newlines with ↵', () => {
        expect(formatDisplayValue('line1\nline2')).toBe('line1↵line2');
    });

    it('should return unchanged string when no whitespace or newlines', () => {
        expect(formatDisplayValue('hello')).toBe('hello');
    });

    it('should handle empty string', () => {
        expect(formatDisplayValue('')).toBe('');
    });

    it('should handle number input without throwing', () => {
        expect(formatDisplayValue(123 as unknown as string)).toBe('123');
    });

    it('should handle null input without throwing', () => {
        expect(formatDisplayValue(null as unknown as string)).toBe('');
    });

    it('should handle undefined input without throwing', () => {
        expect(formatDisplayValue(undefined as unknown as string)).toBe('');
    });

    it('should handle boolean input without throwing', () => {
        expect(formatDisplayValue(true as unknown as string)).toBe('true');
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
