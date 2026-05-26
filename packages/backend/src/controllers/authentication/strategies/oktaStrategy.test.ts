import { OrganizationSsoProvider } from '@lightdash/common';
import { Request } from 'express';

// oktaStrategy reads the lightdashConfig singleton; mock it with a mutable
// `okta` block so each test can toggle the instance-level env config.
const mockOktaEnv: {
    oauth2Issuer: string | undefined;
    oktaDomain: string | undefined;
    oauth2ClientId: string | undefined;
    oauth2ClientSecret: string | undefined;
    authorizationServerId: string | undefined;
    extraScopes: string | undefined;
    callbackPath: string;
    loginPath: string;
} = {
    oauth2Issuer: undefined,
    oktaDomain: undefined,
    oauth2ClientId: undefined,
    oauth2ClientSecret: undefined,
    authorizationServerId: undefined,
    extraScopes: undefined,
    callbackPath: '/oauth/redirect/okta',
    loginPath: '/login/okta',
};

jest.mock('../../../config/lightdashConfig', () => {
    const { lightdashConfigMock } = jest.requireActual(
        '../../../config/lightdashConfig.mock',
    );
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'https://test.lightdash.cloud',
            auth: { ...lightdashConfigMock.auth, okta: mockOktaEnv },
        },
    };
});

// eslint-disable-next-line import/first
import { getOktaConfigFromEnv, resolveOktaConfig } from './oktaStrategy';

const FULL_ENV = {
    oauth2Issuer: 'https://env.okta.com',
    oktaDomain: 'env.okta.com',
    oauth2ClientId: 'env-client',
    oauth2ClientSecret: 'env-secret',
    authorizationServerId: undefined,
    extraScopes: undefined,
};

const setEnv = (partial: Partial<typeof mockOktaEnv>) => {
    Object.assign(mockOktaEnv, {
        oauth2Issuer: undefined,
        oktaDomain: undefined,
        oauth2ClientId: undefined,
        oauth2ClientSecret: undefined,
        authorizationServerId: undefined,
        extraScopes: undefined,
        ...partial,
    });
};

const perOrgMethod = {
    organizationUuid: 'org-1',
    provider: OrganizationSsoProvider.OKTA,
    config: {
        oauth2Issuer: 'https://acme.okta.com',
        oktaDomain: 'acme.okta.com',
        oauth2ClientId: 'acme-client',
        oauth2ClientSecret: 'acme-secret',
        authorizationServerId: 'default',
        extraScopes: null,
    },
    enabled: true,
    overrideEmailDomains: false,
    emailDomains: [],
    allowPassword: true,
};

const makeReq = (
    loginHint: string | undefined,
    findEnabledMethodForEmail: jest.Mock,
): Request =>
    ({
        query: loginHint ? { login_hint: loginHint } : {},
        services: {
            getOrganizationSsoService: () => ({ findEnabledMethodForEmail }),
        },
    }) as unknown as Request;

beforeEach(() => {
    setEnv({});
});

describe('getOktaConfigFromEnv', () => {
    test('returns undefined when env config is incomplete', () => {
        setEnv({ ...FULL_ENV, oauth2ClientSecret: undefined });
        expect(getOktaConfigFromEnv()).toBeUndefined();
    });

    test('returns the config when all required env vars are present', () => {
        setEnv(FULL_ENV);
        expect(getOktaConfigFromEnv()).toEqual({
            oauth2Issuer: 'https://env.okta.com',
            oktaDomain: 'env.okta.com',
            oauth2ClientId: 'env-client',
            oauth2ClientSecret: 'env-secret',
            authorizationServerId: null,
            extraScopes: null,
        });
    });
});

describe('resolveOktaConfig', () => {
    test('env-only customer (no per-org match) falls back to env config', async () => {
        setEnv(FULL_ENV);
        const findEnabledMethodForEmail = jest
            .fn()
            .mockResolvedValue(undefined);
        const req = makeReq('user@env-customer.com', findEnabledMethodForEmail);

        const resolved = await resolveOktaConfig(req);
        expect(resolved).toEqual({
            config: {
                oauth2Issuer: 'https://env.okta.com',
                oktaDomain: 'env.okta.com',
                oauth2ClientId: 'env-client',
                oauth2ClientSecret: 'env-secret',
                authorizationServerId: null,
                extraScopes: null,
            },
            organizationUuid: null,
        });
    });

    test('no login hint + env present → env config', async () => {
        setEnv(FULL_ENV);
        const findEnabledMethodForEmail = jest.fn();
        const req = makeReq(undefined, findEnabledMethodForEmail);

        const resolved = await resolveOktaConfig(req);
        expect(resolved?.organizationUuid).toBeNull();
        expect(resolved?.config.oauth2ClientId).toBe('env-client');
        // No email hint → no per-org lookup attempted.
        expect(findEnabledMethodForEmail).not.toHaveBeenCalled();
    });

    test('per-org match takes precedence over env config', async () => {
        setEnv(FULL_ENV);
        const findEnabledMethodForEmail = jest
            .fn()
            .mockResolvedValue(perOrgMethod);
        const req = makeReq('user@acme.com', findEnabledMethodForEmail);

        const resolved = await resolveOktaConfig(req);
        expect(findEnabledMethodForEmail).toHaveBeenCalledWith(
            'user@acme.com',
            OrganizationSsoProvider.OKTA,
        );
        expect(resolved).toEqual({
            config: perOrgMethod.config,
            organizationUuid: 'org-1',
        });
    });

    test('no per-org match and no env config → undefined', async () => {
        setEnv({}); // env unset
        const findEnabledMethodForEmail = jest
            .fn()
            .mockResolvedValue(undefined);
        const req = makeReq('user@nowhere.com', findEnabledMethodForEmail);

        expect(await resolveOktaConfig(req)).toBeUndefined();
    });
});
