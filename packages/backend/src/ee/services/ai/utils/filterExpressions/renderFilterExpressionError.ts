import { assertUnreachable } from '@lightdash/common';
import type {
    FilterExpressionResolutionError,
    FilterExpressionSource,
    QueryFilterExpressionCategory,
} from './errors';

const summarizeInline = (value: string, maximum: number): string => {
    const sanitized = value.replace(/\s+/g, ' ').trim();
    return sanitized.length <= maximum
        ? sanitized
        : `${sanitized.slice(0, maximum - 1)}…`;
};

const getCategoryLabel = (category: QueryFilterExpressionCategory): string => {
    switch (category) {
        case 'dimensions':
            return 'dimension';
        case 'metrics':
            return 'metric';
        case 'tableCalculations':
            return 'table calculation';
        default:
            return assertUnreachable(
                category,
                `Unknown filter expression category: ${category}`,
            );
    }
};

const getSourceLabel = (source: FilterExpressionSource): string => {
    switch (source.kind) {
        case 'queryFilter':
            return getCategoryLabel(source.category);
        case 'customMetricFilter':
            return `custom metric ${JSON.stringify(
                summarizeInline(source.customMetricName, 120),
            )}`;
        default:
            return assertUnreachable(
                source,
                'Unknown filter expression source',
            );
    }
};

const getFieldId = (
    error: FilterExpressionResolutionError,
): string | undefined => {
    switch (error.code) {
        case 'FILTER_EXPRESSION_UNKNOWN_FIELD':
        case 'FILTER_EXPRESSION_WRONG_CATEGORY':
        case 'FILTER_EXPRESSION_INVALID_VALUE':
        case 'FILTER_EXPRESSION_WRONG_ARITY':
            return error.fieldId;
        case 'FILTER_EXPRESSION_SYNTAX':
        case 'FILTER_EXPRESSION_MIXED_CONNECTORS':
        case 'FILTER_EXPRESSION_BOUNDS_EXCEEDED':
        case 'FILTER_EXPRESSION_CUSTOM_METRIC_OR':
            return undefined;
        default:
            return assertUnreachable(error, 'Unknown filter expression error');
    }
};

export const formatFilterExpressionError = (
    error: FilterExpressionResolutionError,
): string => {
    const fieldId = getFieldId(error);
    const fieldText = fieldId
        ? ` for field ${JSON.stringify(summarizeInline(fieldId, 160))}`
        : '';
    const exampleText =
        error.example === null
            ? ''
            : `\nExample: ${summarizeInline(error.example, 300)}`;

    return `[${error.code}]
Invalid ${getSourceLabel(error.source)} filter expression${fieldText}.

Location: line ${error.span.start.line}, column ${error.span.start.column}
Problem: ${summarizeInline(error.problem, 600)}
How to fix: ${summarizeInline(error.guidance, 400)}${exampleText}`;
};
