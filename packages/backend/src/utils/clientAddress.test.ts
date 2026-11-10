import { type Request } from 'express';
import { getClientAddress } from './clientAddress';

const request = (
    remoteAddress: string,
    forwardedFor?: string,
): Pick<Request, 'socket' | 'get'> =>
    ({
        socket: { remoteAddress },
        get: (header: string) =>
            header.toLowerCase() === 'x-forwarded-for'
                ? forwardedFor
                : undefined,
    }) as unknown as Pick<Request, 'socket' | 'get'>;

describe('getClientAddress', () => {
    it('ignores X-Forwarded-For when TRUST_PROXY is off', () => {
        expect(
            getClientAddress(request('10.0.0.5', '203.0.113.7'), false),
        ).toBe('10.0.0.5');
    });

    it('takes the client from X-Forwarded-For behind a private proxy', () => {
        expect(getClientAddress(request('10.0.0.5', '203.0.113.7'), true)).toBe(
            '203.0.113.7',
        );
        expect(
            getClientAddress(
                request('::ffff:10.0.0.5', '203.0.113.7, 10.1.2.3'),
                true,
            ),
        ).toBe('203.0.113.7');
    });

    it('ignores addresses a client prepends to X-Forwarded-For', () => {
        expect(
            getClientAddress(
                request('10.0.0.5', '198.51.100.1, 203.0.113.7'),
                true,
            ),
        ).toBe('203.0.113.7');
    });

    it('ignores X-Forwarded-For from a public address that is not a proxy', () => {
        expect(
            getClientAddress(request('198.51.100.9', '203.0.113.7'), true),
        ).toBe('198.51.100.9');
    });

    it('falls back to the socket address when the header is missing or invalid', () => {
        expect(getClientAddress(request('10.0.0.5'), true)).toBe('10.0.0.5');
        expect(getClientAddress(request('10.0.0.5', 'not-an-ip'), true)).toBe(
            '10.0.0.5',
        );
    });
});
