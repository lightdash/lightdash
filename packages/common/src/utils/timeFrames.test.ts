import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import { timeFrameConfigs, WeekDay } from './timeFrames';

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
            ).toEqual('DATETIME_TRUNC(${TABLE}.created, WEEK(WEDNESDAY))');
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
                "DATEADD(DAY, 2, DATE_TRUNC('WEEK', DATEADD(DAY, -2, ${TABLE}.created)))",
            );
        });
    });
});
