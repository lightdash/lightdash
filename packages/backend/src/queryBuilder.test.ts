import { SupportedDbtAdapter } from 'common';
import { buildQuery } from './queryBuilder';
import {
    EXPLORE,
    METRIC_QUERY,
    METRIC_QUERY_SQL,
    METRIC_QUERY_SQL_BIGQUERY,
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
        const bigQueryExplore = {
            ...EXPLORE,
            targetDatabase: SupportedDbtAdapter.BIGQUERY,
        };
        expect(
            buildQuery({
                explore: bigQueryExplore,
                compiledMetricQuery: METRIC_QUERY,
            }).query,
        ).toStrictEqual(METRIC_QUERY_SQL_BIGQUERY);
    });
    /*
    test('Should build metric query across two tables', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
            }).query,
        ).toStrictEqual(METRIC_QUERY_TWO_TABLES_SQL);
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
    }); */
});
/*
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
*/
