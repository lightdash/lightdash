import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import { getDateDimension, timeFrameConfigs, WeekDay } from './timeFrames';

describe('TimeFrames', () => {
    describe('getSqlForTruncatedDate', () => {
        test('should get sql where stat of the week is Wednesday', async () => {
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.POSTGRES,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                "(DATE_TRUNC('WEEK', (${TABLE}.created - interval '2 days')) + interval '2 days')",
            );
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.REDSHIFT,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                "(DATE_TRUNC('WEEK', (${TABLE}.created - interval '2 days')) + interval '2 days')",
            );
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.BIGQUERY,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual('TIMESTAMP_TRUNC(${TABLE}.created, WEEK(WEDNESDAY))');
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.DATABRICKS,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                "DATEADD(DAY, 2, DATE_TRUNC('WEEK', DATEADD(DAY, -2, ${TABLE}.created)))",
            );
            expect(
                timeFrameConfigs[TimeFrames.WEEK].getSql(
                    SupportedDbtAdapter.SNOWFLAKE,
                    TimeFrames.WEEK,
                    '${TABLE}.created',
                    DimensionType.TIMESTAMP,
                    WeekDay.WEDNESDAY,
                ),
            ).toEqual(
                "DATE_TRUNC('WEEK', ${TABLE}.created)", // start of week is set in the session
            );
        });
    });

    describe('getDateDimension', () => {
        test('should parse dates', async () => {
            // Invalid date granularities
            expect(getDateDimension('dimension_hour')).toEqual({});
            expect(getDateDimension('dimension')).toEqual({});
            expect(getDateDimension('dimension_date')).toEqual({});
            expect(getDateDimension('dimension_raw')).toEqual({});

            // Valid date granularities
            expect(getDateDimension('dimension_day')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.DAY,
            });
            expect(getDateDimension('table_my_dimension_day')).toEqual({
                baseDimensionId: `table_my_dimension`,
                newTimeFrame: TimeFrames.DAY,
            });
            expect(getDateDimension('dimension_week')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.WEEK,
            });
            expect(getDateDimension('dimension_month')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.MONTH,
            });
            expect(getDateDimension('dimension_quarter')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.QUARTER,
            });
            expect(getDateDimension('dimension_year')).toEqual({
                baseDimensionId: `dimension`,
                newTimeFrame: TimeFrames.YEAR,
            });
        });
    });
});
