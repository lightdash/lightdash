import {
    getLiveSourceSignInReturnUrl,
    parseLiveSourceReturnPath,
} from './liveSourceUserSignIn';

describe('parseLiveSourceReturnPath', () => {
    it.each(['/projects/p/saved/c', '/projects/p/dashboards/d/view?tab=1'])(
        'keeps the app path %s',
        (path) => {
            expect(parseLiveSourceReturnPath(path, '/fallback')).toBe(path);
        },
    );

    it.each([
        undefined,
        '',
        'https://evil.example.com',
        '//evil.example.com/path',
        '/\\evil.example.com',
        '/\t/evil.example.com',
        '/\n/evil.example.com',
        '/api/v1/ee/live-sources/hydra/oauth/authorize',
    ])('never returns anywhere but the app: %s', (path) => {
        expect(parseLiveSourceReturnPath(path, '/fallback')).toBe('/fallback');
    });
});

describe('getLiveSourceSignInReturnUrl', () => {
    it('returns to the page that asked, saying how the sign-in went', () => {
        expect(
            getLiveSourceSignInReturnUrl(
                'https://app.example.com',
                '/projects/p/saved/c?x=1',
                { connectionUuid: 'conn-1' },
            ),
        ).toBe(
            'https://app.example.com/projects/p/saved/c?x=1&liveSourceSignedIn=conn-1',
        );
    });

    it('stays in the app when a path would leave it', () => {
        expect(
            getLiveSourceSignInReturnUrl(
                'https://app.example.com',
                '/\t/evil.example.com',
                { error: 'denied' },
            ),
        ).toBe('https://app.example.com/?liveSourceSignInError=denied');
    });
});
