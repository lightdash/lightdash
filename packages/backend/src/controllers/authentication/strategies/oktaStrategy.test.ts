import { OrganizationSsoProvider } from '@lightdash/common';
import { Request } from 'express';

// oktaStrategy reads the lightdashConfig singleton; mock it with a mutable
// `okta` block so each test can toggle the instance-level env config.
const mockOktaEnv = vi.hoisted(
    (): {
        oauth2Issuer: string | undefined;
        oktaDomain: string | undefined;
        oauth2ClientId: string | undefined;
        oauth2ClientSecret: string | undefined;
        authorizationServerId: string | undefined;
        extraScopes: string | undefined;
        callbackPath: string;
        loginPath: string;
    } => ({
        oauth2Issuer: undefined,
        oktaDomain: undefined,
        oauth2ClientId: undefined,
        oauth2ClientSecret: undefined,
        authorizationServerId: undefined,
        extraScopes: undefined,
        callbackPath: '/oauth/redirect/okta',
        loginPath: '/login/okta',
    }),
);

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } = await vi.importActual<
        typeof import('../../../config/lightdashConfig.mock')
    >('../../../config/lightdashConfig.mock');
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

const makeReq = ({
    loginHint,
    issuer,
    findEnabledMethodForEmail = vi.fn(),
    findEnabledOktaMethodForIssuer = vi.fn(),
}: {
    loginHint?: string;
    issuer?: string;
    findEnabledMethodForEmail?: import('vitest').Mock;
    findEnabledOktaMethodForIssuer?: import('vitest').Mock;
}): Request =>
    ({
        query: {
            ...(loginHint ? { login_hint: loginHint } : {}),
            ...(issuer ? { iss: issuer } : {}),
        },
        services: {
            getOrganizationSsoService: () => ({
                findEnabledMethodForEmail,
                findEnabledOktaMethodForIssuer,
            }),
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
        const findEnabledMethodForEmail = vi.fn().mockResolvedValue(undefined);
        const req = makeReq({
            loginHint: 'user@env-customer.com',
            findEnabledMethodForEmail,
        });

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
        const findEnabledMethodForEmail = vi.fn();
        const req = makeReq({ findEnabledMethodForEmail });

        const resolved = await resolveOktaConfig(req);
        expect(resolved?.organizationUuid).toBeNull();
        expect(resolved?.config.oauth2ClientId).toBe('env-client');
        // No email hint → no per-org lookup attempted.
        expect(findEnabledMethodForEmail).not.toHaveBeenCalled();
    });

    test('per-org match takes precedence over env config', async () => {
        setEnv(FULL_ENV);
        const findEnabledMethodForEmail = vi
            .fn()
            .mockResolvedValue(perOrgMethod);
        const findEnabledOktaMethodForIssuer = vi.fn();
        const req = makeReq({
            loginHint: 'user@acme.com',
            issuer: 'https://env.okta.com',
            findEnabledMethodForEmail,
            findEnabledOktaMethodForIssuer,
        });

        const resolved = await resolveOktaConfig(req);
        expect(findEnabledMethodForEmail).toHaveBeenCalledWith(
            'user@acme.com',
            OrganizationSsoProvider.OKTA,
        );
        expect(resolved).toEqual({
            config: perOrgMethod.config,
            organizationUuid: 'org-1',
        });
        expect(findEnabledOktaMethodForIssuer).not.toHaveBeenCalled();
    });

    test('per-org issuer match supports Okta dashboard launch', async () => {
        setEnv({});
        const findEnabledMethodForEmail = vi.fn();
        const findEnabledOktaMethodForIssuer = vi
            .fn()
            .mockResolvedValue(perOrgMethod);
        const req = makeReq({
            issuer: 'https://acme.okta.com',
            findEnabledMethodForEmail,
            findEnabledOktaMethodForIssuer,
        });

        const resolved = await resolveOktaConfig(req);

        expect(findEnabledMethodForEmail).not.toHaveBeenCalled();
        expect(findEnabledOktaMethodForIssuer).toHaveBeenCalledWith(
            'https://acme.okta.com',
        );
        expect(resolved).toEqual({
            config: perOrgMethod.config,
            organizationUuid: 'org-1',
        });
    });

    test('issuer miss falls back to env config', async () => {
        setEnv(FULL_ENV);
        const findEnabledOktaMethodForIssuer = vi
            .fn()
            .mockResolvedValue(undefined);
        const req = makeReq({
            issuer: 'https://unknown.okta.com',
            findEnabledOktaMethodForIssuer,
        });

        const resolved = await resolveOktaConfig(req);

        expect(findEnabledOktaMethodForIssuer).toHaveBeenCalledWith(
            'https://unknown.okta.com',
        );
        expect(resolved?.organizationUuid).toBeNull();
        expect(resolved?.config.oauth2ClientId).toBe('env-client');
    });

    test('no per-org match and no env config → undefined', async () => {
        setEnv({}); // env unset
        const findEnabledMethodForEmail = vi.fn().mockResolvedValue(undefined);
        const req = makeReq({
            loginHint: 'user@nowhere.com',
            findEnabledMethodForEmail,
        });

        expect(await resolveOktaConfig(req)).toBeUndefined();
    });
});
