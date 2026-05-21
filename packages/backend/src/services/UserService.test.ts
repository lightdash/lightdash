import {
    defineUserAbility,
    EmailStatus,
    NotFoundError,
    OpenIdIdentityIssuerType,
    OrganizationMemberRole,
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
    getOpenIdIssuers: jest.fn(async () => []),
    hasPasswordByEmail: jest.fn(async () => false),
    findSessionUserByOpenId: jest.fn(async () => undefined),
    findSessionUserByUUID: jest.fn(async () => sessionUser),
    getSessionUserFromCacheOrDB: jest.fn(async () => ({
        sessionUser,
        cacheHit: false,
    })),
    createUser: jest.fn(async () => sessionUser),
    activateUser: jest.fn(async () => sessionUser),
    getOrganizationsForUser: jest.fn(async () => [sessionUser]),
    findUserByEmail: jest.fn(async () => undefined),
    createPendingUser: jest.fn(async () => newUser),
    findSessionUserByPrimaryEmail: jest.fn(async () => sessionUser),
    joinOrg: jest.fn(async () => sessionUser),
    hasUsers: jest.fn(async () => false),
};

const openIdIdentityModel = {
    findIdentitiesByEmail: jest.fn(async () => [openIdIdentity]),
    createIdentity: jest.fn(async () => {}),
    updateIdentityByOpenId: jest.fn(async () => {}),
};

const emailModel = {
    getPrimaryEmailStatus: jest.fn(
        async () =>
            <EmailStatus>{
                email: 'example',
                isVerified: true,
            },
    ),
    verifyUserEmailIfExists: jest.fn(async () => []),
};

const inviteLinkModel = {
    getByCode: jest.fn(async () => inviteLink),
    deleteByCode: jest.fn(async () => undefined),
    upsert: jest.fn(async () => inviteLink),
};

const emailClient = {
    sendInviteEmail: jest.fn(),
};

const organizationModel = {
    get: jest.fn(async () => organisation),
    getAllowedOrgsForDomain: jest.fn(async () => []),
};

const projectModel = {
    getProjectsWithDefaultUserSpaces: jest.fn(async () => []),
    ensureDefaultUserSpace: jest.fn(async () => undefined),
};

const organizationSsoModel = {
    findEnabledMethodsForEmailDomain: jest.fn(async () => []),
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
        userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
        projectModel: projectModel as unknown as ProjectModel,
        featureFlagModel: {
            get: jest.fn(async () => ({
                id: 'leave-organization',
                enabled: true,
            })),
        } as unknown as FeatureFlagModel,
    });

jest.spyOn(analyticsMock, 'track');
const auditLogSpy = jest
    .spyOn(winston, 'logAuditEvent')
    .mockImplementation(() => {});

describe('UserService', () => {
    const userService = createUserService(lightdashConfigMock);

    afterEach(() => {
        jest.clearAllMocks();
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
        (userModel.getOpenIdIssuers as jest.Mock).mockImplementationOnce(
            async () => [OpenIdIdentityIssuerType.OKTA],
        );

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
        (userModel.getOpenIdIssuers as jest.Mock).mockImplementationOnce(
            async () => [OpenIdIdentityIssuerType.OKTA],
        );

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
        (userModel.getOpenIdIssuers as jest.Mock).mockImplementationOnce(
            async () => [
                OpenIdIdentityIssuerType.GOOGLE,
                OpenIdIdentityIssuerType.OKTA,
            ],
        );

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
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
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
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([azureMethod]);
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                true,
            );

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('user@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'azuread'],
            });
        });

        test('per-org Azure match + allow_password=false hides password input', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([{ ...azureMethod, allowPassword: false }]);
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                true,
            );

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
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([azureMethod]);
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                false,
            );

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
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([
                { ...azureMethod, allowPassword: false },
                googleMethod,
            ]);
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                true,
            );

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
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([
                { ...azureMethod, allowPassword: false },
                { ...googleMethod, allowPassword: false },
            ]);
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                true,
            );

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
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([azureMethod]);
            (userModel.getOpenIdIssuers as jest.Mock).mockResolvedValueOnce([
                OpenIdIdentityIssuerType.GOOGLE,
            ]);
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                false,
            );

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
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([azureMethod]);
            (userModel.getOpenIdIssuers as jest.Mock).mockResolvedValueOnce([
                OpenIdIdentityIssuerType.AZUREAD,
            ]);
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                false,
            );

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
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([azureMethod]); // org-1
            (userModel.findUserByEmail as jest.Mock).mockResolvedValueOnce({
                userUuid: 'victim-uuid',
                email: 'victim@acme.com',
            });
            (
                userModel.getOrganizationsForUser as jest.Mock
            ).mockResolvedValueOnce([
                { organizationUuid: 'org-2', organizationName: 'Victim Org' },
            ]);
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                true,
            );

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
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([azureMethod]); // org-1
            (userModel.findUserByEmail as jest.Mock).mockResolvedValueOnce({
                userUuid: 'member-uuid',
                email: 'member@acme.com',
            });
            (
                userModel.getOrganizationsForUser as jest.Mock
            ).mockResolvedValueOnce([
                { organizationUuid: 'org-1', organizationName: 'Acme Org' },
            ]);
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                true,
            );

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('member@acme.com')).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email', 'azuread'],
            });
        });

        test('brand-new user (no Lightdash account) → cross-org filter does not apply, discovery as normal', async () => {
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as jest.Mock
            ).mockResolvedValueOnce([azureMethod]);
            (userModel.findUserByEmail as jest.Mock).mockResolvedValueOnce(
                undefined,
            );
            (userModel.hasPasswordByEmail as jest.Mock).mockResolvedValueOnce(
                false,
            );

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions('newcomer@acme.com')).toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/azuread?login_hint=newcomer%40acme.com',
                showOptions: ['azuread'],
            });
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
                openIdIdentityModel.updateIdentityByOpenId as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(userModel.createUser as jest.Mock).toHaveBeenCalledTimes(1);
            expect(userModel.createUser as jest.Mock).toBeCalledWith(
                openIdUser,
            );
            expect(userModel.activateUser as jest.Mock).toHaveBeenCalledTimes(
                0,
            );
        });
        test('should activate invited user', async () => {
            await userService.loginWithOpenId(
                openIdUser,
                undefined,
                'inviteCode',
            );
            expect(
                openIdIdentityModel.updateIdentityByOpenId as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(userModel.createUser as jest.Mock).toHaveBeenCalledTimes(0);
            expect(userModel.activateUser as jest.Mock).toHaveBeenCalledTimes(
                1,
            );
        });
        test('should link openid with authenticated user', async () => {
            await userService.loginWithOpenId(
                openIdUser,
                authenticatedUser,
                undefined,
            );
            expect(
                openIdIdentityModel.updateIdentityByOpenId as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as jest.Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                openIdIdentityModel.createIdentity as jest.Mock,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: authenticatedUser.userId,
                }),
            );
            expect(userModel.createUser as jest.Mock).toHaveBeenCalledTimes(0);
            expect(userModel.activateUser as jest.Mock).toHaveBeenCalledTimes(
                0,
            );
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
                openIdIdentityModel.updateIdentityByOpenId as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as jest.Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                openIdIdentityModel.createIdentity as jest.Mock,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: sessionUser.userId,
                }),
            );
            expect(userModel.createUser as jest.Mock).toHaveBeenCalledTimes(0);
            expect(userModel.activateUser as jest.Mock).toHaveBeenCalledTimes(
                0,
            );
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
                openIdIdentityModel.updateIdentityByOpenId as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(
                openIdIdentityModel.createIdentity as jest.Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                openIdIdentityModel.createIdentity as jest.Mock,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: sessionUser.userId,
                }),
            );
            expect(userModel.createUser as jest.Mock).toHaveBeenCalledTimes(0);
            expect(userModel.activateUser as jest.Mock).toHaveBeenCalledTimes(
                0,
            );
        });
        test('should update openid ', async () => {
            // Mock that identity is found for that openid
            (
                userModel.findSessionUserByOpenId as jest.Mock
            ).mockImplementationOnce(async () => sessionUser);

            await userService.loginWithOpenId(openIdUser, undefined, undefined);
            expect(
                openIdIdentityModel.updateIdentityByOpenId as jest.Mock,
            ).toHaveBeenCalledTimes(1);
            expect(
                openIdIdentityModel.createIdentity as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(userModel.createUser as jest.Mock).toHaveBeenCalledTimes(0);
            expect(userModel.activateUser as jest.Mock).toHaveBeenCalledTimes(
                0,
            );
        });

        test('should emit allowed audit event on successful OpenID login', async () => {
            (
                userModel.findSessionUserByOpenId as jest.Mock
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
                getUserByPrimaryEmailAndPassword: jest.fn(async () => {
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
                    findOrganizationUuidByProviderAndEmailDomain: jest.fn(
                        async () => undefined,
                    ),
                } as unknown as OrganizationSsoModel,
                userWarehouseCredentialsModel:
                    {} as UserWarehouseCredentialsModel,
                warehouseAvailableTablesModel:
                    {} as WarehouseAvailableTablesModel,
                projectModel: projectModel as unknown as ProjectModel,
                featureFlagModel: {
                    get: jest.fn(async () => ({
                        id: 'leave-organization',
                        enabled: true,
                    })),
                } as unknown as FeatureFlagModel,
            });

            await expect(
                service.loginWithPassword('user@example.com', 'wrong', {
                    ip: '127.0.0.1',
                    userAgent: 'jest',
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
                        userAgent: 'jest',
                    }),
                    resource: expect.objectContaining({ type: 'Session' }),
                }),
            );
        });

        test('should emit denied audit event for unknown personal access token', async () => {
            const tokenUserModel = {
                ...userModel,
                findSessionUserByPersonalAccessToken: jest.fn(
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
                    findOrganizationUuidByProviderAndEmailDomain: jest.fn(
                        async () => undefined,
                    ),
                } as unknown as OrganizationSsoModel,
                userWarehouseCredentialsModel:
                    {} as UserWarehouseCredentialsModel,
                warehouseAvailableTablesModel:
                    {} as WarehouseAvailableTablesModel,
                projectModel: projectModel as unknown as ProjectModel,
                featureFlagModel: {
                    get: jest.fn(async () => ({
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
                userModel.createPendingUser as jest.Mock,
            ).toHaveBeenCalledTimes(1);
            expect(inviteLinkModel.upsert as jest.Mock).toHaveBeenCalledTimes(
                1,
            );
        });
        test('should send invite when email belongs to user without org', async () => {
            (userModel.findUserByEmail as jest.Mock).mockImplementationOnce(
                async () => userWithoutOrg,
            );
            expect(
                await userService.createPendingUserAndInviteLink(
                    sessionUser,
                    inviteUser,
                ),
            ).toEqual(inviteLink);
            expect(userModel.joinOrg as jest.Mock).toHaveBeenCalledTimes(1);
            expect(
                userModel.createPendingUser as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(inviteLinkModel.upsert as jest.Mock).toHaveBeenCalledTimes(
                1,
            );
        });
        test('should send invite when email belongs to inactive user in same org', async () => {
            (userModel.findUserByEmail as jest.Mock).mockImplementationOnce(
                async () => ({
                    ...userWithoutOrg,
                    isPending: true,
                    organizationUuid: sessionUser.organizationUuid,
                }),
            );
            await userService.createPendingUserAndInviteLink(
                sessionUser,
                inviteUser,
            );
            expect(
                userModel.createPendingUser as jest.Mock,
            ).toHaveBeenCalledTimes(0);
            expect(inviteLinkModel.upsert as jest.Mock).toHaveBeenCalledTimes(
                1,
            );
        });
        test('should throw error when email belongs to user in different org', async () => {
            (userModel.findUserByEmail as jest.Mock).mockImplementationOnce(
                async () => ({
                    ...userWithoutOrg,
                    organizationUuid: 'anotherOrg',
                }),
            );
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
            (userModel.findUserByEmail as jest.Mock).mockImplementationOnce(
                async () => ({
                    ...userWithoutOrg,
                    isActive: true,
                    organizationUuid: sessionUser.organizationUuid,
                }),
            );
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
                userModel.getSessionUserFromCacheOrDB as jest.Mock
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
                projectModel.getProjectsWithDefaultUserSpaces as jest.Mock
            ).mockResolvedValueOnce([]);

            await callOnLogin(service, makeSessionUser());

            expect(projectModel.ensureDefaultUserSpace).not.toHaveBeenCalled();
        });

        test('should create space for interactive viewer', async () => {
            const service = createUserService(lightdashConfigMock);

            (
                projectModel.getProjectsWithDefaultUserSpaces as jest.Mock
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
                projectModel.getProjectsWithDefaultUserSpaces as jest.Mock
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
                projectModel.getProjectsWithDefaultUserSpaces as jest.Mock
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
