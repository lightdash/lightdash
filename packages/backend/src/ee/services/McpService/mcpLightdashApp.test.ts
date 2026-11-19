import {
    buildLightdashAppSignInUrl,
    getClaudeSandboxDomain,
    resolveLightdashAppUrl,
} from './mcpLightdashApp';

const siteUrl = 'https://app.lightdash.example';

describe('resolveLightdashAppUrl', () => {
    it('opens the home page without a URL', () => {
        expect(resolveLightdashAppUrl(undefined, siteUrl)).toBe(
            'https://app.lightdash.example/',
        );
    });

    it('keeps a page on this Lightdash site', () => {
        expect(
            resolveLightdashAppUrl('/projects/p1/tables/orders?x=1', siteUrl),
        ).toBe('https://app.lightdash.example/projects/p1/tables/orders?x=1');
    });

    it.each([
        'https://evil.example/projects',
        '//evil.example/projects',
        'data:text/html,hello',
    ])('refuses %s', (url) => {
        expect(resolveLightdashAppUrl(url, siteUrl)).toBeNull();
    });
});

describe('buildLightdashAppSignInUrl', () => {
    it('sends the token and the page to the sign-in route', () => {
        const signIn = new URL(
            buildLightdashAppSignInUrl({
                siteUrl,
                token: 'tok',
                url: 'https://app.lightdash.example/projects/p1/home',
            }),
        );
        expect(signIn.origin + signIn.pathname).toBe(
            'https://app.lightdash.example/api/v1/mcp-app/sign-in',
        );
        expect(signIn.searchParams.get('token')).toBe('tok');
        expect(signIn.searchParams.get('redirect')).toBe(
            'https://app.lightdash.example/projects/p1/home',
        );
    });
});

describe('getClaudeSandboxDomain', () => {
    it('matches the domain Claude documents for a server URL', () => {
        expect(getClaudeSandboxDomain('https://example.com/mcp')).toBe(
            'c3d80a4ed901ee05b21755a88273b4a4.claudemcpcontent.com',
        );
    });
});
