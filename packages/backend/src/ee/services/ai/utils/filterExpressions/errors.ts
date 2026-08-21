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
    example: string;
};

export type FilterExpressionResolutionError =
    | (FilterExpressionErrorBase & {
          code:
              | 'FILTER_EXPRESSION_SYNTAX'
              | 'FILTER_EXPRESSION_MIXED_CONNECTORS';
          parserMessage: string;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED';
          limit: Extract<
              FilterExpressionParseError,
              { code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED' }
          >['limit'];
          maximum: number;
          actual: number;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_UNKNOWN_FIELD';
          fieldId: string;
          reason: 'notFound' | 'ambiguous';
          suggestions: string[];
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_WRONG_CATEGORY';
          fieldId: string;
          expectedCategory: QueryFilterExpressionCategory;
          actualCategory: QueryFilterExpressionCategory;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_INVALID_VALUE';
          fieldId: string;
          operator: FilterOperator;
          filterType: FilterType;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_WRONG_ARITY';
          fieldId: string;
          operator: FilterOperator;
          expected: FilterExpressionArgumentCount;
          actual: number;
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_CONNECTOR_CONFLICT';
          connector: 'and' | 'or';
          conflictingConnector: 'and' | 'or';
      })
    | (FilterExpressionErrorBase & {
          code: 'FILTER_EXPRESSION_CUSTOM_METRIC_OR';
      });
