import {
    FILTER_EXPRESSION_MAX_RULES,
    FilterOperator,
    FilterType,
    type FilterExpressionSpan,
} from '@lightdash/common';
import type {
    FilterExpressionResolutionError,
    FilterExpressionSource,
} from './errors';
import { formatFilterExpressionError } from './renderFilterExpressionError';

const dimensionSource = {
    kind: 'queryFilter',
    exploreName: 'orders',
    category: 'dimensions',
} satisfies FilterExpressionSource;

const metricSource = {
    kind: 'queryFilter',
    exploreName: 'orders',
    category: 'metrics',
} satisfies FilterExpressionSource;

const tableCalculationSource = {
    kind: 'queryFilter',
    exploreName: 'orders',
    category: 'tableCalculations',
} satisfies FilterExpressionSource;

const customMetricSource = {
    kind: 'customMetricFilter',
    exploreName: 'orders',
    category: 'customMetric',
    customMetricName: 'completed_revenue',
} satisfies FilterExpressionSource;

const span = {
    start: { offset: 12, line: 2, column: 3 },
    end: { offset: 16, line: 2, column: 7 },
} satisfies FilterExpressionSpan;

const details = {
    span,
    problem: 'The expression is invalid.',
    guidance: 'Correct the expression.',
    example: 'field equals=value',
};

const errorsByCode: Record<
    FilterExpressionResolutionError['code'],
    FilterExpressionResolutionError
> = {
    FILTER_EXPRESSION_SYNTAX: {
        ...details,
        code: 'FILTER_EXPRESSION_SYNTAX',
        source: dimensionSource,
        parserMessage: 'Parser syntax error',
    },
    FILTER_EXPRESSION_MIXED_CONNECTORS: {
        ...details,
        code: 'FILTER_EXPRESSION_MIXED_CONNECTORS',
        source: metricSource,
        parserMessage: 'Mixed connectors',
    },
    FILTER_EXPRESSION_BOUNDS_EXCEEDED: {
        ...details,
        code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED',
        example: null,
        source: tableCalculationSource,
        limit: 'ruleCount',
        maximum: FILTER_EXPRESSION_MAX_RULES,
        actual: FILTER_EXPRESSION_MAX_RULES + 1,
    },
    FILTER_EXPRESSION_UNKNOWN_FIELD: {
        ...details,
        code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
        source: customMetricSource,
        fieldId: 'orders_statu',
        reason: 'notFound',
        suggestions: ['orders_status'],
        suggestedFields: [
            {
                fieldId: 'orders_status',
                category: 'dimensions',
                filterType: FilterType.STRING,
            },
        ],
    },
    FILTER_EXPRESSION_WRONG_CATEGORY: {
        ...details,
        code: 'FILTER_EXPRESSION_WRONG_CATEGORY',
        source: dimensionSource,
        fieldId: 'orders_total_revenue',
        expectedCategory: 'metrics',
        actualCategory: 'dimensions',
    },
    FILTER_EXPRESSION_CUSTOM_METRIC_WRONG_CATEGORY: {
        ...details,
        code: 'FILTER_EXPRESSION_CUSTOM_METRIC_WRONG_CATEGORY',
        source: customMetricSource,
        fieldId: 'orders_total_revenue',
        allowedCategory: 'dimensions',
        fieldCategory: 'metrics',
        example: null,
    },
    FILTER_EXPRESSION_INVALID_VALUE: {
        ...details,
        code: 'FILTER_EXPRESSION_INVALID_VALUE',
        source: metricSource,
        fieldId: 'orders_total_revenue',
        operator: FilterOperator.GREATER_THAN,
        filterType: FilterType.NUMBER,
    },
    FILTER_EXPRESSION_WRONG_ARITY: {
        ...details,
        code: 'FILTER_EXPRESSION_WRONG_ARITY',
        source: tableCalculationSource,
        fieldId: 'profit_margin',
        operator: FilterOperator.IN_BETWEEN,
        expected: 2,
        actual: 1,
    },
    FILTER_EXPRESSION_CUSTOM_METRIC_OR: {
        ...details,
        code: 'FILTER_EXPRESSION_CUSTOM_METRIC_OR',
        source: customMetricSource,
        example: null,
    },
};

const expectedByCode = {
    FILTER_EXPRESSION_SYNTAX: `[FILTER_EXPRESSION_SYNTAX]
Invalid dimension filter expression.

Location: line 2, column 3
Problem: The expression is invalid.
How to fix: Correct the expression.
Example: field equals=value`,
    FILTER_EXPRESSION_MIXED_CONNECTORS: `[FILTER_EXPRESSION_MIXED_CONNECTORS]
Invalid metric filter expression.

Location: line 2, column 3
Problem: The expression is invalid.
How to fix: Correct the expression.
Example: field equals=value`,
    FILTER_EXPRESSION_BOUNDS_EXCEEDED: `[FILTER_EXPRESSION_BOUNDS_EXCEEDED]
Invalid table calculation filter expression.

Location: line 2, column 3
Problem: The expression is invalid.
How to fix: Correct the expression.`,
    FILTER_EXPRESSION_UNKNOWN_FIELD: `[FILTER_EXPRESSION_UNKNOWN_FIELD]
Invalid custom metric "completed_revenue" filter expression for field "orders_statu".

Location: line 2, column 3
Problem: The expression is invalid.
How to fix: Correct the expression.
Example: field equals=value`,
    FILTER_EXPRESSION_WRONG_CATEGORY: `[FILTER_EXPRESSION_WRONG_CATEGORY]
Invalid dimension filter expression for field "orders_total_revenue".

Location: line 2, column 3
Problem: The expression is invalid.
How to fix: Correct the expression.
Example: field equals=value`,
    FILTER_EXPRESSION_CUSTOM_METRIC_WRONG_CATEGORY: `[FILTER_EXPRESSION_CUSTOM_METRIC_WRONG_CATEGORY]
Invalid custom metric "completed_revenue" filter expression for field "orders_total_revenue".

Location: line 2, column 3
Problem: The expression is invalid.
How to fix: Correct the expression.`,
    FILTER_EXPRESSION_INVALID_VALUE: `[FILTER_EXPRESSION_INVALID_VALUE]
Invalid metric filter expression for field "orders_total_revenue".

Location: line 2, column 3
Problem: The expression is invalid.
How to fix: Correct the expression.
Example: field equals=value`,
    FILTER_EXPRESSION_WRONG_ARITY: `[FILTER_EXPRESSION_WRONG_ARITY]
Invalid table calculation filter expression for field "profit_margin".

Location: line 2, column 3
Problem: The expression is invalid.
How to fix: Correct the expression.
Example: field equals=value`,
    FILTER_EXPRESSION_CUSTOM_METRIC_OR: `[FILTER_EXPRESSION_CUSTOM_METRIC_OR]
Invalid custom metric "completed_revenue" filter expression.

Location: line 2, column 3
Problem: The expression is invalid.
How to fix: Correct the expression.`,
} satisfies Record<FilterExpressionResolutionError['code'], string>;

describe('formatFilterExpressionError', () => {
    it.each(Object.values(errorsByCode))('formats $code exactly', (error) => {
        expect(formatFilterExpressionError(error)).toBe(
            expectedByCode[error.code],
        );
    });
});
