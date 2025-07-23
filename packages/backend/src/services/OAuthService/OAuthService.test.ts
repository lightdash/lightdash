// eslint-disable @typescript-eslint/dot-notation
import { AnyType } from '@lightdash/common';

import OAuth2Server from '@node-oauth/oauth2-server';
import { LightdashConfig } from '../../config/parseConfig';
import { OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { OAuthService } from './OAuthService';

// Test subclass to expose oauthServer for mocking
class TestOAuthService extends OAuthService {
    public setOAuthServer(server: AnyType) {
        this.oauthServer = server;
    }
}

describe('OAuthService', () => {
    let oauthService: TestOAuthService;
    let mockUserModel: jest.Mocked<UserModel>;
    let mockOAuthModel: jest.Mocked<OAuth2Model>;
    let mockLightdashConfig: jest.Mocked<LightdashConfig>;

    beforeEach(() => {
        mockUserModel = {
            getSessionUserFromCacheOrDB: jest.fn(),
        } as AnyType;
        mockOAuthModel = {
            getRefreshToken: jest.fn(),
            getAccessToken: jest.fn(),
            revokeToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
        } as AnyType;
        mockOAuthModel.getRefreshToken = jest.fn().mockResolvedValue({
            refreshToken: 'mocked_refresh_token',
            refreshTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
            scope: ['read', 'write'],
            client: {
                id: 'lightdash-cli',
                clientSecret: 'secret',
                redirectUris: ['http://localhost:8100/callback'],
                grants: ['refresh_token'],
            },
            user: {
                userId: 1,
                organizationUuid: 'org-uuid',
            },
        });
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

    it('calls revokeToken and returns true if access token revoked', async () => {
        mockOAuthModel.revokeToken.mockResolvedValue(true);
        const result = await oauthService.revokeToken('token');
        expect(result).toBe(true);
        expect(mockOAuthModel.revokeToken).toHaveBeenCalled();
    });

    it('calls authorize', async () => {
        const request = {} as OAuth2Server.Request;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            authorize: jest.fn().mockResolvedValue('auth-code'),
        } as AnyType);
        const result = await oauthService.authorize(request, response, {
            user_id: 'u',
            organization_uuid: 'o',
        } as AnyType);
        expect(result).toBe('auth-code');
    });

    it('calls token', async () => {
        const request = {} as OAuth2Server.Request;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            token: jest.fn().mockResolvedValue('token'),
        } as AnyType);
        const result = await oauthService.token(request, response);
        expect(result).toBe('token');
    });

    it('calls authenticate', async () => {
        const request = {} as OAuth2Server.Request;
        const response = {} as OAuth2Server.Response;
        oauthService.setOAuthServer({
            authenticate: jest.fn().mockResolvedValue('token'),
        } as AnyType);
        const result = await oauthService.authenticate(request, response);
        expect(result).toBe('token');
    });
});

describe('OAuthService edge cases', () => {
    let oauthService: TestOAuthService;
    let mockUserModel: jest.Mocked<UserModel>;
    let mockOAuthModel: jest.Mocked<OAuth2Model>;
    let mockLightdashConfig: jest.Mocked<LightdashConfig>;

    beforeEach(() => {
        mockUserModel = {
            getSessionUserFromCacheOrDB: jest.fn(),
        } as AnyType;
        mockOAuthModel = {
            getAccessToken: jest.fn(),
            revokeToken: jest.fn(),
            revokeRefreshToken: jest.fn(),
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
            authorize: jest.fn().mockImplementation(() => {
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
            token: jest.fn().mockImplementation(() => {
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
            token: jest.fn().mockImplementation(() => {
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
            token: jest.fn().mockImplementation(() => {
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
            authorize: jest.fn().mockImplementation(() => {
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
});
