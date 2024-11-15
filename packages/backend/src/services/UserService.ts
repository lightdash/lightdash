import { subject } from '@casl/ability';
import {
    ActivateUser,
    ArgumentsOf,
    assertUnreachable,
    AuthorizationError,
    CompleteUserArgs,
    CreateInviteLink,
    CreatePasswordResetLink,
    CreateUserArgs,
    DeactivatedAccountError,
    DeleteOpenIdentity,
    EmailStatusExpiring,
    ExpiredError,
    ForbiddenError,
    getEmailDomain,
    hasInviteCode,
    InviteLink,
    isOpenIdIdentityIssuerType,
    isOpenIdUser,
    isUserWithOrg,
    LightdashMode,
    LightdashUser,
    LocalIssuerTypes,
    LoginOptions,
    LoginOptionTypes,
    NotExistsError,
    NotFoundError,
    OpenIdIdentityIssuerType,
    OpenIdIdentitySummary,
    OpenIdUser,
    OrganizationMemberRole,
    ParameterError,
    PasswordReset,
    RegisterOrActivateUser,
    SessionUser,
    UpdateUserArgs,
    UpsertUserWarehouseCredentials,
    UserAllowedOrganization,
    validateOrganizationEmailDomains,
} from '@lightdash/common';
import { randomInt } from 'crypto';
import { uniq } from 'lodash';
import { nanoid } from 'nanoid';
import refresh from 'passport-oauth2-refresh';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import EmailClient from '../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
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
import { WarehouseAvailableTablesModel } from '../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { postHogClient } from '../postHog';
import { wrapSentryTransaction } from '../utils';
import { BaseService } from './BaseService';

type UserServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    inviteLinkModel: InviteLinkModel;
    userModel: UserModel;
    groupsModel: GroupsModel;
    sessionModel: SessionModel;
    emailModel: EmailModel;
    openIdIdentityModel: OpenIdIdentityModel;
    passwordResetLinkModel: PasswordResetLinkModel;
    emailClient: EmailClient;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    organizationModel: OrganizationModel;
    personalAccessTokenModel: PersonalAccessTokenModel;
    organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;
    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
    warehouseAvailableTablesModel: WarehouseAvailableTablesModel;
};

export class UserService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly inviteLinkModel: InviteLinkModel;

    private readonly userModel: UserModel;

    private readonly groupsModel: GroupsModel;

    private readonly sessionModel: SessionModel;

    private readonly emailModel: EmailModel;

    private readonly openIdIdentityModel: OpenIdIdentityModel;

    private readonly passwordResetLinkModel: PasswordResetLinkModel;

    private readonly emailClient: EmailClient;

    private readonly organizationMemberProfileModel;

    private readonly organizationModel: OrganizationModel;

    private readonly personalAccessTokenModel: PersonalAccessTokenModel;

    private readonly organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;

    private readonly userWarehouseCredentialsModel: UserWarehouseCredentialsModel;

    private readonly warehouseAvailableTablesModel: WarehouseAvailableTablesModel;

    private readonly emailOneTimePasscodeExpirySeconds = 60 * 15;

    private readonly emailOneTimePasscodeMaxAttempts = 5;

    constructor({
        lightdashConfig,
        analytics,
        inviteLinkModel,
        userModel,
        groupsModel,
        sessionModel,
        emailModel,
        openIdIdentityModel,
        emailClient,
        passwordResetLinkModel,
        organizationModel,
        organizationMemberProfileModel,
        personalAccessTokenModel,
        organizationAllowedEmailDomainsModel,
        userWarehouseCredentialsModel,
        warehouseAvailableTablesModel,
    }: UserServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.inviteLinkModel = inviteLinkModel;
        this.userModel = userModel;
        this.groupsModel = groupsModel;
        this.sessionModel = sessionModel;
        this.emailModel = emailModel;
        this.openIdIdentityModel = openIdIdentityModel;
        this.passwordResetLinkModel = passwordResetLinkModel;
        this.emailClient = emailClient;
        this.organizationModel = organizationModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.personalAccessTokenModel = personalAccessTokenModel;
        this.organizationAllowedEmailDomainsModel =
            organizationAllowedEmailDomainsModel;
        this.userWarehouseCredentialsModel = userWarehouseCredentialsModel;
        this.warehouseAvailableTablesModel = warehouseAvailableTablesModel;
    }

    private identifyUser(
        user: LightdashUser & { isMarketingOptedIn?: boolean },
    ): void {
        if (this.lightdashConfig.mode === LightdashMode.DEMO) {
            return;
        }
        this.analytics.identify({
            userId: user.userUuid,
            traits: user.isTrackingAnonymized
                ? { is_tracking_anonymized: user.isTrackingAnonymized }
                : {
                      email: user.email,
                      first_name: user.firstName,
                      last_name: user.lastName,
                      is_tracking_anonymized: user.isTrackingAnonymized,
                      is_marketing_opted_in: user.isMarketingOptedIn,
                  },
        });

        postHogClient?.identify({
            distinctId: user.userUuid,
            properties: {
                uuid: user.userUuid,
                ...(user.isTrackingAnonymized
                    ? {}
                    : {
                          email: user.email,
                          first_name: user.firstName,
                          last_name: user.lastName,
                      }),
            },
        });

        if (user.organizationUuid) {
            this.analytics.group({
                userId: user.userUuid,
                groupId: user.organizationUuid,
                traits: {
                    name: user.organizationName,
                },
            });

            postHogClient?.groupIdentify({
                groupType: 'organization',
                groupKey: user.organizationUuid,
                properties: {
                    uuid: user.organizationUuid,
                    name: user.organizationName,
                },
                distinctId: user.userUuid,
            });
        }
    }

    private async tryVerifyUserEmail(
        user: LightdashUser,
        email: string,
    ): Promise<void> {
        const updatedEmails = await this.emailModel.verifyUserEmailIfExists(
            user.userUuid,
            email,
        );
        if (updatedEmails.length > 0) {
            this.analytics.track({
                userId: user.userUuid,
                event: 'user.verified',
                properties: {
                    email,
                    location: user.isSetupComplete ? 'settings' : 'onboarding',
                    isTrackingAnonymized: user.isTrackingAnonymized,
                },
            });
        }
    }

    async activateUserFromInvite(
        inviteCode: string,
        activateUser: ActivateUser | OpenIdUser,
    ): Promise<LightdashUser> {
        const inviteLink = await this.inviteLinkModel.getByCode(inviteCode);
        const userEmail = isOpenIdUser(activateUser)
            ? activateUser.openId.email
            : inviteLink.email;

        if (isOpenIdUser(activateUser)) {
            if (
                (await this.isLoginMethodAllowed(
                    userEmail,
                    activateUser.openId.issuerType,
                )) === false
            ) {
                throw new ForbiddenError(
                    `User with email ${userEmail} is not allowed to login with ${activateUser.openId.issuerType}`,
                );
            }
        } else if (
            (await this.isLoginMethodAllowed(
                userEmail,
                LocalIssuerTypes.EMAIL,
            )) === false
        ) {
            throw new ForbiddenError(
                `User with email ${userEmail} is not allowed to login with password`,
            );
        }

        if (inviteLink.email.toLowerCase() !== userEmail.toLowerCase()) {
            this.logger.error(
                `User accepted invite with wrong email ${userEmail} when the invited email was ${inviteLink.email}`,
            );
            throw new AuthorizationError(
                `Provided email ${userEmail} does not match the invited email.`,
            );
        }
        const user = await this.userModel.activateUser(
            inviteLink.userUuid,
            activateUser,
        );
        await this.inviteLinkModel.deleteByCode(inviteLink.inviteCode);
        this.identifyUser(user);
        this.analytics.track({
            event: 'user.created',
            userId: user.userUuid,
            properties: {
                context: 'accept_invite',
                createdUserId: user.userUuid,
                organizationId: user.organizationUuid,
                userConnectionType: 'password',
            },
        });
        if (!isOpenIdUser(activateUser)) {
            await this.sendOneTimePasscodeToPrimaryEmail(user);
        }
        return user;
    }

    async delete(user: SessionUser, userUuidToDelete: string): Promise<void> {
        const userToDelete = await this.userModel.getUserDetailsByUuid(
            userUuidToDelete,
        );
        // The user might not have an org yet
        // This is expected on the "Cancel registration" flow on single org instances.
        if (userToDelete?.organizationUuid) {
            // We assume only one org per user

            if (
                user.ability.cannot(
                    'delete',
                    subject('OrganizationMemberProfile', {
                        organizationUuid: userToDelete.organizationUuid,
                    }),
                )
            ) {
                throw new ForbiddenError();
            }

            // Race condition between check and delete
            const [admin, ...remainingAdmins] =
                await this.organizationMemberProfileModel.getOrganizationAdmins(
                    userToDelete.organizationUuid,
                );
            if (
                remainingAdmins.length === 0 &&
                admin.userUuid === userUuidToDelete
            ) {
                throw new ForbiddenError(
                    'Organization must have at least one admin',
                );
            }
        }

        await this.sessionModel.deleteAllByUserUuid(userUuidToDelete);

        await this.userModel.delete(userUuidToDelete);
        this.analytics.track({
            event: 'user.deleted',
            userId: user.userUuid,
            properties: {
                context:
                    user.userUuid !== userUuidToDelete
                        ? 'delete_org_member'
                        : 'delete_self',
                firstName: userToDelete.firstName,
                lastName: userToDelete.lastName,
                email: userToDelete.email,
                organizationId: userToDelete.organizationUuid,
                deletedUserId: userUuidToDelete,
            },
        });
    }

    async createPendingUserAndInviteLink(
        user: SessionUser,
        createInviteLink: CreateInviteLink,
    ): Promise<InviteLink> {
        // We assume users can only have one org
        const { organizationUuid } = user;

        if (
            user.ability.cannot(
                'create',
                subject('InviteLink', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const { expiresAt, email, role } = createInviteLink;
        const inviteCode = nanoid(30);
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

        const existingUserWithEmail = await this.userModel.findUserByEmail(
            email,
        );
        if (existingUserWithEmail && existingUserWithEmail.organizationUuid) {
            if (existingUserWithEmail.organizationUuid !== organizationUuid) {
                throw new ParameterError(
                    'Email is already used by a user in another organization',
                );
            } else if (!existingUserWithEmail.isPending) {
                throw new ParameterError(
                    'Email is already used by a user in your organization',
                );
            }
        }

        let userUuid: string;
        const userRole = user.ability.can(
            'manage',
            subject('OrganizationMemberProfile', { organizationUuid }),
        )
            ? role || OrganizationMemberRole.MEMBER
            : OrganizationMemberRole.MEMBER;
        if (!existingUserWithEmail) {
            const pendingUser = await this.userModel.createPendingUser(
                organizationUuid,
                {
                    email,
                    firstName: '',
                    lastName: '',
                    role: userRole,
                },
            );
            userUuid = pendingUser.userUuid;
        } else {
            userUuid = existingUserWithEmail.userUuid;
        }

        if (existingUserWithEmail && !existingUserWithEmail?.organizationUuid) {
            Logger.warn(
                `User with email ${email} already exists but has no org, so we invite them to join`,
            );
            await this.userModel.joinOrg(
                existingUserWithEmail.userUuid,
                organizationUuid,
                userRole,
                undefined,
            );
        }

        const inviteLink = await this.inviteLinkModel.upsert(
            inviteCode,
            expiresAt,
            organizationUuid,
            userUuid,
        );
        await this.emailClient.sendInviteEmail(user, inviteLink);
        this.analytics.track({
            userId: user.userUuid,
            event: 'invite_link.created',
        });

        const organization = await this.organizationModel.get(organizationUuid);
        this.analytics.track({
            userId: user.userUuid,
            event: 'permission.updated',
            properties: {
                userId: user.userUuid,
                userIdUpdated: userUuid,
                organizationPermissions: userRole,
                projectPermissions: {
                    name: organization.name,
                    userRole,
                },
                newUser: existingUserWithEmail === undefined,
                generatedInvite: true,
            },
        });

        return inviteLink;
    }

    async revokeAllInviteLinks(user: SessionUser) {
        // We assume users can only have one org
        const { organizationUuid } = user;

        if (
            user.ability.cannot(
                'delete',
                subject('InviteLink', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        await this.inviteLinkModel.deleteByOrganization(organizationUuid);
        this.analytics.track({
            userId: user.userUuid,
            event: 'invite_link.all_revoked',
        });
    }

    /**
     * @deprecated Group Sync is deprecated. https://github.com/lightdash/lightdash/issues/12430
     */
    private async tryAddUserToGroups(
        ...data: ArgumentsOf<GroupsModel['addUserToGroupsIfExist']>
    ) {
        const updatedGroups = await this.groupsModel.addUserToGroupsIfExist(
            ...data,
        );
        if (updatedGroups) {
            await Promise.all(
                updatedGroups.map(async (groupUuid) => {
                    const updatedGroup =
                        await this.groupsModel.getGroupWithMembers(groupUuid);
                    this.analytics.track({
                        event: 'group.updated',
                        userId: data[0].userUuid,
                        properties: {
                            viaSso: true,
                            organizationId: updatedGroup.organizationUuid,
                            groupId: updatedGroup.uuid,
                            name: updatedGroup.name,
                            countUsersInGroup: updatedGroup.memberUuids.length,
                            context: 'add_member_via_sso',
                        },
                    });
                }),
            );
        }
    }

    /**
     * In this method we check if the user is allowed to register in this instance before registerUser happens.
     * If the instance is a single org, and there are already users and orgs,
     * and the user's email domain is allowed in the org whitelisted,
     * we throw a ForbiddenError.
     * @param inviteCode invite code
     * @param email email for the user registering
     */
    async checkNewUserRegistrationAllowed(
        inviteCode: string | undefined,
        email: string,
    ) {
        if (
            inviteCode === undefined &&
            !this.lightdashConfig.allowMultiOrgs &&
            (await this.userModel.hasUsers()) &&
            (await this.organizationModel.hasOrgs()) &&
            (
                await this.organizationModel.getAllowedOrgsForDomain(
                    getEmailDomain(email),
                )
            ).length < 1
        ) {
            throw new ForbiddenError(
                `You can't register a new user with email ${email} on this instance. Please contact your organization administrator and ask for an invite`,
            );
        }
    }

    async loginWithOpenId(
        openIdUser: OpenIdUser,
        authenticatedUser: SessionUser | undefined,
        inviteCode: string | undefined,
        refreshToken?: string,
    ): Promise<SessionUser> {
        const openIdSession = await this.userModel.findSessionUserByOpenId(
            openIdUser.openId.issuer,
            openIdUser.openId.subject,
        );

        if (
            (await this.isLoginMethodAllowed(
                openIdUser.openId.email,
                openIdUser.openId.issuerType,
            )) === false
        ) {
            throw new ForbiddenError(
                `User with email ${openIdUser.openId.email} is not allowed to login with ${openIdUser.openId.issuerType}`,
            );
        }
        this.logger.info(
            `Logging with OpenId email ${openIdUser.openId.email} and groups ${
                openIdUser.openId.groups
            }, is authenticated: ${authenticatedUser !== undefined}`,
        );
        // Identity already exists. Update the identity attributes and login the user
        if (openIdSession) {
            if (!openIdSession.isActive) {
                throw new DeactivatedAccountError();
            }

            const organization = this.loginToOrganization(
                openIdSession?.userUuid,
                openIdUser.openId.issuerType,
            );
            const loginUser: SessionUser = {
                ...openIdSession,
                ...organization,
            };

            if (inviteCode) {
                const inviteLink = await this.inviteLinkModel.getByCode(
                    inviteCode,
                );
                if (
                    loginUser.email &&
                    inviteLink.email.toLowerCase() !==
                        loginUser.email.toLowerCase()
                ) {
                    this.logger.error(
                        `User accepted invite with wrong email ${loginUser.email} when the invited email was ${inviteLink.email}`,
                    );
                    throw new AuthorizationError(
                        `Provided email ${loginUser.email} does not match the invited email.`,
                    );
                }
            }

            await this.openIdIdentityModel.updateIdentityByOpenId({
                ...openIdUser.openId,
                refreshToken,
            });
            await this.tryVerifyUserEmail(loginUser, openIdUser.openId.email);
            this.identifyUser(loginUser);
            this.analytics.track({
                userId: loginUser.userUuid,
                event: 'user.logged_in',
                properties: {
                    loginProvider: openIdUser.openId.issuerType,
                },
            });

            if (
                this.lightdashConfig.groups.enabled === true &&
                this.lightdashConfig.auth.enableGroupSync === true &&
                Array.isArray(openIdUser.openId.groups) &&
                openIdUser.openId.groups.length &&
                loginUser.organizationUuid
            )
                await this.tryAddUserToGroups({
                    userUuid: loginUser.userUuid,
                    groups: openIdUser.openId.groups,
                    organizationUuid: loginUser.organizationUuid,
                });

            return loginUser;
        }

        // Link the new openid identity to an existing user if they already have another OIDC with the same email
        if (!authenticatedUser && this.lightdashConfig.auth.enableOidcLinking) {
            const identities =
                await this.openIdIdentityModel.findIdentitiesByEmail(
                    openIdUser.openId.email,
                );
            const identitiesUsers = uniq(
                identities.map((identity) => identity.userUuid),
            );
            if (identitiesUsers.length > 1) {
                Logger.warn(
                    `Multiple openid identities found with the same email ${openIdUser.openId.email}`,
                );
            } else if (identitiesUsers.length === 1) {
                const sessionUser = await this.userModel.findSessionUserByUUID(
                    identitiesUsers[0],
                );
                if (
                    this.lightdashConfig.groups.enabled === true &&
                    this.lightdashConfig.auth.enableGroupSync === true &&
                    Array.isArray(openIdUser.openId.groups) &&
                    openIdUser.openId.groups.length &&
                    sessionUser.organizationUuid
                )
                    await this.tryAddUserToGroups({
                        userUuid: sessionUser.userUuid,
                        groups: openIdUser.openId.groups,
                        organizationUuid: sessionUser.organizationUuid,
                    });

                return this.linkOpenIdIdentityToUser(
                    sessionUser,
                    openIdUser,
                    refreshToken,
                );
            }
        }

        // Link the new openid identity to an existing user if they already have the same primary email and it's verified
        if (
            !authenticatedUser &&
            this.lightdashConfig.auth.enableOidcToEmailLinking
        ) {
            const userWithSameEmail =
                await this.userModel.findSessionUserByPrimaryEmail(
                    openIdUser.openId.email,
                );

            if (userWithSameEmail) {
                const emailStatus = await this.emailModel.getPrimaryEmailStatus(
                    userWithSameEmail.userUuid,
                );

                if (emailStatus.isVerified) {
                    if (
                        this.lightdashConfig.groups.enabled === true &&
                        this.lightdashConfig.auth.enableGroupSync === true &&
                        Array.isArray(openIdUser.openId.groups) &&
                        openIdUser.openId.groups.length &&
                        userWithSameEmail.organizationUuid
                    )
                        await this.tryAddUserToGroups({
                            userUuid: userWithSameEmail.userUuid,
                            groups: openIdUser.openId.groups,
                            organizationUuid:
                                userWithSameEmail.organizationUuid,
                        });

                    return this.linkOpenIdIdentityToUser(
                        userWithSameEmail,
                        openIdUser,
                        refreshToken,
                    );
                }
            }
        }

        // Link openid identity to currently logged in user
        if (authenticatedUser) {
            if (
                this.lightdashConfig.groups.enabled === true &&
                this.lightdashConfig.auth.enableGroupSync === true &&
                Array.isArray(openIdUser.openId.groups) &&
                openIdUser.openId.groups.length &&
                authenticatedUser.organizationUuid
            )
                await this.tryAddUserToGroups({
                    userUuid: authenticatedUser.userUuid,
                    groups: openIdUser.openId.groups,
                    organizationUuid: authenticatedUser.organizationUuid,
                });

            return this.linkOpenIdIdentityToUser(
                authenticatedUser,
                openIdUser,
                refreshToken,
            );
        }

        // Create user
        await this.checkNewUserRegistrationAllowed(
            inviteCode,
            openIdUser.openId.email,
        );
        const createdUser = await this.activateUserWithOpenId(
            openIdUser,
            inviteCode,
        );
        await this.tryVerifyUserEmail(createdUser, openIdUser.openId.email);
        const allowedOrgs =
            await this.organizationModel.getAllowedOrgsForDomain(
                getEmailDomain(openIdUser.openId.email),
            );
        const hasGroups =
            this.lightdashConfig.groups.enabled === true &&
            this.lightdashConfig.auth.enableGroupSync === true &&
            Array.isArray(openIdUser.openId.groups) &&
            openIdUser.openId.groups.length;
        let { organizationUuid } = createdUser;
        if (
            !organizationUuid &&
            !inviteCode &&
            hasGroups &&
            allowedOrgs.length === 1
        ) {
            organizationUuid = allowedOrgs[0].organizationUuid;
            this.logger.info(
                `Automatically joining user '${createdUser.email}' whitelisted organization ${organizationUuid}`,
            );
            await this.joinOrg(createdUser, organizationUuid); // Join automatically the whitelisted org so we can apply groups
        }

        if (hasGroups && organizationUuid)
            await this.tryAddUserToGroups({
                userUuid: createdUser.userUuid,
                groups: openIdUser.openId.groups!,
                organizationUuid,
            });

        return {
            ...createdUser,
            organizationUuid,
        };
    }

    private async activateUserWithOpenId(
        openIdUser: OpenIdUser,
        inviteCode: string | undefined,
    ): Promise<SessionUser> {
        if (inviteCode) {
            const user = await this.activateUserFromInvite(
                inviteCode,
                openIdUser,
            );
            return this.userModel.findSessionUserByUUID(user.userUuid);
        }
        const user = await this.registerUser(openIdUser);
        return this.userModel.findSessionUserByUUID(user.userUuid);
    }

    private async linkOpenIdIdentityToUser(
        sessionUser: SessionUser,
        openIdUser: OpenIdUser,
        refreshToken?: string,
    ): Promise<SessionUser> {
        await this.openIdIdentityModel.createIdentity({
            userId: sessionUser.userId,
            issuer: openIdUser.openId.issuer,
            subject: openIdUser.openId.subject,
            email: openIdUser.openId.email,
            issuerType: openIdUser.openId.issuerType,
            refreshToken,
        });
        await this.tryVerifyUserEmail(sessionUser, openIdUser.openId.email);
        this.analytics.track({
            userId: sessionUser.userUuid,
            event: 'user.identity_linked',
            properties: {
                loginProvider: openIdUser.openId.issuerType,
            },
        });

        if (
            this.lightdashConfig.groups.enabled &&
            this.lightdashConfig.auth.enableGroupSync &&
            Array.isArray(openIdUser.openId.groups) &&
            openIdUser.openId.groups.length &&
            sessionUser.organizationUuid
        ) {
            await this.tryAddUserToGroups({
                userUuid: sessionUser.userUuid,
                groups: openIdUser.openId.groups,
                organizationUuid: sessionUser.organizationUuid,
            });
        }

        return sessionUser;
    }

    async completeUserSetup(
        user: SessionUser,
        {
            organizationName,
            jobTitle,
            isTrackingAnonymized,
            isMarketingOptedIn,
            enableEmailDomainAccess,
        }: CompleteUserArgs,
    ): Promise<LightdashUser> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (organizationName) {
            if (
                user.ability.cannot(
                    'update',
                    subject('Organization', {
                        organizationUuid: user.organizationUuid,
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
            await this.organizationModel.update(user.organizationUuid, {
                name: organizationName,
            });
            this.analytics.track({
                userId: user.userUuid,
                event: 'organization.updated',
                properties: {
                    type:
                        this.lightdashConfig.mode === LightdashMode.CLOUD_BETA
                            ? 'cloud'
                            : 'self-hosted',
                    organizationId: user.organizationUuid,
                    organizationName,
                    defaultProjectUuid: undefined,
                    defaultColourPaletteUpdated: false,
                    defaultProjectUuidUpdated: false,
                },
            });
            if (enableEmailDomainAccess && user.email) {
                const emailDomain = getEmailDomain(user.email);

                const error = validateOrganizationEmailDomains([emailDomain]);
                if (error) {
                    throw new ParameterError(error);
                }
                await this.organizationAllowedEmailDomainsModel.upsertAllowedEmailDomains(
                    {
                        organizationUuid: user.organizationUuid,
                        emailDomains: [emailDomain],
                        role: OrganizationMemberRole.VIEWER,
                        projects: [],
                    },
                );
            }
        }
        const completeUser = await this.userModel.updateUser(
            user.userUuid,
            undefined,
            {
                isSetupComplete: true,
                isTrackingAnonymized,
                isMarketingOptedIn,
            },
        );

        this.identifyUser(completeUser);
        this.analytics.track({
            event: 'user.updated',
            userId: completeUser.userUuid,
            properties: {
                ...completeUser,
                updatedUserId: completeUser.userUuid,
                organizationId: completeUser.organizationUuid,
                jobTitle,
                context: 'complete_setup',
            },
        });
        return completeUser;
    }

    async getLinkedIdentities({
        userId,
    }: Pick<SessionUser, 'userId'>): Promise<
        Record<OpenIdIdentitySummary['issuerType'], OpenIdIdentitySummary[]>
    > {
        return this.openIdIdentityModel.getIdentitiesByUserId(userId);
    }

    async deleteLinkedIdentity(
        user: SessionUser,
        openIdentity: DeleteOpenIdentity,
    ): Promise<void> {
        const userIdentity = await this.openIdIdentityModel.getIdentity(
            user.userId,
            openIdentity.issuer,
            openIdentity.email,
        );
        await this.openIdIdentityModel.deleteIdentity(
            user.userId,
            openIdentity.issuer,
            openIdentity.email,
        );
        this.analytics.track({
            userId: user.userUuid,
            event: 'user.identity_removed',
            properties: {
                loginProvider: userIdentity.issuerType,
            },
        });
    }

    async getInviteLink(inviteCode: string): Promise<InviteLink> {
        const inviteLink = await this.inviteLinkModel.getByCode(inviteCode);
        const now = new Date();
        if (inviteLink.expiresAt <= now) {
            try {
                await this.inviteLinkModel.deleteByCode(inviteLink.inviteCode);
            } catch (e) {
                throw new NotExistsError('Invite link not found');
            }
            throw new ExpiredError('Invite link expired');
        }
        return inviteLink;
    }

    async loginWithPassword(
        email: string,
        password: string,
    ): Promise<LightdashUser> {
        if (
            (await this.isLoginMethodAllowed(email, LocalIssuerTypes.EMAIL)) ===
            false
        ) {
            throw new ForbiddenError(
                `User with email ${email} is not allowed to login with password`,
            );
        }

        try {
            if (this.lightdashConfig.auth.disablePasswordAuthentication) {
                throw new ForbiddenError(
                    'Password credentials are not allowed',
                );
            }
            // TODO: move to authorization service layer
            // TODO we should probably remove the organization from the model
            const user = await this.userModel.getUserByPrimaryEmailAndPassword(
                email,
                password,
            );
            if (!user.isActive) {
                throw new DeactivatedAccountError();
            }
            const userOrganization = this.loginToOrganization(
                user.userUuid,
                LocalIssuerTypes.EMAIL,
            );
            const userWithOrganization = {
                ...user,
                ...userOrganization,
            };
            this.identifyUser(userWithOrganization);
            this.analytics.track({
                userId: user.userUuid,
                event: 'user.logged_in',
                properties: {
                    loginProvider: 'password',
                },
            });
            return user;
        } catch (e) {
            if (e instanceof NotFoundError) {
                throw new AuthorizationError(
                    'Email and password not recognized',
                );
            }
            throw e;
        }
    }

    async hasPassword(user: SessionUser): Promise<boolean> {
        return this.userModel.hasPassword(user.userUuid);
    }

    async updatePassword(
        user: SessionUser,
        data: { password: string; newPassword: string },
    ): Promise<void> {
        const hasPassword = await this.userModel.hasPassword(user.userUuid);
        if (hasPassword) {
            // confirm old password
            await this.userModel.getUserByUuidAndPassword(
                user.userUuid,
                data.password,
            );
            await this.userModel.updatePassword(
                user.userUuid,
                data.newPassword,
            );
        } else {
            await this.userModel.createPassword(user.userId, data.newPassword);
        }
        this.analytics.track({
            userId: user.userUuid,
            event: 'password.updated',
        });
    }

    async updateUser(
        user: SessionUser,
        data: Partial<UpdateUserArgs>,
    ): Promise<LightdashUser> {
        const updatedUser = await this.userModel.updateUser(
            user.userUuid,
            user.email,
            {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                isMarketingOptedIn: data.isMarketingOptedIn,
                isTrackingAnonymized: data.isTrackingAnonymized,
            },
        );
        this.identifyUser(updatedUser);
        this.analytics.track({
            userId: updatedUser.userUuid,
            event: 'user.updated',
            properties: {
                ...updatedUser,
                updatedUserId: updatedUser.userUuid,
                organizationId: updatedUser.organizationUuid,
                context: 'update_self',
            },
        });
        return updatedUser;
    }

    async registerOrActivateUser(
        user: RegisterOrActivateUser,
    ): Promise<SessionUser> {
        let lightdashUser;
        if (hasInviteCode(user)) {
            lightdashUser = await this.activateUserFromInvite(user.inviteCode, {
                firstName: user.firstName,
                lastName: user.lastName,
                password: user.password,
            });
        } else {
            await this.checkNewUserRegistrationAllowed(undefined, user.email);

            lightdashUser = await this.registerUser({
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                password: user.password,
            });
        }

        return this.userModel.findSessionUserByUUID(lightdashUser.userUuid);
    }

    private async registerUser(createUser: CreateUserArgs | OpenIdUser) {
        if (isOpenIdUser(createUser)) {
            if (
                (await this.isLoginMethodAllowed(
                    createUser.openId.email,
                    createUser.openId.issuerType,
                )) === false
            ) {
                throw new ForbiddenError(
                    `User with email ${createUser.openId.email} is not allowed to login with ${createUser.openId.issuerType}`,
                );
            }
        } else if (
            (await this.isLoginMethodAllowed(
                createUser.email,
                LocalIssuerTypes.EMAIL,
            )) === false
        ) {
            throw new ForbiddenError(
                `User with email ${createUser.email} is not allowed to login with password`,
            );
        }

        const user = await this.userModel.createUser(createUser);
        this.identifyUser({
            ...user,
            isMarketingOptedIn: user.isMarketingOptedIn,
        });
        this.analytics.track({
            event: 'user.created',
            userId: user.userUuid,
            properties: {
                context: 'accept_invite',
                createdUserId: user.userUuid,
                organizationId: user.organizationUuid,
                userConnectionType: isOpenIdUser(createUser)
                    ? createUser.openId.issuerType
                    : 'password',
            },
        });
        if (isOpenIdUser(createUser)) {
            this.analytics.track({
                userId: user.userUuid,
                event: 'user.identity_linked',
                properties: {
                    loginProvider: createUser.openId.issuerType,
                },
            });
        } else {
            await this.sendOneTimePasscodeToPrimaryEmail(user);
        }
        return user;
    }

    async verifyPasswordResetLink(code: string): Promise<void> {
        const link = await this.passwordResetLinkModel.getByCode(code);
        if (link.isExpired) {
            try {
                await this.passwordResetLinkModel.deleteByCode(link.code);
            } catch (e) {
                throw new NotExistsError('Password reset link not found');
            }
            throw new NotExistsError('Password reset link expired');
        }
    }

    async recoverPassword(data: CreatePasswordResetLink): Promise<void> {
        const user = await this.userModel.findUserByEmail(data.email);
        if (user) {
            const code = nanoid(30);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // expires in 1 day
            const link = await this.passwordResetLinkModel.create(
                code,
                expiresAt,
                data.email,
            );
            this.analytics.track({
                userId: user.userUuid,
                event: 'password_reset_link.created',
            });
            await this.emailClient.sendPasswordRecoveryEmail(link);
        }
    }

    async resetPassword(data: PasswordReset): Promise<void> {
        const link = await this.passwordResetLinkModel.getByCode(data.code);
        if (link.isExpired) {
            throw new NotExistsError('Password reset link expired');
        }
        const user = await this.userModel.findUserByEmail(link.email);
        if (user) {
            await this.userModel.upsertPassword(
                user.userUuid,
                data.newPassword,
            );
            await this.passwordResetLinkModel.deleteByCode(link.code);
            this.analytics.track({
                userId: user.userUuid,
                event: 'password_reset_link.used',
            });
        }
    }

    async loginWithPersonalAccessToken(token: string): Promise<SessionUser> {
        const results =
            await this.userModel.findSessionUserByPersonalAccessToken(token);
        if (results === undefined) {
            throw new AuthorizationError();
        }
        const { user, personalAccessToken } = results;
        if (!user.isActive) {
            throw new DeactivatedAccountError();
        }
        if (user.ability.cannot('view', subject('PersonalAccessToken', {}))) {
            throw new ForbiddenError(
                'You do not have permission to login with personal access tokens',
            );
        }
        const organization = this.loginToOrganization(
            user.userUuid,
            LocalIssuerTypes.API_TOKEN,
        );
        const userWithOrganization: SessionUser = { ...user, ...organization };

        const now = new Date();
        if (
            personalAccessToken.expiresAt &&
            personalAccessToken.expiresAt <= now
        ) {
            if (personalAccessToken.uuid) {
                await this.personalAccessTokenModel.delete(
                    personalAccessToken.uuid,
                );
            }
            throw new AuthorizationError();
        }
        // Update last used date
        await this.personalAccessTokenModel.updateUsedDate(
            personalAccessToken.uuid,
        );
        return userWithOrganization;
    }

    async getSessionByUserUuid(userUuid: string): Promise<SessionUser> {
        return this.userModel.findSessionUserByUUID(userUuid);
    }

    private otpExpirationDate(createdAt: Date) {
        return new Date(
            createdAt.getTime() + this.emailOneTimePasscodeExpirySeconds * 1000,
        );
    }

    async sendOneTimePasscodeToPrimaryEmail(
        user: Pick<SessionUser, 'userUuid'>,
    ): Promise<EmailStatusExpiring> {
        const passcode =
            this.lightdashConfig.mode === LightdashMode.PR ||
            this.lightdashConfig.mode === LightdashMode.DEV
                ? '000000'
                : randomInt(999999).toString().padStart(6, '0');
        const emailStatus = await this.emailModel.createPrimaryEmailOtp({
            passcode,
            userUuid: user.userUuid,
        });
        await this.emailClient.sendOneTimePasscodeEmail({
            recipient: emailStatus.email,
            passcode,
        });
        return {
            ...emailStatus,
            otp: emailStatus.otp && {
                ...emailStatus.otp,
                expiresAt: this.otpExpirationDate(emailStatus.otp.createdAt),
                isExpired: this.isOtpExpired(emailStatus.otp.createdAt),
                isMaxAttempts: this.isOtpMaxAttempts(
                    emailStatus.otp.numberOfAttempts,
                ),
            },
        };
    }

    private isOtpExpired(createdAt: Date) {
        return this.otpExpirationDate(createdAt) < new Date();
    }

    private isOtpMaxAttempts(attempts: number) {
        return attempts >= this.emailOneTimePasscodeMaxAttempts;
    }

    async getPrimaryEmailStatus(
        user: SessionUser,
        passcode?: string,
    ): Promise<EmailStatusExpiring> {
        // Attempt to verify the passcode if it's provided
        if (passcode) {
            try {
                const emailStatus =
                    await this.emailModel.getPrimaryEmailStatusByUserAndOtp({
                        userUuid: user.userUuid,
                        passcode,
                    });
                if (
                    emailStatus.otp &&
                    !this.isOtpMaxAttempts(emailStatus.otp.numberOfAttempts) &&
                    !this.isOtpExpired(emailStatus.otp.createdAt)
                ) {
                    await this.tryVerifyUserEmail(user, emailStatus.email);
                    await this.emailModel.deleteEmailOtp(
                        user.userUuid,
                        emailStatus.email,
                    );
                }
            } catch (e) {
                // Attempt to find an email+passcode combo failed, increment the number of attempts
                if (e instanceof NotFoundError) {
                    await this.emailModel.incrementPrimaryEmailOtpAttempts(
                        user.userUuid,
                    );
                } else {
                    throw e;
                }
            }
        }

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        const emailStatusExpiring = {
            ...emailStatus,
            otp: emailStatus.otp && {
                ...emailStatus.otp,
                expiresAt: this.otpExpirationDate(emailStatus.otp.createdAt),
                isMaxAttempts: this.isOtpMaxAttempts(
                    emailStatus.otp.numberOfAttempts,
                ),
                isExpired: this.isOtpExpired(emailStatus.otp.createdAt),
            },
        };
        return emailStatusExpiring;
    }

    async getAllowedOrganizations(
        user: SessionUser,
    ): Promise<UserAllowedOrganization[]> {
        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        if (emailStatus.isVerified) {
            return this.organizationModel.getAllowedOrgsForDomain(
                getEmailDomain(emailStatus.email),
            );
        }
        return [];
    }

    async joinOrg(user: SessionUser, orgUuid: string): Promise<void> {
        if (isUserWithOrg(user)) {
            throw new ForbiddenError('User already has an organization');
        }
        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        if (!emailStatus.isVerified) {
            throw new ForbiddenError('User has not verified their email');
        }
        const allowedEmailDomains =
            await this.organizationAllowedEmailDomainsModel.getAllowedEmailDomains(
                orgUuid,
            );
        if (
            !allowedEmailDomains.emailDomains.some(
                (domain) =>
                    domain.toLowerCase() === getEmailDomain(emailStatus.email),
            )
        ) {
            throw new ForbiddenError(
                'User is not allowed to join this organization',
            );
        }
        await this.userModel.joinOrg(
            user.userUuid,
            orgUuid,
            allowedEmailDomains.role,
            allowedEmailDomains.role === OrganizationMemberRole.MEMBER
                ? allowedEmailDomains.projects.reduce(
                      (acc, project) => ({
                          ...acc,
                          [project.projectUuid]: project.role,
                      }),
                      {},
                  )
                : undefined,
        );

        await this.analytics.track({
            userId: user.userUuid,
            event: 'user.joined_organization',
            properties: {
                organizationId: orgUuid,
                role: allowedEmailDomains.role,
                projectIds: allowedEmailDomains.projects.map(
                    (project) => project.projectUuid,
                ),
            },
        });
    }

    async loginToOrganization(
        userUuid: string,
        loginMethod: LoginOptionTypes,
    ): Promise<
        Pick<
            LightdashUser,
            'organizationUuid' | 'organizationCreatedAt' | 'organizationName'
        >
    > {
        const organizations = await this.userModel.getOrganizationsForUser(
            userUuid,
        );
        if (organizations.length === 0) {
            throw new NotExistsError('User not part of any organization');
        } else if (organizations.length > 1) {
            throw new ForbiddenError('User is part of multiple organizations');
        }
        // TODO check valid login methods allowed in org
        // const organization = await this.organizationModel.get(organizations[0].organization_uuid)
        return organizations[0];
    }

    async findSessionUser(passportUser: { id: string; organization: string }) {
        const user = await wrapSentryTransaction(
            'Passport.deserializeUser',
            {},
            () =>
                this.userModel.findSessionUserAndOrgByUuid(
                    passportUser.id,
                    passportUser.organization,
                ),
        );

        return user;
    }

    private static async generateGoogleAccessToken(
        refreshToken: string,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            refresh.requestNewAccessToken(
                'google',
                refreshToken,
                (err: any, accessToken: string, _refreshToken, result) => {
                    if (err || !accessToken) {
                        reject(err);
                        return;
                    }

                    const scopes: string[] =
                        result && typeof result.scope === 'string'
                            ? result.scope.split(' ')
                            : [];
                    if (
                        scopes.includes(
                            'https://www.googleapis.com/auth/drive.file',
                        ) &&
                        scopes.includes(
                            'https://www.googleapis.com/auth/spreadsheets',
                        )
                    ) {
                        resolve(accessToken);
                    }
                    reject(
                        new AuthorizationError(
                            'Missing authorization to access Google Drive',
                        ),
                    );
                },
            );
        });
    }

    /**
     * This method is used on the gdrive API to get the accessToken for listing files on the user's drive
     * @param user
     * @returns accessToken
     */
    async getAccessToken(user: SessionUser): Promise<string> {
        const refreshToken = await this.userModel.getRefreshToken(
            user.userUuid,
        );
        const accessToken = await UserService.generateGoogleAccessToken(
            refreshToken,
        );
        return accessToken;
    }

    async isLoginMethodAllowed(_email: string, loginMethod: LoginOptionTypes) {
        switch (loginMethod) {
            case LocalIssuerTypes.EMAIL:
                return !this.lightdashConfig.auth.disablePasswordAuthentication;
            case LocalIssuerTypes.API_TOKEN:
            case OpenIdIdentityIssuerType.GOOGLE:
            case OpenIdIdentityIssuerType.OKTA:
            case OpenIdIdentityIssuerType.ONELOGIN:
            case OpenIdIdentityIssuerType.AZUREAD:
            case OpenIdIdentityIssuerType.GENERIC_OIDC:
                return true;
            default:
                assertUnreachable(
                    loginMethod,
                    `Invalid login method ${loginMethod} provided.`,
                );
        }
        return true;
    }

    /**
     * This method is used on the scheduler to perform the actions on Google Drive for that user
     * @param user
     * @returns accessToken
     */
    async getRefreshToken(userUuid: string): Promise<string> {
        return this.userModel.getRefreshToken(userUuid);
    }

    async getWarehouseCredentials(user: SessionUser) {
        return this.userWarehouseCredentialsModel.getAllByUserUuid(
            user.userUuid,
        );
    }

    async createWarehouseCredentials(
        user: SessionUser,
        data: UpsertUserWarehouseCredentials,
    ) {
        const userWarehouseCredentialsUuid =
            await this.userWarehouseCredentialsModel.create(
                user.userUuid,
                data,
            );
        this.analytics.track({
            userId: user.userUuid,
            event: 'user_warehouse_credentials.created',
            properties: {
                credentialsId: userWarehouseCredentialsUuid,
                warehouseType: data.credentials.type,
            },
        });
        return this.userWarehouseCredentialsModel.getByUuid(
            userWarehouseCredentialsUuid,
        );
    }

    async updateWarehouseCredentials(
        user: SessionUser,
        userWarehouseCredentialsUuid: string,
        data: UpsertUserWarehouseCredentials,
    ) {
        await this.userWarehouseCredentialsModel.update(
            user.userUuid,
            userWarehouseCredentialsUuid,
            data,
        );
        this.analytics.track({
            userId: user.userUuid,
            event: 'user_warehouse_credentials.updated',
            properties: {
                credentialsId: userWarehouseCredentialsUuid,
                warehouseType: data.credentials.type,
            },
        });
        return this.userWarehouseCredentialsModel.getByUuid(
            userWarehouseCredentialsUuid,
        );
    }

    async deleteWarehouseCredentials(
        user: SessionUser,
        userWarehouseCredentialsUuid: string,
    ) {
        await this.userWarehouseCredentialsModel.delete(
            user.userUuid,
            userWarehouseCredentialsUuid,
        );
        this.analytics.track({
            userId: user.userUuid,
            event: 'user_warehouse_credentials.deleted',
            properties: {
                credentialsId: userWarehouseCredentialsUuid,
            },
        });
    }

    private getRedirectUri(issuer: OpenIdIdentityIssuerType) {
        switch (issuer) {
            case OpenIdIdentityIssuerType.AZUREAD:
                return this.lightdashConfig.auth.azuread.loginPath;
            case OpenIdIdentityIssuerType.GOOGLE:
                return this.lightdashConfig.auth.google.loginPath;
            case OpenIdIdentityIssuerType.OKTA:
                return this.lightdashConfig.auth.okta.loginPath;
            case OpenIdIdentityIssuerType.ONELOGIN:
                return this.lightdashConfig.auth.oneLogin.loginPath;
            case OpenIdIdentityIssuerType.GENERIC_OIDC:
                return this.lightdashConfig.auth.oidc.loginPath;
            default:
                assertUnreachable(
                    issuer,
                    `Invalid login option for issuer ${issuer}`,
                );
        }
        return undefined;
    }

    private getInstanceLoginOptions() {
        const options = new Set<LoginOptionTypes>();
        if (!this.lightdashConfig.auth.disablePasswordAuthentication) {
            options.add(LocalIssuerTypes.EMAIL);
        }
        if (this.lightdashConfig.auth.google.enabled) {
            options.add(OpenIdIdentityIssuerType.GOOGLE);
        }
        if (this.lightdashConfig.auth.azuread?.oauth2ClientId !== undefined) {
            options.add(OpenIdIdentityIssuerType.AZUREAD);
        }
        if (this.lightdashConfig.auth.oneLogin?.oauth2ClientId) {
            options.add(OpenIdIdentityIssuerType.ONELOGIN);
        }
        if (this.lightdashConfig.auth.okta?.oauth2ClientId) {
            options.add(OpenIdIdentityIssuerType.OKTA);
        }
        if (this.lightdashConfig.auth.oidc.clientId) {
            options.add(OpenIdIdentityIssuerType.GENERIC_OIDC);
        }
        return options;
    }

    async getLoginOptions(email?: string): Promise<LoginOptions> {
        const instancesOptions = this.getInstanceLoginOptions();
        if (!email) {
            return {
                showOptions: Array.from(instancesOptions),
                forceRedirect: false,
                redirectUri: undefined,
            };
        }

        const openIdIssuers = await this.userModel.getOpenIdIssuers(email);
        const hasPassword = await this.userModel.hasPasswordByEmail(email);
        const userOptions = hasPassword
            ? [LocalIssuerTypes.EMAIL, ...openIdIssuers]
            : openIdIssuers;
        // Filter out the options that are not available for the instance. eg: user connected to google drive but google auth is not enabled
        const validUserOptions = userOptions.filter((option) =>
            instancesOptions.has(option),
        );

        // if user has no valid options, return instance options
        if (validUserOptions.length === 0) {
            return {
                showOptions: Array.from(instancesOptions),
                forceRedirect: false,
                redirectUri: undefined,
            };
        }

        const oidcOptions = validUserOptions.filter(isOpenIdIdentityIssuerType);
        if (oidcOptions.length === 1) {
            // Force redirect to the only issuer option
            return {
                showOptions: validUserOptions,
                forceRedirect: true,
                redirectUri: new URL(
                    `/api/v1${this.getRedirectUri(
                        oidcOptions[0],
                    )}?login_hint=${encodeURIComponent(email)}`,
                    this.lightdashConfig.siteUrl,
                ).href,
            };
        }
        return {
            showOptions: validUserOptions,
            forceRedirect: false,
            redirectUri: undefined,
        };
    }
}
