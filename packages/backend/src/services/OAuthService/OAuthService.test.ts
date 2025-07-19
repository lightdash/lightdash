import { AnyType } from '@lightdash/common';
import crypto from 'crypto';
import { DEFAULT_OAUTH_CLIENT_ID, OAuthModel } from '../../models/OAuthModel';
import { UserModel } from '../../models/UserModel';
import { OAuthService } from './OAuthService';

// Mock dependencies
jest.mock('../../models/OAuthModel');
jest.mock('../../models/UserModel');
jest.mock('@node-oauth/oauth2-server');

describe('OAuthService', () => {
    let oauthService: OAuthService;
    let mockOAuthModel: jest.Mocked<OAuthModel>;
    let mockUserModel: jest.Mocked<UserModel>;

    beforeEach(() => {
        mockOAuthModel = {
            getClient: jest.fn(),
            saveAuthorizationCode: jest.fn(),
            getAuthorizationCode: jest.fn(),
            revokeAuthorizationCode: jest.fn(),
            saveAccessToken: jest.fn(),
            getAccessToken: jest.fn(),
            updateAccessTokenLastUsed: jest.fn(),
            revokeAccessToken: jest.fn(),
            saveRefreshToken: jest.fn(),
            getRefreshToken: jest.fn(),
            updateRefreshTokenLastUsed: jest.fn(),
            revokeRefreshToken: jest.fn(),
            cleanupExpiredTokens: jest.fn(),
        } as AnyType;

        mockUserModel = {
            getSessionUserFromCacheOrDB: jest.fn(),
        } as AnyType;

        oauthService = new OAuthService({
            userModel: mockUserModel,
            oauthModel: mockOAuthModel,
            lightdashConfig: {} as AnyType,
        });
    });

    describe('validateCodeChallenge', () => {
        it('should validate S256 code challenge', () => {
            const challenge = crypto.randomBytes(32).toString('base64url');
            expect(() =>
                oauthService.validateCodeChallenge(challenge, 'S256'),
            ).not.toThrow();
        });

        it('should validate plain code challenge', () => {
            const challenge = crypto.randomBytes(32).toString('base64url');
            expect(() =>
                oauthService.validateCodeChallenge(challenge, 'plain'),
            ).not.toThrow();
        });

        it('should not throw for undefined challenge', () => {
            expect(() =>
                oauthService.validateCodeChallenge(undefined, undefined),
            ).not.toThrow();
        });

        it('should throw for invalid challenge method', () => {
            const challenge = crypto.randomBytes(32).toString('base64url');
            expect(() =>
                oauthService.validateCodeChallenge(
                    challenge,
                    'invalid' as AnyType,
                ),
            ).toThrow();
        });

        it('should throw for short S256 challenge', () => {
            const challenge = 'short';
            expect(() =>
                oauthService.validateCodeChallenge(challenge, 'S256'),
            ).toThrow();
        });

        it('should throw for short plain challenge', () => {
            const challenge = 'short';
            expect(() =>
                oauthService.validateCodeChallenge(challenge, 'plain'),
            ).toThrow();
        });

        it('should throw when challenge method is missing for challenge', () => {
            const challenge = crypto.randomBytes(32).toString('base64url');
            expect(() =>
                oauthService.validateCodeChallenge(challenge, undefined),
            ).toThrow();
        });
    });

    describe('generateAuthorizationCode', () => {
        beforeEach(() => {
            mockOAuthModel.getClient.mockResolvedValue({
                clientUuid: 'client-uuid-123',
                id: DEFAULT_OAUTH_CLIENT_ID,
                clientId: DEFAULT_OAUTH_CLIENT_ID,
                clientName: 'Lightdash CLI',
                clientSecret: '',
                redirectUris: ['http://localhost:*'],
                grants: ['authorization_code', 'refresh_token'],
                scopes: ['read', 'write'],
            });
        });

        it('should generate authorization code with PKCE', async () => {
            mockOAuthModel.saveAuthorizationCode.mockResolvedValue({
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: 'test_challenge',
                codeChallengeMethod: 'S256',
            });

            const result = await oauthService.generateAuthorizationCode({
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                codeChallenge: 'test_challenge',
                codeChallengeMethod: 'S256',
            });

            expect(result).toMatch(/^[a-f0-9]{64}$/);
            expect(mockOAuthModel.saveAuthorizationCode).toHaveBeenCalledWith({
                authorization_code: expect.any(String),
                expires_at: expect.any(Date),
                redirect_uri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                user_uuid: 'user-123',
                organization_uuid: 'org-456',
                code_challenge: 'test_challenge',
                code_challenge_method: 'S256',
            });
        });

        it('should generate authorization code without PKCE', async () => {
            mockOAuthModel.saveAuthorizationCode.mockResolvedValue({
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: null,
                codeChallengeMethod: null,
            });

            const result = await oauthService.generateAuthorizationCode({
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
            });

            expect(result).toMatch(/^[a-f0-9]{64}$/);
            expect(mockOAuthModel.saveAuthorizationCode).toHaveBeenCalledWith({
                authorization_code: expect.any(String),
                expires_at: expect.any(Date),
                redirect_uri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                user_uuid: 'user-123',
                organization_uuid: 'org-456',
                code_challenge: null,
                code_challenge_method: null,
            });
        });

        it('should generate authorization code with default scopes', async () => {
            mockOAuthModel.saveAuthorizationCode.mockResolvedValue({
                authorizationCodeUuid: 'code-uuid-123',
                authorizationCode: 'auth_code_123',
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                redirectUri: 'http://localhost/callback',
                scopes: ['read', 'write'],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
                createdAt: new Date(),
                usedAt: null,
                codeChallenge: null,
                codeChallengeMethod: null,
            });

            await oauthService.generateAuthorizationCode({
                redirectUri: 'http://localhost/callback',
                scopes: [],
                userUuid: 'user-123',
                organizationUuid: 'org-456',
            });

            expect(mockOAuthModel.saveAuthorizationCode).toHaveBeenCalledWith({
                authorization_code: expect.any(String),
                expires_at: expect.any(Date),
                redirect_uri: 'http://localhost/callback',
                scopes: [],
                user_uuid: 'user-123',
                organization_uuid: 'org-456',
                code_challenge: null,
                code_challenge_method: null,
            });
        });
    });

    describe('validateCodeVerifier', () => {
        it('should validate S256 code verifier', async () => {
            const codeVerifier = crypto.randomBytes(32).toString('base64url');
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

        it('should validate plain code verifier', async () => {
            const codeVerifier = crypto.randomBytes(32).toString('base64url');

            const result = await oauthService.validateCodeVerifier(
                codeVerifier,
                codeVerifier,
                'plain',
            );

            expect(result).toBe(true);
        });

        it('should reject invalid S256 code verifier', async () => {
            const codeVerifier = crypto.randomBytes(32).toString('base64url');
            const codeChallenge = 'invalid_challenge';

            const result = await oauthService.validateCodeVerifier(
                codeVerifier,
                codeChallenge,
                'S256',
            );

            expect(result).toBe(false);
        });

        it('should reject invalid plain code verifier', async () => {
            const codeVerifier = crypto.randomBytes(32).toString('base64url');
            const codeChallenge = 'different_challenge';

            const result = await oauthService.validateCodeVerifier(
                codeVerifier,
                codeChallenge,
                'plain',
            );

            expect(result).toBe(false);
        });

        it('should reject unknown challenge method', async () => {
            const codeVerifier = crypto.randomBytes(32).toString('base64url');
            const codeChallenge = crypto.randomBytes(32).toString('base64url');

            const result = await oauthService.validateCodeVerifier(
                codeVerifier,
                codeChallenge,
                'unknown' as AnyType,
            );

            expect(result).toBe(false);
        });
    });

    describe('getOAuthServer', () => {
        it('should return OAuth server instance', () => {
            const server = oauthService.getOAuthServer();
            expect(server).toBeDefined();
        });
    });
});
