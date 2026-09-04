import {
    ForbiddenError,
    ManagedSignInError,
    OpenIdIdentityIssuerType,
    OrganizationSsoProvider,
    type SessionUser,
} from '@lightdash/common';
import {
    createLocalJWKSet,
    exportJWK,
    generateKeyPair,
    SignJWT,
    type JWK,
    type JWTVerifyGetKey,
    type KeyLike,
} from 'jose';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import type { ManagedSignInModel } from '../../../models/ManagedSignInModel';
import type { OrganizationSsoModel } from '../../../models/OrganizationSsoModel';
import type { UserService } from '../../UserService';
import { ManagedSignInRejection } from './ManagedSignInRejection';
import { ManagedSignInService } from './ManagedSignInService';
import { MicrosoftTokenVerifier } from './microsoftTokenVerifier';

const TENANT_ID = '11111111-2222-3333-4444-555555555555';
const OTHER_TENANT_ID = '99999999-8888-7777-6666-555555555555';
const IOS_CLIENT_ID = 'ios-registration';
const ANDROID_CLIENT_ID = 'android-registration';
const ORGANIZATION_UUID = 'org-uuid-1';
const MOBILE_CLIENT_ID = 'lightdash-mobile';

const sessionUser = {
    userId: 42,
    userUuid: 'user-uuid-1',
    organizationUuid: ORGANIZATION_UUID,
    email: 'person@example.com',
} as SessionUser;

let privateKey: KeyLike;
let publicJwk: JWK;
let otherPrivateKey: KeyLike;

beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    publicJwk = { ...(await exportJWK(pair.publicKey)), alg: 'RS256' };
    otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
});

type TokenOverrides = {
    tid?: string;
    iss?: string;
    aud?: string;
    oid?: string;
    email?: string | undefined;
    exp?: number;
    nbf?: number;
    iat?: number;
    signWith?: 'tenant' | 'other';
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

const signToken = async (overrides: TokenOverrides = {}): Promise<string> => {
    const tid = overrides.tid ?? TENANT_ID;
    const issuedAt = overrides.iat ?? nowSeconds();
    const claims: Record<string, unknown> = {
        tid,
        oid: overrides.oid ?? 'entra-object-id',
        name: 'A Person',
    };
    if (!('email' in overrides) || overrides.email !== undefined) {
        claims.email = overrides.email ?? 'person@example.com';
    }
    let builder = new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(
            overrides.iss ?? `https://login.microsoftonline.com/${tid}/v2.0`,
        )
        .setAudience(overrides.aud ?? IOS_CLIENT_ID)
        .setIssuedAt(issuedAt)
        .setExpirationTime(overrides.exp ?? issuedAt + 3600);
    if (overrides.nbf !== undefined) {
        builder = builder.setNotBefore(overrides.nbf);
    }
    return builder.sign(
        overrides.signWith === 'other' ? otherPrivateKey : privateKey,
    );
};

const configWith = (
    overrides: Partial<LightdashConfig['auth']> = {},
): LightdashConfig => ({
    ...lightdashConfigMock,
    auth: {
        ...lightdashConfigMock.auth,
        microsoftManagedSignIn: {
            iosClientId: IOS_CLIENT_ID,
            androidClientId: ANDROID_CLIENT_ID,
        },
        ...overrides,
    },
});

const dedicatedConfig = (tenantId = TENANT_ID) =>
    configWith({
        azuread: {
            ...lightdashConfigMock.auth.azuread,
            oauth2TenantId: tenantId,
        },
    });

const azureMethod = (
    tenantId: string,
    organizationUuid = ORGANIZATION_UUID,
) => ({
    organizationUuid,
    config: {
        oauth2ClientId: 'web-registration',
        oauth2ClientSecret: 'secret',
        oauth2TenantId: tenantId,
    },
});

const createService = (
    lightdashConfig: LightdashConfig,
    {
        azureMethods = [],
        claimTokenUse = vi.fn(async () => true),
        loginWithOpenId = vi.fn(async () => sessionUser),
        fetchOpenIdConfiguration,
    }: {
        azureMethods?: ReturnType<typeof azureMethod>[];
        claimTokenUse?: ManagedSignInModel['claimTokenUse'];
        loginWithOpenId?: UserService['loginWithOpenId'];
        fetchOpenIdConfiguration?: (tenantId: string) => Promise<unknown>;
    } = {},
) => {
    const organizationSsoModel = {
        findEnabledAzureAdMethodsByTenantId: vi.fn(async () => azureMethods),
    } as unknown as OrganizationSsoModel;
    const managedSignInModel = {
        claimTokenUse,
    } as unknown as ManagedSignInModel;
    const userService = { loginWithOpenId } as unknown as UserService;
    const keySet: JWTVerifyGetKey = createLocalJWKSet({ keys: [publicJwk] });

    const service = new ManagedSignInService({
        lightdashConfig,
        organizationSsoModel,
        managedSignInModel,
        getUserService: () => userService,
        verifier: new MicrosoftTokenVerifier({
            fetchOpenIdConfiguration:
                fetchOpenIdConfiguration ??
                (async (tenantId: string) => ({
                    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
                    jwks_uri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
                })),
            createKeySet: () => keySet,
        }),
    });

    return {
        service,
        organizationSsoModel,
        claimTokenUse,
        loginWithOpenId,
    };
};

const exchange = (
    service: ManagedSignInService,
    subjectToken: string,
): Promise<SessionUser> =>
    service.exchangeIdToken({ subjectToken, clientId: MOBILE_CLIENT_ID });

const expectRejection = async (
    promise: Promise<unknown>,
    code: ManagedSignInError,
) => {
    await expect(promise).rejects.toBeInstanceOf(ManagedSignInRejection);
    await promise.catch((error: ManagedSignInRejection) => {
        expect(error.code).toEqual(code);
    });
};

describe('ManagedSignInService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    });

    describe('happy path', () => {
        it('signs the user in through the browser sign-in rules', async () => {
            const { service, loginWithOpenId } =
                createService(dedicatedConfig());

            await expect(exchange(service, await signToken())).resolves.toEqual(
                sessionUser,
            );

            expect(vi.mocked(loginWithOpenId)).toHaveBeenCalledWith(
                {
                    openId: {
                        issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
                        issuerType: OpenIdIdentityIssuerType.AZUREAD,
                        subject: 'entra-object-id',
                        email: 'person@example.com',
                        firstName: 'A',
                        lastName: 'Person',
                    },
                },
                undefined,
                undefined,
                undefined,
                { ip: undefined, userAgent: undefined },
            );
        });

        it('accepts the android registration audience', async () => {
            const { service } = createService(dedicatedConfig());

            await expect(
                exchange(service, await signToken({ aud: ANDROID_CLIENT_ID })),
            ).resolves.toEqual(sessionUser);
        });

        it('records the token as used with its own expiry', async () => {
            const claimTokenUse = vi.fn(async () => true);
            const { service } = createService(dedicatedConfig(), {
                claimTokenUse,
            });
            const expiry = nowSeconds() + 600;

            await exchange(service, await signToken({ exp: expiry }));

            expect(claimTokenUse).toHaveBeenCalledWith(
                expect.stringMatching(/^[0-9a-f]{64}$/),
                new Date(expiry * 1000),
            );
        });
    });

    describe('token validation', () => {
        it('rejects a token signed by another key', async () => {
            const { service } = createService(dedicatedConfig());

            await expectRejection(
                exchange(service, await signToken({ signWith: 'other' })),
                ManagedSignInError.TOKEN_INVALID,
            );
        });

        it('rejects an audience that is not a mobile registration', async () => {
            const { service } = createService(dedicatedConfig());

            await expectRejection(
                exchange(service, await signToken({ aud: 'web-registration' })),
                ManagedSignInError.TOKEN_INVALID,
            );
        });

        it('rejects every audience when no mobile registration is configured', async () => {
            const { service } = createService(
                configWith({
                    azuread: {
                        ...lightdashConfigMock.auth.azuread,
                        oauth2TenantId: TENANT_ID,
                    },
                    microsoftManagedSignIn: {
                        iosClientId: undefined,
                        androidClientId: undefined,
                    },
                }),
            );

            await expectRejection(
                exchange(service, await signToken()),
                ManagedSignInError.TOKEN_INVALID,
            );
        });

        it('rejects an issuer that does not match the tenant', async () => {
            const { service } = createService(dedicatedConfig());

            await expectRejection(
                exchange(
                    service,
                    await signToken({
                        iss: `https://login.microsoftonline.com/${OTHER_TENANT_ID}/v2.0`,
                    }),
                ),
                ManagedSignInError.TOKEN_INVALID,
            );
        });

        it('rejects a malformed tenant id without fetching discovery', async () => {
            const fetchOpenIdConfiguration = vi.fn(async () => ({}));
            const { service } = createService(dedicatedConfig(), {
                fetchOpenIdConfiguration,
            });

            await expectRejection(
                exchange(service, await signToken({ tid: '../../evil' })),
                ManagedSignInError.TOKEN_INVALID,
            );
            expect(fetchOpenIdConfiguration).not.toHaveBeenCalled();
        });

        it('rejects a discovery document that describes another issuer', async () => {
            const { service } = createService(dedicatedConfig(), {
                fetchOpenIdConfiguration: async () => ({
                    issuer: `https://login.microsoftonline.com/${OTHER_TENANT_ID}/v2.0`,
                    jwks_uri: 'https://login.microsoftonline.com/keys',
                }),
            });

            await expectRejection(
                exchange(service, await signToken()),
                ManagedSignInError.TOKEN_INVALID,
            );
        });

        it('rejects an expired token', async () => {
            const { service } = createService(dedicatedConfig());
            const issuedAt = nowSeconds() - 120;

            await expectRejection(
                exchange(
                    service,
                    await signToken({ iat: issuedAt, exp: issuedAt + 60 }),
                ),
                ManagedSignInError.TOKEN_EXPIRED,
            );
        });

        it('rejects a token issued more than five minutes ago', async () => {
            const { service } = createService(dedicatedConfig());
            const issuedAt = nowSeconds() - 400;

            await expectRejection(
                exchange(
                    service,
                    await signToken({ iat: issuedAt, exp: issuedAt + 3600 }),
                ),
                ManagedSignInError.TOKEN_EXPIRED,
            );
        });

        it('rejects a token that is not yet valid', async () => {
            const { service } = createService(dedicatedConfig());

            await expectRejection(
                exchange(service, await signToken({ nbf: nowSeconds() + 600 })),
                ManagedSignInError.TOKEN_INVALID,
            );
        });

        it('rejects a token without an email claim', async () => {
            const { service } = createService(dedicatedConfig());

            await expectRejection(
                exchange(service, await signToken({ email: undefined })),
                ManagedSignInError.EMAIL_UNVERIFIED,
            );
        });
    });

    describe('organization resolution', () => {
        it('rejects a tenant that is not the configured one', async () => {
            const { service } = createService(dedicatedConfig());

            await expectRejection(
                exchange(
                    service,
                    await signToken({
                        tid: OTHER_TENANT_ID,
                    }),
                ),
                ManagedSignInError.TENANT_NOT_CONFIGURED,
            );
        });

        it('resolves the single organization that claims the tenant', async () => {
            const { service, organizationSsoModel } = createService(
                configWith(),
                { azureMethods: [azureMethod(TENANT_ID)] },
            );

            await expect(exchange(service, await signToken())).resolves.toEqual(
                sessionUser,
            );
            expect(
                organizationSsoModel.findEnabledAzureAdMethodsByTenantId,
            ).toHaveBeenCalledWith(TENANT_ID);
        });

        it('rejects a tenant no organization claims', async () => {
            const { service } = createService(configWith(), {
                azureMethods: [],
            });

            await expectRejection(
                exchange(service, await signToken()),
                ManagedSignInError.TENANT_NOT_CONFIGURED,
            );
        });

        it('rejects a tenant two organizations claim', async () => {
            const { service } = createService(configWith(), {
                azureMethods: [
                    azureMethod(TENANT_ID, 'org-uuid-1'),
                    azureMethod(TENANT_ID, 'org-uuid-2'),
                ],
            });

            await expectRejection(
                exchange(service, await signToken()),
                ManagedSignInError.TENANT_NOT_CONFIGURED,
            );
        });

        it('rejects a user who lands outside the tenant organization', async () => {
            const { service } = createService(configWith(), {
                azureMethods: [azureMethod(TENANT_ID, 'org-uuid-other')],
            });

            await expectRejection(
                exchange(service, await signToken()),
                ManagedSignInError.USER_NOT_ALLOWED,
            );
        });
    });

    describe('single use', () => {
        it('rejects a token whose hash is already recorded', async () => {
            const { service } = createService(dedicatedConfig(), {
                claimTokenUse: vi.fn(async () => false),
            });

            await expectRejection(
                exchange(service, await signToken()),
                ManagedSignInError.TOKEN_REPLAYED,
            );
        });

        it('rejects the second exchange of the same token', async () => {
            const used = new Set<string>();
            const { service } = createService(dedicatedConfig(), {
                claimTokenUse: vi.fn(async (hash: string) => {
                    if (used.has(hash)) return false;
                    used.add(hash);
                    return true;
                }),
            });
            const token = await signToken();

            await expect(exchange(service, token)).resolves.toEqual(
                sessionUser,
            );
            await expectRejection(
                exchange(service, token),
                ManagedSignInError.TOKEN_REPLAYED,
            );
        });
    });

    describe('user rules', () => {
        it('reports a refused login as user_not_allowed', async () => {
            const { service } = createService(dedicatedConfig(), {
                loginWithOpenId: vi.fn(async () => {
                    throw new ForbiddenError('not invited');
                }) as unknown as UserService['loginWithOpenId'],
            });

            await expectRejection(
                exchange(service, await signToken()),
                ManagedSignInError.USER_NOT_ALLOWED,
            );
        });
    });

    describe('logging', () => {
        it('logs the rejection context and never the token', async () => {
            const warn = vi
                .spyOn(Logger, 'warn')
                .mockImplementation(() => Logger);
            const { service } = createService(dedicatedConfig());
            const token = await signToken({ tid: OTHER_TENANT_ID });

            await exchange(service, token).catch(() => undefined);

            expect(warn).toHaveBeenCalledWith(
                'Managed sign-in exchange rejected',
                expect.objectContaining({
                    reason: ManagedSignInError.TENANT_NOT_CONFIGURED,
                    tid: OTHER_TENANT_ID,
                    aud: IOS_CLIENT_ID,
                    clientId: MOBILE_CLIENT_ID,
                }),
            );
            expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
        });
    });
});
