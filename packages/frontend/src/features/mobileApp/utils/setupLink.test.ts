import {
    buildMobileSetupSchemeUrl,
    parseMobileSetupLinkParams,
} from './setupLink';

const CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const parse = (query: string) =>
    parseMobileSetupLinkParams(new URLSearchParams(query));

describe('parseMobileSetupLinkParams', () => {
    it('accepts a v=2 link and normalises the instance origin', () => {
        expect(
            parse(
                `v=2&i=${encodeURIComponent('https://app.example.com')}&c=${CODE}`,
            ),
        ).toEqual({
            status: 'valid',
            instanceOrigin: 'https://app.example.com',
            code: CODE,
        });
    });

    it('rejects an instance origin with a path', () => {
        expect(
            parse(
                `v=2&i=${encodeURIComponent('http://localhost:3000/somewhere')}&c=${CODE}`,
            ),
        ).toEqual({ status: 'invalid' });
    });

    it('rejects a missing version', () => {
        expect(
            parse(
                `i=${encodeURIComponent('https://app.example.com')}&c=${CODE}`,
            ),
        ).toMatchObject({ status: 'invalid' });
    });

    it('refuses an unknown link version', () => {
        expect(
            parse(
                `v=99&i=${encodeURIComponent('https://app.example.com')}&c=${CODE}`,
            ),
        ).toEqual({ status: 'unsupported-version' });
    });

    it('rejects a cleartext instance origin', () => {
        expect(
            parse(
                `v=2&i=${encodeURIComponent('http://evil.example')}&c=${CODE}`,
            ),
        ).toEqual({ status: 'invalid' });
    });

    it('allows cleartext on loopback so local development works', () => {
        expect(
            parse(
                `v=2&i=${encodeURIComponent('http://localhost:3000')}&c=${CODE}`,
            ),
        ).toEqual({
            status: 'valid',
            instanceOrigin: 'http://localhost:3000',
            code: CODE,
        });
        expect(
            parse(
                `v=2&i=${encodeURIComponent('http://127.0.0.1:8080')}&c=${CODE}`,
            ),
        ).toMatchObject({ status: 'valid' });
    });

    it('does not mistake a lookalike host for loopback', () => {
        expect(
            parse(
                `v=2&i=${encodeURIComponent('http://localhost.evil.example')}&c=${CODE}`,
            ),
        ).toEqual({ status: 'invalid' });
    });

    it('rejects a non-http instance origin', () => {
        expect(
            parse(
                `v=2&i=${encodeURIComponent('javascript:alert(1)')}&c=${CODE}`,
            ),
        ).toEqual({ status: 'invalid' });
    });

    it('rejects a code that is not 32 base32 characters', () => {
        expect(
            parse(
                `v=2&i=${encodeURIComponent('https://app.example.com')}&c=short`,
            ),
        ).toEqual({ status: 'invalid' });
        expect(
            parse(
                `v=2&i=${encodeURIComponent('https://app.example.com')}&c=${CODE.toLowerCase()}`,
            ),
        ).toEqual({ status: 'invalid' });
    });

    it.each(['v=2', 'i', `c=${CODE}`])(
        'rejects duplicate parameters including valueless ones: %s',
        (duplicate) => {
            expect(
                parse(
                    `v=2&i=https%3A%2F%2Fapp.example.com&c=${CODE}&${duplicate}`,
                ),
            ).toEqual({ status: 'invalid' });
        },
    );

    it.each([
        'https://user:password@app.example.com',
        'https://app.example.com/?x=1',
        'https://app.example.com/#secret',
    ])(
        'rejects an origin containing credentials or URL extras: %s',
        (origin) => {
            expect(
                parse(`v=2&i=${encodeURIComponent(origin)}&c=${CODE}`),
            ).toEqual({ status: 'invalid' });
        },
    );

    it('rejects the unverified version 1 protocol', () => {
        expect(parse(`v=1&i=https%3A%2F%2Fapp.example.com&c=${CODE}`)).toEqual({
            status: 'unsupported-version',
        });
    });

    it('rejects a missing code', () => {
        expect(
            parse(`v=2&i=${encodeURIComponent('https://app.example.com')}`),
        ).toEqual({
            status: 'invalid',
        });
    });
});

describe('buildMobileSetupSchemeUrl', () => {
    it('builds the custom scheme url with percent-encoded params', () => {
        expect(
            buildMobileSetupSchemeUrl({
                instanceOrigin: 'http://localhost:3000',
                code: CODE,
            }),
        ).toBe(
            `com.lightdash.mobile://setup?v=2&i=http%3A%2F%2Flocalhost%3A3000&c=${CODE}`,
        );
    });
});
