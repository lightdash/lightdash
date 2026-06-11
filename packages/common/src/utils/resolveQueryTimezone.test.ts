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
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'America/New_York' },
                projectTimezone: 'Australia/Brisbane',
                userTimezone: null,
                isUserTimezoneEnabled: true,
            }),
        ).toBe('America/New_York');
    });

    it('falls back to project timezone when metricQuery.timezone is undefined', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: undefined },
                projectTimezone: 'Australia/Brisbane',
                userTimezone: null,
                isUserTimezoneEnabled: true,
            }),
        ).toBe('Australia/Brisbane');
    });

    it('falls back to project timezone when timezone field is missing', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone: 'Europe/London',
                userTimezone: null,
                isUserTimezoneEnabled: true,
            }),
        ).toBe('Europe/London');
    });

    it('accepts UTC', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone: 'UTC',
                userTimezone: null,
                isUserTimezoneEnabled: true,
            }),
        ).toBe('UTC');
    });

    it('uses user timezone when chart timezone is absent and the flag is on', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone: 'Australia/Brisbane',
                userTimezone: 'Asia/Tokyo',
                isUserTimezoneEnabled: true,
            }),
        ).toBe('Asia/Tokyo');
    });

    it('ignores user timezone when the flag is off, falling back to project', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone: 'Australia/Brisbane',
                userTimezone: 'Asia/Tokyo',
                isUserTimezoneEnabled: false,
            }),
        ).toBe('Australia/Brisbane');
    });

    it('chart timezone takes precedence over user timezone', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'America/New_York' },
                projectTimezone: 'Australia/Brisbane',
                userTimezone: 'Asia/Tokyo',
                isUserTimezoneEnabled: true,
            }),
        ).toBe('America/New_York');
    });

    it('chart timezone still applies when the user-timezone flag is off', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'America/New_York' },
                projectTimezone: 'Australia/Brisbane',
                userTimezone: 'Asia/Tokyo',
                isUserTimezoneEnabled: false,
            }),
        ).toBe('America/New_York');
    });

    it('falls back to project when user timezone is null', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone: 'Australia/Brisbane',
                userTimezone: null,
                isUserTimezoneEnabled: true,
            }),
        ).toBe('Australia/Brisbane');
    });

    it('throws on invalid metricQuery timezone', () => {
        expect(() =>
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: "'; DROP TABLE users; --" },
                projectTimezone: 'UTC',
                userTimezone: null,
                isUserTimezoneEnabled: true,
            }),
        ).toThrow('Invalid timezone');
    });

    it('throws on invalid project timezone', () => {
        expect(() =>
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone: 'Not/A/Timezone',
                userTimezone: null,
                isUserTimezoneEnabled: true,
            }),
        ).toThrow('Invalid timezone');
    });

    it('throws on invalid user timezone', () => {
        expect(() =>
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone: 'UTC',
                userTimezone: "UTC'; DROP TABLE users; --",
                isUserTimezoneEnabled: true,
            }),
        ).toThrow('Invalid timezone');
    });

    it('throws on timezone with SQL injection attempt', () => {
        expect(() =>
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: "UTC' OR '1'='1" },
                projectTimezone: 'UTC',
                userTimezone: null,
                isUserTimezoneEnabled: true,
            }),
        ).toThrow('Invalid timezone');
    });

    it('sessionTimezone wins over chart pin, user, and project', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: 'America/Los_Angeles',
                metricQuery: { timezone: 'Europe/London' },
                projectTimezone: 'UTC',
                userTimezone: 'Asia/Tokyo',
                isUserTimezoneEnabled: true,
            }),
        ).toBe('America/Los_Angeles');
    });

    it('falls back to chart pin when sessionTimezone is null', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'Europe/London' },
                projectTimezone: 'UTC',
                userTimezone: null,
                isUserTimezoneEnabled: false,
            }),
        ).toBe('Europe/London');
    });

    it('falls back to project when sessionTimezone and pin are absent', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone: 'America/New_York',
                userTimezone: null,
                isUserTimezoneEnabled: false,
            }),
        ).toBe('America/New_York');
    });

    it('throws ParameterError for an invalid sessionTimezone', () => {
        expect(() =>
            resolveQueryTimezone({
                sessionTimezone: 'Not/AZone',
                metricQuery: {},
                projectTimezone: 'UTC',
                userTimezone: null,
                isUserTimezoneEnabled: false,
            }),
        ).toThrow('Invalid timezone');
    });
});

describe('getAccountUserTimezone', () => {
    it('returns the stored timezone for a registered user', () => {
        expect(getAccountUserTimezone(registeredAccount('Asia/Tokyo'))).toBe(
            'Asia/Tokyo',
        );
    });

    it('returns null for a registered user with no stored timezone', () => {
        expect(getAccountUserTimezone(registeredAccount(null))).toBeNull();
    });

    it('returns null for anonymous viewers', () => {
        expect(getAccountUserTimezone(anonymousAccount())).toBeNull();
    });

    it('resolves to project timezone when the flag is off and to user timezone when on', () => {
        const account = registeredAccount('Asia/Tokyo');
        const projectTimezone = 'Australia/Brisbane';

        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone,
                userTimezone: getAccountUserTimezone(account),
                isUserTimezoneEnabled: false,
            }),
        ).toBe('Australia/Brisbane');

        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone,
                userTimezone: getAccountUserTimezone(account),
                isUserTimezoneEnabled: true,
            }),
        ).toBe('Asia/Tokyo');
    });
});
