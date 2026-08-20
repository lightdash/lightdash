import {
    generateOAuthAuthorizePage,
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
});
