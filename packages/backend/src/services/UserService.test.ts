import { OpenIdIdentityIssuerType } from '@lightdash/common';
import { analyticsMock } from '../analytics/LightdashAnalytics.mock';
import EmailClient from '../clients/EmailClient/EmailClient';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { LightdashConfig } from '../config/parseConfig';
import { PersonalAccessTokenModel } from '../models/DashboardModel/PersonalAccessTokenModel';
import { EmailModel } from '../models/EmailModel';
import { GroupsModel } from '../models/GroupsModel';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { OpenIdIdentityModel } from '../models/OpenIdIdentitiesModel';
import { OrganizationAllowedEmailDomainsModel } from '../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from '../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../models/OrganizationModel';
import { PasswordResetLinkModel } from '../models/PasswordResetLinkModel';
import { SessionModel } from '../models/SessionModel';
import { UserModel } from '../models/UserModel';
import { UserWarehouseCredentialsModel } from '../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
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
    findSessionUserByOpenId: jest.fn(async () => undefined),
    findSessionUserByUUID: jest.fn(async () => sessionUser),
    createUser: jest.fn(async () => sessionUser),
    activateUser: jest.fn(async () => sessionUser),
    getOrganizationsForUser: jest.fn(async () => [sessionUser]),
    findUserByEmail: jest.fn(async () => undefined),
    createPendingUser: jest.fn(async () => newUser),
};

const openIdIdentityModel = {
    findIdentitiesByEmail: jest.fn(async () => [openIdIdentity]),
    createIdentity: jest.fn(async () => {}),
    updateIdentityByOpenId: jest.fn(async () => {}),
};

const emailModel = {
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
        userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
    });

jest.spyOn(analyticsMock, 'track');
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
    test('redirect is true if only one option is available', async () => {
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
            forceRedirect: true,
            redirectUri:
                'https://test.lightdash.cloud/api/v1/login/google?login_hint=test%40lightdash.com',
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
            redirectUri:
                'https://test.lightdash.cloud/api/v1/login/azuread?login_hint=test%40lightdash.com',
            showOptions: ['azuread', 'google', 'okta', 'oneLogin', 'email'],
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
            redirectUri:
                'https://test.lightdash.cloud/api/v1/login/azuread?login_hint=test%40lightdash.com',
            showOptions: ['azuread', 'google', 'okta', 'oneLogin'],
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
                    isActive: false,
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
                'Email is already used by a user in another organization',
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
});
