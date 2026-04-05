import { resolveQueryTimezone } from './resolveQueryTimezone';

describe('resolveQueryTimezone', () => {
    it('returns metricQuery.timezone when set', () => {
        expect(
            resolveQueryTimezone(
                { timezone: 'America/New_York' },
                'Australia/Brisbane',
            ),
        ).toBe('America/New_York');
    });

    it('falls back to project timezone when metricQuery.timezone is undefined', () => {
        expect(
            resolveQueryTimezone({ timezone: undefined }, 'Australia/Brisbane'),
        ).toBe('Australia/Brisbane');
    });

    it('falls back to project timezone when timezone field is missing', () => {
        expect(resolveQueryTimezone({}, 'Europe/London')).toBe('Europe/London');
    });
});
