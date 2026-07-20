import { Ability } from '@casl/ability';
import {
    AuthorizationError,
    defineUserAbility,
    EmailStatus,
    ExpiredError,
    FeatureFlags,
    ForbiddenError,
    InviteLinkPurpose,
    LightdashUser,
    NotFoundError,
    OpenIdIdentityIssuerType,
    OrganizationMemberRole,
    ParameterError,
    PasswordResetLink,
    PossibleAbilities,
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
import { UserAvatarModel } from '../models/UserAvatarModel';
import { UserModel } from '../models/UserModel';
import { UserOAuthGrantsModel } from '../models/UserOAuthGrantsModel';
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
    getOpenIdIssuers: vi.fn<UserModel['getOpenIdIssuers']>(async () => []),
    hasOpenIdIdentity: vi.fn<UserModel['hasOpenIdIdentity']>(async () => false),
    hasPassword: vi.fn<UserModel['hasPassword']>(async () => false),
    hasPasswordByEmail: vi.fn<UserModel['hasPasswordByEmail']>(
        async () => false,
    ),
    findSessionUserByOpenId: vi.fn(async () => undefined),
    findSessionUserByUUID: vi.fn<UserModel['findSessionUserByUUID']>(
        async () => sessionUser,
    ),
    getSessionUserFromCacheOrDB: vi.fn(async () => ({
        sessionUser,
        cacheHit: false,
    })),
    createUser: vi.fn<UserModel['createUser']>(async () => sessionUser),
    activateUser: vi.fn(async () => sessionUser),
    activateUserWithoutPassword: vi.fn(async () => sessionUser),
    addProjectMemberships: vi.fn(async () => undefined),
    getOrganizationsForUser: vi.fn(async () => [sessionUser]),
    findUserByEmail: vi.fn<UserModel['findUserByEmail']>(async () => undefined),
    createPendingUser: vi.fn(async () => newUser),
    findSessionUserByPrimaryEmail: vi.fn(async () => sessionUser),
    findServiceAccountByUserUuid: vi.fn(async () => undefined),
    joinOrg: vi.fn(async () => sessionUser),
    hasUsers: vi.fn<UserModel['hasUsers']>(async () => false),
    updateUser: vi.fn(async () => sessionUser),
    upsertPassword: vi.fn<UserModel['upsertPassword']>(async () => undefined),
    getUserDetailsByUuid: vi.fn<UserModel['getUserDetailsByUuid']>(
        async () => userWithoutOrg,
    ),
    delete: vi.fn<UserModel['delete']>(async () => undefined),
};

const userOAuthGrantsModel = {
    upsertGrant: vi.fn<UserOAuthGrantsModel['upsertGrant']>(async () => {}),
    getRefreshToken: vi.fn<UserOAuthGrantsModel['getRefreshToken']>(
        async () => 'refresh-token',
    ),
    deleteGrant: vi.fn<UserOAuthGrantsModel['deleteGrant']>(async () => {}),
};

const openIdIdentityModel = {
    findIdentitiesByEmail: vi.fn(async () => [openIdIdentity]),
    createIdentity: vi.fn(async () => {}),
    updateIdentityByOpenId: vi.fn(async () => {}),
};

const emailModel = {
    createPrimaryEmailOtp: vi.fn<EmailModel['createPrimaryEmailOtp']>(
        async () => ({
            email: 'email',
            isVerified: false,
            otp: { createdAt: new Date(), numberOfAttempts: 0 },
        }),
    ),
    getPrimaryEmailStatus: vi.fn<EmailModel['getPrimaryEmailStatus']>(
        async () =>
            <EmailStatus>{
                email: 'example',
                isVerified: true,
            },
    ),
    getPrimaryEmailStatusByUserAndOtp: vi.fn<
        EmailModel['getPrimaryEmailStatusByUserAndOtp']
    >(async () => ({
        email: 'email',
        isVerified: false,
        otp: { createdAt: new Date(), numberOfAttempts: 0 },
    })),
    incrementPrimaryEmailOtpAttempts: vi.fn<
        EmailModel['incrementPrimaryEmailOtpAttempts']
    >(async () => undefined),
    deleteEmailOtp: vi.fn<EmailModel['deleteEmailOtp']>(async () => undefined),
    verifyUserEmailIfExists: vi.fn<EmailModel['verifyUserEmailIfExists']>(
        async () => [],
    ),
};

const inviteLinkModel = {
    getByCode: vi.fn(async () => inviteLink),
    deleteByCode: vi.fn(async () => undefined),
    upsert: vi.fn(async () => inviteLink),
};

const emailClient = {
    sendInviteEmail: vi.fn(),
    sendOneTimePasscodeEmail: vi.fn(),
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

const organizationAllowedEmailDomainsModel = {
    findAllowedEmailDomains: vi.fn(async () => undefined),
};

const sessionModel = {
    deleteAllByUserUuid: vi.fn<SessionModel['deleteAllByUserUuid']>(
        async () => undefined,
    ),
};

const organizationMemberProfileModel = {
    getOrganizationAdmins: vi.fn<
        OrganizationMemberProfileModel['getOrganizationAdmins']
    >(async () => []),
};

type UserServiceTestOverrides = {
    featureFlagModel?: Pick<FeatureFlagModel, 'get'>;
    organizationAllowedEmailDomainsModel?: Pick<
        OrganizationAllowedEmailDomainsModel,
        'findAllowedEmailDomains'
    >;
    passwordResetLinkModel?: Pick<
        PasswordResetLinkModel,
        'getByCode' | 'deleteByCode'
    >;
};

const createUserService = (
    lightdashConfig: LightdashConfig,
    overrides: UserServiceTestOverrides = {},
) =>
    new UserService({
        analytics: analyticsMock,
        lightdashConfig,
        inviteLinkModel: inviteLinkModel as unknown as InviteLinkModel,
        userModel: userModel as unknown as UserModel,
        userOAuthGrantsModel:
            userOAuthGrantsModel as unknown as UserOAuthGrantsModel,
        groupsModel: {} as GroupsModel,
        sessionModel: sessionModel as unknown as SessionModel,
        emailModel: emailModel as unknown as EmailModel,
        openIdIdentityModel:
            openIdIdentityModel as unknown as OpenIdIdentityModel,
        passwordResetLinkModel:
            (overrides.passwordResetLinkModel as PasswordResetLinkModel) ??
            ({} as PasswordResetLinkModel),
        emailClient: emailClient as unknown as EmailClient,
        organizationMemberProfileModel:
            organizationMemberProfileModel as unknown as OrganizationMemberProfileModel,
        organizationModel: organizationModel as unknown as OrganizationModel,
        personalAccessTokenModel: {} as PersonalAccessTokenModel,
        organizationAllowedEmailDomainsModel:
            (overrides.organizationAllowedEmailDomainsModel as OrganizationAllowedEmailDomainsModel) ??
            (organizationAllowedEmailDomainsModel as unknown as OrganizationAllowedEmailDomainsModel),
        organizationSsoModel:
            organizationSsoModel as unknown as OrganizationSsoModel,
        organizationSettingsModel:
            organizationSettingsModel as unknown as OrganizationSettingsModel,
        userWarehouseCredentialsModel: {} as UserWarehouseCredentialsModel,
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
        projectModel: projectModel as unknown as ProjectModel,
        featureFlagModel:
            (overrides.featureFlagModel as FeatureFlagModel) ??
            ({
                get: vi.fn<FeatureFlagModel['get']>(
                    async ({ featureFlagId }) => ({
                        id: featureFlagId,
                        enabled: featureFlagId !== FeatureFlags.NewOnboarding,
                    }),
                ),
            } as unknown as FeatureFlagModel),
        userAvatarModel: {} as UserAvatarModel,
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

    describe('OAuth grants', () => {
        test('stores a provider grant for the session user', async () => {
            await userService.storeOAuthGrant(
                sessionUser,
                OpenIdIdentityIssuerType.GOOGLE,
                'refresh-token',
                ['scope-a'],
                openIdUser.openId,
            );

            expect(userOAuthGrantsModel.upsertGrant).toHaveBeenCalledWith({
                userUuid: sessionUser.userUuid,
                provider: OpenIdIdentityIssuerType.GOOGLE,
                subject: openIdUser.openId.subject,
                email: openIdUser.openId.email,
                scopes: ['scope-a'],
                refreshToken: 'refresh-token',
            });
        });

        test('reads Google access tokens from OAuth grants', async () => {
            const generateAccessToken = vi
                .spyOn(UserService, 'generateGoogleAccessToken')
                .mockResolvedValueOnce('access-token');

            await expect(
                userService.getAccessToken(sessionUser, 'bigquery'),
            ).resolves.toBe('access-token');
            expect(userOAuthGrantsModel.getRefreshToken).toHaveBeenCalledWith(
                sessionUser.userUuid,
                OpenIdIdentityIssuerType.GOOGLE,
            );
            expect(generateAccessToken).toHaveBeenCalledWith(
                'refresh-token',
                'bigquery',
            );
        });
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

    describe('delete', () => {
        const orglessActor: SessionUser = {
            ...sessionUser,
            userUuid: userWithoutOrg.userUuid,
        };

        test('allows a user without an organization to delete their own account', async () => {
            const service = createUserService(lightdashConfigMock);

            await service.delete(orglessActor, userWithoutOrg.userUuid);

            expect(sessionModel.deleteAllByUserUuid).toHaveBeenCalledWith(
                userWithoutOrg.userUuid,
            );
            expect(userModel.delete).toHaveBeenCalledWith(
                userWithoutOrg.userUuid,
            );
        });

        test('rejects deleting a different user without an organization', async () => {
            const service = createUserService(lightdashConfigMock);

            await expect(
                service.delete(sessionUser, userWithoutOrg.userUuid),
            ).rejects.toThrow(ForbiddenError);
            expect(userModel.delete).not.toHaveBeenCalled();
        });

        test('deletes an org member when the organization has no admins', async () => {
            const memberUser: LightdashUser = {
                ...userWithoutOrg,
                organizationUuid: sessionUser.organizationUuid,
            };
            vi.mocked(userModel.getUserDetailsByUuid).mockResolvedValueOnce(
                memberUser,
            );
            const orgAdmin: SessionUser = {
                ...sessionUser,
                ability: new Ability<PossibleAbilities>([
                    {
                        subject: 'OrganizationMemberProfile',
                        action: ['delete'],
                    },
                ]),
            };
            const service = createUserService(lightdashConfigMock);

            await service.delete(orgAdmin, memberUser.userUuid);

            expect(userModel.delete).toHaveBeenCalledWith(memberUser.userUuid);
        });
    });

    describe('registerOrActivateUser', () => {
        const createFeatureFlagModel = (enabled: boolean) => ({
            get: vi.fn<FeatureFlagModel['get']>(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled,
            })),
        });

        test('registers an email-only user when the feature is enabled', async () => {
            const featureFlagModel = createFeatureFlagModel(true);
            const service = createUserService(lightdashConfigMock, {
                featureFlagModel,
            });
            const loginMethodAllowedSpy = vi
                .spyOn(service, 'isLoginMethodAllowed')
                .mockResolvedValue(true);
            const sendOneTimePasscodeSpy = vi
                .spyOn(service, 'sendOneTimePasscodeToPrimaryEmail')
                .mockResolvedValue({
                    email: 'email-only@example.com',
                    isVerified: false,
                });

            await service.registerOrActivateUser({
                email: 'email-only@example.com',
            });

            expect(featureFlagModel.get).toHaveBeenCalledWith({
                user: undefined,
                featureFlagId: FeatureFlags.NewOnboarding,
            });
            expect(userModel.createUser).toHaveBeenCalledWith({
                firstName: '',
                lastName: '',
                email: 'email-only@example.com',
            });
            expect(loginMethodAllowedSpy).toHaveBeenCalledWith(
                'email-only@example.com',
                'email',
            );
            expect(sendOneTimePasscodeSpy).toHaveBeenCalledWith(
                sessionUser,
                'signup_verification',
            );
            expect(analyticsMock.track).toHaveBeenCalledWith({
                event: 'user.created',
                userId: sessionUser.userUuid,
                properties: {
                    context: 'registration',
                    createdUserId: sessionUser.userUuid,
                    organizationId: sessionUser.organizationUuid,
                    userConnectionType: 'email_only',
                    onboardingFlow: 'new',
                },
            });
        });

        test('rejects an email-only user when the feature is disabled', async () => {
            const featureFlagModel = createFeatureFlagModel(false);
            const service = createUserService(lightdashConfigMock, {
                featureFlagModel,
            });

            await expect(
                service.registerOrActivateUser({
                    email: 'email-only@example.com',
                }),
            ).rejects.toThrow(
                new ForbiddenError('Email-only signup is not enabled'),
            );

            expect(userModel.hasUsers).not.toHaveBeenCalled();
            expect(userModel.createUser).not.toHaveBeenCalled();
        });

        test('keeps full registration independent of the email-only feature', async () => {
            const featureFlagModel = createFeatureFlagModel(false);
            const service = createUserService(lightdashConfigMock, {
                featureFlagModel,
            });
            vi.spyOn(service, 'isLoginMethodAllowed').mockResolvedValue(true);
            const sendOneTimePasscodeSpy = vi
                .spyOn(service, 'sendOneTimePasscodeToPrimaryEmail')
                .mockResolvedValue({
                    email: 'full@example.com',
                    isVerified: false,
                });

            await service.registerOrActivateUser({
                firstName: 'Full',
                lastName: 'User',
                email: 'full@example.com',
                password: 'password1!',
            });

            expect(featureFlagModel.get).toHaveBeenCalledWith({
                user: undefined,
                featureFlagId: FeatureFlags.NewOnboarding,
            });
            expect(userModel.createUser).toHaveBeenCalledWith({
                firstName: 'Full',
                lastName: 'User',
                email: 'full@example.com',
                password: 'password1!',
            });
            expect(sendOneTimePasscodeSpy).toHaveBeenCalledWith(
                sessionUser,
                'signup_verification',
            );
        });
    });

    describe('activateUserFromInviteWithoutPassword', () => {
        const validInviteLink = {
            ...inviteLink,
            email: 'invitee@example.com',
            expiresAt: new Date('2099-01-01'),
        };
        const memberUser = {
            ...sessionUser,
            userUuid: validInviteLink.userUuid,
            email: validInviteLink.email,
            role: OrganizationMemberRole.MEMBER,
        };

        test('activates the invited user without a password and consumes the invite', async () => {
            vi.mocked(inviteLinkModel.getByCode).mockResolvedValueOnce(
                validInviteLink,
            );
            vi.mocked(
                userModel.activateUserWithoutPassword,
            ).mockResolvedValueOnce(memberUser);
            vi.mocked(userModel.findSessionUserByUUID).mockResolvedValueOnce(
                memberUser,
            );
            const service = createUserService(lightdashConfigMock);
            const loginMethodAllowedSpy = vi
                .spyOn(service, 'isLoginMethodAllowed')
                .mockResolvedValue(true);

            await expect(
                service.activateUserFromInviteWithoutPassword(
                    validInviteLink.inviteCode,
                ),
            ).resolves.toEqual(memberUser);

            expect(loginMethodAllowedSpy).toHaveBeenCalledWith(
                validInviteLink.email,
                'email',
            );
            expect(userModel.activateUserWithoutPassword).toHaveBeenCalledWith(
                validInviteLink.userUuid,
            );
            expect(inviteLinkModel.deleteByCode).toHaveBeenCalledWith(
                validInviteLink.inviteCode,
            );
            expect(emailClient.sendOneTimePasscodeEmail).not.toHaveBeenCalled();
            expect(analyticsMock.track).toHaveBeenCalledWith({
                event: 'user.created',
                userId: memberUser.userUuid,
                properties: {
                    context: 'accept_invite',
                    createdUserId: memberUser.userUuid,
                    organizationId: memberUser.organizationUuid,
                    userConnectionType: 'email_only',
                    onboardingFlow: 'legacy',
                },
            });
        });

        test('rejects and consumes an expired invite without activating the user', async () => {
            vi.mocked(inviteLinkModel.getByCode).mockResolvedValueOnce({
                ...validInviteLink,
                expiresAt: new Date('2000-01-01'),
            });
            const service = createUserService(lightdashConfigMock);

            await expect(
                service.activateUserFromInviteWithoutPassword(
                    validInviteLink.inviteCode,
                ),
            ).rejects.toThrow(new ExpiredError('Invite link expired'));

            expect(inviteLinkModel.deleteByCode).toHaveBeenCalledWith(
                validInviteLink.inviteCode,
            );
            expect(
                userModel.activateUserWithoutPassword,
            ).not.toHaveBeenCalled();
        });

        test('returns not found for an unknown invite without activating the user', async () => {
            vi.mocked(inviteLinkModel.getByCode).mockRejectedValueOnce(
                new NotFoundError('No invite link found'),
            );
            const service = createUserService(lightdashConfigMock);

            await expect(
                service.activateUserFromInviteWithoutPassword('unknown'),
            ).rejects.toThrow(new NotFoundError('No invite link found'));

            expect(
                userModel.activateUserWithoutPassword,
            ).not.toHaveBeenCalled();
            expect(inviteLinkModel.deleteByCode).not.toHaveBeenCalled();
        });

        test('returns not found when the same invite is consumed again', async () => {
            vi.mocked(inviteLinkModel.getByCode)
                .mockResolvedValueOnce(validInviteLink)
                .mockRejectedValueOnce(
                    new NotFoundError('No invite link found'),
                );
            vi.mocked(
                userModel.activateUserWithoutPassword,
            ).mockResolvedValueOnce(memberUser);
            const service = createUserService(lightdashConfigMock);
            vi.spyOn(service, 'isLoginMethodAllowed').mockResolvedValue(true);

            await service.activateUserFromInviteWithoutPassword(
                validInviteLink.inviteCode,
            );
            await expect(
                service.activateUserFromInviteWithoutPassword(
                    validInviteLink.inviteCode,
                ),
            ).rejects.toThrow(new NotFoundError('No invite link found'));

            expect(userModel.activateUserWithoutPassword).toHaveBeenCalledTimes(
                1,
            );
        });

        test('applies allowed-domain project memberships for a member invite', async () => {
            const allowedEmailDomainsModel: Pick<
                OrganizationAllowedEmailDomainsModel,
                'findAllowedEmailDomains'
            > = {
                findAllowedEmailDomains: vi.fn<
                    OrganizationAllowedEmailDomainsModel['findAllowedEmailDomains']
                >(async () => ({
                    organizationUuid: memberUser.organizationUuid!,
                    emailDomains: ['example.com'],
                    role: OrganizationMemberRole.MEMBER,
                    projects: [
                        {
                            projectUuid: 'project-uuid',
                            role: ProjectMemberRole.VIEWER,
                        },
                    ],
                })),
            };
            vi.mocked(inviteLinkModel.getByCode).mockResolvedValueOnce(
                validInviteLink,
            );
            vi.mocked(
                userModel.activateUserWithoutPassword,
            ).mockResolvedValueOnce(memberUser);
            const service = createUserService(lightdashConfigMock, {
                organizationAllowedEmailDomainsModel: allowedEmailDomainsModel,
            });
            vi.spyOn(service, 'isLoginMethodAllowed').mockResolvedValue(true);

            await service.activateUserFromInviteWithoutPassword(
                validInviteLink.inviteCode,
            );

            expect(userModel.addProjectMemberships).toHaveBeenCalledWith(
                memberUser.userUuid,
                { 'project-uuid': ProjectMemberRole.VIEWER },
            );
        });

        test('preserves an admin invite role without applying member defaults', async () => {
            const adminUser = {
                ...memberUser,
                role: OrganizationMemberRole.ADMIN,
            };
            vi.mocked(inviteLinkModel.getByCode).mockResolvedValueOnce(
                validInviteLink,
            );
            vi.mocked(
                userModel.activateUserWithoutPassword,
            ).mockResolvedValueOnce(adminUser);
            vi.mocked(userModel.findSessionUserByUUID).mockResolvedValueOnce(
                adminUser,
            );
            const service = createUserService(lightdashConfigMock);
            vi.spyOn(service, 'isLoginMethodAllowed').mockResolvedValue(true);

            await expect(
                service.activateUserFromInviteWithoutPassword(
                    validInviteLink.inviteCode,
                ),
            ).resolves.toMatchObject({ role: OrganizationMemberRole.ADMIN });

            expect(
                organizationAllowedEmailDomainsModel.findAllowedEmailDomains,
            ).not.toHaveBeenCalled();
            expect(userModel.addProjectMemberships).not.toHaveBeenCalled();
        });
    });

    test('keeps password-based invite activation unchanged', async () => {
        vi.mocked(inviteLinkModel.getByCode).mockResolvedValueOnce({
            ...inviteLink,
            expiresAt: new Date('2099-01-01'),
        });
        const service = createUserService(lightdashConfigMock);
        vi.spyOn(service, 'isLoginMethodAllowed').mockResolvedValue(true);
        vi.spyOn(
            service,
            'sendOneTimePasscodeToPrimaryEmail',
        ).mockResolvedValue({
            email: inviteLink.email,
            isVerified: false,
        });
        const activation = {
            firstName: 'Invite',
            lastName: 'User',
            password: 'password1!',
        };

        await service.activateUserFromInvite(inviteLink.inviteCode, activation);

        expect(userModel.activateUser).toHaveBeenCalledWith(
            inviteLink.userUuid,
            activation,
        );
        expect(service.sendOneTimePasscodeToPrimaryEmail).toHaveBeenCalledWith(
            sessionUser,
            'signup_verification',
        );
        expect(analyticsMock.track).toHaveBeenCalledWith({
            event: 'user.created',
            userId: sessionUser.userUuid,
            properties: {
                context: 'accept_invite',
                createdUserId: sessionUser.userUuid,
                organizationId: sessionUser.organizationUuid,
                userConnectionType: 'password',
                onboardingFlow: 'legacy',
            },
        });
    });

    describe('email OTP login', () => {
        const createFeatureFlagModel = (enabled: boolean) => ({
            get: vi.fn<FeatureFlagModel['get']>(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled,
            })),
        });
        const activeOtp = (
            numberOfAttempts = 0,
            createdAt = new Date(),
        ): EmailStatus => ({
            email: 'email',
            isVerified: false,
            otp: { createdAt, numberOfAttempts },
        });
        const expectInvalidCode = async (promise: Promise<unknown>) => {
            await expect(promise).rejects.toMatchObject(
                new AuthorizationError('Invalid or expired code'),
            );
        };

        describe('requestEmailOtpLogin', () => {
            test('sends an OTP for a passwordless account even when the feature flag is disabled', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(false),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                userModel.hasPassword.mockResolvedValueOnce(false);
                userModel.hasOpenIdIdentity.mockResolvedValueOnce(false);

                await service.requestEmailOtpLogin('email');

                expect(emailModel.createPrimaryEmailOtp).toHaveBeenCalled();
                expect(emailClient.sendOneTimePasscodeEmail).toHaveBeenCalled();
            });

            test('does not create or send an OTP for a passworded account', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                userModel.hasPassword.mockResolvedValueOnce(true);

                await expect(
                    service.requestEmailOtpLogin('email'),
                ).resolves.toBeUndefined();

                expect(emailModel.createPrimaryEmailOtp).not.toHaveBeenCalled();
                expect(
                    emailClient.sendOneTimePasscodeEmail,
                ).not.toHaveBeenCalled();
            });

            test('does not create or send an OTP for a nonexistent account', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(undefined);

                await expect(
                    service.requestEmailOtpLogin('missing@example.com'),
                ).resolves.toBeUndefined();

                expect(emailModel.createPrimaryEmailOtp).not.toHaveBeenCalled();
                expect(
                    emailClient.sendOneTimePasscodeEmail,
                ).not.toHaveBeenCalled();
            });

            test('creates and emails an OTP for a passwordless account', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                userModel.hasPassword.mockResolvedValueOnce(false);
                userModel.hasOpenIdIdentity.mockResolvedValueOnce(false);

                await service.requestEmailOtpLogin('EMAIL');

                const [{ passcode, userUuid }] = vi.mocked(
                    emailModel.createPrimaryEmailOtp,
                ).mock.calls[0];
                expect(userUuid).toBe(sessionUser.userUuid);
                expect(passcode).toMatch(/^\d{6}$/);
                expect(
                    emailClient.sendOneTimePasscodeEmail,
                ).toHaveBeenCalledWith({
                    recipient: 'email',
                    passcode,
                });
                expect(analyticsMock.track).toHaveBeenCalledWith({
                    event: 'one_time_passcode.sent',
                    userId: sessionUser.userUuid,
                    properties: {
                        purpose: 'login',
                        isResend: false,
                        onboardingFlow: 'new',
                    },
                });
            });

            test('marks an unexpired OTP replacement as a resend', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                userModel.hasPassword.mockResolvedValueOnce(false);
                userModel.hasOpenIdIdentity.mockResolvedValueOnce(false);
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce(
                    activeOtp(),
                );

                await service.requestEmailOtpLogin('email');

                expect(analyticsMock.track).toHaveBeenCalledWith({
                    event: 'one_time_passcode.sent',
                    userId: sessionUser.userUuid,
                    properties: {
                        purpose: 'login',
                        isResend: true,
                        onboardingFlow: 'new',
                    },
                });
            });
        });

        describe('loginWithEmailOtp', () => {
            test('verifies the email, consumes the OTP, and returns the session user', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                const emailStatus = activeOtp();
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                userModel.hasPassword.mockResolvedValueOnce(false);
                userModel.hasOpenIdIdentity.mockResolvedValueOnce(false);
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce(
                    emailStatus,
                );
                emailModel.getPrimaryEmailStatusByUserAndOtp.mockResolvedValueOnce(
                    emailStatus,
                );
                emailModel.verifyUserEmailIfExists.mockResolvedValueOnce([
                    { email: emailStatus.email },
                ]);

                await expect(
                    service.loginWithEmailOtp('EMAIL', '123456'),
                ).resolves.toBe(sessionUser);

                expect(
                    emailModel.getPrimaryEmailStatusByUserAndOtp,
                ).toHaveBeenCalledWith({
                    userUuid: sessionUser.userUuid,
                    passcode: '123456',
                });
                expect(emailModel.verifyUserEmailIfExists).toHaveBeenCalledWith(
                    sessionUser.userUuid,
                    emailStatus.email,
                );
                expect(emailModel.deleteEmailOtp).toHaveBeenCalledWith(
                    sessionUser.userUuid,
                    emailStatus.email,
                );
                expect(analyticsMock.track).toHaveBeenCalledWith({
                    userId: sessionUser.userUuid,
                    event: 'user.verified',
                    properties: {
                        email: emailStatus.email,
                        location: sessionUser.isSetupComplete
                            ? 'settings'
                            : 'onboarding',
                        isTrackingAnonymized: sessionUser.isTrackingAnonymized,
                        method: 'otp',
                        onboardingFlow: 'new',
                    },
                });
                expect(analyticsMock.track).toHaveBeenCalledWith({
                    userId: sessionUser.userUuid,
                    event: 'user.logged_in',
                    properties: { loginProvider: 'email_otp' },
                });
            });

            test('increments attempts for a wrong code', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce(
                    activeOtp(),
                );
                emailModel.getPrimaryEmailStatusByUserAndOtp.mockRejectedValueOnce(
                    new NotFoundError('No matching OTP'),
                );

                await expectInvalidCode(
                    service.loginWithEmailOtp('email', 'wrong'),
                );

                expect(
                    emailModel.incrementPrimaryEmailOtpAttempts,
                ).toHaveBeenCalledWith(sessionUser.userUuid);
                expect(analyticsMock.track).toHaveBeenCalledWith({
                    event: 'one_time_passcode.failed',
                    userId: sessionUser.userUuid,
                    properties: {
                        purpose: 'login',
                        reason: 'invalid',
                        onboardingFlow: 'new',
                    },
                });
            });

            test('rejects a sixth attempt without comparing the code', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce(
                    activeOtp(5),
                );

                await expectInvalidCode(
                    service.loginWithEmailOtp('email', '123456'),
                );

                expect(
                    emailModel.getPrimaryEmailStatusByUserAndOtp,
                ).not.toHaveBeenCalled();
                expect(
                    emailModel.incrementPrimaryEmailOtpAttempts,
                ).not.toHaveBeenCalled();
                expect(analyticsMock.track).toHaveBeenCalledWith({
                    event: 'one_time_passcode.failed',
                    userId: sessionUser.userUuid,
                    properties: {
                        purpose: 'login',
                        reason: 'max_attempts',
                        onboardingFlow: 'new',
                    },
                });
            });

            test('rejects an expired OTP', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce(
                    activeOtp(0, new Date(Date.now() - 16 * 60 * 1000)),
                );

                await expectInvalidCode(
                    service.loginWithEmailOtp('email', '123456'),
                );

                expect(
                    emailModel.getPrimaryEmailStatusByUserAndOtp,
                ).not.toHaveBeenCalled();
                expect(analyticsMock.track).toHaveBeenCalledWith({
                    event: 'one_time_passcode.failed',
                    userId: sessionUser.userUuid,
                    properties: {
                        purpose: 'login',
                        reason: 'expired',
                        onboardingFlow: 'new',
                    },
                });
            });

            test('rejects a passworded account with the generic error', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                userModel.hasPassword.mockResolvedValueOnce(true);

                await expectInvalidCode(
                    service.loginWithEmailOtp('email', '123456'),
                );

                expect(emailModel.getPrimaryEmailStatus).not.toHaveBeenCalled();
            });

            test('uses the generic error for a nonexistent account', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(undefined);

                await expectInvalidCode(
                    service.loginWithEmailOtp('missing@example.com', '123456'),
                );
            });

            test('signs in a passwordless account even when the feature is disabled', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(false),
                });
                const emailStatus = activeOtp();
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                userModel.hasPassword.mockResolvedValueOnce(false);
                userModel.hasOpenIdIdentity.mockResolvedValueOnce(false);
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce(
                    emailStatus,
                );
                emailModel.getPrimaryEmailStatusByUserAndOtp.mockResolvedValueOnce(
                    emailStatus,
                );
                emailModel.verifyUserEmailIfExists.mockResolvedValueOnce([
                    { email: emailStatus.email },
                ]);

                await expect(
                    service.loginWithEmailOtp('EMAIL', '123456'),
                ).resolves.toBe(sessionUser);
            });
        });

        describe('getPrimaryEmailStatus', () => {
            test.each([
                {
                    status: activeOtp(5),
                    reason: 'max_attempts' as const,
                },
                {
                    status: activeOtp(0, new Date(Date.now() - 16 * 60 * 1000)),
                    reason: 'expired' as const,
                },
            ])(
                'tracks $reason verification failures',
                async ({ status, reason }) => {
                    const service = createUserService(lightdashConfigMock, {
                        featureFlagModel: createFeatureFlagModel(true),
                    });
                    emailModel.getPrimaryEmailStatusByUserAndOtp.mockResolvedValueOnce(
                        status,
                    );

                    await service.getPrimaryEmailStatus(
                        { ...sessionUser, isSetupComplete: false },
                        '123456',
                    );

                    expect(analyticsMock.track).toHaveBeenCalledWith({
                        event: 'one_time_passcode.failed',
                        userId: sessionUser.userUuid,
                        properties: {
                            purpose: 'signup_verification',
                            reason,
                            onboardingFlow: 'new',
                        },
                    });
                },
            );

            test('tracks an invalid verification passcode', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                emailModel.getPrimaryEmailStatusByUserAndOtp.mockRejectedValueOnce(
                    new NotFoundError('No matching OTP'),
                );

                await service.getPrimaryEmailStatus(sessionUser, 'wrong');

                expect(analyticsMock.track).toHaveBeenCalledWith({
                    event: 'one_time_passcode.failed',
                    userId: sessionUser.userUuid,
                    properties: {
                        purpose: 'email_change',
                        reason: 'invalid',
                        onboardingFlow: 'new',
                    },
                });
            });
        });
    });

    describe('resetPassword', () => {
        test('upserts the first password for a passwordless user', async () => {
            const resetLink: PasswordResetLink = {
                code: 'reset-code',
                email: 'passwordless@example.com',
                expiresAt: new Date(Date.now() + 60_000),
                url: 'https://example.com/reset-password/reset-code',
                isExpired: false,
            };
            const passwordResetLinkModel = {
                getByCode: vi.fn<PasswordResetLinkModel['getByCode']>(
                    async () => resetLink,
                ),
                deleteByCode: vi.fn<PasswordResetLinkModel['deleteByCode']>(
                    async () => undefined,
                ),
            };
            const service = createUserService(lightdashConfigMock, {
                passwordResetLinkModel,
            });
            userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);

            await service.resetPassword({
                code: resetLink.code,
                newPassword: 'new-password1!',
            });

            expect(userModel.upsertPassword).toHaveBeenCalledWith(
                sessionUser.userUuid,
                'new-password1!',
            );
            expect(passwordResetLinkModel.deleteByCode).toHaveBeenCalledWith(
                resetLink.code,
            );
        });
    });

    describe('getLoginOptions email OTP', () => {
        const createFeatureFlagModel = (enabled: boolean) => ({
            get: vi.fn<FeatureFlagModel['get']>(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled,
            })),
        });

        test('replaces email with email OTP for a passwordless user when enabled', async () => {
            const featureFlagModel = createFeatureFlagModel(true);
            const service = createUserService(lightdashConfigMock, {
                featureFlagModel,
            });
            userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
            userModel.hasPassword.mockResolvedValueOnce(false);
            userModel.hasOpenIdIdentity.mockResolvedValueOnce(false);

            await expect(service.getLoginOptions('email')).resolves.toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['emailOtp'],
            });
        });

        test('still shows email OTP for a passwordless user when the feature is disabled', async () => {
            const service = createUserService(lightdashConfigMock, {
                featureFlagModel: createFeatureFlagModel(false),
            });
            userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
            userModel.hasPassword.mockResolvedValueOnce(false);
            userModel.hasOpenIdIdentity.mockResolvedValueOnce(false);

            await expect(service.getLoginOptions('email')).resolves.toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['emailOtp'],
            });
        });

        test('keeps email unchanged for a passworded user', async () => {
            const service = createUserService(lightdashConfigMock, {
                featureFlagModel: createFeatureFlagModel(true),
            });
            userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
            userModel.hasPassword.mockResolvedValueOnce(true);

            await expect(service.getLoginOptions('email')).resolves.toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email'],
            });
        });

        test('keeps SSO options unchanged for an OpenID user', async () => {
            const service = createUserService(
                {
                    ...lightdashConfigMock,
                    auth: {
                        ...lightdashConfigMock.auth,
                        okta: {
                            ...lightdashConfigMock.auth.okta,
                            oauth2ClientId: 'client-id',
                            loginPath: '/login/okta',
                        },
                    },
                },
                { featureFlagModel: createFeatureFlagModel(true) },
            );
            userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
            userModel.hasPassword.mockResolvedValueOnce(false);
            userModel.hasOpenIdIdentity.mockResolvedValueOnce(true);
            userModel.getOpenIdIssuers.mockResolvedValueOnce([
                OpenIdIdentityIssuerType.OKTA,
            ]);

            await expect(service.getLoginOptions('email')).resolves.toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/okta?login_hint=email',
                showOptions: ['okta'],
            });
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
        test('rejects a link flow when the identity belongs to another user', async () => {
            const currentUser: SessionUser = {
                ...authenticatedUser,
                userUuid: 'current-user-uuid',
            };
            (
                userModel.findSessionUserByOpenId as import('vitest').Mock
            ).mockResolvedValueOnce(sessionUser);

            await expect(
                userService.loginWithOpenId(
                    openIdUser,
                    currentUser,
                    undefined,
                    undefined,
                    undefined,
                    { isLinkFlow: true },
                ),
            ).rejects.toThrowError(
                new ForbiddenError(
                    'This Google account is already connected to another Lightdash user',
                ),
            );

            expect(
                openIdIdentityModel.updateIdentityByOpenId,
            ).not.toHaveBeenCalled();
            expect(auditLogSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'login',
                    status: 'denied',
                    actor: expect.objectContaining({ uuid: 'unknown' }),
                }),
            );
        });
        test('keeps the same user in a link flow when they own the identity', async () => {
            const currentUser: SessionUser = { ...sessionUser };
            (
                userModel.findSessionUserByOpenId as import('vitest').Mock
            ).mockResolvedValueOnce(sessionUser);

            const result = await userService.loginWithOpenId(
                openIdUser,
                currentUser,
                undefined,
                undefined,
                undefined,
                { isLinkFlow: true },
            );

            expect(result).toEqual(currentUser);
            expect(
                openIdIdentityModel.updateIdentityByOpenId,
            ).toHaveBeenCalledTimes(1);
        });
        test('rejects a link flow without an authenticated user', async () => {
            await expect(
                userService.loginWithOpenId(
                    openIdUser,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    { isLinkFlow: true },
                ),
            ).rejects.toThrowError(
                new AuthorizationError(
                    'You must be logged in to connect a Google account',
                ),
            );

            expect(userModel.findSessionUserByOpenId).not.toHaveBeenCalled();
        });
        test('logs in as the identity owner in a non-link flow', async () => {
            const currentUser: SessionUser = {
                ...authenticatedUser,
                userUuid: 'current-user-uuid',
            };
            (
                userModel.findSessionUserByOpenId as import('vitest').Mock
            ).mockResolvedValueOnce(sessionUser);

            const result = await userService.loginWithOpenId(
                openIdUser,
                currentUser,
                undefined,
                undefined,
                undefined,
                { isLinkFlow: false },
            );

            expect(result.userUuid).toBe(sessionUser.userUuid);
            expect(result.userUuid).not.toBe(currentUser.userUuid);
            expect(
                openIdIdentityModel.updateIdentityByOpenId,
            ).toHaveBeenCalledTimes(1);
        });
        test('should update openid', async () => {
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
                userOAuthGrantsModel:
                    userOAuthGrantsModel as unknown as UserOAuthGrantsModel,
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
                userAvatarModel: {} as UserAvatarModel,
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
                userOAuthGrantsModel:
                    userOAuthGrantsModel as unknown as UserOAuthGrantsModel,
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
                userAvatarModel: {} as UserAvatarModel,
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
        test('should default the purpose to member', async () => {
            await userService.createPendingUserAndInviteLink(
                sessionUser,
                inviteUser,
            );

            expect(vi.mocked(inviteLinkModel.upsert)).toHaveBeenCalledWith(
                expect.any(String),
                inviteUser.expiresAt,
                sessionUser.organizationUuid,
                newUser.userUuid,
                InviteLinkPurpose.Member,
            );
        });
        test('should force setup invites to use the admin role', async () => {
            const adminUser = {
                ...sessionUser,
                ability: defineUserAbility(
                    {
                        userUuid: sessionUser.userUuid,
                        role: OrganizationMemberRole.ADMIN,
                        organizationUuid: sessionUser.organizationUuid,
                        roleUuid: undefined,
                    },
                    [],
                ),
            };
            const setupInviteLink = {
                ...inviteLink,
                purpose: InviteLinkPurpose.Setup,
            };
            vi.mocked(inviteLinkModel.upsert).mockResolvedValueOnce(
                setupInviteLink,
            );

            await userService.createPendingUserAndInviteLink(adminUser, {
                ...inviteUser,
                role: OrganizationMemberRole.MEMBER,
                purpose: InviteLinkPurpose.Setup,
            });

            expect(vi.mocked(userModel.createPendingUser)).toHaveBeenCalledWith(
                sessionUser.organizationUuid,
                {
                    email: inviteUser.email,
                    firstName: '',
                    lastName: '',
                    role: OrganizationMemberRole.ADMIN,
                },
            );
            expect(vi.mocked(inviteLinkModel.upsert)).toHaveBeenCalledWith(
                expect.any(String),
                inviteUser.expiresAt,
                sessionUser.organizationUuid,
                newUser.userUuid,
                InviteLinkPurpose.Setup,
            );
            expect(vi.mocked(emailClient.sendInviteEmail)).toHaveBeenCalledWith(
                adminUser,
                setupInviteLink,
            );
        });
        test('should reject setup invites when the caller cannot grant roles', async () => {
            await expect(
                userService.createPendingUserAndInviteLink(sessionUser, {
                    ...inviteUser,
                    purpose: InviteLinkPurpose.Setup,
                }),
            ).rejects.toThrowError(
                new ForbiddenError(
                    'A setup invite requires permission to grant the admin role',
                ),
            );

            expect(
                vi.mocked(userModel.createPendingUser),
            ).not.toHaveBeenCalled();
            expect(vi.mocked(inviteLinkModel.upsert)).not.toHaveBeenCalled();
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
