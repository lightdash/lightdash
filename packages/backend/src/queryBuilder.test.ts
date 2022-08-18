import { buildQuery, renderDateFilterSql } from './queryBuilder';
import {
    DimensionSqlMock,
    EXPLORE,
    EXPLORE_BIGQUERY,
    EXPLORE_JOIN_CHAIN,
    InTheLast1CompletedYearFilter,
    InTheLast1CompletedYearFilterSQL,
    InTheLast1DayFilter,
    InTheLast1DayFilterSQL,
    InTheLast1MonthFilter,
    InTheLast1MonthFilterSQL,
    InTheLast1WeekFilter,
    InTheLast1WeekFilterSQL,
    InTheLast1YearFilter,
    InTheLast1YearFilterSQL,
    METRIC_QUERY,
    METRIC_QUERY_JOIN_CHAIN,
    METRIC_QUERY_JOIN_CHAIN_SQL,
    METRIC_QUERY_SQL,
    METRIC_QUERY_SQL_BIGQUERY,
    METRIC_QUERY_TWO_TABLES,
    METRIC_QUERY_TWO_TABLES_SQL,
    METRIC_QUERY_WITH_ADDITIONAL_METRIC,
    METRIC_QUERY_WITH_ADDITIONAL_METRIC_SQL,
    METRIC_QUERY_WITH_EMPTY_FILTER,
    METRIC_QUERY_WITH_EMPTY_FILTER_SQL,
    METRIC_QUERY_WITH_EMPTY_METRIC_FILTER,
    METRIC_QUERY_WITH_EMPTY_METRIC_FILTER_SQL,
    METRIC_QUERY_WITH_FILTER,
    METRIC_QUERY_WITH_FILTER_OR_OPERATOR,
    METRIC_QUERY_WITH_FILTER_OR_OPERATOR_SQL,
    METRIC_QUERY_WITH_FILTER_SQL,
    METRIC_QUERY_WITH_METRIC_FILTER,
    METRIC_QUERY_WITH_METRIC_FILTER_SQL,
    METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS,
    METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS_SQL,
    METRIC_QUERY_WITH_TABLE_REFERENCE,
    METRIC_QUERY_WITH_TABLE_REFERENCE_SQL,
} from './queryBuilder.mock';

describe('Query builder', () => {
    test('Should build simple metric query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL);
    });

    test('Should build simple metric query in BigQuery', () => {
        expect(
            buildQuery({
                explore: EXPLORE_BIGQUERY,
                compiledMetricQuery: METRIC_QUERY,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL_BIGQUERY);
    });

    test('Should build metric query across two tables', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
            }).query,
        ).toStrictEqual(METRIC_QUERY_TWO_TABLES_SQL);
    });

    test('Should build metric query where a field references another table', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_TABLE_REFERENCE,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_TABLE_REFERENCE_SQL);
    });

    test('Should join table from filter dimension', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_FILTER,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_FILTER_SQL);
    });

    test('should join chain of intermediary tables', () => {
        expect(
            buildQuery({
                explore: EXPLORE_JOIN_CHAIN,
                compiledMetricQuery: METRIC_QUERY_JOIN_CHAIN,
            }).query,
        ).toStrictEqual(METRIC_QUERY_JOIN_CHAIN_SQL);
    });

    test('Should build query with filter OR operator', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_FILTER_OR_OPERATOR,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_FILTER_OR_OPERATOR_SQL);
    });
    test('Should build query with nested filter operators', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_NESTED_FILTER_OPERATORS_SQL);
    });
    test('Should build second query with metric filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_METRIC_FILTER,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_METRIC_FILTER_SQL);
    });

    test('Should build query with additional metric', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_ADDITIONAL_METRIC,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_ADDITIONAL_METRIC_SQL);
    });

    test('Should build query with empty filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_FILTER,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_EMPTY_FILTER_SQL);
    });

    test('Should build query with empty metric filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_EMPTY_METRIC_FILTER,
            }).query,
        ).toStrictEqual(METRIC_QUERY_WITH_EMPTY_METRIC_FILTER_SQL);
    });
});

describe('Filter SQL', () => {
    beforeAll(() => {
        jest.useFakeTimers('modern');
        jest.setSystemTime(new Date('04 Apr 2020 00:12:00 GMT').getTime());
    });
    afterAll(() => {
        jest.useFakeTimers();
    });
    test('should return in the last date filter sql', () => {
        expect(
            renderDateFilterSql(DimensionSqlMock, InTheLast1DayFilter),
        ).toStrictEqual(InTheLast1DayFilterSQL);
        expect(
            renderDateFilterSql(DimensionSqlMock, InTheLast1WeekFilter),
        ).toStrictEqual(InTheLast1WeekFilterSQL);
        expect(
            renderDateFilterSql(DimensionSqlMock, InTheLast1MonthFilter),
        ).toStrictEqual(InTheLast1MonthFilterSQL);
        expect(
            renderDateFilterSql(DimensionSqlMock, InTheLast1YearFilter),
        ).toStrictEqual(InTheLast1YearFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedYearFilter,
            ),
        ).toStrictEqual(InTheLast1CompletedYearFilterSQL);
    });
});
