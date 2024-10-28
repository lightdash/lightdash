import { getDailyDatesFromCron } from './SchedulerClient';

describe('Cron converter', () => {
    test('Should convert cron into daily dates', () => {
        const when = new Date(2023, 0, 1); // Beggining of the day
        const executionDates = getDailyDatesFromCron(
            {
                cron: '0 * * * *', // Every hour
                timezone: 'UTC',
            },
            when,
        );

        expect(executionDates.length).toStrictEqual(24);
    });

    test('Should convert cron into daily dates with timezone', () => {
        const when = new Date(2023, 0, 1);
        const timezone = 'Europe/Paris';
        const executionDates = getDailyDatesFromCron(
            {
                cron: '0 18 * * *',
                timezone,
            },
            when,
        );

        expect(
            executionDates.map((d) =>
                d.toLocaleString('en-GB', { timeZone: 'Europe/Paris' }),
            ),
        ).toStrictEqual(['01/01/2023, 18:00:00']); // 6PM in Europe.paris time
    });

    test('Make sure we can schedule at midnight', () => {
        const when = new Date(2023, 0, 1, 0, 0, 30); // Beggining of the day (30 seconds after midnight)
        const executionDates = getDailyDatesFromCron(
            { cron: '0 * * * *', timezone: 'UTC' }, // Every hour
            when,
        );

        expect(executionDates[0]).toStrictEqual(new Date(2023, 0, 1, 0, 0, 0)); // First execution should be at midnight
    });

    test('Beginning and end of workday', () => {
        const when = new Date(2023, 0, 1, 0, 0, 30); // Beggining of the day (30 seconds after midnight)
        const executionDates = getDailyDatesFromCron(
            { cron: '30 9,18 * * *', timezone: 'UTC' }, // at 9:30 and 18:30
            when,
        );

        expect(executionDates).toStrictEqual([
            new Date(2023, 0, 1, 9, 30, 0),
            new Date(2023, 0, 1, 18, 30, 0),
        ]);
    });

    test('Get empty dates if scheduled on a different day', () => {
        const when = new Date(2023, 0, 1); // Beggining of the day
        const executionDates = getDailyDatesFromCron(
            { cron: '0 * 30 * *', timezone: 'UTC' }, // every 30th day of the month
            when,
        );

        expect(executionDates).toStrictEqual([]);
    });

    test('Get a date at the end of the day', () => {
        const executionDates = getDailyDatesFromCron({
            cron: '59 23 * * *',
            timezone: 'UTC',
        }); // at 23:59

        expect(executionDates.length).toStrictEqual(1);
        expect(executionDates[0].toISOString().split('T')[1]).toStrictEqual(
            '23:59:00.000Z',
        );
    });

    test('Should not get a date at the beggining of the day', () => {
        const executionDates = getDailyDatesFromCron({
            cron: '0 0 * * *',
            timezone: 'UTC',
        }); // at 00:00

        expect(executionDates.length).toStrictEqual(0);
    });
});
