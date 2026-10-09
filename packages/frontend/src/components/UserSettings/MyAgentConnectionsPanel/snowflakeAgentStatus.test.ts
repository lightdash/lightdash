import { describe, expect, it } from 'vitest';
import { credential } from './fixtures';
import { getSnowflakeAgentStatus } from './snowflakeAgentStatus';

const now = new Date('2026-10-09T12:00:00Z').getTime();

describe('getSnowflakeAgentStatus', () => {
    it.each([
        [null, false],
        [credential, false],
        [{ ...credential, expiresAt: new Date(now - 1) }, false],
        [null, true],
        [credential, true],
        [{ ...credential, expiresAt: new Date(now - 1) }, true],
    ] as const)(
        'prioritizes unavailable setup over credential %j and login error %s',
        (storedCredential, hasLoginError) => {
            expect(
                getSnowflakeAgentStatus(
                    storedCredential,
                    hasLoginError,
                    now,
                    false,
                ),
            ).toBe('unavailable');
        },
    );
    it('is not connected without an AI credential', () => {
        expect(getSnowflakeAgentStatus(null, false, now, true)).toBe(
            'not_connected',
        );
    });
    it.each([
        [null, 'connected'],
        [new Date(now + 1), 'connected'],
        [new Date(now - 1), 'expired'],
        [new Date(now), 'expired'],
    ] as const)('handles expiry %s as %s', (expiresAt, status) => {
        expect(
            getSnowflakeAgentStatus(
                { ...credential, expiresAt },
                false,
                now,
                true,
            ),
        ).toBe(status);
    });
    it.each([
        null,
        credential,
        { ...credential, expiresAt: new Date(now - 1) },
    ])('prioritizes a failed login over %j', (storedCredential) => {
        expect(getSnowflakeAgentStatus(storedCredential, true, now, true)).toBe(
            'failing',
        );
    });
});
