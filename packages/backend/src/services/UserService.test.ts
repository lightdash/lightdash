import { Ability } from '@casl/ability';
import {
    AnyType,
    AuthorizationError,
    CommercialFeatureFlags,
    DeactivatedAccountError,
    defineUserAbility,
    EmailStatus,
    ExpiredError,
    FeatureFlags,
    ForbiddenError,
    getUserAbilityBuilder,
    InviteLinkPurpose,
    LightdashUser,
    LocalIssuerTypes,
    NotFoundError,
    OpenIdIdentityIssuerType,
    OrganizationMemberProfile,
    OrganizationMemberRole,
    OrganizationSsoProvider,
    ParameterError,
    PasswordResetLink,
    PossibleAbilities,
    ProjectMemberRole,
    SessionUser,
    SnowflakeAuthenticationType,
    WarehouseTypes,
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
import { RolesModel } from '../models/RolesModel';
import { SessionModel } from '../models/SessionModel';
import { UserAvatarModel } from '../models/UserAvatarModel';
import { UserModel } from '../models/UserModel';
import { UserOAuthGrantsModel } from '../models/UserOAuthGrantsModel';
import { UserOnboardingModel } from '../models/UserOnboardingModel';
import { UserWarehouseCredentialsModel } from '../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { getOrganizationSystemRoleScopes } from '../utils/organizationRolePermissions';
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
    findSessionUserByOpenId: vi.fn<UserModel['findSessionUserByOpenId']>(
        async () => undefined,
    ),
    findSessionUserByUUID: vi.fn<UserModel['findSessionUserByUUID']>(
        async () => sessionUser,
    ),
    findSessionUserAndOrgByUuid: vi.fn<
        UserModel['findSessionUserAndOrgByUuid']
    >(async () => sessionUser),
    getSessionUserFromCacheOrDB: vi.fn(async () => ({
        sessionUser,
        cacheHit: false,
    })),
    invalidateSessionUserCache: vi.fn(),
    createUser: vi.fn<UserModel['createUser']>(async () => sessionUser),
    activateUser: vi.fn(async () => sessionUser),
    activateUserWithoutPassword: vi.fn(async () => sessionUser),
    addProjectMemberships: vi.fn(async () => undefined),
    getOrganizationsForUser: vi.fn<UserModel['getOrganizationsForUser']>(
        async () => [sessionUser],
    ),
    getUserByPrimaryEmailAndPassword: vi.fn<
        UserModel['getUserByPrimaryEmailAndPassword']
    >(async () => userWithoutOrg),
    findUserByEmail: vi.fn<UserModel['findUserByEmail']>(async () => undefined),
    createPendingUser: vi.fn<UserModel['createPendingUser']>(
        async () => newUser,
    ),
    findSessionUserByPrimaryEmail: vi.fn<
        UserModel['findSessionUserByPrimaryEmail']
    >(async () => sessionUser),
    findSessionUserByPersonalAccessToken: vi.fn<
        UserModel['findSessionUserByPersonalAccessToken']
    >(async () => undefined),
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
    findAllPolicySummaries: vi.fn<
        OrganizationSsoModel['findAllPolicySummaries']
    >(async () => []),
    findEnabledMethodsForEmailDomain: vi.fn<
        OrganizationSsoModel['findEnabledMethodsForEmailDomain']
    >(async () => []),
    findGoogleMethodsForEmailDomain: vi.fn<
        OrganizationSsoModel['findGoogleMethodsForEmailDomain']
    >(async () => []),
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
    getOrganizationMemberByUuid:
        vi.fn<OrganizationMemberProfileModel['getOrganizationMemberByUuid']>(),
    getOrganizationAdmins: vi.fn<
        OrganizationMemberProfileModel['getOrganizationAdmins']
    >(async () => []),
    getAllOrganizationMembers: vi.fn<
        OrganizationMemberProfileModel['getAllOrganizationMembers']
    >(async () => []),
};

type UserServiceTestOverrides = {
    featureFlagModel?: Pick<FeatureFlagModel, 'get'>;
    userWarehouseCredentialsModel?: Partial<UserWarehouseCredentialsModel>;
    personalAccessTokenModel?: Pick<
        PersonalAccessTokenModel,
        'delete' | 'updateUsedDate'
    >;
    organizationAllowedEmailDomainsModel?: Pick<
        OrganizationAllowedEmailDomainsModel,
        'findAllowedEmailDomains'
    >;
    passwordResetLinkModel?: Pick<
        PasswordResetLinkModel,
        'getByCode' | 'deleteByCode'
    >;
    rolesModel?: Partial<
        Pick<
            RolesModel,
            'getRoleWithScopesByUuid' | 'getOrganizationUserRoleSet'
        >
    >;
};

// Delegation checks read the caller's extra custom roles; default to none.
const rolesModelWithoutExtraRoles = {
    getOrganizationUserRoleSet: vi.fn(async () => ({
        systemRole: null,
        customRoleUuids: [],
    })),
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
        personalAccessTokenModel:
            (overrides.personalAccessTokenModel as PersonalAccessTokenModel) ??
            ({} as PersonalAccessTokenModel),
        organizationAllowedEmailDomainsModel:
            (overrides.organizationAllowedEmailDomainsModel as OrganizationAllowedEmailDomainsModel) ??
            (organizationAllowedEmailDomainsModel as unknown as OrganizationAllowedEmailDomainsModel),
        organizationSsoModel:
            organizationSsoModel as unknown as OrganizationSsoModel,
        organizationSettingsModel:
            organizationSettingsModel as unknown as OrganizationSettingsModel,
        userWarehouseCredentialsModel:
            (overrides.userWarehouseCredentialsModel as UserWarehouseCredentialsModel) ??
            ({} as UserWarehouseCredentialsModel),
        warehouseAvailableTablesModel: {} as WarehouseAvailableTablesModel,
        projectModel: projectModel as unknown as ProjectModel,
        featureFlagModel:
            (overrides.featureFlagModel as FeatureFlagModel) ??
            ({
                get: vi.fn<FeatureFlagModel['get']>(
                    async ({ featureFlagId }) => ({
                        id: featureFlagId,
                        // Default to unflagged (main) behavior for the two
                        // opt-out-shaped flags; every other flag defaults on.
                        enabled:
                            featureFlagId !== FeatureFlags.NewOnboarding &&
                            featureFlagId !==
                                CommercialFeatureFlags.PatScopeAuthoritative,
                    }),
                ),
            } as unknown as FeatureFlagModel),
        userAvatarModel: {} as UserAvatarModel,
        userOnboardingModel: {} as UserOnboardingModel,
        rolesModel: {
            ...rolesModelWithoutExtraRoles,
            ...overrides.rolesModel,
        } as unknown as RolesModel,
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

    describe('organization selection during login', () => {
        const selectedOrganization = {
            organizationUuid: 'selected-organization-uuid',
            organizationName: 'Selected organization',
            organizationCreatedAt: new Date('2025-01-01T00:00:00.000Z'),
        };
        const otherOrganization = {
            organizationUuid: 'other-organization-uuid',
            organizationName: 'Other organization',
            organizationCreatedAt: new Date('2025-01-02T00:00:00.000Z'),
        };
        const organizationlessSessionUser: SessionUser = { ...sessionUser };
        delete organizationlessSessionUser.organizationUuid;
        delete organizationlessSessionUser.organizationName;
        delete organizationlessSessionUser.organizationCreatedAt;
        delete organizationlessSessionUser.role;

        test('allows password login for a user without an organization', async () => {
            userModel.getOrganizationsForUser.mockResolvedValueOnce([]);

            const result = await userService.loginWithPassword(
                'user@example.com',
                'password',
            );

            expect(result).not.toHaveProperty('organizationUuid');
        });

        test('rejects password login for a user in multiple organizations', async () => {
            userModel.getOrganizationsForUser.mockResolvedValueOnce([
                selectedOrganization,
                otherOrganization,
            ]);

            await expect(
                userService.loginWithPassword('user@example.com', 'password'),
            ).rejects.toThrow(
                new ForbiddenError('User is part of multiple organizations'),
            );
        });

        test('returns the resolved organization for a single-organization password login', async () => {
            userModel.getOrganizationsForUser.mockResolvedValueOnce([
                selectedOrganization,
            ]);

            await expect(
                userService.loginWithPassword('user@example.com', 'password'),
            ).resolves.toEqual({
                ...userWithoutOrg,
                ...selectedOrganization,
            });
        });

        test('allows OpenID login for a user without an organization', async () => {
            userModel.findSessionUserByOpenId.mockResolvedValueOnce(
                organizationlessSessionUser,
            );
            userModel.getOrganizationsForUser.mockResolvedValueOnce([]);

            const result = await userService.loginWithOpenId(
                openIdUser,
                undefined,
                undefined,
            );

            expect(result).not.toHaveProperty('organizationUuid');
        });

        test('rejects OpenID login for a user in multiple organizations', async () => {
            userModel.findSessionUserByOpenId.mockResolvedValueOnce(
                organizationlessSessionUser,
            );
            userModel.getOrganizationsForUser.mockResolvedValueOnce([
                selectedOrganization,
                otherOrganization,
            ]);

            await expect(
                userService.loginWithOpenId(openIdUser, undefined, undefined),
            ).rejects.toThrow(
                new ForbiddenError('User is part of multiple organizations'),
            );
        });

        test('returns the resolved organization for a single-organization OpenID login', async () => {
            userModel.findSessionUserByOpenId.mockResolvedValueOnce(
                organizationlessSessionUser,
            );
            userModel.getOrganizationsForUser.mockResolvedValueOnce([
                selectedOrganization,
            ]);

            await expect(
                userService.loginWithOpenId(openIdUser, undefined, undefined),
            ).resolves.toEqual({
                ...organizationlessSessionUser,
                ...selectedOrganization,
            });
        });
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
                organizationUuid: organisation.organizationUuid,
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

    describe('getAccountByUserUuidAndOrg', () => {
        test('should preserve the requested organization for normal users', async () => {
            const account = await userService.getAccountByUserUuidAndOrg(
                'userUuid',
                'organizationUuid',
            );

            expect(userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledWith(
                'userUuid',
                'organizationUuid',
            );
            expect(account.isSessionUser()).toBe(true);
            expect(account.isServiceAccount()).toBe(false);
        });

        test('should preserve service-account authentication', async () => {
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
                organizationUuid: organisation.organizationUuid,
            });

            const account = await service.getAccountByUserUuidAndOrg(
                'userUuid',
                organisation.organizationUuid,
            );

            expect(account.isServiceAccount()).toBe(true);
            expect(account.authentication).toMatchObject({
                type: 'service-account',
                serviceAccountUuid: 'service-account-uuid',
                serviceAccountDescription: 'CI preview',
            });
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

        test.each([
            { firstName: '<script>alert(1)</script>' },
            { lastName: '<img src=x onerror=alert(1)>' },
        ])('rejects HTML in a user name before persisting', async (data) => {
            await expect(
                userService.updateUser(sessionUser, data),
            ).rejects.toThrow(
                new ParameterError(
                    'First name and last name must not contain HTML',
                ),
            );
            expect(userModel.updateUser).not.toHaveBeenCalled();
        });
    });

    describe('completeUserSetup', () => {
        test('persists and tracks a trimmed answer', async () => {
            await userService.completeUserSetup(sessionUser, {
                jobTitle: '',
                howDidYouHearAboutUs: '  A podcast  ',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            });

            expect(vi.mocked(userModel.updateUser)).toHaveBeenCalledWith(
                sessionUser.userUuid,
                undefined,
                {
                    isSetupComplete: true,
                    isTrackingAnonymized: false,
                    isMarketingOptedIn: true,
                    howDidYouHearAboutUs: 'A podcast',
                },
            );
            expect(vi.mocked(analyticsMock.track)).toHaveBeenCalledWith({
                event: 'hear_about_us.submitted',
                userId: sessionUser.userUuid,
                properties: {
                    organizationId: sessionUser.organizationUuid,
                    onboardingFlow: 'legacy',
                    answered: true,
                    answer: 'A podcast',
                },
            });
        });

        test('persists and tracks a skipped answer', async () => {
            await userService.completeUserSetup(sessionUser, {
                jobTitle: '',
                howDidYouHearAboutUs: '',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            });

            expect(vi.mocked(userModel.updateUser)).toHaveBeenCalledWith(
                sessionUser.userUuid,
                undefined,
                {
                    isSetupComplete: true,
                    isTrackingAnonymized: false,
                    isMarketingOptedIn: true,
                    howDidYouHearAboutUs: '',
                },
            );
            expect(vi.mocked(analyticsMock.track)).toHaveBeenCalledWith({
                event: 'hear_about_us.submitted',
                userId: sessionUser.userUuid,
                properties: {
                    organizationId: sessionUser.organizationUuid,
                    onboardingFlow: 'legacy',
                    answered: false,
                    answer: null,
                },
            });
        });

        test('does not track when the referral answer is omitted (invited member)', async () => {
            await userService.completeUserSetup(sessionUser, {
                jobTitle: '',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: true,
                isTrackingAnonymized: false,
            });

            expect(vi.mocked(userModel.updateUser)).toHaveBeenCalledWith(
                sessionUser.userUuid,
                undefined,
                {
                    isSetupComplete: true,
                    isTrackingAnonymized: false,
                    isMarketingOptedIn: true,
                    howDidYouHearAboutUs: undefined,
                },
            );
            expect(vi.mocked(analyticsMock.track)).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'hear_about_us.submitted',
                }),
            );
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

    describe('leaveOrganization', () => {
        const organizationMember = (
            role: OrganizationMemberRole,
            userUuid = sessionUser.userUuid,
        ): OrganizationMemberProfile => ({
            userUuid,
            userCreatedAt: new Date(),
            userUpdatedAt: new Date(),
            firstName: 'First',
            lastName: 'Last',
            email: `${userUuid}@example.com`,
            organizationUuid: organisation.organizationUuid,
            role,
            roleUuid: undefined,
            isActive: true,
            avatarUrl: null,
            avatarGradient: null,
        });
        const userDetails: LightdashUser = {
            ...userWithoutOrg,
            userUuid: sessionUser.userUuid,
            organizationUuid: sessionUser.organizationUuid,
        };

        test('refuses the sole admin and emits a denied audit event', async () => {
            const admin = organizationMember(OrganizationMemberRole.ADMIN);
            vi.mocked(
                organizationMemberProfileModel.getOrganizationMemberByUuid,
            ).mockResolvedValueOnce(admin);
            vi.mocked(
                organizationMemberProfileModel.getOrganizationAdmins,
            ).mockResolvedValueOnce([admin]);
            const service = createUserService(lightdashConfigMock);

            await expect(
                service.leaveOrganization(sessionUser),
            ).rejects.toThrow(ForbiddenError);

            expect(auditLogSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'leave_organization',
                    status: 'denied',
                    reason: 'Last admin in organization',
                    actor: expect.objectContaining({
                        uuid: sessionUser.userUuid,
                    }),
                    resource: expect.objectContaining({
                        type: 'OrganizationMembership',
                        organizationUuid: sessionUser.organizationUuid,
                        metadata: { role: OrganizationMemberRole.ADMIN },
                    }),
                }),
            );
            expect(userModel.delete).not.toHaveBeenCalled();
        });

        test('allows an admin to leave when another admin remains', async () => {
            const admin = organizationMember(OrganizationMemberRole.ADMIN);
            const coAdmin = organizationMember(
                OrganizationMemberRole.ADMIN,
                'co-admin-uuid',
            );
            vi.mocked(
                organizationMemberProfileModel.getOrganizationMemberByUuid,
            ).mockResolvedValueOnce(admin);
            vi.mocked(
                organizationMemberProfileModel.getOrganizationAdmins,
            ).mockResolvedValueOnce([admin, coAdmin]);
            vi.mocked(userModel.getUserDetailsByUuid).mockResolvedValueOnce(
                userDetails,
            );
            const service = createUserService(lightdashConfigMock);

            await service.leaveOrganization(sessionUser);

            expect(userModel.delete).toHaveBeenCalledWith(sessionUser.userUuid);
        });

        test('allows a non-admin member to leave', async () => {
            const member = organizationMember(OrganizationMemberRole.MEMBER);
            const admin = organizationMember(
                OrganizationMemberRole.ADMIN,
                'admin-uuid',
            );
            vi.mocked(
                organizationMemberProfileModel.getOrganizationMemberByUuid,
            ).mockResolvedValueOnce(member);
            vi.mocked(
                organizationMemberProfileModel.getOrganizationAdmins,
            ).mockResolvedValueOnce([admin]);
            vi.mocked(userModel.getUserDetailsByUuid).mockResolvedValueOnce(
                userDetails,
            );
            const service = createUserService(lightdashConfigMock);
            const memberUser = {
                ...sessionUser,
                role: OrganizationMemberRole.MEMBER,
            };

            await service.leaveOrganization(memberUser);

            expect(userModel.delete).toHaveBeenCalledWith(sessionUser.userUuid);
        });
    });

    describe('registerOrActivateUser', () => {
        const createFeatureFlagModel = (enabled: boolean) => ({
            get: vi.fn<FeatureFlagModel['get']>(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled,
            })),
        });

        test('rejects HTML in a user name before registration', async () => {
            await expect(
                userService.registerOrActivateUser({
                    firstName: '<svg onload=alert(1)>',
                    lastName: 'User',
                    email: 'xss@example.com',
                    password: 'password1!',
                }),
            ).rejects.toThrow(
                new ParameterError(
                    'First name and last name must not contain HTML',
                ),
            );
            expect(userModel.createUser).not.toHaveBeenCalled();
        });

        test('registers an email-only user when the feature is enabled', async () => {
            const featureFlagModel = createFeatureFlagModel(true);
            const service = createUserService(
                {
                    ...lightdashConfigMock,
                    smtp: {
                        host: 'localhost',
                        port: 587,
                        secure: false,
                        allowInvalidCertificate: false,
                        useAuth: false,
                        auth: {
                            user: '',
                            pass: undefined,
                            accessToken: undefined,
                        },
                        sender: {
                            name: 'Lightdash',
                            email: 'lightdash@example.com',
                        },
                        inlineImageCid: false,
                    },
                },
                {
                    featureFlagModel,
                },
            );
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
            expect(vi.mocked(userModel.createUser)).toHaveBeenCalledWith(
                {
                    firstName: '',
                    lastName: '',
                    email: 'email-only@example.com',
                },
                true,
                false,
            );
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
                    isOrganizationCreator: true,
                },
            });
        });

        test('rejects an email-only user without an email server', async () => {
            const featureFlagModel = createFeatureFlagModel(true);
            const service = createUserService(
                { ...lightdashConfigMock, smtp: undefined },
                {
                    featureFlagModel,
                },
            );

            await expect(
                service.registerOrActivateUser({
                    email: 'email-only@example.com',
                }),
            ).rejects.toThrow(
                new ForbiddenError(
                    'Email-only signup requires an email server to be configured',
                ),
            );

            expect(userModel.createUser).not.toHaveBeenCalled();
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
            expect(vi.mocked(userModel.createUser)).toHaveBeenCalledWith(
                {
                    firstName: 'Full',
                    lastName: 'User',
                    email: 'full@example.com',
                    password: 'password1!',
                },
                true,
                undefined,
            );
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
                    isOrganizationCreator: false,
                },
            });
        });

        test('requires SSO instead of activating the invited user when local authentication is disabled', async () => {
            vi.mocked(inviteLinkModel.getByCode).mockResolvedValueOnce(
                validInviteLink,
            );
            const service = createUserService(lightdashConfigMock);
            vi.spyOn(service, 'isLoginMethodAllowed').mockResolvedValue(false);

            await expect(
                service.activateUserFromInviteWithoutPassword(
                    validInviteLink.inviteCode,
                ),
            ).rejects.toThrow(
                new ForbiddenError('Your organisation requires SSO sign-in'),
            );

            expect(
                userModel.activateUserWithoutPassword,
            ).not.toHaveBeenCalled();
            expect(inviteLinkModel.deleteByCode).not.toHaveBeenCalled();
        });

        test('rejects an expired invite without activating the user', async () => {
            vi.mocked(inviteLinkModel.getByCode).mockRejectedValueOnce(
                new ExpiredError('Invite link expired'),
            );
            const service = createUserService(lightdashConfigMock);

            await expect(
                service.activateUserFromInviteWithoutPassword(
                    validInviteLink.inviteCode,
                ),
            ).rejects.toThrow(new ExpiredError('Invite link expired'));

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

    describe('getInviteLinkWithAuthenticationOptions', () => {
        test('returns the SSO provider and disables local invite flows when SSO is required', async () => {
            vi.mocked(inviteLinkModel.getByCode).mockResolvedValueOnce(
                inviteLink,
            );
            const service = createUserService(lightdashConfigMock);
            vi.spyOn(service, 'getLoginOptions').mockResolvedValue({
                showOptions: [OpenIdIdentityIssuerType.GOOGLE],
                forceRedirect: true,
                redirectUri: 'https://example.com/api/v1/login/google',
            });
            vi.spyOn(service, 'isLoginMethodAllowed').mockResolvedValue(false);

            await expect(
                service.getInviteLinkWithAuthenticationOptions(
                    inviteLink.inviteCode,
                ),
            ).resolves.toEqual({
                ...inviteLink,
                authentication: {
                    allowOneClickActivation: false,
                    allowPasswordSignup: false,
                    ssoProviders: [OpenIdIdentityIssuerType.GOOGLE],
                },
            });
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
                isOrganizationCreator: false,
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
                const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
                emailModel.getPrimaryEmailStatus
                    .mockResolvedValueOnce(activeOtp(0, twoMinutesAgo))
                    .mockResolvedValueOnce(activeOtp(0, twoMinutesAgo));

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

            test('does not re-issue an OTP within the resend interval', async () => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                userModel.findUserByEmail.mockResolvedValueOnce(sessionUser);
                userModel.hasPassword.mockResolvedValueOnce(false);
                userModel.hasOpenIdIdentity.mockResolvedValueOnce(false);
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce(
                    activeOtp(),
                );

                await expect(
                    service.requestEmailOtpLogin('email'),
                ).resolves.toBeUndefined();

                expect(emailModel.createPrimaryEmailOtp).not.toHaveBeenCalled();
                expect(
                    emailClient.sendOneTimePasscodeEmail,
                ).not.toHaveBeenCalled();
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
                ).resolves.toEqual(sessionUser);

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

            test('rejects OTP login for a user in multiple organizations', async () => {
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
                userModel.getOrganizationsForUser.mockResolvedValueOnce([
                    {
                        organizationUuid: 'first-organization-uuid',
                        organizationName: 'First organization',
                        organizationCreatedAt: new Date(
                            '2025-01-01T00:00:00.000Z',
                        ),
                    },
                    {
                        organizationUuid: 'second-organization-uuid',
                        organizationName: 'Second organization',
                        organizationCreatedAt: new Date(
                            '2025-01-02T00:00:00.000Z',
                        ),
                    },
                ]);

                await expect(
                    service.loginWithEmailOtp('EMAIL', '123456'),
                ).rejects.toThrow(
                    new ForbiddenError(
                        'User is part of multiple organizations',
                    ),
                );

                expect(emailModel.deleteEmailOtp).not.toHaveBeenCalled();
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
                ).resolves.toEqual(sessionUser);
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

        describe('onboarding step gating', () => {
            const verifyEmailAs = async (user: SessionUser) => {
                const service = createUserService(lightdashConfigMock, {
                    featureFlagModel: createFeatureFlagModel(true),
                });
                const emailStatus = activeOtp();
                emailModel.getPrimaryEmailStatusByUserAndOtp.mockResolvedValueOnce(
                    emailStatus,
                );
                emailModel.verifyUserEmailIfExists.mockResolvedValueOnce([
                    { email: emailStatus.email },
                ]);

                await service.getPrimaryEmailStatus(user, '123456');

                return emailStatus;
            };

            test('emits the verified step when verifying during onboarding', async () => {
                const onboardingUser: SessionUser = {
                    ...sessionUser,
                    isSetupComplete: false,
                };

                const emailStatus = await verifyEmailAs(onboardingUser);

                expect(analyticsMock.track).toHaveBeenCalledWith({
                    userId: onboardingUser.userUuid,
                    event: 'user.verified',
                    properties: {
                        email: emailStatus.email,
                        location: 'onboarding',
                        isTrackingAnonymized:
                            onboardingUser.isTrackingAnonymized,
                        method: 'otp',
                        onboardingFlow: 'new',
                    },
                });
                expect(analyticsMock.track).toHaveBeenCalledWith({
                    userId: onboardingUser.userUuid,
                    event: 'onboarding.step_completed',
                    properties: {
                        step: 'verified',
                        stepIndex: 2,
                        onboardingFlow: 'new',
                        organizationId: onboardingUser.organizationUuid,
                    },
                });
            });

            test('does not emit the verified step when verifying from settings', async () => {
                const settingsUser: SessionUser = {
                    ...sessionUser,
                    isSetupComplete: true,
                };

                const emailStatus = await verifyEmailAs(settingsUser);

                expect(analyticsMock.track).toHaveBeenCalledWith({
                    userId: settingsUser.userUuid,
                    event: 'user.verified',
                    properties: {
                        email: emailStatus.email,
                        location: 'settings',
                        isTrackingAnonymized: settingsUser.isTrackingAnonymized,
                        method: 'otp',
                        onboardingFlow: 'new',
                    },
                });
                expect(analyticsMock.track).not.toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'onboarding.step_completed',
                    }),
                );
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

    describe('getMobileLoginPresentation', () => {
        const configForProvider = (provider: OpenIdIdentityIssuerType) => ({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                google: {
                    ...lightdashConfigMock.auth.google,
                    loginPath: '/login/google',
                    enabled: provider === OpenIdIdentityIssuerType.GOOGLE,
                },
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    loginPath: '/login/okta',
                    oauth2ClientId:
                        provider === OpenIdIdentityIssuerType.OKTA
                            ? 'client-id'
                            : undefined,
                },
                oneLogin: {
                    ...lightdashConfigMock.auth.oneLogin,
                    loginPath: '/login/oneLogin',
                    oauth2ClientId:
                        provider === OpenIdIdentityIssuerType.ONELOGIN
                            ? 'client-id'
                            : undefined,
                },
                azuread: {
                    ...lightdashConfigMock.auth.azuread,
                    loginPath: '/login/azuread',
                    oauth2ClientId:
                        provider === OpenIdIdentityIssuerType.AZUREAD
                            ? 'client-id'
                            : undefined,
                },
                oidc: {
                    ...lightdashConfigMock.auth.oidc,
                    loginPath: '/login/oidc',
                    clientId:
                        provider === OpenIdIdentityIssuerType.GENERIC_OIDC
                            ? 'client-id'
                            : undefined,
                },
            },
        });

        it.each([
            OpenIdIdentityIssuerType.GOOGLE,
            OpenIdIdentityIssuerType.OKTA,
            OpenIdIdentityIssuerType.ONELOGIN,
            OpenIdIdentityIssuerType.AZUREAD,
            OpenIdIdentityIssuerType.GENERIC_OIDC,
        ])('brands the sole invariant %s provider', async (provider) => {
            const service = createUserService(configForProvider(provider));

            await expect(service.getMobileLoginPresentation()).resolves.toEqual(
                {
                    ssoPresentation: { kind: 'branded', provider },
                    localEmailAvailable: true,
                },
            );
        });

        it('returns neutral for several instance providers', async () => {
            const service = createUserService({
                ...configForProvider(OpenIdIdentityIssuerType.GOOGLE),
                auth: {
                    ...configForProvider(OpenIdIdentityIssuerType.GOOGLE).auth,
                    okta: {
                        ...lightdashConfigMock.auth.okta,
                        oauth2ClientId: 'client-id',
                    },
                },
            });

            await expect(service.getMobileLoginPresentation()).resolves.toEqual(
                {
                    ssoPresentation: { kind: 'neutral' },
                    localEmailAvailable: true,
                },
            );
        });

        it('returns neutral when per-organization routing can replace the provider', async () => {
            organizationSsoModel.findAllPolicySummaries.mockResolvedValueOnce([
                {
                    provider: OrganizationSsoProvider.AZUREAD,
                    enabled: true,
                },
            ]);
            const service = createUserService(
                configForProvider(OpenIdIdentityIssuerType.GOOGLE),
            );

            await expect(service.getMobileLoginPresentation()).resolves.toEqual(
                {
                    ssoPresentation: { kind: 'neutral' },
                    localEmailAvailable: true,
                },
            );
        });

        it('returns neutral when a disabled per-organization Google policy can suppress Google', async () => {
            organizationSsoModel.findAllPolicySummaries.mockResolvedValueOnce([
                {
                    provider: OrganizationSsoProvider.GOOGLE,
                    enabled: false,
                },
            ]);
            const service = createUserService(
                configForProvider(OpenIdIdentityIssuerType.GOOGLE),
            );

            await expect(service.getMobileLoginPresentation()).resolves.toEqual(
                {
                    ssoPresentation: { kind: 'neutral' },
                    localEmailAvailable: true,
                },
            );
        });

        it('returns neutral for an unknown enabled provider', async () => {
            organizationSsoModel.findAllPolicySummaries.mockResolvedValueOnce([
                {
                    provider: 'future-provider' as OrganizationSsoProvider,
                    enabled: true,
                },
            ]);
            const service = createUserService(lightdashConfigMock);

            await expect(service.getMobileLoginPresentation()).resolves.toEqual(
                {
                    ssoPresentation: { kind: 'neutral' },
                    localEmailAvailable: true,
                },
            );
        });

        it('reports local email without SSO for a local-only instance', async () => {
            const service = createUserService(lightdashConfigMock);

            await expect(service.getMobileLoginPresentation()).resolves.toEqual(
                {
                    ssoPresentation: { kind: 'none' },
                    localEmailAvailable: true,
                },
            );
        });

        it('reports no methods when local and SSO methods are disabled', async () => {
            const service = createUserService({
                ...lightdashConfigMock,
                auth: {
                    ...lightdashConfigMock.auth,
                    disablePasswordAuthentication: true,
                },
            });

            await expect(service.getMobileLoginPresentation()).resolves.toEqual(
                {
                    ssoPresentation: { kind: 'none' },
                    localEmailAvailable: false,
                },
            );
        });

        it('fails closed to neutral when the authority query fails', async () => {
            organizationSsoModel.findAllPolicySummaries.mockRejectedValueOnce(
                new Error('query failed'),
            );
            const service = createUserService(
                configForProvider(OpenIdIdentityIssuerType.OKTA),
            );

            await expect(service.getMobileLoginPresentation()).resolves.toEqual(
                {
                    ssoPresentation: { kind: 'neutral' },
                    localEmailAvailable: true,
                },
            );
        });
    });

    it('suppresses an SSO-only auto-redirect for the local browser intent', async () => {
        const service = createUserService(
            {
                ...lightdashConfigMock,
                auth: {
                    ...lightdashConfigMock.auth,
                    disablePasswordAuthentication: true,
                    okta: {
                        ...lightdashConfigMock.auth.okta,
                        oauth2ClientId: 'client-id',
                    },
                },
            },
            {},
        );
        userModel.getOpenIdIssuers.mockResolvedValueOnce([
            OpenIdIdentityIssuerType.OKTA,
        ]);

        await expect(
            service.getLoginOptions('user@example.com', 'local'),
        ).resolves.toEqual({
            forceRedirect: false,
            redirectUri: undefined,
            showOptions: [],
        });
    });

    describe('mobile login intent filtering', () => {
        const mixedConfig = {
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                google: {
                    ...lightdashConfigMock.auth.google,
                    loginPath: '/login/google',
                    enabled: true,
                },
            },
        };

        it('filters no-email instance defaults for both intents', async () => {
            const service = createUserService(mixedConfig);

            await expect(
                service.getLoginOptions(undefined, 'sso'),
            ).resolves.toEqual({
                showOptions: [OpenIdIdentityIssuerType.GOOGLE],
                forceRedirect: false,
                redirectUri: undefined,
            });
            await expect(
                service.getLoginOptions(undefined, 'local'),
            ).resolves.toEqual({
                showOptions: [LocalIssuerTypes.EMAIL],
                forceRedirect: false,
                redirectUri: undefined,
            });
        });

        it('filters normal email options and redirects only the SSO intent', async () => {
            userModel.getOpenIdIssuers
                .mockResolvedValueOnce([OpenIdIdentityIssuerType.GOOGLE])
                .mockResolvedValueOnce([OpenIdIdentityIssuerType.GOOGLE]);
            userModel.hasPasswordByEmail
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(true);
            const service = createUserService(mixedConfig);

            await expect(
                service.getLoginOptions('user@example.com', 'sso'),
            ).resolves.toEqual({
                showOptions: [OpenIdIdentityIssuerType.GOOGLE],
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/google?login_hint=user%40example.com',
            });
            await expect(
                service.getLoginOptions('user@example.com', 'local'),
            ).resolves.toEqual({
                showOptions: [LocalIssuerTypes.EMAIL],
                forceRedirect: false,
                redirectUri: undefined,
            });
        });

        it('filters the empty-result instance fallback for both intents', async () => {
            const service = createUserService(mixedConfig);

            await expect(
                service.getLoginOptions('new@example.com', 'sso'),
            ).resolves.toEqual({
                showOptions: [OpenIdIdentityIssuerType.GOOGLE],
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/google?login_hint=new%40example.com',
            });
            await expect(
                service.getLoginOptions('new@example.com', 'local'),
            ).resolves.toEqual({
                showOptions: [LocalIssuerTypes.EMAIL],
                forceRedirect: false,
                redirectUri: undefined,
            });
        });

        it('preserves and suppresses a sole-provider force redirect by intent', async () => {
            const service = createUserService({
                ...lightdashConfigMock,
                auth: {
                    ...lightdashConfigMock.auth,
                    disablePasswordAuthentication: true,
                    okta: {
                        ...lightdashConfigMock.auth.okta,
                        oauth2ClientId: 'client-id',
                        loginPath: '/login/okta',
                    },
                },
            });
            userModel.getOpenIdIssuers
                .mockResolvedValueOnce([OpenIdIdentityIssuerType.OKTA])
                .mockResolvedValueOnce([OpenIdIdentityIssuerType.OKTA]);

            await expect(
                service.getLoginOptions('user@example.com', 'sso'),
            ).resolves.toEqual({
                showOptions: [OpenIdIdentityIssuerType.OKTA],
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/okta?login_hint=user%40example.com',
            });
            await expect(
                service.getLoginOptions('user@example.com', 'local'),
            ).resolves.toEqual({
                showOptions: [],
                forceRedirect: false,
                redirectUri: undefined,
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

        test('passwordless user keeps email OTP alongside per-org SSO when local login is allowed', async () => {
            const method = {
                ...googleMethod,
                organizationUuid: sessionUser.organizationUuid!,
                allowPassword: true,
            };
            (
                organizationSsoModel.findEnabledMethodsForEmailDomain as import('vitest').Mock
            )
                .mockResolvedValueOnce([method])
                .mockResolvedValueOnce([method]);
            vi.mocked(userModel.findUserByEmail)
                .mockResolvedValueOnce(sessionUser)
                .mockResolvedValueOnce(sessionUser);
            vi.mocked(userModel.hasPasswordByEmail).mockResolvedValueOnce(
                false,
            );
            vi.mocked(userModel.hasPassword).mockResolvedValueOnce(false);
            vi.mocked(userModel.hasOpenIdIdentity).mockResolvedValueOnce(false);

            const service = createUserService(configWithGoogleEnv);
            expect(await service.getLoginOptions(sessionUser.email)).toEqual({
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['emailOtp', 'google'],
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

    describe('per-organization password policy enforcement', () => {
        type MatchingMethod = Awaited<
            ReturnType<OrganizationSsoModel['findEnabledMethodsForEmailDomain']>
        >[number];
        type UserOrganization = Awaited<
            ReturnType<UserModel['getOrganizationsForUser']>
        >[number];

        const createMatchingMethod = (
            organizationUuid: string,
            allowPassword: boolean,
        ): MatchingMethod => ({
            organizationUuid,
            provider: OrganizationSsoProvider.AZUREAD,
            config: {
                oauth2ClientId: 'client-id',
                oauth2ClientSecret: 'client-secret',
                oauth2TenantId: 'tenant-id',
            },
            enabled: true,
            overrideEmailDomains: false,
            emailDomains: [],
            allowPassword,
        });
        const createUserOrganization = (
            organizationUuid: string,
        ): UserOrganization => ({
            organizationUuid,
            organizationName: organizationUuid,
            organizationCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
        });

        test('refuses email and email OTP when every matching member organization requires SSO', async () => {
            const method = createMatchingMethod('organization-1', false);
            const organization = createUserOrganization('organization-1');
            vi.mocked(organizationSsoModel.findEnabledMethodsForEmailDomain)
                .mockResolvedValueOnce([method])
                .mockResolvedValueOnce([method]);
            vi.mocked(userModel.findUserByEmail)
                .mockResolvedValueOnce(sessionUser)
                .mockResolvedValueOnce(sessionUser);
            vi.mocked(userModel.getOrganizationsForUser)
                .mockResolvedValueOnce([organization])
                .mockResolvedValueOnce([organization]);

            await expect(
                userService.isLoginMethodAllowed(
                    'user@example.com',
                    LocalIssuerTypes.EMAIL,
                ),
            ).resolves.toBe(false);
            await expect(
                userService.isLoginMethodAllowed(
                    'user@example.com',
                    LocalIssuerTypes.EMAIL_OTP,
                ),
            ).resolves.toBe(false);
        });

        test('surfaces the organization SSO message from password login', async () => {
            const method = createMatchingMethod('organization-1', false);
            vi.mocked(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).mockResolvedValueOnce([method]);
            vi.mocked(userModel.findUserByEmail).mockResolvedValueOnce(
                sessionUser,
            );
            vi.mocked(userModel.getOrganizationsForUser).mockResolvedValueOnce([
                createUserOrganization('organization-1'),
            ]);

            await expect(
                userService.loginWithPassword('user@example.com', 'password'),
            ).rejects.toThrow(
                new ForbiddenError('Your organisation requires SSO sign-in'),
            );
        });

        test('surfaces the organization SSO message from email OTP login using one policy result', async () => {
            const method = createMatchingMethod('organization-1', false);
            vi.mocked(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).mockResolvedValueOnce([method]);
            vi.mocked(userModel.findUserByEmail)
                .mockResolvedValueOnce(sessionUser)
                .mockResolvedValueOnce(sessionUser);
            vi.mocked(userModel.getOrganizationsForUser).mockResolvedValueOnce([
                createUserOrganization('organization-1'),
            ]);

            await expect(
                userService.loginWithEmailOtp('user@example.com', '123456'),
            ).rejects.toThrow(
                new ForbiddenError('Your organisation requires SSO sign-in'),
            );
            expect(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).toHaveBeenCalledTimes(1);
        });

        test('surfaces the organization SSO message from password recovery', async () => {
            const method = createMatchingMethod('organization-1', false);
            vi.mocked(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).mockResolvedValueOnce([method]);
            vi.mocked(userModel.findUserByEmail)
                .mockResolvedValueOnce(sessionUser)
                .mockResolvedValueOnce(sessionUser);
            vi.mocked(userModel.getOrganizationsForUser).mockResolvedValueOnce([
                createUserOrganization('organization-1'),
            ]);

            await expect(
                userService.recoverPassword({ email: 'user@example.com' }),
            ).rejects.toThrow(
                new ForbiddenError('Your organisation requires SSO sign-in'),
            );
        });

        test('keeps password recovery as a no-op when no account exists', async () => {
            vi.mocked(userModel.findUserByEmail).mockResolvedValueOnce(
                undefined,
            );

            await expect(
                userService.recoverPassword({ email: 'new@example.com' }),
            ).resolves.toBeUndefined();
            expect(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).not.toHaveBeenCalled();
        });

        test('allows email and email OTP when the matching method allows password', async () => {
            const method = createMatchingMethod('organization-1', true);
            const organization = createUserOrganization('organization-1');
            vi.mocked(organizationSsoModel.findEnabledMethodsForEmailDomain)
                .mockResolvedValueOnce([method])
                .mockResolvedValueOnce([method]);
            vi.mocked(userModel.findUserByEmail)
                .mockResolvedValueOnce(sessionUser)
                .mockResolvedValueOnce(sessionUser);
            vi.mocked(userModel.getOrganizationsForUser)
                .mockResolvedValueOnce([organization])
                .mockResolvedValueOnce([organization]);

            await expect(
                userService.isLoginMethodAllowed(
                    'user@example.com',
                    LocalIssuerTypes.EMAIL,
                ),
            ).resolves.toBe(true);
            await expect(
                userService.isLoginMethodAllowed(
                    'user@example.com',
                    LocalIssuerTypes.EMAIL_OTP,
                ),
            ).resolves.toBe(true);
        });

        test('allows password when one of two matching member organizations allows it', async () => {
            const firstOrganization = createUserOrganization('organization-1');
            const secondOrganization = createUserOrganization('organization-2');
            vi.mocked(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).mockResolvedValueOnce([
                createMatchingMethod('organization-1', false),
                createMatchingMethod('organization-2', true),
            ]);
            vi.mocked(userModel.findUserByEmail).mockResolvedValueOnce(
                sessionUser,
            );
            vi.mocked(userModel.getOrganizationsForUser).mockResolvedValueOnce([
                firstOrganization,
                secondOrganization,
            ]);

            await expect(
                userService.isLoginMethodAllowed(
                    'user@example.com',
                    LocalIssuerTypes.EMAIL,
                ),
            ).resolves.toBe(true);
        });

        test('allows email when an SSO-only domain match belongs to another organization', async () => {
            vi.mocked(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).mockResolvedValueOnce([
                createMatchingMethod('other-organization', false),
            ]);
            vi.mocked(userModel.findUserByEmail).mockResolvedValueOnce(
                sessionUser,
            );
            vi.mocked(userModel.getOrganizationsForUser).mockResolvedValueOnce([
                createUserOrganization('member-organization'),
            ]);

            await expect(
                userService.isLoginMethodAllowed(
                    'user@example.com',
                    LocalIssuerTypes.EMAIL,
                ),
            ).resolves.toBe(true);
        });

        test('keeps matching SSO signup available for a brand-new user', async () => {
            vi.mocked(
                organizationSsoModel.findEnabledMethodsForEmailDomain,
            ).mockResolvedValueOnce([
                createMatchingMethod('organization-1', false),
            ]);
            vi.mocked(userModel.findUserByEmail).mockResolvedValueOnce(
                undefined,
            );
            vi.mocked(userModel.hasPasswordByEmail).mockResolvedValueOnce(
                false,
            );
            const service = createUserService({
                ...lightdashConfigMock,
                auth: {
                    ...lightdashConfigMock.auth,
                    azuread: {
                        ...lightdashConfigMock.auth.azuread,
                        loginPath: '/login/azuread',
                    },
                },
            });

            await expect(
                service.getLoginOptions('new@example.com'),
            ).resolves.toEqual({
                forceRedirect: true,
                redirectUri:
                    'https://test.lightdash.cloud/api/v1/login/azuread?login_hint=new%40example.com',
                showOptions: [OpenIdIdentityIssuerType.AZUREAD],
            });
        });

        test('keeps instance-level password disablement enforced with its generic message', async () => {
            const service = createUserService({
                ...lightdashConfigMock,
                auth: {
                    ...lightdashConfigMock.auth,
                    disablePasswordAuthentication: true,
                },
            });

            await expect(
                service.loginWithPassword('user@example.com', 'password'),
            ).rejects.toThrow(
                new ForbiddenError('Password credentials are not allowed'),
            );
            vi.mocked(userModel.findUserByEmail).mockResolvedValueOnce(
                sessionUser,
            );
            await expect(
                service.recoverPassword({ email: 'user@example.com' }),
            ).rejects.toThrow(
                new ForbiddenError('Password credentials are not allowed'),
            );
            await expect(
                service.isLoginMethodAllowed(
                    'user@example.com',
                    LocalIssuerTypes.EMAIL_OTP,
                ),
            ).resolves.toBe(false);
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
            userModel.findSessionUserByPrimaryEmail.mockResolvedValueOnce(
                undefined,
            );
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
            expect(vi.mocked(userModel.createUser)).toBeCalledWith(
                openIdUser,
                true,
                undefined,
            );
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
        describe('when an account with the same email already exists and is not linked', () => {
            const unverifiedEmail = {
                email: openIdUser.openId.email,
                isVerified: false,
            };

            test('tells a pending user to activate with a one-time code or an invite', async () => {
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce(
                    unverifiedEmail,
                );

                await expect(
                    userService.loginWithOpenId(
                        openIdUser,
                        undefined,
                        undefined,
                    ),
                ).rejects.toThrowError(
                    new ForbiddenError(
                        'An account for test@test.com is waiting to be activated. Sign in with your email to get a one-time code, or ask your admin for an invite link. After that, SSO sign-in will be enabled.',
                    ),
                );

                expect(userModel.createUser).not.toHaveBeenCalled();
                expect(
                    openIdIdentityModel.createIdentity,
                ).not.toHaveBeenCalled();
            });

            test('tells a pending user to get an invite when one-time-code login is unavailable', async () => {
                const service = createUserService({
                    ...lightdashConfigMock,
                    auth: {
                        ...lightdashConfigMock.auth,
                        disablePasswordAuthentication: true,
                    },
                });
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce(
                    unverifiedEmail,
                );

                await expect(
                    service.loginWithOpenId(openIdUser, undefined, undefined),
                ).rejects.toThrowError(
                    new ForbiddenError(
                        "An account for test@test.com already exists but hasn't been activated. Ask your admin for an invite link. After that, SSO sign-in will be enabled.",
                    ),
                );

                expect(userModel.createUser).not.toHaveBeenCalled();
                expect(
                    openIdIdentityModel.createIdentity,
                ).not.toHaveBeenCalled();
            });

            test('tells a verified user to sign in with email when linking by email is disabled', async () => {
                emailModel.getPrimaryEmailStatus.mockResolvedValueOnce({
                    email: openIdUser.openId.email,
                    isVerified: true,
                });

                await expect(
                    userService.loginWithOpenId(
                        openIdUser,
                        undefined,
                        undefined,
                    ),
                ).rejects.toThrowError(
                    new ForbiddenError(
                        'An account for test@test.com already exists. Sign in with your email, then connect this sign-in method from your account settings, or ask your admin to enable linking SSO logins by email.',
                    ),
                );

                expect(userModel.createUser).not.toHaveBeenCalled();
                expect(
                    openIdIdentityModel.createIdentity,
                ).not.toHaveBeenCalled();
            });
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

        test('allows an unverified provider email for an existing OpenID identity without trusting the email', async () => {
            (
                userModel.findSessionUserByOpenId as import('vitest').Mock
            ).mockResolvedValueOnce(sessionUser);
            const openIdUserWithUnverifiedEmail = {
                openId: {
                    ...openIdUser.openId,
                    email: 'unverified@example.com',
                },
            };

            await userService.loginWithOpenId(
                openIdUserWithUnverifiedEmail,
                undefined,
                undefined,
                undefined,
                undefined,
                { emailVerified: false },
            );

            expect(
                openIdIdentityModel.updateIdentityByOpenId,
            ).not.toHaveBeenCalled();
            expect(emailModel.verifyUserEmailIfExists).not.toHaveBeenCalled();
        });

        test('rejects an unverified provider email before linking a new OpenID identity', async () => {
            const service = createUserService({
                ...lightdashConfigMock,
                auth: {
                    ...lightdashConfigMock.auth,
                    enableOidcLinking: true,
                    enableOidcToEmailLinking: true,
                },
            });

            await expect(
                service.loginWithOpenId(
                    openIdUser,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    { emailVerified: false },
                ),
            ).rejects.toThrowError(
                new ForbiddenError(
                    'Authentication failed: email is not verified in OpenID profile.',
                ),
            );

            expect(openIdIdentityModel.createIdentity).not.toHaveBeenCalled();
            expect(userModel.createUser).not.toHaveBeenCalled();
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
                organizationSsoModel:
                    organizationSsoModel as unknown as OrganizationSsoModel,
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
                userOnboardingModel: {} as UserOnboardingModel,
                rolesModel: {} as RolesModel,
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
                organizationSsoModel:
                    organizationSsoModel as unknown as OrganizationSsoModel,
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
                userOnboardingModel: {} as UserOnboardingModel,
                rolesModel: {} as RolesModel,
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
            expect(vi.mocked(userModel.createPendingUser)).toHaveBeenCalledWith(
                sessionUser.organizationUuid,
                {
                    email: inviteUser.email,
                    firstName: '',
                    lastName: '',
                    role: OrganizationMemberRole.MEMBER,
                },
                true,
                undefined,
            );
            expect(
                inviteLinkModel.upsert as import('vitest').Mock,
            ).toHaveBeenCalledTimes(1);
        });
        test('should default the purpose to member', async () => {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await userService.createPendingUserAndInviteLink(sessionUser, {
                ...inviteUser,
                expiresAt,
            });

            expect(vi.mocked(inviteLinkModel.upsert)).toHaveBeenCalledWith(
                expect.any(String),
                expiresAt,
                sessionUser.organizationUuid,
                newUser.userUuid,
                InviteLinkPurpose.Member,
            );
        });
        test('should cap invite expiry at three days', async () => {
            const now = new Date('2026-08-11T12:00:00.000Z');
            const dateNowSpy = vi
                .spyOn(Date, 'now')
                .mockReturnValue(now.getTime());

            await userService.createPendingUserAndInviteLink(sessionUser, {
                ...inviteUser,
                expiresAt: new Date('2099-01-01T00:00:00.000Z'),
            });

            expect(vi.mocked(inviteLinkModel.upsert)).toHaveBeenCalledWith(
                expect.any(String),
                new Date('2026-08-14T12:00:00.000Z'),
                sessionUser.organizationUuid,
                newUser.userUuid,
                InviteLinkPurpose.Member,
            );
            dateNowSpy.mockRestore();
        });
        test('should replace a past invite expiry with three days', async () => {
            const now = new Date('2026-08-11T12:00:00.000Z');
            const dateNowSpy = vi
                .spyOn(Date, 'now')
                .mockReturnValue(now.getTime());

            await userService.createPendingUserAndInviteLink(sessionUser, {
                ...inviteUser,
                expiresAt: new Date('2026-08-10T12:00:00.000Z'),
            });

            expect(vi.mocked(inviteLinkModel.upsert)).toHaveBeenCalledWith(
                expect.any(String),
                new Date('2026-08-14T12:00:00.000Z'),
                sessionUser.organizationUuid,
                newUser.userUuid,
                InviteLinkPurpose.Member,
            );
            dateNowSpy.mockRestore();
        });
        test('should preserve an invite expiry shorter than three days', async () => {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

            await userService.createPendingUserAndInviteLink(sessionUser, {
                ...inviteUser,
                expiresAt,
            });

            expect(vi.mocked(inviteLinkModel.upsert)).toHaveBeenCalledWith(
                expect.any(String),
                expiresAt,
                sessionUser.organizationUuid,
                newUser.userUuid,
                InviteLinkPurpose.Member,
            );
        });
        test('should force setup invites to use the admin role', async () => {
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
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
                expiresAt,
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
                true,
                undefined,
            );
            expect(vi.mocked(inviteLinkModel.upsert)).toHaveBeenCalledWith(
                expect.any(String),
                expiresAt,
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

        describe('delegation ceiling', () => {
            // Manages members and invites, but its own scopes stop at
            // organization member level — so it may invite a member and must
            // not mint an admin.
            const limitedManagerRole = {
                roleUuid: 'limited-org-manager-role',
                organizationUuid: sessionUser.organizationUuid,
                level: 'organization',
                scopes: [
                    'manage:OrganizationMemberProfile',
                    'manage:InviteLink',
                    ...getOrganizationSystemRoleScopes(
                        OrganizationMemberRole.MEMBER,
                    ),
                ],
            };

            const patConfig = (enabled: boolean) => ({
                enabled,
                allowedOrgRoles: Object.values(OrganizationMemberRole),
                maxExpirationTimeInDays: undefined,
            });

            // Built the way production builds it: from the role's scopes, so
            // the PAT scope is granted by config rather than by the role.
            const limitedManagerUser = (patEnabled: boolean): SessionUser => ({
                ...sessionUser,
                role: OrganizationMemberRole.MEMBER,
                roleUuid: limitedManagerRole.roleUuid,
                ability: getUserAbilityBuilder({
                    user: {
                        userUuid: sessionUser.userUuid,
                        role: OrganizationMemberRole.MEMBER,
                        organizationUuid: sessionUser.organizationUuid,
                        roleUuid: limitedManagerRole.roleUuid,
                    },
                    projectProfiles: [],
                    permissionsConfig: { pat: patConfig(patEnabled) },
                    customRoleScopes: {
                        [limitedManagerRole.roleUuid]:
                            limitedManagerRole.scopes,
                    },
                    customRolesEnabled: true,
                }).builder.build(),
            });

            const buildLimitedManagerService = (
                patEnabled: boolean = false,
                patScopeAuthoritative: boolean = false,
            ) =>
                createUserService(
                    {
                        ...lightdashConfigMock,
                        auth: {
                            ...lightdashConfigMock.auth,
                            pat: patConfig(patEnabled),
                        },
                    },
                    {
                        rolesModel: {
                            getRoleWithScopesByUuid: vi
                                .fn()
                                .mockResolvedValue(limitedManagerRole),
                        } as unknown as RolesModel,
                        featureFlagModel: {
                            get: vi.fn<FeatureFlagModel['get']>(
                                async ({ featureFlagId }) => ({
                                    id: featureFlagId,
                                    enabled:
                                        featureFlagId ===
                                        CommercialFeatureFlags.PatScopeAuthoritative
                                            ? patScopeAuthoritative
                                            : featureFlagId !==
                                              FeatureFlags.NewOnboarding,
                                }),
                            ),
                        },
                    },
                );

            test('rejects an invite whose role exceeds the caller permissions', async () => {
                await expect(
                    buildLimitedManagerService().createPendingUserAndInviteLink(
                        limitedManagerUser(false),
                        {
                            ...inviteUser,
                            role: OrganizationMemberRole.ADMIN,
                        },
                    ),
                ).rejects.toBeInstanceOf(ForbiddenError);

                expect(
                    vi.mocked(userModel.createPendingUser),
                ).not.toHaveBeenCalled();
                expect(vi.mocked(userModel.joinOrg)).not.toHaveBeenCalled();
                expect(
                    vi.mocked(inviteLinkModel.upsert),
                ).not.toHaveBeenCalled();
            });

            test('rejects a setup invite from a caller that is not admin-equivalent', async () => {
                await expect(
                    buildLimitedManagerService().createPendingUserAndInviteLink(
                        limitedManagerUser(false),
                        {
                            ...inviteUser,
                            purpose: InviteLinkPurpose.Setup,
                        },
                    ),
                ).rejects.toBeInstanceOf(ForbiddenError);

                expect(
                    vi.mocked(userModel.createPendingUser),
                ).not.toHaveBeenCalled();
                expect(
                    vi.mocked(inviteLinkModel.upsert),
                ).not.toHaveBeenCalled();
            });

            test('allows an invite the caller permissions already cover', async () => {
                await buildLimitedManagerService().createPendingUserAndInviteLink(
                    limitedManagerUser(false),
                    { ...inviteUser, role: OrganizationMemberRole.MEMBER },
                );

                expect(
                    vi.mocked(userModel.createPendingUser),
                ).toHaveBeenCalledWith(
                    sessionUser.organizationUuid,
                    {
                        email: inviteUser.email,
                        firstName: '',
                        lastName: '',
                        role: OrganizationMemberRole.MEMBER,
                    },
                    true,
                    undefined,
                );
            });

            // The invited role carries manage:PersonalAccessToken from the PAT
            // config, and so does the caller — a custom role never lists that
            // scope, so comparing against its stored scopes alone would deny
            // every invite.
            test('allows a covered invite when personal access tokens are enabled', async () => {
                await buildLimitedManagerService(
                    true,
                ).createPendingUserAndInviteLink(limitedManagerUser(true), {
                    ...inviteUser,
                    role: OrganizationMemberRole.MEMBER,
                });

                expect(
                    vi.mocked(userModel.createPendingUser),
                ).toHaveBeenCalledWith(
                    sessionUser.organizationUuid,
                    {
                        email: inviteUser.email,
                        firstName: '',
                        lastName: '',
                        role: OrganizationMemberRole.MEMBER,
                    },
                    true,
                    undefined,
                );
            });

            // getRoleWithScopesByUuid is left unstubbed here: a system-role
            // caller must be measured from its own role, without a custom-role lookup.
            test('allows an organization admin to invite an admin', async () => {
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

                await createUserService(
                    lightdashConfigMock,
                ).createPendingUserAndInviteLink(adminUser, {
                    ...inviteUser,
                    role: OrganizationMemberRole.ADMIN,
                });

                expect(
                    vi.mocked(userModel.createPendingUser),
                ).toHaveBeenCalledWith(
                    sessionUser.organizationUuid,
                    {
                        email: inviteUser.email,
                        firstName: '',
                        lastName: '',
                        role: OrganizationMemberRole.ADMIN,
                    },
                    true,
                    undefined,
                );
            });

            test('still rejects an admin invite when personal access tokens are enabled', async () => {
                await expect(
                    buildLimitedManagerService(
                        true,
                    ).createPendingUserAndInviteLink(limitedManagerUser(true), {
                        ...inviteUser,
                        role: OrganizationMemberRole.ADMIN,
                    }),
                ).rejects.toBeInstanceOf(ForbiddenError);

                expect(
                    vi.mocked(userModel.createPendingUser),
                ).not.toHaveBeenCalled();
                expect(
                    vi.mocked(inviteLinkModel.upsert),
                ).not.toHaveBeenCalled();
            });

            // A caller whose own ability denies tokens must still be blocked
            // from an invite that would carry token access from config. This
            // ceiling never relaxes: config-derived token access is still
            // self-escalation via an invited system role (#26771).
            test('flag off: rejects an invite that would carry token access from config when the caller lacks it', async () => {
                await expect(
                    buildLimitedManagerService(
                        true,
                    ).createPendingUserAndInviteLink(
                        limitedManagerUser(false),
                        { ...inviteUser, role: OrganizationMemberRole.MEMBER },
                    ),
                ).rejects.toBeInstanceOf(ForbiddenError);

                expect(
                    vi.mocked(userModel.createPendingUser),
                ).not.toHaveBeenCalled();
            });

            test('flag on: still rejects the same invite — the ceiling does not relax', async () => {
                await expect(
                    buildLimitedManagerService(
                        true,
                        true,
                    ).createPendingUserAndInviteLink(
                        limitedManagerUser(false),
                        { ...inviteUser, role: OrganizationMemberRole.MEMBER },
                    ),
                ).rejects.toBeInstanceOf(ForbiddenError);

                expect(
                    vi.mocked(userModel.createPendingUser),
                ).not.toHaveBeenCalled();
            });
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

        test('should create space via ensureDefaultUserSpacesForUser (provisioning entry point)', async () => {
            const service = createUserService(lightdashConfigMock);

            (
                projectModel.getProjectsWithDefaultUserSpaces as import('vitest').Mock
            ).mockResolvedValueOnce([projectWithDefaultSpaces]);

            const editor = makeSessionUser({
                orgRole: OrganizationMemberRole.EDITOR,
            });
            (
                userModel.getSessionUserFromCacheOrDB as import('vitest').Mock
            ).mockResolvedValueOnce({
                sessionUser: editor,
                cacheHit: false,
            });

            await service.ensureDefaultUserSpacesForUser({
                userUuid: editor.userUuid,
                organizationUuid,
            });

            expect(projectModel.ensureDefaultUserSpace).toHaveBeenCalledTimes(
                1,
            );
        });

        test('should backfill spaces for active members only', async () => {
            const service = createUserService(lightdashConfigMock);

            organizationMemberProfileModel.getAllOrganizationMembers.mockResolvedValueOnce(
                [
                    { userUuid: 'active-1', isActive: true },
                    { userUuid: 'inactive-1', isActive: false },
                    { userUuid: 'active-2', isActive: true },
                ] as OrganizationMemberProfile[],
            );
            const ensureSpy = vi
                .spyOn(service, 'ensureDefaultUserSpacesForUser')
                .mockResolvedValue(undefined);

            const result =
                await service.ensureDefaultUserSpacesForOrganizationMembers(
                    organizationUuid,
                );

            expect(ensureSpy).toHaveBeenCalledTimes(2);
            expect(ensureSpy).toHaveBeenCalledWith({
                userUuid: 'active-1',
                organizationUuid,
            });
            expect(ensureSpy).toHaveBeenCalledWith({
                userUuid: 'active-2',
                organizationUuid,
            });
            expect(result).toEqual({ processedMembers: 2, failedMembers: 0 });
        });

        test('should continue backfill when one member fails', async () => {
            const service = createUserService(lightdashConfigMock);

            organizationMemberProfileModel.getAllOrganizationMembers.mockResolvedValueOnce(
                [
                    { userUuid: 'active-1', isActive: true },
                    { userUuid: 'active-2', isActive: true },
                ] as OrganizationMemberProfile[],
            );
            const ensureSpy = vi
                .spyOn(service, 'ensureDefaultUserSpacesForUser')
                .mockRejectedValueOnce(new Error('boom'))
                .mockResolvedValue(undefined);

            const result =
                await service.ensureDefaultUserSpacesForOrganizationMembers(
                    organizationUuid,
                );

            expect(ensureSpy).toHaveBeenCalledTimes(2);
            expect(result).toEqual({ processedMembers: 2, failedMembers: 1 });
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

    const createSnowflakeCredentialsModel = () => ({
        getAllByUserUuid: vi.fn().mockResolvedValue([
            {
                uuid: 'password-credentials-uuid',
                name: 'Default',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'snowflake-user',
                    authenticationType: SnowflakeAuthenticationType.PASSWORD,
                },
                project: null,
            },
            {
                uuid: 'sso-credentials-uuid',
                name: 'My Snowflake login',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: SnowflakeAuthenticationType.SSO,
                },
                project: null,
            },
        ]),
        update: vi.fn().mockResolvedValue('sso-credentials-uuid'),
        getByUuid: vi.fn().mockResolvedValue({ uuid: 'sso-credentials-uuid' }),
        create: vi.fn(),
    });

    describe('createSnowflakeWarehouseCredentials', () => {
        it('updates only an existing Snowflake SSO credential', async () => {
            const credentialsModel = createSnowflakeCredentialsModel();
            const service = createUserService(lightdashConfigMock, {
                userWarehouseCredentialsModel:
                    credentialsModel as unknown as UserWarehouseCredentialsModel,
            });

            await service.createSnowflakeWarehouseCredentials(
                sessionUser,
                'new-refresh-token',
            );

            expect(credentialsModel.update).toHaveBeenCalledWith(
                sessionUser.userUuid,
                'sso-credentials-uuid',
                expect.objectContaining({
                    credentials: expect.objectContaining({
                        authenticationType: SnowflakeAuthenticationType.SSO,
                        refreshToken: 'new-refresh-token',
                    }),
                }),
            );
            expect(credentialsModel.create).not.toHaveBeenCalled();
        });

        it('keeps the name the user gave the existing credential', async () => {
            const credentialsModel = createSnowflakeCredentialsModel();
            const service = createUserService(lightdashConfigMock, {
                userWarehouseCredentialsModel:
                    credentialsModel as unknown as UserWarehouseCredentialsModel,
            });

            await service.createSnowflakeWarehouseCredentials(
                sessionUser,
                'new-refresh-token',
            );

            expect(credentialsModel.update).toHaveBeenCalledWith(
                sessionUser.userUuid,
                'sso-credentials-uuid',
                expect.objectContaining({ name: 'My Snowflake login' }),
            );
        });

        it('refreshes the credential queries actually resolve when duplicates exist', async () => {
            const credentialsModel = createSnowflakeCredentialsModel();
            // Oldest first, matching getAllByUserUuid's ordering.
            credentialsModel.getAllByUserUuid.mockResolvedValue([
                {
                    uuid: 'stale-sso-credentials-uuid',
                    name: 'Default',
                    credentials: {
                        type: WarehouseTypes.SNOWFLAKE,
                        authenticationType: SnowflakeAuthenticationType.SSO,
                    },
                    project: null,
                },
                {
                    uuid: 'newest-sso-credentials-uuid',
                    name: 'Default',
                    credentials: {
                        type: WarehouseTypes.SNOWFLAKE,
                        authenticationType: SnowflakeAuthenticationType.SSO,
                    },
                    project: null,
                },
            ]);
            const service = createUserService(lightdashConfigMock, {
                userWarehouseCredentialsModel:
                    credentialsModel as unknown as UserWarehouseCredentialsModel,
            });

            await service.createSnowflakeWarehouseCredentials(
                sessionUser,
                'new-refresh-token',
            );

            expect(credentialsModel.update).toHaveBeenCalledWith(
                sessionUser.userUuid,
                'newest-sso-credentials-uuid',
                expect.anything(),
            );
        });

        it('rejects a callback without a refresh token instead of writing', async () => {
            const credentialsModel = createSnowflakeCredentialsModel();
            const service = createUserService(lightdashConfigMock, {
                userWarehouseCredentialsModel:
                    credentialsModel as unknown as UserWarehouseCredentialsModel,
            });

            await expect(
                service.createSnowflakeWarehouseCredentials(sessionUser, ''),
            ).rejects.toThrow(ParameterError);
            expect(credentialsModel.update).not.toHaveBeenCalled();
            expect(credentialsModel.create).not.toHaveBeenCalled();
        });
    });

    describe('loginWithPersonalAccessToken', () => {
        const patAbility = new Ability<PossibleAbilities>([
            { subject: 'PersonalAccessToken', action: ['view'] },
        ]);

        const patLookup = (overrides: AnyType = {}) => ({
            data: {
                user: {
                    ...sessionUser,
                    ability: patAbility,
                    ...overrides.user,
                },
                personalAccessToken: {
                    uuid: 'pat-uuid',
                    createdAt: new Date('2024-01-01'),
                    rotatedAt: null,
                    lastUsedAt: null,
                    expiresAt: null,
                    description: 'test token',
                    ...overrides.personalAccessToken,
                },
            },
            cacheHit: false,
            ...overrides.lookup,
        });

        const buildPatMocks = () => ({
            delete: vi.fn(async () => undefined),
            updateUsedDate: vi.fn(async () => undefined),
        });

        it('authenticates a matched token', async () => {
            const patModel = buildPatMocks();
            const service = createUserService(lightdashConfigMock, {
                personalAccessTokenModel: patModel as AnyType,
            });
            userModel.findSessionUserByPersonalAccessToken.mockResolvedValue(
                patLookup() as AnyType,
            );

            const result = await service.loginWithPersonalAccessToken('token');

            expect(result.userUuid).toEqual(sessionUser.userUuid);
            expect(patModel.updateUsedDate).toHaveBeenCalledWith('pat-uuid');
        });

        it('rejects a deactivated account', async () => {
            const patModel = buildPatMocks();
            const service = createUserService(lightdashConfigMock, {
                personalAccessTokenModel: patModel as AnyType,
            });
            userModel.findSessionUserByPersonalAccessToken.mockResolvedValue(
                patLookup({ user: { isActive: false } }) as AnyType,
            );

            await expect(
                service.loginWithPersonalAccessToken('token'),
            ).rejects.toBeInstanceOf(DeactivatedAccountError);
        });

        it('rejects an unauthorized user', async () => {
            const patModel = buildPatMocks();
            const service = createUserService(lightdashConfigMock, {
                personalAccessTokenModel: patModel as AnyType,
            });
            userModel.findSessionUserByPersonalAccessToken.mockResolvedValue(
                patLookup({
                    user: { ability: new Ability<PossibleAbilities>([]) },
                }) as AnyType,
            );

            await expect(
                service.loginWithPersonalAccessToken('token'),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });

        it('deletes an expired token', async () => {
            const patModel = buildPatMocks();
            const service = createUserService(lightdashConfigMock, {
                personalAccessTokenModel: patModel as AnyType,
            });
            userModel.findSessionUserByPersonalAccessToken.mockResolvedValue(
                patLookup({
                    personalAccessToken: {
                        expiresAt: new Date(Date.now() - 1000),
                    },
                }) as AnyType,
            );

            await expect(
                service.loginWithPersonalAccessToken('token'),
            ).rejects.toBeInstanceOf(AuthorizationError);
            expect(patModel.delete).toHaveBeenCalledWith('pat-uuid');
        });
    });
});
