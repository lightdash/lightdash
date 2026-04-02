import {
    EXPLORE,
    EXPLORE_WITH_REQUIRED_FILTERS,
    EXPLORE_WITH_SQL_FILTER,
    METRIC_QUERY,
    METRIC_QUERY_WITH_CUSTOM_USER_ATTRIBUTE_FILTER_VALUE,
    METRIC_QUERY_WITH_DISABLED_FILTER,
    METRIC_QUERY_WITH_EMPTY_FILTER,
    METRIC_QUERY_WITH_EMPTY_FILTER_GROUPS,
    METRIC_QUERY_WITH_EMPTY_METRIC_FILTER,
    METRIC_QUERY_WITH_FILTER,
    METRIC_QUERY_WITH_FILTER_AND_DISABLED_FILTER,
    METRIC_QUERY_WITH_FILTER_OR_OPERATOR,
    METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM,
    METRIC_QUERY_WITH_METRIC_FILTER,
    METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS,
    METRIC_QUERY_WITH_NESTED_METRIC_FILTERS,
    METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER,
    METRIC_QUERY_WITH_USER_ATTRIBUTE_FILTER_VALUE,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

describe('MetricQueryBuilder snapshot: filter queries', () => {
    // Mirrors filter dashboard tiles that depend on nested boolean logic,
    // with grouped dimension predicates combining AND/OR branches before aggregation.
    test('matches snapshot for a nested-filter query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS,
            }),
        ).toMatchSnapshot();
    });

    // Covers joined-table dimension filters that force an extra join even when the filtered field
    // is not selected, matching the common dashboard case of filtering on related table attributes.
    test('matches snapshot for a joined-dimension filter query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_FILTER,
            }),
        ).toMatchSnapshot();
    });

    // Covers OR-connected dimension filters, where multiple sibling predicates must stay grouped
    // in a single WHERE branch instead of being flattened into the default AND path.
    test('matches snapshot for a dimension filter query with OR logic', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_FILTER_OR_OPERATOR,
            }),
        ).toMatchSnapshot();
    });

    // Covers disabled dimension filters, ensuring ignored predicates are fully removed
    // from the compiled SQL while the rest of the grouped query shape stays unchanged.
    test('matches snapshot for a query with a disabled dimension filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_DISABLED_FILTER,
            }),
        ).toMatchSnapshot();
    });

    // Covers mixed enabled and disabled filters in the same query, protecting the path
    // where only active predicates survive into the final WHERE clause.
    test('matches snapshot for a query with enabled and disabled filters', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery:
                    METRIC_QUERY_WITH_FILTER_AND_DISABLED_FILTER,
            }),
        ).toMatchSnapshot();
    });

    // Covers aggregate-level metric filters applied after the metrics CTE,
    // protecting the HAVING-style path where results are filtered on computed measures.
    test('matches snapshot for a metric-filter query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_METRIC_FILTER,
            }),
        ).toMatchSnapshot();
    });

    // Covers nested metric filter groups with mixed boolean logic on aggregated measures,
    // which is a distinct code path from dimension filters because it filters after metric computation.
    test('matches snapshot for a nested metric-filter query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_NESTED_METRIC_FILTERS,
            }),
        ).toMatchSnapshot();
    });

    // Covers disabled metric filters that reference joined-table dimensions, ensuring the builder
    // does not pull in an unnecessary join path when the filter itself is inactive.
    test('matches snapshot for a query with a disabled joined-dimension metric filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery:
                    METRIC_QUERY_WITH_METRIC_DISABLED_FILTER_THAT_REFERENCES_JOINED_TABLE_DIM,
            }),
        ).toMatchSnapshot();
    });

    // Covers empty filter groups that should compile away entirely, matching the plain baseline SQL
    // instead of leaving behind an empty WHERE wrapper or redundant boolean scaffolding.
    test('matches snapshot for a query with empty filter groups', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_FILTER_GROUPS,
            }),
        ).toMatchSnapshot();
    });

    // Covers queries where filtering on a table calculation forces an extra CTE layer,
    // so the calculation can be materialized before applying its filter predicate.
    test('matches snapshot for a table-calculation filter query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER,
            }),
        ).toMatchSnapshot();
    });

    // Covers fully empty dimension filters, protecting the path where an empty filter payload
    // must not inject WHERE noise or change the grouped query shape.
    test('matches snapshot for a query with an empty dimension filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_FILTER,
            }),
        ).toMatchSnapshot();
    });

    // Covers fully empty metric filters, ensuring the builder removes the empty post-aggregation
    // predicate layer instead of producing a malformed HAVING-style filter section.
    test('matches snapshot for a query with an empty metric filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_METRIC_FILTER,
            }),
        ).toMatchSnapshot();
    });

    // Covers SQL filters that depend on user attribute substitution, so the snapshot protects
    // the final compiled predicate after user-provided values are expanded into the SQL filter.
    test('matches snapshot for a query with a SQL filter using user attributes', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SQL_FILTER,
                compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_METRIC_FILTER,
                userAttributes: {
                    country: ['EU'],
                },
            }),
        ).toMatchSnapshot();
    });

    // Covers intrinsic user attribute placeholders used in filter values, ensuring those values
    // are resolved before the normal dimension-filter SQL is compiled.
    test('matches snapshot for a query with intrinsic user-attribute filter values', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery:
                    METRIC_QUERY_WITH_USER_ATTRIBUTE_FILTER_VALUE,
            }),
        ).toMatchSnapshot();
    });

    // Covers custom user attribute placeholders in filter values, protecting the path that injects
    // user-scoped attribute arrays into the normal dimension filter compilation.
    test('matches snapshot for a query with custom user-attribute filter values', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery:
                    METRIC_QUERY_WITH_CUSTOM_USER_ATTRIBUTE_FILTER_VALUE,
                userAttributes: {
                    country: ['EU'],
                },
            }),
        ).toMatchSnapshot();
    });

    // Covers model-level required filters that are injected alongside user filters,
    // protecting the path that augments the query with mandatory predicates from the explore.
    test('matches snapshot for a required-filter query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_REQUIRED_FILTERS,
                compiledMetricQuery: METRIC_QUERY,
            }),
        ).toMatchSnapshot();
    });
});
