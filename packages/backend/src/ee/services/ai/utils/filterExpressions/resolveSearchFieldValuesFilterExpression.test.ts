import { FilterOperator } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { mockOrdersExplore } from '../validationExplore.mock';
import { formatFilterExpressionError } from './renderFilterExpressionError';
import { resolveSearchFieldValuesFilterExpression } from './resolveFilterExpressionArgs';

describe('resolveSearchFieldValuesFilterExpression', () => {
    it('resolves an AND dimension expression', () => {
        const result = resolveSearchFieldValuesFilterExpression({
            expressionInput:
                'orders_customer_name equals=Alice AND orders_amount greaterThan=100',
            explore: mockOrdersExplore,
        });

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.dimensions).toMatchObject({
            and: [
                {
                    target: { fieldId: 'orders_customer_name' },
                    operator: FilterOperator.EQUALS,
                    values: ['Alice'],
                },
                {
                    target: { fieldId: 'orders_amount' },
                    operator: FilterOperator.GREATER_THAN,
                    values: [100],
                },
            ],
        });
        expect(result.data.metrics).toMatchObject({ and: [] });
        expect(result.data.tableCalculations).toMatchObject({ and: [] });
    });

    it('returns a typed error for OR', () => {
        const result = resolveSearchFieldValuesFilterExpression({
            expressionInput:
                'orders_customer_name equals=Alice OR orders_customer_name equals=Bob',
            explore: mockOrdersExplore,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(formatFilterExpressionError(result.error))
            .toMatchInlineSnapshot(`
          "[FILTER_EXPRESSION_SEARCH_FIELD_VALUES_OR]
          Invalid dimension filter expression.

          Location: line 1, column 38
          Problem: Field-value search filter rules are always combined with AND and cannot use OR.
          How to fix: Keep only dimension rules that should all scope the value search, joined with AND."
        `);
    });

    it('returns the existing typed category error for metrics', () => {
        const result = resolveSearchFieldValuesFilterExpression({
            expressionInput: 'orders_total_revenue greaterThan=100',
            explore: mockOrdersExplore,
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.code).toBe('FILTER_EXPRESSION_WRONG_CATEGORY');
    });
});
