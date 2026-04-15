/// <reference path="../../../@types/express-session.d.ts" />
import { Request } from 'express';
import { OpenIDClientOktaStrategy } from './oktaStrategy';

jest.mock('../../../logging/logger', () => ({
    default: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

jest.mock('@sentry/node', () => ({
    captureException: jest.fn(),
}));

jest.mock('../../../config/lightdashConfig', () => ({
    lightdashConfig: {
        auth: {
            okta: {
                callbackPath: '/oauth/redirect/okta',
                oauth2ClientId: 'test-client-id',
                oauth2ClientSecret: 'test-client-secret',
                authorizationServerId: undefined,
                oktaDomain: 'test.okta.com',
                extraScopes: undefined,
            },
        },
        siteUrl: 'https://example.com',
    },
}));

jest.mock('openid-client', () => ({
    Issuer: {
        discover: jest.fn(),
    },
    generators: {
        state: jest.fn(() => 'mock-state'),
        codeVerifier: jest.fn(() => 'mock-code-verifier'),
        codeChallenge: jest.fn(() => 'mock-code-challenge'),
    },
}));

describe('OpenIDClientOktaStrategy', () => {
    let strategy: OpenIDClientOktaStrategy;
    let mockCallbackFn: jest.Mock;
    let mockCallbackParamsFn: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCallbackFn = jest.fn();
        mockCallbackParamsFn = jest.fn(() => ({
            // Simulate Okta returning a state parameter in the redirect URL
            state: 'okta-state-from-redirect',
        }));

        const mockClientInstance = {
            callbackParams: mockCallbackParamsFn,
            callback: mockCallbackFn,
            authorizationUrl: jest.fn(),
            userinfo: jest.fn(),
        };

        const MockClientConstructor = jest.fn(() => mockClientInstance);
        const mockIssuer = { Client: MockClientConstructor };

        const { Issuer } = jest.requireMock('openid-client') as {
            Issuer: { discover: jest.Mock };
        };
        Issuer.discover.mockResolvedValue(mockIssuer);

        strategy = new OpenIDClientOktaStrategy();
        // Set up passport-strategy callback methods (normally set by Passport internals)
        strategy.fail = jest.fn();
        strategy.error = jest.fn();
        strategy.success = jest.fn();
    });

    describe('authenticate — missing session OAuth state', () => {
        it('should gracefully fail with 401 when session oauth state is missing', async () => {
            // Simulate the TypeError that openid-client throws when Okta sends state
            // in the redirect URL but checks.state is undefined (missing from session)
            mockCallbackFn.mockRejectedValue(
                new TypeError('checks.state argument is missing'),
            );

            const mockReq = {
                query: {},
                session: { oauth: { codeVerifier: 'some-verifier' } }, // state is absent
            } as unknown as Request;

            await strategy.authenticate(mockReq);

            // Should redirect the user gracefully, not throw a 500
            expect(strategy.fail).toHaveBeenCalledWith(
                {
                    message:
                        'Your login session has expired. Please try logging in again.',
                },
                401,
            );
            expect(strategy.error).not.toHaveBeenCalled();
        });

        it('should gracefully fail with 401 when session oauth is undefined', async () => {
            // Simulate the TypeError that openid-client throws when Okta sends state
            // in the redirect URL but checks.state is undefined (session lost entirely)
            mockCallbackFn.mockRejectedValue(
                new TypeError('checks.state argument is missing'),
            );

            const mockReq = {
                query: {},
                session: {}, // oauth property is absent entirely
            } as unknown as Request;

            await strategy.authenticate(mockReq);

            expect(strategy.fail).toHaveBeenCalledWith(
                {
                    message:
                        'Your login session has expired. Please try logging in again.',
                },
                401,
            );
            expect(strategy.error).not.toHaveBeenCalled();
        });
    });
});
