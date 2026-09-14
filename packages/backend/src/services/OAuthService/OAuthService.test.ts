// eslint-disable @typescript-eslint/dot-notation
import { AnyType } from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { LightdashConfig } from '../../config/parseConfig';
import { OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { OAuthService } from './OAuthService';

const JAVASCRIPT_REDIRECT_URI = ['javascript', 'alert(1)'].join(':');

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
            getAccessToken: vi.fn(),
            getClient: vi.fn(),
            getRefreshToken: vi.fn(),
            revokeToken: vi.fn(),
            revokeRefreshToken: vi.fn(),
            deleteRefreshToken: vi.fn(),
            deleteAccessToken: vi.fn(),
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
        const client: OAuth2Server.Client = {
            id: 'client-id',
            redirectUris: ['https://example.com/callback'],
            grants: ['authorization_code'],
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

    describe('revokeToken', () => {
        const refreshToken = {
            refreshToken: 'refresh-token',
            refreshTokenExpiresAt: new Date('2026-12-01T00:00:00.000Z'),
            client: { id: 'oauth-mobile', grants: ['refresh_token'] },
            user: { userId: 42, organizationUuid: 'organization-uuid' },
        } as AnyType;

        it('deletes a refresh token outright and never softly revokes it', async () => {
            vi.mocked(mockOAuthModel.getRefreshToken).mockResolvedValue(
                refreshToken,
            );
            vi.mocked(mockOAuthModel.deleteRefreshToken).mockResolvedValue(
                true,
            );

            await expect(
                oauthService.revokeToken('refresh-token'),
            ).resolves.toBe(true);
            expect(mockOAuthModel.deleteRefreshToken).toHaveBeenCalledWith(
                'refresh-token',
            );
            expect(mockOAuthModel.revokeToken).not.toHaveBeenCalled();
        });

        it('tells the listener which grant the user revoked', async () => {
            const onGrantRevoked = vi.fn(async () => undefined);
            const service = new TestOAuthService({
                userModel: mockUserModel,
                oauthModel: mockOAuthModel,
                lightdashConfig: mockLightdashConfig,
                onGrantRevoked,
            });
            vi.mocked(mockOAuthModel.getRefreshToken).mockResolvedValue(
                refreshToken,
            );
            vi.mocked(mockOAuthModel.deleteRefreshToken).mockResolvedValue(
                true,
            );

            await service.revokeToken('refresh-token');

            expect(onGrantRevoked).toHaveBeenCalledWith({
                userId: 42,
                clientId: 'oauth-mobile',
            });
        });

        it('leaves the listener alone when no row was deleted', async () => {
            const onGrantRevoked = vi.fn(async () => undefined);
            const service = new TestOAuthService({
                userModel: mockUserModel,
                oauthModel: mockOAuthModel,
                lightdashConfig: mockLightdashConfig,
                onGrantRevoked,
            });
            vi.mocked(mockOAuthModel.getRefreshToken).mockResolvedValue(
                refreshToken,
            );
            vi.mocked(mockOAuthModel.deleteRefreshToken).mockResolvedValue(
                false,
            );

            await expect(service.revokeToken('refresh-token')).resolves.toBe(
                false,
            );
            expect(onGrantRevoked).not.toHaveBeenCalled();
        });

        it('deletes an access token when the value is not a refresh token', async () => {
            vi.mocked(mockOAuthModel.getRefreshToken).mockResolvedValue(false);
            vi.mocked(mockOAuthModel.deleteAccessToken).mockResolvedValue(true);

            await expect(
                oauthService.revokeToken('access-token'),
            ).resolves.toBe(true);
            expect(mockOAuthModel.deleteAccessToken).toHaveBeenCalledWith(
                'access-token',
            );
        });
    });

    describe('registerClient', () => {
        it('rejects an unsafe redirect URI scheme', async () => {
            await expect(
                oauthService.registerClient({
                    clientName: 'Unsafe client',
                    redirectUris: [JAVASCRIPT_REDIRECT_URI],
                }),
            ).rejects.toThrow(
                `Invalid redirect URI ${JAVASCRIPT_REDIRECT_URI}`,
            );
        });
    });
});
