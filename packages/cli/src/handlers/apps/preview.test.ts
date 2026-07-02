import { buildPreviewEnv } from './preview';

describe('buildPreviewEnv', () => {
    it('renders the three VITE vars exactly, with trailing newline', () => {
        expect(
            buildPreviewEnv({
                serverUrl: 'http://localhost:3000',
                apiKey: 'ldpat_abc',
                projectUuid: 'proj-uuid-1',
            }),
        ).toBe(
            'VITE_LIGHTDASH_URL=http://localhost:3000\n' +
                'VITE_LIGHTDASH_API_KEY=ldpat_abc\n' +
                'VITE_LIGHTDASH_PROJECT_UUID=proj-uuid-1\n',
        );
    });

    it('strips a trailing slash from the server url', () => {
        const env = buildPreviewEnv({
            serverUrl: 'http://localhost:3000/',
            apiKey: 'k',
            projectUuid: 'p',
        });
        expect(env).toContain('VITE_LIGHTDASH_URL=http://localhost:3000\n');
    });
});
