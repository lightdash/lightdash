/* eslint-disable @typescript-eslint/no-explicit-any */
import { AuthorizationError, AuthTokenPrefix } from '@lightdash/common';
import crypto from 'crypto';
import { LightdashConfig } from '../../config/parseConfig';
import { DEFAULT_OAUTH_CLIENT_ID, OAuthModel } from '../../models/OAuthModel';
import { UserModel } from '../../models/UserModel';
import { OAuthService } from './OAuthService';

// Mock dependencies
jest.mock('../../models/UserModel');
jest.mock('../../models/OAuthModel');
jest.mock('../../config/parseConfig');
jest.mock('@node-oauth/oauth2-server');

describe('OAuthService', () => {
    let oauthService: OAuthService;
    let mockUserModel: jest.Mocked<UserModel>;
    let mockOAuthModel: jest.Mocked<OAuthModel>;
    let mockLightdashConfig: jest.Mocked<LightdashConfig>;

    beforeEach(() => {
        // Create mock instances
        mockUserModel = {
            getSessionUserFromCacheOrDB: jest.fn(),
        } as any;

        mockOAuthModel = {
            getClient: jest.fn().mockResolvedValue({
                clientUuid: expect.any(String),
                clientId: DEFAULT_OAUTH_CLIENT_ID,
                clientSecret: '',
                clientName: 'Lightdash CLI',
                redirectUris: ['http://localhost:*'],
                grants: ['authorization_code', 'refresh_token'],
                scopes: ['read', 'write'],
                createdAt: expect.any(Date),
                createdByUserUuid: null,
                expiresAt: null,
            }),
            saveAuthorizationCode: jest.fn(),
            getAuthorizationCode: jest.fn(),
            revokeAuthorizationCode: jest.fn(),
            saveAccessToken: jest.fn(),
            getAccessToken: jest.fn(),
            revokeAccessToken: jest.fn(),
            updateAccessTokenLastUsed: jest.fn(),
            getAccessTokenByUserAndClient: jest.fn(),
            saveRefreshToken: jest.fn(),
            getRefreshToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
            updateRefreshTokenLastUsed: jest.fn(),
            cleanupExpiredTokens: jest.fn(),
        } as any;

        mockLightdashConfig = {
            siteUrl: 'https://lightdash.com',
        } as any;

        // Create service instance
        oauthService = new OAuthService({
            userModel: mockUserModel,
            oauthModel: mockOAuthModel,
            lightdashConfig: mockLightdashConfig,
        });
    });

    describe('validateCodeChallenge', () => {
        it('should pass validation for valid S256 challenge', () => {
            const challenge = 'a'.repeat(43); // 43 characters
            expect(() =>
                oauthService.validateCodeChallenge(challenge, 'S256'),
            ).not.toThrow();
        });

        it('should pass validation for valid plain challenge', () => {
            const challenge = 'a'.repeat(43); // 43 characters
            expect(() =>
                oauthService.validateCodeChallenge(challenge, 'plain'),
            ).not.toThrow();
        });

        it('should throw error when challenge provided without method', () => {
            const challenge = 'a'.repeat(43);
            expect(() =>
                oauthService.validateCodeChallenge(challenge, undefined),
            ).toThrow(
                'code_challenge_method is required when code_challenge is provided',
            );
        });

        it('should throw error for invalid challenge method', () => {
            const challenge = 'a'.repeat(43);
            expect(() =>
                oauthService.validateCodeChallenge(challenge, 'invalid' as any),
            ).toThrow('code_challenge_method must be "S256" or "plain"');
        });

        it('should throw error for S256 challenge shorter than 43 characters', () => {
            const challenge = 'a'.repeat(42);
            expect(() =>
                oauthService.validateCodeChallenge(challenge, 'S256'),
            ).toThrow(
                'code_challenge must be at least 43 characters for S256 method',
            );
        });

        it('should throw error for plain challenge shorter than 43 characters', () => {
            const challenge = 'a'.repeat(42);
            expect(() =>
                oauthService.validateCodeChallenge(challenge, 'plain'),
            ).toThrow(
                'code_challenge must be at least 43 characters for plain method',
            );
        });

        it('should pass validation when no challenge provided', () => {
            expect(() =>
                oauthService.validateCodeChallenge(undefined, undefined),
            ).not.toThrow();
        });
    });

    describe('generateAuthorizationCode', () => {
        const mockUserUuid = 'user-123';
        const mockOrgUuid = 'org-456';
        const mockRedirectUri = 'http://localhost/callback';
        const mockScopes = ['read', 'write'];

        beforeEach(() => {
            mockOAuthModel.saveAuthorizationCode.mockResolvedValue({
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(),
                redirectUri: mockRedirectUri,
                scopes: mockScopes,
                userUuid: mockUserUuid,
                organizationUuid: mockOrgUuid,
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: null,
                codeChallengeMethod: null,
            });
        });

        it('should generate and save authorization code', async () => {
            const result = await oauthService.generateAuthorizationCode({
                redirectUri: mockRedirectUri,
                scopes: mockScopes,
                userUuid: mockUserUuid,
                organizationUuid: mockOrgUuid,
            });

            expect(result).toMatch(/^[a-f0-9]{64}$/); // 32 bytes = 64 hex chars
            expect(mockOAuthModel.saveAuthorizationCode).toHaveBeenCalledWith({
                authorization_code: expect.any(String),
                expires_at: expect.any(Date),
                redirect_uri: mockRedirectUri,
                scopes: mockScopes,
                user_uuid: mockUserUuid,
                organization_uuid: mockOrgUuid,
                code_challenge: null,
                code_challenge_method: null,
            });
        });

        it('should handle PKCE parameters', async () => {
            const codeChallenge = 'a'.repeat(43);
            const codeChallengeMethod = 'S256' as const;

            await oauthService.generateAuthorizationCode({
                redirectUri: mockRedirectUri,
                scopes: mockScopes,
                userUuid: mockUserUuid,
                organizationUuid: mockOrgUuid,
                codeChallenge,
                codeChallengeMethod,
            });

            expect(mockOAuthModel.saveAuthorizationCode).toHaveBeenCalledWith({
                authorization_code: expect.any(String),
                expires_at: expect.any(Date),
                redirect_uri: mockRedirectUri,
                scopes: mockScopes,
                user_uuid: mockUserUuid,
                organization_uuid: mockOrgUuid,
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod,
            });
        });

        it('should handle empty redirect URI', async () => {
            await oauthService.generateAuthorizationCode({
                redirectUri: '',
                scopes: mockScopes,
                userUuid: mockUserUuid,
                organizationUuid: mockOrgUuid,
            });

            expect(mockOAuthModel.saveAuthorizationCode).toHaveBeenCalledWith({
                authorization_code: expect.any(String),
                expires_at: expect.any(Date),
                redirect_uri: '',
                scopes: mockScopes,
                user_uuid: mockUserUuid,
                organization_uuid: mockOrgUuid,
                code_challenge: null,
                code_challenge_method: null,
            });
        });
    });

    describe('validateCodeVerifier', () => {
        it('should validate S256 code verifier correctly', async () => {
            const codeVerifier = 'test_verifier_123';
            const codeChallenge = crypto
                .createHash('sha256')
                .update(codeVerifier)
                .digest('base64url');

            const result = await oauthService.validateCodeVerifier(
                codeVerifier,
                codeChallenge,
                'S256',
            );
            expect(result).toBe(true);
        });

        it('should validate plain code verifier correctly', async () => {
            const codeVerifier = 'test_verifier_123';
            const codeChallenge = codeVerifier;

            const result = await oauthService.validateCodeVerifier(
                codeVerifier,
                codeChallenge,
                'plain',
            );
            expect(result).toBe(true);
        });

        it('should return false for invalid S256 verifier', async () => {
            const codeVerifier = 'test_verifier_123';
            const codeChallenge = 'invalid_challenge';

            const result = await oauthService.validateCodeVerifier(
                codeVerifier,
                codeChallenge,
                'S256',
            );
            expect(result).toBe(false);
        });

        it('should return false for invalid plain verifier', async () => {
            const codeVerifier = 'test_verifier_123';
            const codeChallenge = 'different_verifier';

            const result = await oauthService.validateCodeVerifier(
                codeVerifier,
                codeChallenge,
                'plain',
            );
            expect(result).toBe(false);
        });

        it('should return false for unknown method', async () => {
            const codeVerifier = 'test_verifier_123';
            const codeChallenge = 'test_challenge';

            const result = await oauthService.validateCodeVerifier(
                codeVerifier,
                codeChallenge,
                'unknown' as any,
            );
            expect(result).toBe(false);
        });
    });

    describe('getAuthorizationCodeForController', () => {
        const mockTokenRequest = {
            grant_type: 'authorization_code' as const,
            code: 'auth_code_123',
            client_id: DEFAULT_OAUTH_CLIENT_ID,
            client_secret: 'cli-secret',
            redirect_uri: 'http://localhost/callback',
            code_verifier: 'test_verifier',
        };

        beforeEach(() => {
            mockOAuthModel.getClient.mockResolvedValue({
                clientUuid: 'client-uuid-123',
                clientId: DEFAULT_OAUTH_CLIENT_ID,
                clientSecret: 'cli-secret',
                clientName: 'Lightdash CLI',
                redirectUris: ['http://localhost:3000/callback'],
                grants: ['authorization_code', 'refresh_token'],
                scopes: ['read', 'write'],
                createdAt: new Date(),
                createdByUserUuid: null,
                expiresAt: null,
            });
        });

        it('should return token response for valid authorization code', async () => {
            const mockAuthCode = {
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(Date.now() + 3600000), // Valid for 1 hour
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: null,
                codeChallengeMethod: null,
            };

            const mockAccessToken = {
                accessTokenUuid: 'access-uuid-123',
                accessToken: 'access_token_123',
                expiresAt: new Date(Date.now() + 3600000),
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                lastUsedAt: null,
                revokedAt: null,
                authorizationCodeUuid: null,
            };

            mockOAuthModel.getAuthorizationCode.mockResolvedValue(mockAuthCode);
            mockOAuthModel.getAccessTokenByUserAndClient.mockResolvedValue(
                mockAccessToken,
            );

            const result = await oauthService.getAuthorizationCodeForController(
                mockTokenRequest,
            );

            expect(result).toEqual({
                access_token: expect.stringMatching(/^ldapp_[a-f0-9]{64}$/),
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_token: expect.stringMatching(/^ldref_[a-f0-9]{64}$/),
                scope: 'read write',
            });
        });

        it('should throw error for invalid authorization code', async () => {
            mockOAuthModel.getAuthorizationCode.mockResolvedValue(null);

            await expect(
                oauthService.getAuthorizationCodeForController(
                    mockTokenRequest,
                ),
            ).rejects.toThrow('Invalid authorization code');
        });

        it('should throw error for expired authorization code', async () => {
            const expiredAuthCode = {
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(Date.now() - 1000), // Expired
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: null,
                codeChallengeMethod: null,
            };

            mockOAuthModel.getAuthorizationCode.mockResolvedValue(
                expiredAuthCode,
            );

            await expect(
                oauthService.getAuthorizationCodeForController(
                    mockTokenRequest,
                ),
            ).rejects.toThrow('Authorization code has expired');
        });

        it('should handle different client ID (no validation implemented)', async () => {
            const mockAuthCode = {
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(Date.now() + 3600000),
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: null,
                codeChallengeMethod: null,
            };

            const mockAccessToken = {
                accessTokenUuid: 'access-uuid-123',
                accessToken: 'access_token_123',
                expiresAt: new Date(Date.now() + 3600000),
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                lastUsedAt: null,
                revokedAt: null,
                authorizationCodeUuid: null,
            };

            mockOAuthModel.getAuthorizationCode.mockResolvedValue(mockAuthCode);
            mockOAuthModel.getAccessTokenByUserAndClient.mockResolvedValue(
                mockAccessToken,
            );
            mockOAuthModel.getClient.mockResolvedValue({
                clientUuid: 'client-uuid-123',
                clientId: 'different-client',
                clientSecret: 'cli-secret',
                clientName: 'Lightdash CLI',
                redirectUris: ['http://localhost:3000/callback'],
                grants: ['authorization_code', 'refresh_token'],
                scopes: ['read', 'write'],
                createdAt: new Date(),
                createdByUserUuid: null,
                expiresAt: null,
            });

            // Should not throw error since client ID validation is not implemented
            const result = await oauthService.getAuthorizationCodeForController(
                mockTokenRequest,
            );

            expect(result).toEqual({
                access_token: expect.stringMatching(/^ldapp_[a-f0-9]{64}$/),
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_token: expect.stringMatching(/^ldref_[a-f0-9]{64}$/),
                scope: 'read write',
            });
        });

        it('should validate PKCE when code challenge is provided', async () => {
            const mockAuthCode = {
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(Date.now() + 3600000),
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: 'test_challenge',
                codeChallengeMethod: 'S256' as const,
            };

            mockOAuthModel.getAuthorizationCode.mockResolvedValue(mockAuthCode);

            const requestWithPKCE = {
                ...mockTokenRequest,
                code_verifier: 'invalid_verifier',
            };

            await expect(
                oauthService.getAuthorizationCodeForController(requestWithPKCE),
            ).rejects.toThrow('Invalid code verifier');
        });

        it('should throw error when code verifier is missing for PKCE', async () => {
            const mockAuthCode = {
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(Date.now() + 3600000),
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: 'test_challenge',
                codeChallengeMethod: 'S256' as const,
            };

            mockOAuthModel.getAuthorizationCode.mockResolvedValue(mockAuthCode);

            const requestWithoutVerifier = {
                ...mockTokenRequest,
                code_verifier: undefined,
            };

            await expect(
                oauthService.getAuthorizationCodeForController(
                    requestWithoutVerifier,
                ),
            ).rejects.toThrow('code_verifier is required for PKCE');
        });
    });

    describe('refreshTokenForController', () => {
        const mockTokenRequest = {
            grant_type: 'refresh_token' as const,
            refresh_token: 'refresh_token_123',
            client_id: DEFAULT_OAUTH_CLIENT_ID,
            client_secret: 'cli-secret',
        };

        beforeEach(() => {
            mockOAuthModel.getClient.mockResolvedValue({
                clientUuid: 'client-uuid-123',
                clientId: DEFAULT_OAUTH_CLIENT_ID,
                clientSecret: 'cli-secret',
                clientName: 'Lightdash CLI',
                redirectUris: ['http://localhost:3000/callback'],
                grants: ['authorization_code', 'refresh_token'],
                scopes: ['read', 'write'],
                createdAt: new Date(),
                createdByUserUuid: null,
                expiresAt: null,
            });
        });

        it('should return new token response for valid refresh token', async () => {
            const mockRefreshToken = {
                refreshTokenUuid: 'refresh-uuid-123',
                refreshToken: 'refresh_token_123',
                expiresAt: new Date(Date.now() + 86400000), // Valid for 24 hours
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                lastUsedAt: null,
                revokedAt: null,
                accessTokenUuid: 'access-uuid-123',
            };

            mockOAuthModel.getRefreshToken.mockResolvedValue(mockRefreshToken);

            const result = await oauthService.refreshTokenForController(
                mockTokenRequest,
            );

            expect(result).toEqual({
                access_token: expect.stringMatching(/^ldapp_[a-f0-9]{64}$/),
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_token: 'refresh_token_123',
                scope: 'read write',
            });
        });

        it('should throw error for invalid refresh token', async () => {
            mockOAuthModel.getRefreshToken.mockResolvedValue(null);

            await expect(
                oauthService.refreshTokenForController(mockTokenRequest),
            ).rejects.toThrow('Invalid refresh token');
        });

        it('should throw error for expired refresh token', async () => {
            const expiredRefreshToken = {
                refreshTokenUuid: 'refresh-uuid-123',
                refreshToken: 'refresh_token_123',
                expiresAt: new Date(Date.now() - 1000), // Expired
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                lastUsedAt: null,
                revokedAt: null,
                accessTokenUuid: 'access-uuid-123',
            };

            mockOAuthModel.getRefreshToken.mockResolvedValue(
                expiredRefreshToken,
            );

            await expect(
                oauthService.refreshTokenForController(mockTokenRequest),
            ).rejects.toThrow('Refresh token has expired');
        });

        it('should handle different client ID (no validation implemented)', async () => {
            const mockRefreshToken = {
                refreshTokenUuid: 'refresh-uuid-123',
                refreshToken: 'refresh_token_123',
                expiresAt: new Date(Date.now() + 86400000),
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                lastUsedAt: null,
                revokedAt: null,
                accessTokenUuid: 'access-uuid-123',
            };

            mockOAuthModel.getRefreshToken.mockResolvedValue(mockRefreshToken);
            mockOAuthModel.getClient.mockResolvedValue({
                clientUuid: 'client-uuid-123',
                clientId: 'different-client',
                clientSecret: 'cli-secret',
                clientName: 'Lightdash CLI',
                redirectUris: ['http://localhost:3000/callback'],
                grants: ['authorization_code', 'refresh_token'],
                scopes: ['read', 'write'],
                createdAt: new Date(),
                createdByUserUuid: null,
                expiresAt: null,
            });

            // Should not throw error since client ID validation is not implemented
            const result = await oauthService.refreshTokenForController(
                mockTokenRequest,
            );

            expect(result).toEqual({
                access_token: expect.stringMatching(/^ldapp_[a-f0-9]{64}$/),
                token_type: 'Bearer',
                expires_in: 3600,
                refresh_token: 'refresh_token_123',
                scope: 'read write',
            });
        });
    });

    describe('getAccessTokenForController', () => {
        it('should return access token information', async () => {
            const mockAccessToken = {
                accessTokenUuid: 'access-uuid-123',
                accessToken: 'access_token_123',
                expiresAt: new Date(Date.now() + 3600000),
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date('2023-01-01T00:00:00Z'),
                lastUsedAt: null,
                revokedAt: null,
                authorizationCodeUuid: null,
            };

            mockOAuthModel.getAccessToken.mockResolvedValue(mockAccessToken);
            mockOAuthModel.getClient.mockResolvedValue({
                clientUuid: 'client-uuid-123',
                clientId: DEFAULT_OAUTH_CLIENT_ID,
                clientSecret: 'cli-secret',
                clientName: 'Lightdash CLI',
                redirectUris: ['http://localhost:3000/callback'],
                grants: ['authorization_code', 'refresh_token'],
                scopes: ['read', 'write'],
                createdAt: new Date(),
                createdByUserUuid: null,
                expiresAt: null,
            });

            const result = await oauthService.getAccessTokenForController(
                'access_token_123',
            );

            expect(result).toEqual({
                accessToken: 'access_token_123',
                expiresAt: mockAccessToken.expiresAt,
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: mockAccessToken.createdAt,
            });
            expect(
                mockOAuthModel.updateAccessTokenLastUsed,
            ).toHaveBeenCalledWith('access-uuid-123');
        });

        it('should return null for non-existent token', async () => {
            mockOAuthModel.getAccessToken.mockResolvedValue(null);

            const result = await oauthService.getAccessTokenForController(
                'non_existent_token',
            );

            expect(result).toBeNull();
        });

        it('should handle token with no scopes', async () => {
            const mockAccessToken = {
                accessTokenUuid: 'access-uuid-123',
                accessToken: 'access_token_123',
                expiresAt: new Date(Date.now() + 3600000),
                scopes: [],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                lastUsedAt: null,
                revokedAt: null,
                authorizationCodeUuid: null,
            };

            mockOAuthModel.getAccessToken.mockResolvedValue(mockAccessToken);
            mockOAuthModel.getClient.mockResolvedValue({
                clientUuid: 'client-uuid-123',
                clientId: DEFAULT_OAUTH_CLIENT_ID,
                clientSecret: 'cli-secret',
                clientName: 'Lightdash CLI',
                redirectUris: ['http://localhost:3000/callback'],
                grants: ['authorization_code', 'refresh_token'],
                scopes: ['read', 'write'],
                createdAt: new Date(),
                createdByUserUuid: null,
                expiresAt: null,
            });

            const result = await oauthService.getAccessTokenForController(
                'access_token_123',
            );

            expect(result?.scopes).toEqual([]);
        });
    });

    describe('getRefreshTokenForController', () => {
        it('should return refresh token information', async () => {
            const mockRefreshToken = {
                refreshTokenUuid: 'refresh-uuid-123',
                refreshToken: 'refresh_token_123',
                expiresAt: new Date(Date.now() + 86400000),
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                lastUsedAt: null,
                revokedAt: null,
                accessTokenUuid: 'access-uuid-123',
            };

            mockOAuthModel.getRefreshToken.mockResolvedValue(mockRefreshToken);
            mockOAuthModel.getClient.mockResolvedValue({
                clientUuid: 'client-uuid-123',
                clientId: DEFAULT_OAUTH_CLIENT_ID,
                clientSecret: 'cli-secret',
                clientName: 'Lightdash CLI',
                redirectUris: ['http://localhost:3000/callback'],
                grants: ['authorization_code', 'refresh_token'],
                scopes: ['read', 'write'],
                createdAt: new Date(),
                createdByUserUuid: null,
                expiresAt: null,
            });

            const result = await oauthService.getRefreshTokenForController(
                'refresh_token_123',
            );

            expect(result).toEqual({
                refreshToken: 'refresh_token_123',
                expiresAt: mockRefreshToken.expiresAt,
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
            });
            expect(
                mockOAuthModel.updateRefreshTokenLastUsed,
            ).toHaveBeenCalledWith('refresh-uuid-123');
        });

        it('should return null for non-existent token', async () => {
            mockOAuthModel.getRefreshToken.mockResolvedValue(null);

            const result = await oauthService.getRefreshTokenForController(
                'non_existent_token',
            );

            expect(result).toBeNull();
        });
    });

    describe('revokeAccessTokenForController', () => {
        it('should revoke access token', async () => {
            const mockAccessToken = {
                accessTokenUuid: 'access-uuid-123',
                accessToken: 'access_token_123',
                expiresAt: new Date(Date.now() + 3600000),
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                lastUsedAt: null,
                revokedAt: null,
                authorizationCodeUuid: null,
            };

            mockOAuthModel.getAccessToken.mockResolvedValue(mockAccessToken);

            await oauthService.revokeAccessTokenForController(
                'access_token_123',
            );

            expect(mockOAuthModel.revokeAccessToken).toHaveBeenCalledWith(
                'access-uuid-123',
            );
        });

        it('should handle non-existent token gracefully', async () => {
            mockOAuthModel.getAccessToken.mockResolvedValue(null);

            await expect(
                oauthService.revokeAccessTokenForController(
                    'non_existent_token',
                ),
            ).resolves.toBeUndefined();
        });
    });

    describe('revokeRefreshTokenForController', () => {
        it('should revoke refresh token', async () => {
            const mockRefreshToken = {
                refreshTokenUuid: 'refresh-uuid-123',
                refreshToken: 'refresh_token_123',
                expiresAt: new Date(Date.now() + 86400000),
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                lastUsedAt: null,
                revokedAt: null,
                accessTokenUuid: 'access-uuid-123',
            };

            mockOAuthModel.getRefreshToken.mockResolvedValue(mockRefreshToken);

            await oauthService.revokeRefreshTokenForController(
                'refresh_token_123',
            );

            expect(mockOAuthModel.revokeRefreshToken).toHaveBeenCalledWith(
                'refresh-uuid-123',
            );
        });

        it('should handle non-existent token gracefully', async () => {
            mockOAuthModel.getRefreshToken.mockResolvedValue(null);

            await expect(
                oauthService.revokeRefreshTokenForController(
                    'non_existent_token',
                ),
            ).resolves.toBeUndefined();
        });
    });

    describe('revokeAuthorizationCodeForController', () => {
        it('should revoke authorization code', async () => {
            const mockAuthCode = {
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(Date.now() + 3600000),
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: null,
                codeChallengeMethod: null,
            };

            mockOAuthModel.getAuthorizationCode.mockResolvedValue(mockAuthCode);

            await oauthService.revokeAuthorizationCodeForController(
                'auth_code_123',
            );

            expect(mockOAuthModel.revokeAuthorizationCode).toHaveBeenCalledWith(
                'code-uuid-123',
            );
        });

        it('should handle non-existent code gracefully', async () => {
            mockOAuthModel.getAuthorizationCode.mockResolvedValue(null);

            await expect(
                oauthService.revokeAuthorizationCodeForController(
                    'non_existent_code',
                ),
            ).resolves.toBeUndefined();
        });
    });

    describe('createClient', () => {
        it('should throw NotImplementedError', async () => {
            await expect(
                oauthService.createClient({
                    clientSecret: 'secret',
                    clientName: 'Test Client',
                    redirectUris: ['http://localhost/callback'],
                    grants: ['authorization_code'],
                    scopes: ['read'],
                    userUuid: 'user-123',
                    organizationUuid: 'org-456',
                }),
            ).rejects.toThrow('Not implemented');
        });
    });
});
