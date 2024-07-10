import {
    getHumanReadableCronExpression,
    isAllowedCronExpression,
} from './scheduler';

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

    describe('isAllowedCronExpression', () => {
        test('check valid expression', async () => {
            expect(isAllowedCronExpression('* * * *')).toEqual(false);
            expect(isAllowedCronExpression('* * * * * *')).toEqual(false);
            expect(isAllowedCronExpression('30 30 * * * *')).toEqual(false);
            expect(isAllowedCronExpression('30 , 30 * * * *')).toEqual(false);
            expect(isAllowedCronExpression('30-25 * * * *')).toEqual(false);
            expect(isAllowedCronExpression('55-65 * * * *')).toEqual(false);
            expect(isAllowedCronExpression('55,65 * * * *')).toEqual(false);
        });
        test('should check if frequency happens multiple times per hour', async () => {
            expect(isAllowedCronExpression('0 * * * *')).toEqual(true);
            expect(isAllowedCronExpression('30 * * * *')).toEqual(true);
            expect(isAllowedCronExpression('0 0 * * *')).toEqual(true);
            expect(isAllowedCronExpression('0 0 1 * *')).toEqual(true);

            expect(isAllowedCronExpression('* * * * *')).toEqual(false);
            expect(isAllowedCronExpression('*/5 * * * *')).toEqual(false);
            expect(isAllowedCronExpression('*/59 * * * *')).toEqual(false);
            expect(isAllowedCronExpression('0,15 * * * *')).toEqual(false);
            expect(isAllowedCronExpression('0,15 * * * *')).toEqual(false);
            expect(isAllowedCronExpression('3-5 * * * *')).toEqual(false); // At every minute from 3 through 5.
            expect(isAllowedCronExpression('* 0 * * *')).toEqual(false);
            expect(isAllowedCronExpression('*/5,15 * * * *')).toEqual(false);
        });
    });
});
