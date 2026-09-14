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
