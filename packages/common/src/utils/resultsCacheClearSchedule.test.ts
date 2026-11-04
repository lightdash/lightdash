import {
    getNextResultsCacheClearAt,
    parseResultsCacheClearCron,
    resultsCacheClearCadenceToCron,
    type ResultsCacheClearCadence,
} from './resultsCacheClearSchedule';

describe('results cache clear schedule cron', () => {
    const cadences: [ResultsCacheClearCadence, string][] = [
        [{ frequency: 'daily', hours: [6] }, '0 6 * * *'],
        [{ frequency: 'daily', hours: [0] }, '0 0 * * *'],
        [{ frequency: 'daily', hours: [6, 14, 22] }, '0 6,14,22 * * *'],
        [{ frequency: 'daily', hours: [1, 2, 3, 4, 5] }, '0 1,2,3,4,5 * * *'],
        [{ frequency: 'weekly', dayOfWeek: 1, hours: [23] }, '0 23 * * 1'],
        [{ frequency: 'weekly', dayOfWeek: 5, hours: [6, 14] }, '0 6,14 * * 5'],
    ];

    test.each(cadences)('round trips %j', (cadence, cron) => {
        expect(resultsCacheClearCadenceToCron(cadence)).toEqual(cron);
        expect(parseResultsCacheClearCron(cron)).toEqual(cadence);
    });

    test('sorts hours when building the cron', () => {
        expect(
            resultsCacheClearCadenceToCron({
                frequency: 'daily',
                hours: [14, 6],
            }),
        ).toEqual('0 6,14 * * *');
    });

    test.each([
        '0 * * * *',
        '0 14,6 * * *',
        '0 6,6 * * *',
        '0 6,24 * * *',
        '0 06,14 * * *',
        '0 6, * * *',
        '0 *,6 * * *',
        '30 6 * * *',
        '*/5 * * * *',
        '0 24 * * *',
        '0 06 * * *',
        '0 6 1 * *',
        '0 6 * * 7',
        '0 * * * 1',
        '0 6 * *',
        '',
    ])('rejects %j', (cron) => {
        expect(parseResultsCacheClearCron(cron)).toBeNull();
    });
});

describe('getNextResultsCacheClearAt', () => {
    test('returns the next daily run in the project timezone', () => {
        expect(
            getNextResultsCacheClearAt(
                '0 6 * * *',
                'America/New_York',
                new Date('2026-01-15T00:00:00Z'),
            ),
        ).toEqual(new Date('2026-01-15T11:00:00Z'));
    });

    test('moves past a run that is due exactly now', () => {
        expect(
            getNextResultsCacheClearAt(
                '0 7 * * *',
                'UTC',
                new Date('2026-01-15T07:00:00.000Z'),
            ),
        ).toEqual(new Date('2026-01-16T07:00:00Z'));
    });

    test('moves past the current hour when called mid-sweep', () => {
        expect(
            getNextResultsCacheClearAt(
                '0 7 * * *',
                'UTC',
                new Date('2026-01-15T07:00:03.250Z'),
            ),
        ).toEqual(new Date('2026-01-16T07:00:00Z'));
    });

    test('returns the next weekly run', () => {
        expect(
            getNextResultsCacheClearAt(
                '0 6 * * 1',
                'UTC',
                new Date('2026-01-15T00:00:00Z'),
            ),
        ).toEqual(new Date('2026-01-19T06:00:00Z'));
    });

    test('rounds up to the sweep in half-hour offset timezones', () => {
        // 06:00 IST is 00:30 UTC, so the sweep picks it up at 01:00 UTC
        expect(
            getNextResultsCacheClearAt(
                '0 6 * * *',
                'Asia/Kolkata',
                new Date('2026-01-15T00:00:00Z'),
            ),
        ).toEqual(new Date('2026-01-15T01:00:00Z'));
    });

    test('moves a time skipped by daylight saving forward on the same day', () => {
        // 01:00 does not exist in Lisbon on 2026-03-29, clocks jump to 02:00 (01:00 UTC)
        expect(
            getNextResultsCacheClearAt(
                '0 1 * * *',
                'Europe/Lisbon',
                new Date('2026-03-28T12:00:00Z'),
            ),
        ).toEqual(new Date('2026-03-29T01:00:00Z'));
    });

    test('runs a time repeated by daylight saving once', () => {
        // 01:00 happens twice in Lisbon on 2026-10-25, at 00:00 and 01:00 UTC
        const first = getNextResultsCacheClearAt(
            '0 1 * * *',
            'Europe/Lisbon',
            new Date('2026-10-24T12:00:00Z'),
        );
        expect(first).toEqual(new Date('2026-10-25T01:00:00Z'));
        expect(
            getNextResultsCacheClearAt('0 1 * * *', 'Europe/Lisbon', first),
        ).toEqual(new Date('2026-10-26T01:00:00Z'));
    });

    test('picks the next hour of a multi-hour daily schedule', () => {
        expect(
            getNextResultsCacheClearAt(
                '0 6,14 * * *',
                'UTC',
                new Date('2026-01-15T06:00:03Z'),
            ),
        ).toEqual(new Date('2026-01-15T14:00:00Z'));
    });

    test('rolls a multi-hour daily schedule to the first hour tomorrow', () => {
        expect(
            getNextResultsCacheClearAt(
                '0 6,14 * * *',
                'UTC',
                new Date('2026-01-15T14:00:00Z'),
            ),
        ).toEqual(new Date('2026-01-16T06:00:00Z'));
    });

    test('picks the next hour of a multi-hour weekly schedule', () => {
        expect(
            getNextResultsCacheClearAt(
                '0 6,14 * * 1',
                'UTC',
                new Date('2026-01-19T06:00:00Z'),
            ),
        ).toEqual(new Date('2026-01-19T14:00:00Z'));
        expect(
            getNextResultsCacheClearAt(
                '0 6,14 * * 1',
                'UTC',
                new Date('2026-01-19T14:00:00Z'),
            ),
        ).toEqual(new Date('2026-01-26T06:00:00Z'));
    });

    test('rounds each hour up to the sweep in half-hour offset timezones', () => {
        // 06:00 and 07:00 IST are 00:30 and 01:30 UTC
        const first = getNextResultsCacheClearAt(
            '0 6,7 * * *',
            'Asia/Kolkata',
            new Date('2026-01-15T00:00:00Z'),
        );
        expect(first).toEqual(new Date('2026-01-15T01:00:00Z'));
        expect(
            getNextResultsCacheClearAt('0 6,7 * * *', 'Asia/Kolkata', first),
        ).toEqual(new Date('2026-01-15T02:00:00Z'));
    });

    test('clears once when a skipped hour moves onto a selected hour', () => {
        // 01:00 does not exist in Lisbon on 2026-03-29, so it lands on 02:00 (01:00 UTC)
        const first = getNextResultsCacheClearAt(
            '0 1,2 * * *',
            'Europe/Lisbon',
            new Date('2026-03-28T12:00:00Z'),
        );
        expect(first).toEqual(new Date('2026-03-29T01:00:00Z'));
        expect(
            getNextResultsCacheClearAt('0 1,2 * * *', 'Europe/Lisbon', first),
        ).toEqual(new Date('2026-03-30T00:00:00Z'));
    });

    test('rolls a weekly run already passed this week to next week', () => {
        expect(
            getNextResultsCacheClearAt(
                '0 6 * * 1',
                'UTC',
                new Date('2026-01-19T06:00:00Z'),
            ),
        ).toEqual(new Date('2026-01-26T06:00:00Z'));
    });

    test('throws on an unsupported cron', () => {
        expect(() =>
            getNextResultsCacheClearAt('*/5 * * * *', 'UTC', new Date()),
        ).toThrow('Unsupported');
    });
});
