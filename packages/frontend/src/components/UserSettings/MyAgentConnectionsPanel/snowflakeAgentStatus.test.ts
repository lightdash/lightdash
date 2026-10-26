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
                getSnowflakeAgentStatus(storedCredential, hasLoginError, false),
            ).toBe('unavailable');
        },
    );
    it('is not connected without an AI credential', () => {
        expect(getSnowflakeAgentStatus(null, false, true)).toBe(
            'not_connected',
        );
    });
    it.each([null, new Date(now + 1), new Date(now - 1), new Date(now)])(
        'keeps a stored credential connected regardless of expiry %s',
        (expiresAt) => {
            expect(
                getSnowflakeAgentStatus(
                    { ...credential, expiresAt },
                    false,
                    true,
                ),
            ).toBe('connected');
        },
    );
    it.each([null, new Date(now + 1), new Date(now), new Date(now - 1)])(
        'expires a replaced client regardless of date %s',
        (expiresAt) => {
            expect(
                getSnowflakeAgentStatus(
                    { ...credential, agentClientCurrent: false, expiresAt },
                    false,
                    true,
                ),
            ).toBe('expired');
        },
    );
    it.each([
        null,
        credential,
        { ...credential, expiresAt: new Date(now - 1) },
    ])('prioritizes a failed login over %j', (storedCredential) => {
        expect(getSnowflakeAgentStatus(storedCredential, true, true)).toBe(
            'failing',
        );
    });
});
