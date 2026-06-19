import { ParameterError } from '@lightdash/common';
import {
    assertSafeApiKeyHeaderName,
    buildOutboundUrl,
    computeMinuteWindow,
    normalizeAndValidatePath,
    serializeRequestBody,
} from './proxyValidation';

describe('normalizeAndValidatePath', () => {
    const prefixes = ['/v1/', '/public/data'];

    it('accepts a path that prefix-matches an allowlisted prefix', () => {
        expect(normalizeAndValidatePath('/v1/users', prefixes)).toBe(
            '/v1/users',
        );
    });

    it('accepts an exact prefix match', () => {
        expect(normalizeAndValidatePath('/public/data', prefixes)).toBe(
            '/public/data',
        );
    });

    it('rejects a path that matches no prefix', () => {
        expect(() => normalizeAndValidatePath('/admin', prefixes)).toThrow(
            ParameterError,
        );
    });

    it('rejects an absolute http URL', () => {
        expect(() =>
            normalizeAndValidatePath('http://evil.com/v1/x', prefixes),
        ).toThrow(ParameterError);
    });

    it('rejects an absolute https URL', () => {
        expect(() =>
            normalizeAndValidatePath('https://evil.com/v1/x', prefixes),
        ).toThrow(ParameterError);
    });

    it('rejects a protocol-relative //host (leading double slash)', () => {
        expect(() =>
            normalizeAndValidatePath('//evil.com/v1/x', prefixes),
        ).toThrow(ParameterError);
    });

    it('rejects a scheme-relative path with backslashes', () => {
        expect(() =>
            normalizeAndValidatePath('/v1\\..\\..\\etc', prefixes),
        ).toThrow(ParameterError);
        expect(() =>
            normalizeAndValidatePath('\\\\evil.com\\x', prefixes),
        ).toThrow(ParameterError);
    });

    it('rejects raw .. traversal', () => {
        expect(() =>
            normalizeAndValidatePath('/v1/../admin', prefixes),
        ).toThrow(ParameterError);
    });

    it('rejects percent-encoded .. (%2e%2e) traversal', () => {
        expect(() =>
            normalizeAndValidatePath('/v1/%2e%2e/admin', prefixes),
        ).toThrow(ParameterError);
        expect(() =>
            normalizeAndValidatePath('/v1/%2E%2E/admin', prefixes),
        ).toThrow(ParameterError);
    });

    it('rejects encoded path separators used to smuggle a host (%2f%2f)', () => {
        expect(() =>
            normalizeAndValidatePath('/%2f%2fevil.com', prefixes),
        ).toThrow(ParameterError);
    });

    it('rejects an @ that could be read as userinfo when re-parsed', () => {
        expect(() =>
            normalizeAndValidatePath('/v1/x@evil.com', prefixes),
        ).toThrow(ParameterError);
    });

    it('rejects an embedded NUL or control char', () => {
        // eslint-disable-next-line no-control-regex
        expect(() => normalizeAndValidatePath('/v1/x\x00y', prefixes)).toThrow(
            ParameterError,
        );
    });

    it('requires a leading slash', () => {
        expect(() => normalizeAndValidatePath('v1/users', prefixes)).toThrow(
            ParameterError,
        );
    });

    it('strips a query string from the path (query is passed separately)', () => {
        expect(normalizeAndValidatePath('/v1/users?evil=1', prefixes)).toBe(
            '/v1/users',
        );
    });

    describe('segment-aware prefix matching', () => {
        const segmentPrefixes = ['/v1/users'];

        it('rejects a path that starts with the prefix but continues with non-separator chars', () => {
            expect(() =>
                normalizeAndValidatePath('/v1/users-admin', segmentPrefixes),
            ).toThrow(ParameterError);
            expect(() =>
                normalizeAndValidatePath('/v1/usersecrets', segmentPrefixes),
            ).toThrow(ParameterError);
            expect(() =>
                normalizeAndValidatePath('/v1/usersxxx', segmentPrefixes),
            ).toThrow(ParameterError);
        });

        it('accepts the exact prefix', () => {
            expect(normalizeAndValidatePath('/v1/users', segmentPrefixes)).toBe(
                '/v1/users',
            );
        });

        it('accepts the prefix with a trailing slash', () => {
            expect(
                normalizeAndValidatePath('/v1/users/', segmentPrefixes),
            ).toBe('/v1/users/');
        });

        it('accepts a path that extends the prefix after a slash', () => {
            expect(
                normalizeAndValidatePath('/v1/users/123', segmentPrefixes),
            ).toBe('/v1/users/123');
        });
    });
});

describe('buildOutboundUrl', () => {
    it('joins origin + path and serializes query via URLSearchParams', () => {
        const url = buildOutboundUrl('https://api.example.com', '/v1/users', {
            page: '2',
            q: 'a b&c',
        });
        expect(url).toBe('https://api.example.com/v1/users?page=2&q=a+b%26c');
    });

    it('handles an origin with a trailing slash without doubling', () => {
        const url = buildOutboundUrl(
            'https://api.example.com/',
            '/v1/users',
            undefined,
        );
        expect(url).toBe('https://api.example.com/v1/users');
    });

    it('handles an origin that includes a base path', () => {
        const url = buildOutboundUrl(
            'https://api.example.com/base',
            '/v1/x',
            undefined,
        );
        expect(url).toBe('https://api.example.com/base/v1/x');
    });

    it('keeps the host pinned to the origin even if path looks hostlike', () => {
        // path is already validated, but URL construction must not be fooled
        const url = buildOutboundUrl(
            'https://api.example.com',
            '/v1/evil.com',
            undefined,
        );
        expect(new URL(url).host).toBe('api.example.com');
    });

    it('omits the query string when query is empty', () => {
        const url = buildOutboundUrl('https://api.example.com', '/v1/x', {});
        expect(url).toBe('https://api.example.com/v1/x');
    });

    describe('self-enforces origin host invariant (defense-in-depth SSRF)', () => {
        // These tests call buildOutboundUrl DIRECTLY, bypassing normalizeAndValidatePath,
        // to prove the builder defends independently against host-escaping paths.

        it('throws on a path that looks like "@evil.com"', () => {
            expect(() =>
                buildOutboundUrl(
                    'https://api.example.com',
                    '@evil.com',
                    undefined,
                ),
            ).toThrow(ParameterError);
        });

        it('throws on a path that looks like "//evil.com"', () => {
            expect(() =>
                buildOutboundUrl(
                    'https://api.example.com',
                    '//evil.com',
                    undefined,
                ),
            ).toThrow(ParameterError);
        });

        it('throws on a path that looks like "https://evil.com"', () => {
            expect(() =>
                buildOutboundUrl(
                    'https://api.example.com',
                    'https://evil.com',
                    undefined,
                ),
            ).toThrow(ParameterError);
        });

        it('throws on a path that looks like "\\\\evil.com"', () => {
            expect(() =>
                buildOutboundUrl(
                    'https://api.example.com',
                    '\\\\evil.com',
                    undefined,
                ),
            ).toThrow(ParameterError);
        });
    });
});

describe('computeMinuteWindow', () => {
    it('floors a Date to the start of its minute (UTC)', () => {
        const d = new Date('2026-06-17T10:23:45.678Z');
        expect(computeMinuteWindow(d).toISOString()).toBe(
            '2026-06-17T10:23:00.000Z',
        );
    });

    it('is stable across two calls in the same minute', () => {
        const a = computeMinuteWindow(new Date('2026-06-17T10:23:01.000Z'));
        const b = computeMinuteWindow(new Date('2026-06-17T10:23:59.999Z'));
        expect(a.getTime()).toBe(b.getTime());
    });

    it('advances to the next window at the minute boundary', () => {
        const a = computeMinuteWindow(new Date('2026-06-17T10:23:59.999Z'));
        const b = computeMinuteWindow(new Date('2026-06-17T10:24:00.000Z'));
        expect(b.getTime() - a.getTime()).toBe(60_000);
    });
});

describe('serializeRequestBody', () => {
    it('serializes an object to JSON and reports byte length', () => {
        const { json, bytes } = serializeRequestBody({ a: 1 });
        expect(json).toBe('{"a":1}');
        expect(bytes).toBe(Buffer.byteLength('{"a":1}', 'utf8'));
    });

    it('treats undefined body as an empty object', () => {
        const { json } = serializeRequestBody(undefined);
        expect(json).toBe('{}');
    });

    it('counts multibyte characters by UTF-8 byte length', () => {
        const { bytes } = serializeRequestBody({ s: 'é' });
        // {"s":"é"} -> 'é' is 2 bytes in UTF-8
        expect(bytes).toBe(Buffer.byteLength('{"s":"é"}', 'utf8'));
    });

    it('throws ParameterError on a value that cannot be JSON-serialized', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(() => serializeRequestBody(circular)).toThrow(ParameterError);
    });
});

describe('assertSafeApiKeyHeaderName', () => {
    it('accepts a normal api key header', () => {
        expect(() => assertSafeApiKeyHeaderName('X-Api-Key')).not.toThrow();
    });

    it.each([
        ['Host'],
        ['host'],
        ['Cookie'],
        ['Authorization'],
        ['Content-Length'],
        ['Transfer-Encoding'],
        ['Connection'],
    ])('rejects the sensitive/hop-by-hop header %s', (name) => {
        expect(() => assertSafeApiKeyHeaderName(name)).toThrow(ParameterError);
    });

    it.each([['Bad Header'], ['x:y'], ['has\nnewline'], ['']])(
        'rejects the invalid token %j',
        (name) => {
            expect(() => assertSafeApiKeyHeaderName(name)).toThrow(
                ParameterError,
            );
        },
    );
});
