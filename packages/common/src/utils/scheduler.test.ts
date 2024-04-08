import { getHumanReadableCronExpression } from './scheduler';

describe('Scheduler utils', () => {
    describe('getHumanReadableCronExpression', () => {
        test('Should convert human readable cron expression with UTC', async () => {
            expect(getHumanReadableCronExpression('* * * * *', 'UTC')).toEqual(
                'every minute, every hour, every day',
            );

            expect(getHumanReadableCronExpression('0 * * * *', 'UTC')).toEqual(
                'every hour, every day',
            );

            expect(getHumanReadableCronExpression('0 0 * * *', 'UTC')).toEqual(
                'at 12:00 AM (UTC), every day',
            );

            expect(getHumanReadableCronExpression('0 13 * * *', 'UTC')).toEqual(
                'at 01:00 PM (UTC), every day',
            );

            expect(getHumanReadableCronExpression('0 13 1 * *', 'UTC')).toEqual(
                'at 01:00 PM (UTC), on day 1 of the month',
            );

            expect(getHumanReadableCronExpression('0 13 1 1 *', 'UTC')).toEqual(
                'at 01:00 PM (UTC), on day 1 of the month, only in January',
            );

            expect(getHumanReadableCronExpression('0 13 1 1 1', 'UTC')).toEqual(
                'at 01:00 PM (UTC), on day 1 of the month, and on Monday, only in January',
            );

            expect(getHumanReadableCronExpression('* 13 1 * *', 'UTC')).toEqual(
                'every minute, between 01:00 PM (UTC) and 01:59 PM (UTC), on day 1 of the month',
            );
        });
    });
});
