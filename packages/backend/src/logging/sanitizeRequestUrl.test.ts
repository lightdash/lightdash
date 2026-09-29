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

it.each(['c', 'code', 'code_verifier', 'verification_code'])(
    'redacts setup secret %s',
    (key) => {
        expect(
            sanitizeRequestUrl(
                `/mobile-setup?v=2&${key}=secret&i=https%3A%2F%2Fexample.com`,
            ),
        ).toBe(
            `/mobile-setup?v=2&${key}=[REDACTED]&i=https%3A%2F%2Fexample.com`,
        );
    },
);
