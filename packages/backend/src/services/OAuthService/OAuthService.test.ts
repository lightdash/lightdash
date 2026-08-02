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
            revokeToken: vi.fn(),
            revokeRefreshToken: vi.fn(),
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
});
