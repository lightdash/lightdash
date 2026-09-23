import moment from 'moment-timezone';
import { getTimezoneLabel, isValidTimezone } from '../utils/scheduler';
import { isTimeZone, TimeZone, toTimezoneSetting } from './timezone';

describe('Timezone selections', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    test.each([
        'Europe/Vilnius',
        'Europe/Berlin',
        'Europe/Riga',
        'Africa/Johannesburg',
        'America/Toronto',
        'Asia/Singapore',
        'Pacific/Fiji',
        'UTC',
        'Asia/Kolkata',
        'Asia/Kathmandu',
        'America/Buenos_Aires',
    ])(
        'accepts %s without falling back to the project timezone',
        (timezone) => {
            expect(isTimeZone(timezone)).toBe(true);
            expect(toTimezoneSetting(timezone)).toBe(timezone);
        },
    );

    test('only offers zones accepted by scheduler validation', () => {
        const invalidZones = Object.values(TimeZone).filter(
            (timezone) => !isValidTimezone(timezone),
        );
        expect(invalidZones).toEqual([]);
    });

    test('only offers zones supported by date formatting and filters', () => {
        const unsupportedZones = Object.values(TimeZone).filter(
            (timezone) => moment.tz.zone(timezone) === null,
        );
        expect(unsupportedZones).toEqual([]);
    });

    test.each([
        ['2026-01-15T12:00:00Z', '(UTC +02:00) Europe/Vilnius'],
        ['2026-07-15T12:00:00Z', '(UTC +03:00) Europe/Vilnius'],
    ])('labels Vilnius with its seasonal offset on %s', (date, label) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(date));
        expect(getTimezoneLabel(TimeZone['Europe/Vilnius'])).toBe(label);
        expect(getTimezoneLabel(TimeZone.UTC)).toBe('UTC');
    });
});
