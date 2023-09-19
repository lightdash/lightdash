import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType } from '../types/field';
import { TimeFrames } from '../types/timeFrames';
import { getHumanReadableCronExpression } from './scheduler';
import { timeFrameConfigs, WeekDay } from './timeFrames';

describe('Scheduler utils', () => {
    describe('getHumanReadableCronExpression', () => {
        test('Should convert human readable cron expression with UTC', async () => {
            expect(getHumanReadableCronExpression('* * * * *')).toEqual(
                'every minute, every hour, every day',
            );

            expect(getHumanReadableCronExpression('0 * * * *')).toEqual(
                'every hour, every day',
            );

            expect(getHumanReadableCronExpression('0 0 * * *')).toEqual(
                'at 12:00 AM (UTC), every day',
            );

            expect(getHumanReadableCronExpression('0 13 * * *')).toEqual(
                'at 01:00 PM (UTC), every day',
            );

            expect(getHumanReadableCronExpression('0 13 1 * *')).toEqual(
                'at 01:00 PM (UTC), on day 1 of the month',
            );

            expect(getHumanReadableCronExpression('0 13 1 1 *')).toEqual(
                'at 01:00 PM (UTC), on day 1 of the month, only in January',
            );

            expect(getHumanReadableCronExpression('0 13 1 1 1')).toEqual(
                'at 01:00 PM (UTC), on day 1 of the month, and on Monday, only in January',
            );

            expect(getHumanReadableCronExpression('* 13 1 * *')).toEqual(
                'every minute, between 01:00 PM (UTC) and 01:59 PM (UTC), on day 1 of the month',
            );
        });
    });
});
