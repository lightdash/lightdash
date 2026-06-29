import {
    defineUserAbility,
    EmailStatus,
    NotFoundError,
    OpenIdIdentityIssuerType,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../analytics/LightdashAnalytics.mock';
import EmailClient from '../clients/EmailClient/EmailClient';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { LightdashConfig } from '../config/parseConfig';
import * as winston from '../logging/winston';
import { PersonalAccessTokenModel } from '../models/DashboardModel/PersonalAccessTokenModel';
import { EmailModel } from '../models/EmailModel';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../models/GroupsModel';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { OpenIdIdentityModel } from '../models/OpenIdIdentitiesModel';
import { OrganizationAllowedEmailDomainsModel } from '../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from '../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../models/OrganizationModel';
import { OrganizationSettingsModel } from '../models/OrganizationSettingsModel';
import { OrganizationSsoModel } from '../models/OrganizationSsoModel';
import { PasswordResetLinkModel } from '../models/PasswordResetLinkModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { SessionModel } from '../models/SessionModel';
import { UserModel } from '../models/UserModel';
import { UserWarehouseCredentialsModel } from '../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { UserService } from './UserService';
import {
    authenticatedUser,
    inviteLink,
    inviteUser,
    newUser,
    openIdIdentity,
    openIdUser,
    openIdUserWithInvalidIssuer,
    organisation,
    sessionUser,
    userWithoutOrg,
} from './UserService.mock';

const userModel = {
    getOpenIdIssuers: vi.fn(async () => []),
    hasPasswordByEmail: vi.fn(async () => false),
    findSessionUserByOpenId: vi.fn(async () => undefined),
    findSessionUserByUUID: vi.fn(async () => sessionUser),
    getSessionUserFromCacheOrDB: vi.fn(async () => ({
        sessionUser,
        cacheHit: false,
    })),
    createUser: vi.fn(async () => sessionUser),
    activateUser: vi.fn(async () => sessionUser),
    getOrganizationsForUser: vi.fn(async () => [sessionUser]),
    findUserByEmail: vi.fn(async () => undefined),
    createPendingUser: vi.fn(async () => newUser),
    findSessionUserByPrimaryEmail: vi.fn(async () => sessionUser),
    findServiceAccountByUserUuid: vi.fn(async () => undefined),
    joinOrg: vi.fn(async () => sessionUser),
    hasUsers: vi.fn(async () => false),
    updateUser: vi.fn(async () => sessionUser),
};

const openIdIdentityModel = {
    findIdentitiesByEmail: vi.fn(async () => [openIdIdentity]),
    createIdentity: vi.fn(async () => {}),
    updateIdentityByOpenId: vi.fn(async () => {}),
};

const emailModel = {
    getPrimaryEmailStatus: vi.fn(
        async () =>
            <EmailStatus>{
                email: 'example',
                isVerified: true,
            },
    ),
    verifyUserEmailIfExists: vi.fn(async () => []),
};

const inviteLinkModel = {
    getByCode: vi.fn(async () => inviteLink),
    deleteByCode: vi.fn(async () => undefined),
    upsert: vi.fn(async () => inviteLink),
};

const emailClient = {
    sendInviteEmail: vi.fn(),
};

const organizationModel = {
    get: vi.fn(async () => organisation),
    getAllowedOrgsForDomain: vi.fn(async () => []),
};

const projectModel = {
    getProjectsWithDefaultUserSpaces: vi.fn(async () => []),
    ensureDefaultUserSpace: vi.fn(async () => undefined),
};

const organizationSsoModel = {
    findEnabledMethodsForEmailDomain: vi.fn(async () => []),
    findGoogleMethodsForEmailDomain: vi.fn(async () => []),
};

const organizationSettingsModel = {
    get: vi.fn(async () => ({
        oidcLinkingEnabled: null,
        oidcToEmailLinkingEnabled: null,
    })),
    update: vi.fn(),
};

const createUserService = (lightdashConfig: LightdashConfig) =>
    new UserService({
        analytics: analyticsMock,
        lightdashConfig,
        inviteLinkModel: inviteLinkModel as unknown as InviteLinkModel,
        userModel: userModel as unknown as UserModel,
        groupsModel: {} as GroupsModel,
        sessionModel: {} as SessionModel,
        emailModel: emailModel as unknown as EmailModel,
        openIdIdentityModel:
            openIdIdentityModel as unknown as OpenIdIdentityModel,
        passwordResetLinkModel: {} as PasswordResetLinkModel,
        emailClient: emailClient as unknown as EmailClient,
        organizationMemberProfileModel: {} as OrganizationMemberProfileModel,
        organizationModel: organizationModel as unknown as OrganizationModel,
        personalAccessTokenModel: {} as PersonalAccessTokenModel,
        organizationAllowedEmailDomainsModel:
            {} as OrganizationAllowedEmailDomainsModel,
        organizationSsoModel:
            organizationSsoModel as unknown as OrganizationSsoModel,
        organizationSettingsModel:
            organizationSettingsModel as unknown as OrganizationSettingsModel,
        userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
        projectModel: projectModel as unknown as ProjectModel,
        featureFlagModel: {
            get: vi.fn(async () => ({
                id: 'leave-organization',
                enabled: true,
            })),
        } as unknown as FeatureFlagModel,
    });

vi.spyOn(analyticsMock, 'track');
const auditLogSpy = vi
    .spyOn(winston, 'logAuditEvent')
    .mockImplementation(() => {});

describe('UserService', () => {
    const userService = createUserService(lightdashConfigMock);

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('getAccountByUserUuid', () => {
        test('should return a session account for normal users', async () => {
            const account = await userService.getAccountByUserUuid('userUuid');

            expect(userModel.findSessionUserByUUID).toHaveBeenCalledWith(
                'userUuid',
            );
            expect(account.isSessionUser()).toBe(true);
            expect(account.isServiceAccount()).toBe(false);
        });

        test('should return a service account when the user backs a service account', async () => {
            const service = createUserService({
                ...lightdashConfigMock,
                serviceAccount: {
                    enabled: true,
                },
            });
            (
                userModel.findServiceAccountByUserUuid as import('vitest').Mock
            ).mockResolvedValueOnce({
                uuid: 'service-account-uuid',
                description: 'CI preview',
                scopes: ['system:developer'],
                organizationUuid: sessionUser.organizationUuid,
            });

            const account = await service.getAccountByUserUuid('userUuid');

            expect(account.isServiceAccount()).toBe(true);
            expect(account.authentication).toMatchObject({
                type: 'service-account',
                serviceAccountUuid: 'service-account-uuid',
                serviceAccountDescription: 'CI preview',
            });
            expect(account.user.id).toBe('userUuid');
        });
    });

    describe('updateUser', () => {
        test('should reject an invalid email before persisting', async () => {
            await expect(
                userService.updateUser(sessionUser, {
                    email: "x' OR '1'='1@evil.com",
                }),
            ).rejects.toThrow(ParameterError);
            expect(userModel.updateUser).not.toHaveBeenCalled();
        });

        test('should persist a valid email', async () => {
            await userService.updateUser(sessionUser, {
                firstName: 'firstName',
                lastName: 'lastName',
                email: sessionUser.email!,
            });
            expect(userModel.updateUser).toHaveBeenCalled();
        });
    });

    test('should return email and no sso (default case)', async () => {
        expect(await userService.getLoginOptions('test@lightdash.com')).toEqual(
            {
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email'],
            },
        );
    });
    test('should return no options if email and sso are disabled', async () => {
        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: true,
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: false,
            redirectUri: undefined,
            showOptions: [],
        });
    });
    test('should previous logged in sso provider', async () => {
        (
            userModel.getOpenIdIssuers as import('vitest').Mock
        ).mockImplementationOnce(async () => [OpenIdIdentityIssuerType.OKTA]);

        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: false,
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    oauth2ClientId: '1',
                    loginPath: '/login/okta',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: true,
            redirectUri:
                'https://test.lightdash.cloud/api/v1/login/okta?login_hint=test%40lightdash.com',
            showOptions: ['okta'],
        });
    });
    test('should not login with previous sso provider if not enabled', async () => {
        (
            userModel.getOpenIdIssuers as import('vitest').Mock
        ).mockImplementationOnce(async () => [OpenIdIdentityIssuerType.OKTA]);

        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: false,
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    oauth2ClientId: undefined, // disbled okta
                    loginPath: '/login/okta',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: false,
            redirectUri: undefined,
            showOptions: ['email'],
        });
    });
    test('should previous logged in enabled sso provider', async () => {
        (
            userModel.getOpenIdIssuers as import('vitest').Mock
        ).mockImplementationOnce(async () => [
            OpenIdIdentityIssuerType.GOOGLE,
            OpenIdIdentityIssuerType.OKTA,
        ]);

        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: false,
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    oauth2ClientId: '1',
                    loginPath: '/login/okta',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: true,
            redirectUri:
                'https://test.lightdash.cloud/api/v1/login/okta?login_hint=test%40lightdash.com',
            showOptions: ['okta'],
        });
    });
    test('should not redirect if only 1 sso is available but no email match', async () => {
        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: true,
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: false,
            redirectUri: undefined,
            showOptions: ['google'],
        });
    });
    test('should return all available sso providers and email', async () => {
        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: false,
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    oauth2ClientId: '1',
                    loginPath: '/login/okta',
                },
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
                oneLogin: {
                    ...lightdashConfigMock.auth.oneLogin,
                    oauth2ClientId: '1',
                    loginPath: '/login/oneLogin',
                },
                azuread: {
                    ...lightdashConfigMock.auth.azuread,
                    oauth2ClientId: '1',
                    loginPath: '/login/azuread',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: false,
            redirectUri: undefined,
            showOptions: ['email', 'google', 'azuread', 'oneLogin', 'okta'],
        });
    });

    test('should return all available sso providers but no email', async () => {
        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: true,
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    oauth2ClientId: '1',
                    loginPath: '/login/okta',
                },
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
                oneLogin: {
                    ...lightdashConfigMock.auth.oneLogin,
                    oauth2ClientId: '1',
                    loginPath: '/login/oneLogin',
                },
                azuread: {
                    ...lightdashConfigMock.auth.azuread,
                    oauth2ClientId: '1',
                    loginPath: '/login/azuread',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: false,
            redirectUri: undefined,
            showOptions: ['google', 'azuread', 'oneLogin', 'okta'],
        });
    });

    describe('getLoginOptions per-org SSO discovery', () => {
        const azureMethod = {
            organizationUuid: 'org-1',
            provider: OpenIdIdentityIssuerType.AZUREAD as unknown as never,
            config: {
                oauth2ClientId: 'cid',
                oauth2ClientSecret: 'sec',
                oauth2TenantId: 'tid',
            },
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        };
        const googleMethod = {
            ...azureMethod,
            provider: OpenIdIdentityIssuerType.GOOGLE as unknown as never,
        };

        const configWithGoogleEnv: LightdashConfig = {
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
                azuread: {
                    ...lightdashConfigMock.auth.azuread,
                    loginPath: '/login/azuread',
                },
            },
        };

        test('no per-org match → instance defaults shown', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([]);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@unknown.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'google'],
            });
        });

        test('per-org Azure match suppresses instance Google (returning user with password)', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([azureMethod]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'azuread'],
            });
        });

        test('per-org Azure match + allow_password=false hides password input', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([{ ...azureMethod, allowPassword: false }]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/azuread?login_hint=user%40acme.com',
                showOptions: ['azuread'],
            });
        });

        test('brand-new user matching per-org Azure → forceRedirect with login_hint', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([azureMethod]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(false);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('newbie@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/azuread?login_hint=newbie%40acme.com',
                showOptions: ['azuread'],
            });
        });

        test('multiple per-org matches → both buttons, no forceRedirect', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([
                { ...azureMethod, allowPassword: false },
                googleMethod,
            ]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            // Lenient password rule: googleMethod.allowPassword=true → password shown
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'azuread', 'google'],
            });
        });

        test('multiple per-org matches all allow_password=false → no password input', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([
                { ...azureMethod, allowPassword: false },
                { ...googleMethod, allowPassword: false },
            ]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['azuread', 'google'],
            });
        });

        test("returning user's prior Google identity is ignored when per-org Azure matches", async () => {
            // Org migrated from instance Google to per-org Azure.
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([azureMethod]);
            (
                userModel.getOpenIdIssuers as import('vitest').Mock
            ).mockResolvedValueOnce([OpenIdIdentityIssuerType.GOOGLE]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(false);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/azuread?login_hint=user%40acme.com',
                showOptions: ['azuread'],
            });
        });

        test('returning user with linked SSO and password → single OIDC still forceRedirects (no other SSO option to show)', async () => {
            // hasPassword=false, only one OIDC option (Azure), no password input
            // ⇒ truly one option ⇒ forceRedirect
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([azureMethod]);
            (
                userModel.getOpenIdIssuers as import('vitest').Mock
            ).mockResolvedValueOnce([OpenIdIdentityIssuerType.AZUREAD]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(false);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/azuread?login_hint=user%40acme.com',
                showOptions: ['azuread'],
            });
        });

        test('no email → returns instance defaults, no SSO lookup', async () => {
            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions()).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'google'],
            });
            expect(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).not.toHaveBeenCalled();
        });

        test('existing user in a DIFFERENT org → per-org SSO method is filtered out (cross-org hijack defence)', async () => {
            // The Azure SSO row belongs to org-1, but the user is in org-2.
            // Without filtering, an attacker org could redirect this user's
            // SSO flow to their tenant.
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([azureMethod]); // org-1
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce({
                userUuid: 'victim-uuid',
                email: 'victim@acme.com',
            });
            (
                userModel.getOrganizationsForUser as import('vitest').Mock
            ).mockResolvedValueOnce([
                { organizationUuid: 'org-2', organizationName: 'Victim Org' },
            ]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('victim@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                // No Azure — the matching method belonged to a different org
                showOptions: ['email'],
            });
        });

        test('existing user in the SAME org → per-org SSO method is kept', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([azureMethod]); // org-1
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce({
                userUuid: 'member-uuid',
                email: 'member@acme.com',
            });
            (
                userModel.getOrganizationsForUser as import('vitest').Mock
            ).mockResolvedValueOnce([
                { organizationUuid: 'org-1', organizationName: 'Acme Org' },
            ]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('member@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'azuread'],
            });
        });

        test('brand-new user (no Lightdash account) → cross-org filter does not apply, discovery as normal', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([azureMethod]);
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(undefined);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(false);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('newcomer@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/azuread?login_hint=newcomer%40acme.com',
                showOptions: ['azuread'],
            });
        });
    });

    describe('getLoginOptions per-org Okta SSO discovery', () => {
        // Per-org Okta config lives in the DB. The instance has NO Okta env
        // config — discovery must work purely from the stored method, proving
        // the per-org path is independent of environment variables.
        const oktaMethod = {
            organizationUuid: 'org-1',
            provider: OpenIdIdentityIssuerType.OKTA as unknown as never,
            config: {
                oauth2Issuer: 'https://acme.okta.com',
                oktaDomain: 'acme.okta.com',
                oauth2ClientId: 'cid',
                oauth2ClientSecret: 'sec',
                authorizationServerId: 'default',
                extraScopes: null,
            },
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        };

        // Google enabled instance-wide, Okta NOT configured via env.
        const configWithGoogleEnv: LightdashConfig = {
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    loginPath: '/login/okta',
                },
            },
        };

        test('per-org Okta match suppresses instance Google (returning user with password)', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([oktaMethod]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'okta'],
            });
        });

        test('per-org Okta match + allow_password=false → forceRedirect to /login/okta', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([{ ...oktaMethod, allowPassword: false }]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/okta?login_hint=user%40acme.com',
                showOptions: ['okta'],
            });
        });

        test('brand-new user matching per-org Okta → forceRedirect with login_hint', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([oktaMethod]);
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(undefined);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(false);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('newbie@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/okta?login_hint=newbie%40acme.com',
                showOptions: ['okta'],
            });
        });

        test('existing user in a DIFFERENT org → per-org Okta method filtered out (cross-org hijack defence)', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([oktaMethod]); // org-1
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce({
                userUuid: 'victim-uuid',
                email: 'victim@acme.com',
            });
            (
                userModel.getOrganizationsForUser as import('vitest').Mock
            ).mockResolvedValueOnce([
                { organizationUuid: 'org-2', organizationName: 'Victim Org' },
            ]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('victim@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                // No Okta — the matching method belonged to a different org
                showOptions: ['email'],
            });
        });
    });

    describe('getLoginOptions per-org generic OIDC discovery', () => {
        // Per-org OIDC config lives in the DB; the instance has no OIDC env
        // config. Proves the generic discovery path maps provider 'oidc' to the
        // GENERIC_OIDC login option independently of env config.
        const oidcMethod = {
            organizationUuid: 'org-1',
            provider: OpenIdIdentityIssuerType.GENERIC_OIDC as unknown as never,
            config: {
                clientId: 'cid',
                clientSecret: 'sec',
                metadataDocumentEndpoint:
                    'https://idp.acme.com/.well-known/openid-configuration',
                scopes: null,
            },
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        };

        const configWithGoogleEnv: LightdashConfig = {
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
                oidc: {
                    ...lightdashConfigMock.auth.oidc,
                    loginPath: '/login/oidc',
                },
            },
        };

        test('per-org OIDC match suppresses instance Google (returning user with password)', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([oidcMethod]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'oidc'],
            });
        });

        test('brand-new user matching per-org OIDC → forceRedirect to /login/oidc', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([oidcMethod]);
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(undefined);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(false);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('newbie@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/oidc?login_hint=newbie%40acme.com',
                showOptions: ['oidc'],
            });
        });
    });

    describe('getLoginOptions per-org OneLogin discovery', () => {
        const oneLoginMethod = {
            organizationUuid: 'org-1',
            provider: OpenIdIdentityIssuerType.ONELOGIN as unknown as never,
            config: {
                oauth2Issuer: 'https://acme.onelogin.com',
                oauth2ClientId: 'cid',
                oauth2ClientSecret: 'sec',
            },
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        };

        const configWithGoogleEnv: LightdashConfig = {
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
                oneLogin: {
                    ...lightdashConfigMock.auth.oneLogin,
                    loginPath: '/login/oneLogin',
                },
            },
        };

        test('per-org OneLogin match suppresses instance Google (returning user with password)', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([oneLoginMethod]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'oneLogin'],
            });
        });

        test('brand-new user matching per-org OneLogin → forceRedirect to /login/oneLogin', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([oneLoginMethod]);
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(undefined);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(false);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('newbie@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/oneLogin?login_hint=newbie%40acme.com',
                showOptions: ['oneLogin'],
            });
        });
    });

    describe('getLoginOptions per-org Google provider', () => {
        const configWithGoogleEnv: LightdashConfig = {
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
            },
        };

        const oktaMethod = {
            organizationUuid: 'org-1',
            provider: OpenIdIdentityIssuerType.OKTA as unknown as never,
            config: {
                oauth2Issuer: 'https://acme.okta.com',
                oktaDomain: 'acme.okta.com',
                oauth2ClientId: 'cid',
                oauth2ClientSecret: 'sec',
                authorizationServerId: 'default',
                extraScopes: null,
            },
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        };

        const googleMethod = {
            organizationUuid: 'org-1',
            provider: OpenIdIdentityIssuerType.GOOGLE as unknown as never,
            config: {},
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword: true,
        };

        test('an enabled Google row is shown alongside other per-org SSO (flows through discovery)', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([oktaMethod, googleMethod]);
            (
                organizationSsoModel.findGoogleMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([
                {
                    organizationUuid: 'org-1',
                    enabled: true,
                    allowPassword: true,
                },
            ]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'okta', 'google'],
            });
        });

        test('org disabled Google (no other SSO) → Google dropped from the new-signup fallback', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([]);
            (
                organizationSsoModel.findGoogleMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([
                {
                    organizationUuid: 'org-1',
                    enabled: false,
                    allowPassword: true,
                },
            ]);
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(undefined);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(false);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('newbie@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email'],
            });
        });

        test('returning user with a linked Google identity but org disabled Google → Google hidden', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([]);
            (
                organizationSsoModel.findGoogleMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([
                {
                    organizationUuid: 'org-1',
                    enabled: false,
                    allowPassword: true,
                },
            ]);
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce({
                userUuid: 'member-uuid',
                email: 'member@acme.com',
            });
            (
                userModel.getOrganizationsForUser as import('vitest').Mock
            ).mockResolvedValueOnce([
                { organizationUuid: 'org-1', organizationName: 'Acme Org' },
            ]);
            (
                userModel.getOpenIdIssuers as import('vitest').Mock
            ).mockResolvedValueOnce([OpenIdIdentityIssuerType.GOOGLE]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('member@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email'],
            });
        });

        test('disabling policy is ignored for a non-member (cross-org) → Google stays', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([]);
            (
                organizationSsoModel.findGoogleMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([
                {
                    organizationUuid: 'org-1',
                    enabled: false,
                    allowPassword: true,
                },
            ]);
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce({
                userUuid: 'outsider-uuid',
                email: 'outsider@acme.com',
            });
            (
                userModel.getOrganizationsForUser as import('vitest').Mock
            ).mockResolvedValueOnce([
                { organizationUuid: 'org-2', organizationName: 'Other Org' },
            ]);
            (
                userModel.getOpenIdIssuers as import('vitest').Mock
            ).mockResolvedValueOnce([OpenIdIdentityIssuerType.GOOGLE]);
            (
                userModel.hasPasswordByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(true);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('outsider@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'google'],
            });
        });
    });

    describe('isLoginMethodAllowed Google per-org opt-out', () => {
        test('allows Google when the domain has no per-org policy', async () => {
            (
                organizationSsoModel.findGoogleMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([]);
            expect(
                await userService.isLoginMethodAllowed(
                    'user@acme.com',
                    OpenIdIdentityIssuerType.GOOGLE,
                ),
            ).toBe(true);
        });

        test('blocks Google when the owning org disabled it', async () => {
            (
                organizationSsoModel.findGoogleMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([
                {
                    organizationUuid: 'org-1',
                    enabled: false,
                    allowPassword: true,
                },
            ]);
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce(undefined);
            expect(
                await userService.isLoginMethodAllowed(
                    'user@acme.com',
                    OpenIdIdentityIssuerType.GOOGLE,
                ),
            ).toBe(false);
        });

        test('allows Google for a non-member even if another org disabled it (cross-org)', async () => {
            (
                organizationSsoModel.findGoogleMethodsForEmailDomain as import('vitest').Mock
            ).mockResolvedValueOnce([
                {
                    organizationUuid: 'org-1',
                    enabled: false,
                    allowPassword: true,
                },
            ]);
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockResolvedValueOnce({
                userUuid: 'outsider-uuid',
                email: 'outsider@acme.com',
            });
            (
                userModel.getOrganizationsForUser as import('vitest').Mock
            ).mockResolvedValueOnce([
                { organizationUuid: 'org-2', organizationName: 'Other Org' },
            ]);
            expect(
                await userService.isLoginMethodAllowed(
                    'outsider@acme.com',
                    OpenIdIdentityIssuerType.GOOGLE,
                ),
            ).toBe(true);
        });
    });

    describe('loginWithOpenId', () => {
        test('should throw error if provider not allowed', async () => {
            await expect(
                userService.loginWithOpenId(
                    openIdUserWithInvalidIssuer,
                    undefined,
                    undefined,
                ),
            ).rejects.toThrowError(
                'Invalid login method invalid_issuer provided.',
            );
        });
        test('should create user', async () => {
            await userService.loginWithOpenId(openIdUser, undefined, undefined);
            expect(
                openIdIdentityModel.updateIdentityByOpenId as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                userModel.createUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                userModel.createUser as import('vitest').Mock,
            ).toBeCalledWith(openIdUser);
            expect(
                userModel.activateUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
        });
        test('should activate invited user', async () => {
            await userService.loginWithOpenId(
                openIdUser,
                undefined,
                'inviteCode',
            );
            expect(
                openIdIdentityModel.updateIdentityByOpenId as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                userModel.createUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                userModel.activateUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
        });
        test('should link openid with authenticated user', async () => {
            await userService.loginWithOpenId(
                openIdUser,
                authenticatedUser,
                undefined,
            );
            expect(
                openIdIdentityModel.updateIdentityByOpenId as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: authenticatedUser.userId,
                }),
            );
            expect(
                userModel.createUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                userModel.activateUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
        });
        test('should link openid to an existing user that has another OIDC with the same email', async () => {
            const service = createUserService({
                ...lightdashConfigMock,
                auth: {
                    ...lightdashConfigMock.auth,
                    enableOidcLinking: true,
                },
            });
            await service.loginWithOpenId(openIdUser, undefined, undefined);
            expect(
                openIdIdentityModel.updateIdentityByOpenId as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: sessionUser.userId,
                }),
            );
            expect(
                userModel.createUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                userModel.activateUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
        });
        test('should link openid to an existing user that has the same verified email', async () => {
            const service = createUserService({
                ...lightdashConfigMock,
                auth: {
                    ...lightdashConfigMock.auth,
                    enableOidcToEmailLinking: true,
                },
            });
            await service.loginWithOpenId(openIdUser, undefined, undefined);
            expect(
                openIdIdentityModel.updateIdentityByOpenId as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: sessionUser.userId,
                }),
            );
            expect(
                userModel.createUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                userModel.activateUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
        });
        test('links via per-org OIDC linking even when the instance env flag is off', async () => {
            // Instance env flags are off (default config); the org opts in
            // through organization_settings.
            (
                organizationSettingsModel.get as import('vitest').Mock
            ).mockResolvedValueOnce({
                oidcLinkingEnabled: true,
                oidcToEmailLinkingEnabled: false,
            });

            await userService.loginWithOpenId(openIdUser, undefined, undefined);

            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ userId: sessionUser.userId }),
            );
            expect(
                userModel.createUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
        });
        test('links via per-org OIDC-to-email linking even when the instance env flag is off', async () => {
            // No matching OIDC identity → the OIDC-linking gate is skipped; the
            // user is matched by verified primary email and the org opts in.
            (
                openIdIdentityModel.findIdentitiesByEmail as import('vitest').Mock
            ).mockResolvedValueOnce([]);
            (
                organizationSettingsModel.get as import('vitest').Mock
            ).mockResolvedValueOnce({
                oidcLinkingEnabled: false,
                oidcToEmailLinkingEnabled: true,
            });

            await userService.loginWithOpenId(openIdUser, undefined, undefined);

            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledWith(
                expect.objectContaining({ userId: sessionUser.userId }),
            );
            expect(
                userModel.createUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
        });
        test('should update openid ', async () => {
            // Mock that identity is found for that openid
            (
                userModel.findSessionUserByOpenId as import('vitest').Mock
            ).mockImplementationOnce(async () => sessionUser);

            await userService.loginWithOpenId(openIdUser, undefined, undefined);
            expect(
                openIdIdentityModel.updateIdentityByOpenId as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                openIdIdentityModel.createIdentity as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                userModel.createUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                userModel.activateUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
        });

        test('should emit allowed audit event on successful OpenID login', async () => {
            (
                userModel.findSessionUserByOpenId as import('vitest').Mock
            ).mockImplementationOnce(async () => sessionUser);

            await userService.loginWithOpenId(openIdUser, undefined, undefined);

            expect(auditLogSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'login',
                    status: 'allowed',
                    actor: expect.objectContaining({
                        uuid: sessionUser.userUuid,
                        type: 'session',
                    }),
                    resource: expect.objectContaining({ type: 'Session' }),
                }),
            );
        });

        test('should emit denied audit event when OpenID provider not allowed', async () => {
            await expect(
                userService.loginWithOpenId(
                    openIdUserWithInvalidIssuer,
                    undefined,
                    undefined,
                ),
            ).rejects.toThrow();

            expect(auditLogSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'login',
                    status: 'denied',
                    actor: expect.objectContaining({ uuid: 'unknown' }),
                    resource: expect.objectContaining({ type: 'Session' }),
                }),
            );
        });
    });

    describe('audit events for login failures', () => {
        test('should emit denied audit event when password is wrong', async () => {
            const failingUserModel = {
                ...userModel,
                getUserByPrimaryEmailAndPassword: vi.fn(async () => {
                    throw new NotFoundError('wrong password');
                }),
            };
            const service = new UserService({
                analytics: analyticsMock,
                lightdashConfig: lightdashConfigMock,
                inviteLinkModel: inviteLinkModel as unknown as InviteLinkModel,
                userModel: failingUserModel as unknown as UserModel,
                groupsModel: {} as GroupsModel,
                sessionModel: {} as SessionModel,
                emailModel: emailModel as unknown as EmailModel,
                openIdIdentityModel:
                    openIdIdentityModel as unknown as OpenIdIdentityModel,
                passwordResetLinkModel: {} as PasswordResetLinkModel,
                emailClient: emailClient as unknown as EmailClient,
                organizationMemberProfileModel:
                    {} as OrganizationMemberProfileModel,
                organizationModel:
                    organizationModel as unknown as OrganizationModel,
                personalAccessTokenModel: {} as PersonalAccessTokenModel,
                organizationAllowedEmailDomainsModel:
                    {} as OrganizationAllowedEmailDomainsModel,
                organizationSsoModel: {
                    findOrganizationUuidByProviderAndEmailDomain: vi.fn(
                        async () => undefined,
                    ),
                } as unknown as OrganizationSsoModel,
                organizationSettingsModel: {
                    get: vi.fn(async () => ({
                        oidcLinkingEnabled: null,
                        oidcToEmailLinkingEnabled: null,
                    })),
                    update: vi.fn(),
                } as unknown as OrganizationSettingsModel,
                userWarehouseCredentialsModel:
                    {} as UserWarehouseCredentialsModel,
                warehouseAvailableTablesModel:
                    {} as WarehouseAvailableTablesModel,
                projectModel: projectModel as unknown as ProjectModel,
                featureFlagModel: {
                    get: vi.fn(async () => ({
                        id: 'leave-organization',
                        enabled: true,
                    })),
                } as unknown as FeatureFlagModel,
            });

            await expect(
                service.loginWithPassword('user@example.com', 'wrong', {
                    ip: '127.0.0.1',
                    userAgent: 'test',
                }),
            ).rejects.toThrow();

            expect(auditLogSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'login',
                    status: 'denied',
                    reason: 'Email and password not recognized',
                    actor: expect.objectContaining({
                        uuid: 'unknown',
                        email: 'user@example.com',
                    }),
                    context: expect.objectContaining({
                        ip: '127.0.0.1',
                        userAgent: 'test',
                    }),
                    resource: expect.objectContaining({ type: 'Session' }),
                }),
            );
        });

        test('should emit denied audit event for unknown personal access token', async () => {
            const tokenUserModel = {
                ...userModel,
                findSessionUserByPersonalAccessToken: vi.fn(
                    async () => undefined,
                ),
            };
            const service = new UserService({
                analytics: analyticsMock,
                lightdashConfig: lightdashConfigMock,
                inviteLinkModel: inviteLinkModel as unknown as InviteLinkModel,
                userModel: tokenUserModel as unknown as UserModel,
                groupsModel: {} as GroupsModel,
                sessionModel: {} as SessionModel,
                emailModel: emailModel as unknown as EmailModel,
                openIdIdentityModel:
                    openIdIdentityModel as unknown as OpenIdIdentityModel,
                passwordResetLinkModel: {} as PasswordResetLinkModel,
                emailClient: emailClient as unknown as EmailClient,
                organizationMemberProfileModel:
                    {} as OrganizationMemberProfileModel,
                organizationModel:
                    organizationModel as unknown as OrganizationModel,
                personalAccessTokenModel: {} as PersonalAccessTokenModel,
                organizationAllowedEmailDomainsModel:
                    {} as OrganizationAllowedEmailDomainsModel,
                organizationSsoModel: {
                    findOrganizationUuidByProviderAndEmailDomain: vi.fn(
                        async () => undefined,
                    ),
                } as unknown as OrganizationSsoModel,
                organizationSettingsModel: {
                    get: vi.fn(async () => ({
                        oidcLinkingEnabled: null,
                        oidcToEmailLinkingEnabled: null,
                    })),
                    update: vi.fn(),
                } as unknown as OrganizationSettingsModel,
                userWarehouseCredentialsModel:
                    {} as UserWarehouseCredentialsModel,
                warehouseAvailableTablesModel:
                    {} as WarehouseAvailableTablesModel,
                projectModel: projectModel as unknown as ProjectModel,
                featureFlagModel: {
                    get: vi.fn(async () => ({
                        id: 'leave-organization',
                        enabled: true,
                    })),
                } as unknown as FeatureFlagModel,
            });

            await expect(
                service.loginWithPersonalAccessToken('bad-token'),
            ).rejects.toThrow();

            expect(auditLogSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'login',
                    status: 'denied',
                    resource: expect.objectContaining({
                        type: 'PersonalAccessToken',
                    }),
                }),
            );
        });
    });

    describe('createPendingUserAndInviteLink', () => {
        test('should create user and send invite when email is not found', async () => {
            expect(
                await userService.createPendingUserAndInviteLink(
                    sessionUser,
                    inviteUser,
                ),
            ).toEqual(inviteLink);
            expect(
                userModel.createPendingUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                inviteLinkModel.upsert as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
        });
        test('should send invite when email belongs to user without org', async () => {
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockImplementationOnce(async () => userWithoutOrg);
            expect(
                await userService.createPendingUserAndInviteLink(
                    sessionUser,
                    inviteUser,
                ),
            ).toEqual(inviteLink);
            expect(
                userModel.joinOrg as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                userModel.createPendingUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                inviteLinkModel.upsert as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
        });
        test('should send invite when email belongs to inactive user in same org', async () => {
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockImplementationOnce(async () => ({
                ...userWithoutOrg,
                isPending: true,
                organizationUuid: sessionUser.organizationUuid,
            }));
            await userService.createPendingUserAndInviteLink(
                sessionUser,
                inviteUser,
            );
            expect(
                userModel.createPendingUser as import('vitest').Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                inviteLinkModel.upsert as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
        });
        test('should throw error when email belongs to user in different org', async () => {
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockImplementationOnce(async () => ({
                ...userWithoutOrg,
                organizationUuid: 'anotherOrg',
            }));
            await expect(
                userService.createPendingUserAndInviteLink(
                    sessionUser,
                    inviteUser,
                ),
            ).rejects.toThrowError(
                'Email is already used by a user in another organization. Ask them to leave their organisation before inviting them.',
            );
        });
        test('should throw error when email belongs to an active user in same org', async () => {
            (
                userModel.findUserByEmail as import('vitest').Mock
            ).mockImplementationOnce(async () => ({
                ...userWithoutOrg,
                isActive: true,
                organizationUuid: sessionUser.organizationUuid,
            }));
            await expect(
                userService.createPendingUserAndInviteLink(
                    sessionUser,
                    inviteUser,
                ),
            ).rejects.toThrowError(
                'Email is already used by a user in your organization',
            );
        });
    });

    describe('ensureDefaultUserSpaces', () => {
        const projectUuid = 'project-uuid';
        const organizationUuid = 'organizationUuid';

        const projectWithDefaultSpaces = {
            projectId: 1,
            projectUuid,
            parentSpaceUuid: 'parent-space-uuid',
            parentPath: 'default_user_spaces',
        };

        const makeSessionUser = (
            overrides: Partial<SessionUser> & {
                orgRole?: OrganizationMemberRole;
                projectRole?: ProjectMemberRole;
            } = {},
        ): SessionUser => {
            const {
                orgRole = OrganizationMemberRole.EDITOR,
                projectRole,
                ...rest
            } = overrides;
            const userUuid = rest.userUuid ?? 'test-user-uuid';
            return {
                ...sessionUser,
                userUuid,
                userId: rest.userId ?? 42,
                firstName: rest.firstName ?? 'Test',
                lastName: rest.lastName ?? 'User',
                organizationUuid,
                role: orgRole,
                ability: defineUserAbility(
                    {
                        userUuid,
                        role: orgRole,
                        organizationUuid,
                    },
                    projectRole
                        ? [
                              {
                                  projectUuid,
                                  role: projectRole,
                                  userUuid,
                                  roleUuid: undefined,
                              },
                          ]
                        : [],
                ),
                ...rest,
            };
        };

        const callOnLogin = async (service: UserService, user: SessionUser) => {
            (
                userModel.getSessionUserFromCacheOrDB as import('vitest').Mock
            ).mockResolvedValueOnce({
                sessionUser: user,
                cacheHit: false,
            });
            await service.onLogin({
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
            });
        };

        test('should return early when user has no organization', async () => {
            const service = createUserService(lightdashConfigMock);

            await service.onLogin({
                userUuid: 'test-user-uuid',
                organizationUuid: undefined,
            });

            expect(
                userModel.getSessionUserFromCacheOrDB,
            ).not.toHaveBeenCalled();
            expect(
                projectModel.getProjectsWithDefaultUserSpaces,
            ).not.toHaveBeenCalled();
        });

        test('should return early when no projects have the feature enabled', async () => {
            const service = createUserService(lightdashConfigMock);

            (
                projectModel.getProjectsWithDefaultUserSpaces as import('vitest').Mock
            ).mockResolvedValueOnce([]);

            await callOnLogin(service, makeSessionUser());

            expect(projectModel.ensureDefaultUserSpace).not.toHaveBeenCalled();
        });

        test('should create space for interactive viewer', async () => {
            const service = createUserService(lightdashConfigMock);

            (
                projectModel.getProjectsWithDefaultUserSpaces as import('vitest').Mock
            ).mockResolvedValueOnce([projectWithDefaultSpaces]);

            const interactiveViewer = makeSessionUser({
                projectRole: ProjectMemberRole.INTERACTIVE_VIEWER,
            });

            await callOnLogin(service, interactiveViewer);

            expect(projectModel.ensureDefaultUserSpace).toHaveBeenCalledTimes(
                1,
            );
            expect(projectModel.ensureDefaultUserSpace).toHaveBeenCalledWith(
                projectWithDefaultSpaces.projectId,
                projectWithDefaultSpaces.parentSpaceUuid,
                projectWithDefaultSpaces.parentPath,
                {
                    userId: interactiveViewer.userId,
                    userUuid: interactiveViewer.userUuid,
                    firstName: interactiveViewer.firstName,
                    lastName: interactiveViewer.lastName,
                },
            );
        });

        test('should skip space creation for viewer (no manage:SavedChart ability)', async () => {
            const service = createUserService(lightdashConfigMock);

            (
                projectModel.getProjectsWithDefaultUserSpaces as import('vitest').Mock
            ).mockResolvedValueOnce([projectWithDefaultSpaces]);

            const viewer = makeSessionUser({
                orgRole: OrganizationMemberRole.VIEWER,
                projectRole: ProjectMemberRole.VIEWER,
            });

            await callOnLogin(service, viewer);

            expect(projectModel.ensureDefaultUserSpace).not.toHaveBeenCalled();
        });

        test('should create spaces across multiple projects', async () => {
            const service = createUserService(lightdashConfigMock);

            const secondProject = {
                projectId: 2,
                projectUuid: 'project-uuid-2',
                parentSpaceUuid: 'parent-space-uuid-2',
                parentPath: 'default_user_spaces_2',
            };

            (
                projectModel.getProjectsWithDefaultUserSpaces as import('vitest').Mock
            ).mockResolvedValueOnce([projectWithDefaultSpaces, secondProject]);

            const editor = makeSessionUser({
                orgRole: OrganizationMemberRole.EDITOR,
            });

            await callOnLogin(service, editor);

            expect(projectModel.ensureDefaultUserSpace).toHaveBeenCalledTimes(
                2,
            );
        });
    });
});
