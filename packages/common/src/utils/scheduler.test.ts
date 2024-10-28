import { getHumanReadableCronExpression, isValidFrequency } from './scheduler';

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
                'at 12:00 AM (UTC +00:00), every day',
            );

            expect(getHumanReadableCronExpression('0 13 * * *', 'UTC')).toEqual(
                'at 01:00 PM (UTC +00:00), every day',
            );

            expect(getHumanReadableCronExpression('0 13 1 * *', 'UTC')).toEqual(
                'at 01:00 PM (UTC +00:00), on day 1 of the month',
            );

            expect(getHumanReadableCronExpression('0 13 1 1 *', 'UTC')).toEqual(
                'at 01:00 PM (UTC +00:00), on day 1 of the month, only in January',
            );

            expect(getHumanReadableCronExpression('0 13 1 1 1', 'UTC')).toEqual(
                'at 01:00 PM (UTC +00:00), on day 1 of the month, and on Monday, only in January',
            );

            expect(getHumanReadableCronExpression('* 13 1 * *', 'UTC')).toEqual(
                'every minute, between 01:00 PM (UTC +00:00) and 01:59 PM (UTC +00:00), on day 1 of the month',
            );
        });
    });

    describe('isValidFrequency', () => {
        test('check valid expression', async () => {
            expect(isValidFrequency('* * * *')).toEqual(false);
            expect(isValidFrequency('* * * * * *')).toEqual(false);
            expect(isValidFrequency('30 30 * * * *')).toEqual(false);
            expect(isValidFrequency('30 , 30 * * * *')).toEqual(false);
            expect(isValidFrequency('30-25 * * * *')).toEqual(false);
            expect(isValidFrequency('55-65 * * * *')).toEqual(false);
            expect(isValidFrequency('55,65 * * * *')).toEqual(false);
        });
        test('should check if frequency happens multiple times per hour', async () => {
            expect(isValidFrequency('0 * * * *')).toEqual(true);
            expect(isValidFrequency('30 * * * *')).toEqual(true);
            expect(isValidFrequency('0 0 * * *')).toEqual(true);
            expect(isValidFrequency('0 0 1 * *')).toEqual(true);

            expect(isValidFrequency('* * * * *')).toEqual(false);
            expect(isValidFrequency('*/5 * * * *')).toEqual(false);
            expect(isValidFrequency('*/59 * * * *')).toEqual(false);
            expect(isValidFrequency('0,15 * * * *')).toEqual(false);
            expect(isValidFrequency('0,15 * * * *')).toEqual(false);
            expect(isValidFrequency('3-5 * * * *')).toEqual(false); // At every minute from 3 through 5.
            expect(isValidFrequency('* 0 * * *')).toEqual(false);
            expect(isValidFrequency('*/5,15 * * * *')).toEqual(false);
        });
    });
});
