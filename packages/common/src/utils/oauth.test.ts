import {
    generateOAuthAuthorizePage,
    generateOAuthRedirectPage,
    generateOAuthSuccessResponse,
    parseScopeString,
} from './oauth';

const VIEWPORT_META =
    '<meta name="viewport" content="width=device-width, initial-scale=1" />';

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

describe('OAuth page templates', () => {
    it('declares the viewport on the authorize page so it renders at 1:1 on mobile', () => {
        expect(authorizePage()).toContain(VIEWPORT_META);
    });

    it('declares the viewport on the response page', () => {
        expect(generateOAuthSuccessResponse('Authorized', ['Done'])).toContain(
            VIEWPORT_META,
        );
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
        expect(redirectPage).not.toContain('href=');
        expect(redirectPage).toContain('&lt;/script&gt;');
    });
});
