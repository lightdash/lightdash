import { AnyType } from '@lightdash/common';
import { OAuth2Model } from './OAuth2Model';

describe('OAuth2Model.validateRedirectUri', () => {
    const model = new OAuth2Model({} as AnyType);
    const client = {
        id: 'oauth-client-id',
        organizationUuid: 'organization-uuid',
        redirectUris: [
            'http://localhost:8100/callback',
            'http://localhost:*/callback',
            'https://example.com/*',
        ],
    };

    it('returns true for exact match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:8100/callback',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns true for wildcard match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:9999/callback',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns true for wildcard path match', async () => {
        const result = await model.validateRedirectUri(
            'https://example.com/anything',
            client as AnyType,
        );
        expect(result).toBe(true);
    });

    it('returns false for non-wildcard port uri', async () => {
        const result = await model.validateRedirectUri(
            'https://example.com:8100/anything',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('returns false for non-matching uri', async () => {
        const result = await model.validateRedirectUri(
            'http://malicious.com/callback',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('returns false for partial match', async () => {
        const result = await model.validateRedirectUri(
            'http://localhost:8100/other',
            client as AnyType,
        );
        expect(result).toBe(false);
    });

    it('requires exact matching for self-registered clients', async () => {
        const selfRegisteredClient = {
            id: 'mcp-client-id',
            organizationUuid: null,
            redirectUris: ['http://localhost:*/callback'],
        };

        await expect(
            model.validateRedirectUri(
                'http://localhost:8100/callback',
                selfRegisteredClient as AnyType,
            ),
        ).resolves.toBe(false);
    });

    it('allows an exact loopback redirect for self-registered clients', async () => {
        const selfRegisteredClient = {
            id: 'mcp-client-id',
            organizationUuid: null,
            redirectUris: ['http://127.0.0.1:8100/callback'],
        };

        await expect(
            model.validateRedirectUri(
                'http://127.0.0.1:8100/callback',
                selfRegisteredClient as AnyType,
            ),
        ).resolves.toBe(true);
    });

    it('requires an exact private-use redirect for self-registered clients', async () => {
        const selfRegisteredClient = {
            id: 'mcp-client-id',
            organizationUuid: null,
            redirectUris: ['com.example.app:/callback'],
        };

        await expect(
            model.validateRedirectUri(
                'com.example.app:/callback',
                selfRegisteredClient as AnyType,
            ),
        ).resolves.toBe(true);
        await expect(
            model.validateRedirectUri(
                'com.example.app:/other',
                selfRegisteredClient as AnyType,
            ),
        ).resolves.toBe(false);
    });

    it('preserves wildcard matching for the seeded CLI client', async () => {
        const cliClient = {
            id: 'lightdash-cli',
            organizationUuid: null,
            redirectUris: ['http://localhost:*/callback'],
        };

        await expect(
            model.validateRedirectUri(
                'http://localhost:8100/callback',
                cliClient as AnyType,
            ),
        ).resolves.toBe(true);
    });
});
