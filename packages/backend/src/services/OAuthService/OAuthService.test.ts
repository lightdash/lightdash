// eslint-disable @typescript-eslint/dot-notation
import { AnyType } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { LightdashConfig } from '../../config/parseConfig';
import {
    OAuth2Model,
    type LightdashOAuthClient,
} from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { OAuthService } from './OAuthService';

// Test subclass to expose oauthServer for mocking
class TestOAuthService extends OAuthService {
    public setOAuthServer(server: AnyType) {
        this.oauthServer = server;
    }
}

describe('OAuthService edge cases', () => {
    let oauthService: TestOAuthService;
    let mockUserModel: import('vitest').Mocked<UserModel>;
    let mockOAuthModel: import('vitest').Mocked<OAuth2Model>;
    let mockLightdashConfig: import('vitest').Mocked<LightdashConfig>;

    beforeEach(() => {
        mockUserModel = {
            getSessionUserFromCacheOrDB: vi.fn(),
        } as AnyType;
        mockOAuthModel = {
            createClient: vi.fn(),
            getAccessToken: vi.fn(),
            getClient: vi.fn(),
            revokeToken: vi.fn(),
            revokeRefreshToken: vi.fn(),
            validateRedirectUri: vi.fn(),
        } as AnyType;
        mockLightdashConfig = {
            siteUrl: 'https://lightdash.com',
            auth: {},
        } as AnyType;
        oauthService = new TestOAuthService({
            userModel: mockUserModel,
            oauthModel: mockOAuthModel,
            lightdashConfig: mockLightdashConfig,
        });
    });

    it('should throw if authorize is called with missing user fields', async () => {
        const request = {} as OAuth2Server.Request;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            authorize: vi.fn().mockImplementation(() => {
                throw new Error('Missing user fields');
            }),
        } as AnyType);
        await expect(
            oauthService.authorize(request, response, {} as AnyType),
        ).rejects.toThrow('Missing user fields');
    });

    it('should throw if token is called with missing parameters', async () => {
        const request = {} as OAuth2Server.Request;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            token: vi.fn().mockImplementation(() => {
                throw new Error('Missing parameters');
            }),
        } as AnyType);
        await expect(oauthService.token(request, response)).rejects.toThrow(
            'Missing parameters',
        );
    });

    it('should throw if PKCE code_verifier is missing', async () => {
        // Simulate a PKCE-required flow
        const request = {
            body: { code_challenge: 'abc', code_challenge_method: 'S256' },
        } as AnyType;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            token: vi.fn().mockImplementation(() => {
                throw new Error('code_verifier is required for PKCE');
            }),
        } as AnyType);
        await expect(oauthService.token(request, response)).rejects.toThrow(
            'code_verifier is required for PKCE',
        );
    });

    it('should throw if PKCE code_verifier does not match code_challenge', async () => {
        // Simulate a PKCE mismatch
        const request = {
            body: {
                code_challenge: 'abc',
                code_challenge_method: 'S256',
                code_verifier: 'wrong',
            },
        } as AnyType;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            token: vi.fn().mockImplementation(() => {
                throw new Error('Invalid code verifier');
            }),
        } as AnyType);
        await expect(oauthService.token(request, response)).rejects.toThrow(
            'Invalid code verifier',
        );
    });

    it('should throw if redirect_uri is invalid', async () => {
        const request = {
            body: { redirect_uri: 'http://malicious.com/callback' },
        } as AnyType;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            authorize: vi.fn().mockImplementation(() => {
                throw new Error('Invalid redirect_uri');
            }),
        } as AnyType);
        await expect(
            oauthService.authorize(request, response, {
                user_id: 'u',
                organization_uuid: 'o',
            } as AnyType),
        ).rejects.toThrow('Invalid redirect_uri');
    });

    describe('validateRedirectUri', () => {
        const client: LightdashOAuthClient = {
            id: 'client-id',
            redirectUris: ['https://example.com/callback'],
            grants: ['authorization_code'],
            clientName: 'Test client',
            organizationUuid: 'organization-uuid',
        };

        it('returns false when the client cannot be resolved', async () => {
            vi.mocked(mockOAuthModel.getClient).mockResolvedValue(false);

            await expect(
                oauthService.validateRedirectUri(
                    'unknown-client',
                    'https://example.com/callback',
                ),
            ).resolves.toBe(false);
            expect(mockOAuthModel.validateRedirectUri).not.toHaveBeenCalled();
        });

        it('delegates redirect matching to the OAuth model', async () => {
            vi.mocked(mockOAuthModel.getClient).mockResolvedValue(client);
            vi.mocked(mockOAuthModel.validateRedirectUri).mockResolvedValue(
                true,
            );

            await expect(
                oauthService.validateRedirectUri(
                    'client-id',
                    'https://example.com/callback',
                ),
            ).resolves.toBe(true);
            expect(mockOAuthModel.validateRedirectUri).toHaveBeenCalledWith(
                'https://example.com/callback',
                client,
            );
        });
    });

    describe('registerClient', () => {
        const registeredClient = {
            clientId: 'mcp-client-id',
            clientSecret: 'client-secret',
            clientName: 'Test client',
            redirectUris: ['https://example.com/callback'],
            grantTypes: ['authorization_code'],
            scopes: [],
            createdAt: new Date('2026-08-20T00:00:00.000Z'),
        };

        beforeEach(() => {
            vi.mocked(mockOAuthModel.createClient).mockResolvedValue(
                registeredClient,
            );
        });

        it.each([
            'https://example.com/*',
            'http://example.com/callback',
            ['java', 'script:alert(1)'].join(''),
            'data:text/plain,callback',
            'file:///tmp/callback',
        ])('rejects the redirect URI %s', async (redirectUri) => {
            await expect(
                oauthService.registerClient({
                    clientName: 'Test client',
                    redirectUris: [redirectUri],
                }),
            ).rejects.toThrow('Invalid redirect URI');
            expect(mockOAuthModel.createClient).not.toHaveBeenCalled();
        });

        it.each([
            'http://localhost:3210/callback',
            'http://127.0.0.1:3210/callback',
            'http://[::1]:3210/callback',
            'https://example.com/callback',
            'com.example.app:/callback',
        ])('registers the redirect URI %s', async (redirectUri) => {
            await expect(
                oauthService.registerClient({
                    clientName: 'Test client',
                    redirectUris: [redirectUri],
                }),
            ).resolves.toEqual(registeredClient);
            expect(mockOAuthModel.createClient).toHaveBeenCalledWith({
                clientName: 'Test client',
                redirectUris: [redirectUri],
                grantTypes: undefined,
                scopes: undefined,
            });
        });
    });
});
