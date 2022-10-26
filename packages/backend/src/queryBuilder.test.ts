import moment from 'moment';
import { buildQuery, renderDateFilterSql } from './queryBuilder';
import {
    DimensionSqlMock,
    EXPLORE,
    EXPLORE_BIGQUERY,
    EXPLORE_JOIN_CHAIN,
    EXPLORE_WITH_FILTERS,
    InTheLast1CompletedDayFilter,
    InTheLast1CompletedDayFilterSQL,
    InTheLast1CompletedHourFilter,
    InTheLast1CompletedHourFilterSQL,
    InTheLast1CompletedMinuteFilter,
    InTheLast1CompletedMinuteFilterSQL,
    InTheLast1CompletedMonthFilter,
    InTheLast1CompletedMonthFilterSQL,
    InTheLast1CompletedWeekFilter,
    InTheLast1CompletedWeekFilterSQL,
    InTheLast1CompletedYearFilter,
    InTheLast1CompletedYearFilterSQL,
    InTheLast1DayFilter,
    InTheLast1DayFilterSQL,
    InTheLast1HourFilter,
    InTheLast1HourFilterSQL,
    InTheLast1MinuteFilter,
    InTheLast1MinuteFilterSQL,
    InTheLast1MonthFilter,
    InTheLast1MonthFilterSQL,
    InTheLast1WeekFilter,
    InTheLast1WeekFilterSQL,
    InTheLast1YearFilter,
    InTheLast1YearFilterSQL,
    METRIC_QUERY,
    METRIC_QUERY_FILTER_METRIC1,
    METRIC_QUERY_FILTER_METRIC2,
    METRIC_QUERY_FILTER_METRIC_WITH_SQL,
    METRIC_QUERY_JOIN_CHAIN,
    METRIC_QUERY_JOIN_CHAIN_SQL,
    METRIC_QUERY_SQL,
    METRIC_QUERY_SQL_BIGQUERY,
    METRIC_QUERY_SQL_FILTER_METRIC1,
    METRIC_QUERY_SQL_FILTER_METRIC1_ALL_RESULTS,
    METRIC_QUERY_SQL_FILTER_METRIC2,
    METRIC_QUERY_SQL_FILTER_METRIC_WITH_SQL,
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

const formatTimestamp = (date: Date): string =>
    moment(date).format('YYYY-MM-DD HH:mm:ss');

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
        jest.useFakeTimers();
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
    });

    test('should return in the last completed date filter sql ', () => {
        expect(
            renderDateFilterSql(DimensionSqlMock, InTheLast1CompletedDayFilter),
        ).toStrictEqual(InTheLast1CompletedDayFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedWeekFilter,
            ),
        ).toStrictEqual(InTheLast1CompletedWeekFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMonthFilter,
            ),
        ).toStrictEqual(InTheLast1CompletedMonthFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedYearFilter,
            ),
        ).toStrictEqual(InTheLast1CompletedYearFilterSQL);
    });

    test('should return in the last date filter sql for timestamps', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1HourFilter,
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1HourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedHourFilter,
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1CompletedHourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1MinuteFilter,
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1MinuteFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMinuteFilter,
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1CompletedMinuteFilterSQL);
    });
});

describe('Query build filter metrics', () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('04 Apr 2020 00:12:00 GMT').getTime());
    });
    afterAll(() => {
        jest.useFakeTimers();
    });
    test('should show filters as columns metric1', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_FILTERS,
                compiledMetricQuery: METRIC_QUERY_FILTER_METRIC1,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL_FILTER_METRIC1);
    });
    test('should show filters as columns metric2', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_FILTERS,
                compiledMetricQuery: METRIC_QUERY_FILTER_METRIC2,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL_FILTER_METRIC2);
    });

    test('should show filters as columns metric with sql', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_FILTERS,
                compiledMetricQuery: METRIC_QUERY_FILTER_METRIC_WITH_SQL,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL_FILTER_METRIC_WITH_SQL);
    });

    test('should show metric1 with all results', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_FILTERS,
                compiledMetricQuery: METRIC_QUERY_FILTER_METRIC1,
                allResults: true,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL_FILTER_METRIC1_ALL_RESULTS);
    });
});
