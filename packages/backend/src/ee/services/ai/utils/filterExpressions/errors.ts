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

export type FilterExpressionFieldSuggestion = {
    fieldId: string;
    category: QueryFilterExpressionCategory;
    filterType: FilterType;
};

export type QueryFilterExpressionSource = {
    kind: 'queryFilter';
    exploreName: string;
    category: QueryFilterExpressionCategory;
};

export type CustomMetricFilterExpressionSource = {
    kind: 'customMetricFilter';
    exploreName: string;
    category: 'customMetric';
    customMetricName: string;
};

export type FilterExpressionSource =
    | QueryFilterExpressionSource
    | CustomMetricFilterExpressionSource;

type FilterExpressionErrorBase<
    TSource extends FilterExpressionSource = FilterExpressionSource,
> = {
    source: TSource;
    span: FilterExpressionSpan;
    problem: string;
    guidance: string;
};

type FilterExpressionErrorWithExample<
    TSource extends FilterExpressionSource = FilterExpressionSource,
> = FilterExpressionErrorBase<TSource> & {
    example: string;
};

type FilterExpressionErrorWithNullableExample<
    TSource extends FilterExpressionSource = FilterExpressionSource,
> = FilterExpressionErrorBase<TSource> & {
    example: string | null;
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
    | (FilterExpressionErrorWithNullableExample & {
          code: 'FILTER_EXPRESSION_UNKNOWN_FIELD';
          fieldId: string;
          reason: 'notFound' | 'ambiguous';
          suggestions: string[];
          suggestedFields: FilterExpressionFieldSuggestion[];
      })
    | (FilterExpressionErrorWithExample<QueryFilterExpressionSource> & {
          code: 'FILTER_EXPRESSION_WRONG_CATEGORY';
          fieldId: string;
          expectedCategory: QueryFilterExpressionCategory;
          actualCategory: QueryFilterExpressionCategory;
      })
    | (FilterExpressionErrorWithNullableExample<CustomMetricFilterExpressionSource> & {
          code: 'FILTER_EXPRESSION_CUSTOM_METRIC_WRONG_CATEGORY';
          fieldId: string;
          allowedCategory: 'dimensions';
          fieldCategory: Exclude<QueryFilterExpressionCategory, 'dimensions'>;
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
