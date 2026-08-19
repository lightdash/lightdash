import { describe, expect, it } from 'vitest';
import {
    generateOAuthAuthorizePage,
    type OAuthAuthorizeParams,
} from './oauth';

const params: OAuthAuthorizeParams = {
    action: '/api/v1/oauth/authorize',
    client_id: 'lightdash-cli',
    client_name: 'Lightdash CLI tool',
    scope: 'mcp:read',
    scopes: [{ title: 'MCP read access', description: 'Read access' }],
    user: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@acme.com',
        organizationName: 'Acme',
    },
    loginUrl: '/login?redirect=%2Fapi%2Fv1%2Foauth%2Fauthorize',
    hiddenInputs: [{ name: 'client_id', value: 'lightdash-cli' }],
};

describe('generateOAuthAuthorizePage', () => {
    it('shows the connected user and organization', () => {
        const html = generateOAuthAuthorizePage(params);

        expect(html).toContain('Jane Doe');
        expect(html).toContain('jane@acme.com');
        expect(html).toContain('Organization: Acme');
        expect(html).toContain('>JD<');
        expect(html).toContain('%2Fapi%2Fv1%2Foauth%2Fauthorize');
    });

    it('omits missing user details', () => {
        const html = generateOAuthAuthorizePage({
            ...params,
            user: {
                ...params.user,
                email: '',
                organizationName: '',
            },
        });

        expect(html).not.toContain('Organization:');
        expect(html).not.toContain('<div class="oauth-account-meta">');
    });

    it('escapes user content', () => {
        const html = generateOAuthAuthorizePage({
            ...params,
            user: {
                ...params.user,
                organizationName: '<script>alert(1)</script>',
            },
        });

        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
    });
});
