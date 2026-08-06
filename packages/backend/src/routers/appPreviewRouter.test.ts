import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { buildCspHeader } from './appPreviewRouter';

describe('app preview CSP browser image origins', () => {
    it('adds the exact origin only to img-src', () => {
        const csp = buildCspHeader(
            lightdashConfigMock.appRuntime,
            ["'self'"],
            ['https://tiles.example.com'],
        );
        const directives = Object.fromEntries(
            csp.split('; ').map((directive) => {
                const [name, ...sources] = directive.split(' ');
                return [name, sources];
            }),
        );

        expect(directives['img-src']).toContain('https://tiles.example.com');
        expect(directives['connect-src']).not.toContain(
            'https://tiles.example.com',
        );
        expect(directives['script-src']).not.toContain(
            'https://tiles.example.com',
        );
    });
});
