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

    it('accepts UTC', () => {
        expect(resolveQueryTimezone({}, 'UTC')).toBe('UTC');
    });

    it('throws on invalid metricQuery timezone', () => {
        expect(() =>
            resolveQueryTimezone(
                { timezone: "'; DROP TABLE users; --" },
                'UTC',
            ),
        ).toThrow('Invalid timezone');
    });

    it('throws on invalid project timezone', () => {
        expect(() => resolveQueryTimezone({}, 'Not/A/Timezone')).toThrow(
            'Invalid timezone',
        );
    });

    it('throws on timezone with SQL injection attempt', () => {
        expect(() =>
            resolveQueryTimezone({ timezone: "UTC' OR '1'='1" }, 'UTC'),
        ).toThrow('Invalid timezone');
    });
});
