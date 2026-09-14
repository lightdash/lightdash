import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    type BaseFilterRule,
    type DashboardFilterRule,
    type DashboardFilterableField,
    type FilterableItem,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getConditionalRuleLabel,
    getFilterRuleTables,
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

    it('should not show a value for is null / is not null operators even with stale values', () => {
        const nullRule: BaseFilterRule = {
            id: 'test-rule-id',
            operator: FilterOperator.NULL,
            values: ['2024-01-01'],
        };
        const notNullRule: BaseFilterRule = {
            id: 'test-rule-id',
            operator: FilterOperator.NOT_NULL,
            values: ['2024-01-01'],
        };

        expect(
            getConditionalRuleLabel(nullRule, FilterType.DATE, 'Created At'),
        ).toEqual({
            field: 'Created At',
            operator: 'is null',
            value: undefined,
        });
        expect(
            getConditionalRuleLabel(notNullRule, FilterType.DATE, 'Created At')
                .value,
        ).toBeUndefined();
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

describe('getFilterRuleTables', () => {
    it("uses each targeted tile's own join label when aliases collide", () => {
        const fieldA: DashboardFilterableField = {
            table: 'team',
            name: 'name',
            tableLabel: 'Team at Event A',
            label: 'Name',
            fieldType: FieldType.DIMENSION,
            type: DimensionType.STRING,
            sql: '${TABLE}.name',
            hidden: false,
        };
        const fieldB = {
            ...fieldA,
            tableLabel: 'Team at Event B',
        };
        const target = { fieldId: 'team_name', tableName: 'team' };
        const rule: DashboardFilterRule = {
            id: 'filter',
            label: undefined,
            operator: FilterOperator.EQUALS,
            target,
            tileTargets: { 'tile-a': false, 'tile-b': target },
        };
        const fieldsByTile = { 'tile-a': [fieldA], 'tile-b': [fieldB] };
        expect(
            getFilterRuleTables(rule, fieldB, [fieldA, fieldB], fieldsByTile),
        ).toEqual(['Team at Event B']);
        const sharedRule: DashboardFilterRule = {
            ...rule,
            tileTargets: { 'tile-a': target, 'tile-b': target },
        };
        expect(
            getFilterRuleTables(
                sharedRule,
                fieldB,
                [fieldA, fieldB],
                fieldsByTile,
            ),
        ).toEqual(['Team at Event A', 'Team at Event B']);
    });
});
