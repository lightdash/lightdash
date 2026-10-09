import qs from 'qs';
import { sanitizeRequestUrl } from './winston';

describe('sanitizeRequestUrl', () => {
    it('redacts download tokens without redacting file identifiers', () => {
        expect(
            sanitizeRequestUrl(
                '/api/v1/file/Zoswz_V59FXISG5hlZ_l3?downloadToken=secret',
            ),
        ).toBe('/api/v1/file/Zoswz_V59FXISG5hlZ_l3?downloadToken=[REDACTED]');
    });

    it('redacts download tokens on any request URL', () => {
        expect(
            sanitizeRequestUrl('/other?downloadToken=secret&next=value'),
        ).toBe('/other?downloadToken=[REDACTED]&next=value');
    });

    it('leaves unrelated request URLs unchanged', () => {
        expect(sanitizeRequestUrl('/api/v1/projects/project-uuid')).toBe(
            '/api/v1/projects/project-uuid',
        );
    });
});

it('redacts whole OAuth parameter names and preserves lookalikes', () => {
    expect(
        sanitizeRequestUrl(
            '/callback?code=auth-secret&state=state-secret&downloadToken=download-secret&countryCode=GB&statement=ready&CODE=again#fragment',
        ),
    ).toBe(
        '/callback?code=[REDACTED]&state=[REDACTED]&downloadToken=[REDACTED]&countryCode=GB&statement=ready&CODE=[REDACTED]#fragment',
    );
});

it.each([
    [
        '/callback?%63ode=auth-secret&%73tate=state-secret',
        '/callback?%63ode=[REDACTED]&%73tate=[REDACTED]',
    ],
    [
        '/callback?code=first&code=second&CoDe=third&sTaTe=fourth&%64ownloadToken=fifth',
        '/callback?code=[REDACTED]&code=[REDACTED]&CoDe=[REDACTED]&sTaTe=[REDACTED]&%64ownloadToken=[REDACTED]',
    ],
    [
        '/callback?countryCode=GB&statement=ready&zipcode=12345',
        '/callback?countryCode=GB&statement=ready&zipcode=12345',
    ],
    [
        '/callback?code&state&downloadToken&code=value=more#fragment',
        '/callback?code&state&downloadToken&code=[REDACTED]#fragment',
    ],
    [
        '/callback?%ZZcode=value&code=secret',
        '/callback?%ZZcode=value&code=[REDACTED]',
    ],
    ['/callback?code=secret#fragment', '/callback?code=[REDACTED]#fragment'],
    ['/callback#fragment?code=value', '/callback#fragment?code=value'],
])('sanitizes decoded parameter names %#', (url, expected) => {
    expect(sanitizeRequestUrl(url)).toBe(expected);
});

it.each([
    'code[0]',
    'code[]',
    'code[a][b]',
    '%63ode%5B0%5D',
    'CoDe%5B%5D',
    'state[nonce]',
    '%73tate%5Ba%5D%5Bb%5D',
    'downloadToken[0]',
    '%64ownloadToken%5B%5D',
    '[code]',
    '%5Bcode%5D',
    '[state][a]',
    '[downloadToken]',
    'co%64e',
])('redacts bracket parameter %s', (name) => {
    expect(sanitizeRequestUrl(`/callback?${name}=secret&state=nonce`)).toBe(
        `/callback?${name}=[REDACTED]&state=[REDACTED]`,
    );
});

it('removes secret values when parsed with the app query parser', () => {
    const url =
        '/callback?%63ode%5B0%5D=auth-secret&code[]=second-secret&state[a][b]=state-secret&downloadToken[0]=download-secret';
    const parseQuery = (requestUrl: string) =>
        qs.parse(requestUrl.slice(requestUrl.indexOf('?') + 1), {
            arrayLimit: 1000,
        });
    expect(parseQuery(url)).toEqual({
        code: ['auth-secret', 'second-secret'],
        state: { a: { b: 'state-secret' } },
        downloadToken: ['download-secret'],
    });
    const parsed = parseQuery(sanitizeRequestUrl(url));
    expect(parsed).toEqual({
        code: ['[REDACTED]', '[REDACTED]'],
        state: { a: { b: '[REDACTED]' } },
        downloadToken: ['[REDACTED]'],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/secret/);
});

it('preserves dotted names that the app query parser treats as literal keys', () => {
    const url = '/callback?code.value=ordinary&state.value=ordinary';
    expect(
        qs.parse(url.slice(url.indexOf('?') + 1), { arrayLimit: 1000 }),
    ).toEqual({
        'code.value': 'ordinary',
        'state.value': 'ordinary',
    });
    expect(sanitizeRequestUrl(url)).toBe(url);
});
