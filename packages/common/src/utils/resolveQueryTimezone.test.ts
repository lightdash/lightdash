import { type Account } from '../types/auth';
import {
    getAccountUserTimezone,
    resolveQueryTimezone,
} from './resolveQueryTimezone';

const registeredAccount = (timezone: string | null): Account =>
    ({
        user: { type: 'registered', timezone },
    }) as unknown as Account;

const anonymousAccount = (): Account =>
    ({
        user: { type: 'anonymous' },
    }) as unknown as Account;

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

    it('uses user timezone when chart timezone is absent', () => {
        expect(
            resolveQueryTimezone({}, 'Australia/Brisbane', 'Asia/Tokyo'),
        ).toBe('Asia/Tokyo');
    });

    it('chart timezone takes precedence over user timezone', () => {
        expect(
            resolveQueryTimezone(
                { timezone: 'America/New_York' },
                'Australia/Brisbane',
                'Asia/Tokyo',
            ),
        ).toBe('America/New_York');
    });

    it('falls back to project when user timezone is null', () => {
        expect(resolveQueryTimezone({}, 'Australia/Brisbane', null)).toBe(
            'Australia/Brisbane',
        );
    });

    it('falls back to project when user timezone is undefined', () => {
        expect(resolveQueryTimezone({}, 'Australia/Brisbane', undefined)).toBe(
            'Australia/Brisbane',
        );
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

    it('throws on invalid user timezone', () => {
        expect(() =>
            resolveQueryTimezone({}, 'UTC', "UTC'; DROP TABLE users; --"),
        ).toThrow('Invalid timezone');
    });

    it('throws on timezone with SQL injection attempt', () => {
        expect(() =>
            resolveQueryTimezone({ timezone: "UTC' OR '1'='1" }, 'UTC'),
        ).toThrow('Invalid timezone');
    });
});

describe('getAccountUserTimezone', () => {
    it('returns the user timezone when the flag is enabled', () => {
        expect(
            getAccountUserTimezone(registeredAccount('Asia/Tokyo'), true),
        ).toBe('Asia/Tokyo');
    });

    it('returns null when the flag is disabled, even with a stored timezone', () => {
        expect(
            getAccountUserTimezone(registeredAccount('Asia/Tokyo'), false),
        ).toBeNull();
    });

    it('returns null for a registered user with no stored timezone', () => {
        expect(
            getAccountUserTimezone(registeredAccount(null), true),
        ).toBeNull();
    });

    it('returns null for anonymous viewers regardless of the flag', () => {
        expect(getAccountUserTimezone(anonymousAccount(), true)).toBeNull();
        expect(getAccountUserTimezone(anonymousAccount(), false)).toBeNull();
    });

    it('resolves to project timezone when the flag is off and to user timezone when on', () => {
        const account = registeredAccount('Asia/Tokyo');
        const projectTimezone = 'Australia/Brisbane';

        expect(
            resolveQueryTimezone(
                {},
                projectTimezone,
                getAccountUserTimezone(account, false),
            ),
        ).toBe('Australia/Brisbane');

        expect(
            resolveQueryTimezone(
                {},
                projectTimezone,
                getAccountUserTimezone(account, true),
            ),
        ).toBe('Asia/Tokyo');
    });
});
