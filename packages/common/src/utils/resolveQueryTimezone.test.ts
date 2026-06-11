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
    it('default project_timezone resolves to project for everyone, ignoring viewer profile', () => {
        const args = {
            sessionTimezone: null,
            metricQuery: { timezone: 'project_timezone' },
            projectTimezone: 'Australia/Brisbane',
            isUserTimezoneEnabled: true,
        };
        expect(
            resolveQueryTimezone({ ...args, userTimezone: 'Asia/Tokyo' }),
        ).toBe('Australia/Brisbane');
        expect(resolveQueryTimezone({ ...args, userTimezone: null })).toBe(
            'Australia/Brisbane',
        );
    });

    it('absent setting defaults to project, ignoring the viewer profile', () => {
        // Only an explicit `user_timezone` uses the viewer's profile; absent
        // resolves to project (deterministic) like `project_timezone`.
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: {},
                projectTimezone: 'Europe/London',
                userTimezone: 'Asia/Tokyo',
                isUserTimezoneEnabled: true,
            }),
        ).toBe('Europe/London');
    });

    it('accepts UTC as the project timezone', () => {
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

    it('user_timezone resolves to the viewer profile when EnableUserTimezones is on', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'user_timezone' },
                projectTimezone: 'Australia/Brisbane',
                userTimezone: 'Asia/Tokyo',
                isUserTimezoneEnabled: true,
            }),
        ).toBe('Asia/Tokyo');
    });

    it('user_timezone falls through to project when EnableUserTimezones is off', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'user_timezone' },
                projectTimezone: 'Australia/Brisbane',
                userTimezone: 'Asia/Tokyo',
                isUserTimezoneEnabled: false,
            }),
        ).toBe('Australia/Brisbane');
    });

    it('user_timezone falls through to project when the viewer has no profile', () => {
        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'user_timezone' },
                projectTimezone: 'Australia/Brisbane',
                userTimezone: null,
                isUserTimezoneEnabled: true,
            }),
        ).toBe('Australia/Brisbane');
    });

    it('an override IANA zone wins over project and user profile', () => {
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

    it('an override zone applies even when the user-timezone flag is off', () => {
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

    it('sessionTimezone wins over override, user, and project', () => {
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

    it('falls back to the override when sessionTimezone is null', () => {
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

    it('falls back to project when sessionTimezone and setting are absent', () => {
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

    it('throws on invalid override timezone', () => {
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

    it('throws on invalid viewer timezone', () => {
        expect(() =>
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'user_timezone' },
                projectTimezone: 'UTC',
                userTimezone: "UTC'; DROP TABLE users; --",
                isUserTimezoneEnabled: true,
            }),
        ).toThrow('Invalid timezone');
    });

    it('throws on an override timezone with a SQL injection attempt', () => {
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

    it('throws on an invalid sessionTimezone', () => {
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

    it('feeds user_timezone resolution: project when the flag is off, profile when on', () => {
        const account = registeredAccount('Asia/Tokyo');
        const projectTimezone = 'Australia/Brisbane';

        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'user_timezone' },
                projectTimezone,
                userTimezone: getAccountUserTimezone(account),
                isUserTimezoneEnabled: false,
            }),
        ).toBe('Australia/Brisbane');

        expect(
            resolveQueryTimezone({
                sessionTimezone: null,
                metricQuery: { timezone: 'user_timezone' },
                projectTimezone,
                userTimezone: getAccountUserTimezone(account),
                isUserTimezoneEnabled: true,
            }),
        ).toBe('Asia/Tokyo');
    });
});
