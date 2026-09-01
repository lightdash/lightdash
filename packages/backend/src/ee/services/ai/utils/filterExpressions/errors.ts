import type {
    FilterExpressionArgumentCount,
    FilterExpressionParseError,
    FilterExpressionSpan,
    FilterOperator,
    FilterType,
} from '@lightdash/common';

export type QueryFilterExpressionCategory =
    | 'dimensions'
    | 'metrics'
    | 'tableCalculations';

export type FilterExpressionSource =
    | {
          kind: 'queryFilter';
          exploreName: string;
          category: QueryFilterExpressionCategory;
      }
    | {
          kind: 'customMetricFilter';
          exploreName: string;
          category: 'customMetric';
          customMetricName: string;
      };

type FilterExpressionErrorBase = {
    source: FilterExpressionSource;
    span: FilterExpressionSpan;
    problem: string;
    guidance: string;
};

type FilterExpressionErrorWithExample = FilterExpressionErrorBase & {
    example: string;
};

export type FilterExpressionResolutionError =
    | (FilterExpressionErrorWithExample & {
          code:
              | 'FILTER_EXPRESSION_SYNTAX'
              | 'FILTER_EXPRESSION_MIXED_CONNECTORS';
          parserMessage: string;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED';
          example: null;
          limit: Extract<
              FilterExpressionParseError,
              { code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED' }
          >['limit'];
          maximum: number;
          actual: number;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_UNKNOWN_FIELD';
          example: string | null;
          fieldId: string;
          reason: 'notFound' | 'ambiguous';
          suggestions: string[];
      })
    | (FilterExpressionErrorWithExample & {
          code: 'FILTER_EXPRESSION_WRONG_CATEGORY';
          fieldId: string;
          expectedCategory: QueryFilterExpressionCategory;
          actualCategory: QueryFilterExpressionCategory;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_INVALID_VALUE';
          example: string | null;
          fieldId: string;
          operator: FilterOperator;
          filterType: FilterType;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_WRONG_ARITY';
          example: string | null;
          fieldId: string;
          operator: FilterOperator;
          expected: FilterExpressionArgumentCount;
          actual: number;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_CUSTOM_METRIC_OR';
          example: null;
      });
