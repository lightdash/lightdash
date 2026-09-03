import {
    generateOAuthAuthorizePage,
    generateOAuthRedirectPage,
    generateOAuthSuccessResponse,
    isSafeRedirectScheme,
    parseScopeString,
} from './oauth';

const VIEWPORT_META =
    '<meta name="viewport" content="width=device-width, initial-scale=1" />';
const AUTHORIZE_VIEWPORT_META =
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />';
const JAVASCRIPT_SCHEME = ['javascript', ''].join(':');
const JAVASCRIPT_REDIRECT_URI = `${JAVASCRIPT_SCHEME}alert(1)`;

const authorizePage = () =>
    generateOAuthAuthorizePage({
        action: '/api/v1/oauth/authorize',
        client_id: 'test-client',
        client_name: 'Test Client',
        scope: 'read',
        scopes: parseScopeString('read'),
        user: {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            organizationName: 'Example',
        },
        loginUrl: '/login',
        hiddenInputs: [],
    });

describe('isSafeRedirectScheme', () => {
    it.each([
        'https://example.com/callback',
        'http://localhost:9000/callback',
        'com.lightdash.mobile://oauth/callback',
    ])('accepts supported redirect URI %s', (redirectUri) => {
        expect(isSafeRedirectScheme(redirectUri)).toBe(true);
    });

    it.each([
        JAVASCRIPT_REDIRECT_URI,
        'data:text/html,x',
        'vbscript:x',
        'file:///etc/passwd',
        'blob:https://x',
        [' JAVASCRIPT', 'alert(1)'].join(':'),
        '\tDaTa:text/html,x ',
        'not a URL',
    ])('rejects unsafe redirect URI %s', (redirectUri) => {
        expect(isSafeRedirectScheme(redirectUri)).toBe(false);
    });
});

describe('OAuth page templates', () => {
    it('declares the viewport on the authorize page so it renders at 1:1 on mobile and exposes safe-area insets', () => {
        expect(authorizePage()).toContain(AUTHORIZE_VIEWPORT_META);
    });

    it('declares the viewport on the response page', () => {
        expect(generateOAuthSuccessResponse('Authorized', ['Done'])).toContain(
            VIEWPORT_META,
        );
    });

    it('reserves bottom safe-area inset plus toolbar clearance so the action row is not hidden by the browser sheet toolbar', () => {
        const bodyRules = authorizePage().match(/body \{[^}]*\}/g) ?? [];
        expect(
            bodyRules.some((rule) =>
                rule.includes('env(safe-area-inset-bottom, 0px)'),
            ),
        ).toBe(true);
    });

    it('sizes the card with border-box so it cannot overflow a narrow screen', () => {
        const containerRule = authorizePage().match(
            /\.container \{([^}]*)\}/,
        )?.[1];
        expect(containerRule).toBeDefined();
        expect(containerRule).toContain('box-sizing: border-box;');
        expect(containerRule).toContain('width: 100%;');
    });

    it('renders OAuth redirects without an executable injection context', () => {
        const redirectPage = generateOAuthRedirectPage({
            redirectUrl:
                'https://example.com/callback?</script><img src=x onerror=alert(document.domain)>',
            message: 'Redirecting',
        });

        expect(redirectPage).toContain('http-equiv="refresh"');
        expect(redirectPage).not.toContain('<script');
        expect(redirectPage).not.toContain('</script>');
        expect(redirectPage).not.toContain('<img src=x');
        expect(redirectPage).not.toContain('onerror=');
        expect(redirectPage).toContain(
            '<a class="button" href="https://example.com/callback?&lt;/script&gt;&lt;img src&#x3D;x onerror&#x3D;alert(document.domain)&gt;">Continue</a>',
        );
        expect(redirectPage).toContain('&lt;/script&gt;');
    });

    it('escapes quotes in OAuth redirect link URLs', () => {
        const redirectPage = generateOAuthRedirectPage({
            redirectUrl: 'com.lightdash.mobile://oauth/callback?state="value"',
            message: 'Redirecting',
        });

        expect(redirectPage).toContain(
            '<a class="button" href="com.lightdash.mobile://oauth/callback?state&#x3D;&quot;value&quot;">Continue</a>',
        );
        expect(redirectPage).not.toContain('href="value"');
    });

    it('does not navigate to an unsafe OAuth redirect URL', () => {
        const redirectPage = generateOAuthRedirectPage({
            redirectUrl: JAVASCRIPT_REDIRECT_URI,
            message: 'Redirecting',
        });

        expect(redirectPage).not.toContain(JAVASCRIPT_SCHEME);
        expect(redirectPage).not.toContain('http-equiv="refresh"');
    });
});
