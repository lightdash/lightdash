import { describe, expect, it } from 'vitest';
import {
    classifySshClientError,
    describeSshTunnelFailure,
    sshClientErrorMessage,
    type SshClientError,
} from './sshTunnelFailure';

const err = (
    message: string,
    extra: Partial<SshClientError> = {},
): SshClientError => Object.assign(new Error(message), extra);

const before = { tcpConnected: false, handshakeCompleted: false };
const afterTcp = { tcpConnected: true, handshakeCompleted: false };
const afterHandshake = { tcpConnected: true, handshakeCompleted: true };

describe('classifySshClientError', () => {
    it('maps DNS failures to resolve', () => {
        expect(
            classifySshClientError(
                err('getaddrinfo ENOTFOUND bastion.example', {
                    code: 'ENOTFOUND',
                }),
                before,
            ),
        ).toBe('resolve');
    });

    it('maps anything before the TCP connect to tcp, including a dropped SYN', () => {
        expect(
            classifySshClientError(
                err('connect ETIMEDOUT 34.195.79.184:22 after 10000ms', {
                    code: 'ETIMEDOUT',
                }),
                before,
            ),
        ).toBe('tcp');
        expect(
            classifySshClientError(
                err('connect ECONNREFUSED 127.0.0.1:2222', {
                    code: 'ECONNREFUSED',
                }),
                before,
            ),
        ).toBe('tcp');
    });

    it('maps a ready timeout after the TCP connect to handshake', () => {
        expect(
            classifySshClientError(
                err('Timed out while waiting for handshake', {
                    level: 'client-timeout',
                }),
                afterTcp,
            ),
        ).toBe('handshake');
        expect(
            classifySshClientError(
                err('Connection lost before handshake', {
                    level: 'client-socket',
                }),
                afterTcp,
            ),
        ).toBe('handshake');
    });

    it('maps rejected keys to auth', () => {
        expect(
            classifySshClientError(
                err('All configured authentication methods failed', {
                    level: 'client-authentication',
                }),
                afterHandshake,
            ),
        ).toBe('auth');
    });

    it('treats a socket reset after the handshake as auth, not tcp', () => {
        expect(
            classifySshClientError(
                err('read ECONNRESET', {
                    code: 'ECONNRESET',
                    level: 'client-socket',
                }),
                afterHandshake,
            ),
        ).toBe('auth');
    });
});

describe('describeSshTunnelFailure', () => {
    const base = {
        sshHost: '34.195.79.184',
        sshPort: 22,
        sshUser: 'lightdash',
        databaseHost: 'redshift.internal',
        databasePort: 5439,
        staticIp: '35.1.2.3',
        cause: 'connect ETIMEDOUT',
    };

    it('tells the bastion admin which IP to allow on tcp failures', () => {
        const message = describeSshTunnelFailure({ ...base, stage: 'tcp' });
        expect(message).toContain('Could not reach 34.195.79.184 on port 22');
        expect(message).toContain('from Lightdash (35.1.2.3)');
        expect(message).toContain('Allow inbound SSH from 35.1.2.3');
    });

    it('omits the IP when the instance has none', () => {
        const message = describeSshTunnelFailure({
            ...base,
            staticIp: null,
            stage: 'tcp',
        });
        expect(message).not.toContain('35.1.2.3');
        expect(message).toContain("Lightdash's IP");
    });

    it('names the user on auth failures', () => {
        expect(describeSshTunnelFailure({ ...base, stage: 'auth' })).toContain(
            'rejected the key for user "lightdash"',
        );
    });

    it('names the database endpoint on forward failures', () => {
        expect(
            describeSshTunnelFailure({ ...base, stage: 'forward' }),
        ).toContain('redshift.internal:5439');
    });
});

describe('sshClientErrorMessage', () => {
    it('unpacks the empty-message AggregateError Node emits for a refused port', () => {
        const aggregate = err('', {
            code: 'ECONNREFUSED',
            errors: [
                new Error('connect ECONNREFUSED ::1:2299'),
                new Error('connect ECONNREFUSED 127.0.0.1:2299'),
            ],
        });
        expect(sshClientErrorMessage(aggregate)).toBe(
            'connect ECONNREFUSED ::1:2299; connect ECONNREFUSED 127.0.0.1:2299',
        );
    });

    it('falls back to the code, then a fixed string', () => {
        expect(sshClientErrorMessage(err('', { code: 'ETIMEDOUT' }))).toBe(
            'ETIMEDOUT',
        );
        expect(sshClientErrorMessage(err(''))).toBe('connection failed');
    });
});
