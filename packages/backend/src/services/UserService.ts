import { subject } from '@casl/ability';
import {
    ActivateUser,
    AuthorizationError,
    CompleteUserArgs,
    CreateInviteLink,
    CreatePasswordResetLink,
    CreateUserArgs,
    DeleteOpenIdentity,
    EmailStatusExpiring,
    ExpiredError,
    ForbiddenError,
    getEmailDomain,
    hasInviteCode,
    InviteLink,
    isOpenIdUser,
    isUserWithOrg,
    LightdashMode,
    LightdashUser,
    NotExistsError,
    NotFoundError,
    OpenIdIdentitySummary,
    OpenIdUser,
    OrganizationMemberRole,
    ParameterError,
    PasswordReset,
    RegisterOrActivateUser,
    SessionUser,
    UpdateUserArgs,
    UserAllowedOrganization,
    validateOrganizationEmailDomains,
} from '@lightdash/common';
import { randomInt } from 'crypto';
import { nanoid } from 'nanoid';
import refresh from 'passport-oauth2-refresh';
import { analytics, identifyUser } from '../analytics/client';
import EmailClient from '../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../config/lightdashConfig';
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

type UserServiceDependencies = {
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
};

export class UserService {
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

    private readonly emailOneTimePasscodeExpirySeconds = 60 * 15;

    private readonly emailOneTimePasscodeMaxAttempts = 5;

    constructor({
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
    }: UserServiceDependencies) {
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
            analytics.track({
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
        if (
            !isOpenIdUser(activateUser) &&
            lightdashConfig.auth.disablePasswordAuthentication
        ) {
            throw new ForbiddenError('Password credentials are not allowed');
        }

        const inviteLink = await this.inviteLinkModel.getByCode(inviteCode);
        const userEmail = isOpenIdUser(activateUser)
            ? activateUser.openId.email
            : inviteLink.email;

        if (inviteLink.email.toLowerCase() !== userEmail.toLowerCase()) {
            Logger.error(
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
        identifyUser(user);
        analytics.track({
            event: 'user.created',
            userId: user.userUuid,
            properties: {
                userConnectionType: 'password',
            },
        });
        if (!isOpenIdUser(activateUser)) {
            await this.sendOneTimePasscodeToPrimaryEmail(user);
        }
        return user;
    }

    async delete(user: SessionUser, userUuidToDelete: string): Promise<void> {
        if (user.organizationUuid) {
            if (user.ability.cannot('delete', 'OrganizationMemberProfile')) {
                throw new ForbiddenError();
            }

            // Race condition between check and delete
            const [admin, ...remainingAdmins] =
                await this.organizationMemberProfileModel.getOrganizationAdmins(
                    user.organizationUuid,
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
        analytics.track({
            event: 'user.deleted',
            userId: user.userUuid,
            properties: {
                deletedUserUuid: userUuidToDelete,
            },
        });
    }

    async createPendingUserAndInviteLink(
        user: SessionUser,
        createInviteLink: CreateInviteLink,
    ): Promise<InviteLink> {
        if (user.ability.cannot('create', 'InviteLink')) {
            throw new ForbiddenError();
        }
        const { organizationUuid } = user;
        const { expiresAt, email, role } = createInviteLink;
        const inviteCode = nanoid(30);
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

        const existingUserWithEmail = await this.userModel.findUserByEmail(
            email,
        );
        if (
            existingUserWithEmail &&
            existingUserWithEmail.organizationUuid !== organizationUuid
        ) {
            throw new ParameterError(
                'Email is already used by a user in another organization',
            );
        }
        if (existingUserWithEmail && existingUserWithEmail.isActive) {
            throw new ParameterError(
                'Email is already used by a user in your organization',
            );
        }

        let userUuid: string;
        const userRole = user.ability.can('manage', 'OrganizationMemberProfile')
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

        const inviteLink = await this.inviteLinkModel.upsert(
            inviteCode,
            expiresAt,
            organizationUuid,
            userUuid,
        );
        await this.emailClient.sendInviteEmail(user, inviteLink);
        analytics.track({
            userId: user.userUuid,
            event: 'invite_link.created',
        });

        const organization = await this.organizationModel.get(organizationUuid);
        analytics.track({
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
        const { organizationUuid } = user;
        if (user.ability.cannot('delete', 'InviteLink')) {
            throw new ForbiddenError();
        }
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        await this.inviteLinkModel.deleteByOrganization(organizationUuid);
        analytics.track({
            userId: user.userUuid,
            event: 'invite_link.all_revoked',
        });
    }

    async loginWithOpenId(
        openIdUser: OpenIdUser,
        sessionUser: SessionUser | undefined,
        inviteCode: string | undefined,
        refreshToken?: string,
    ): Promise<SessionUser> {
        const loginUser = await this.userModel.findSessionUserByOpenId(
            openIdUser.openId.issuer,
            openIdUser.openId.subject,
        );

        // Identity already exists. Update the identity attributes and login the user
        if (loginUser) {
            if (inviteCode) {
                const inviteLink = await this.inviteLinkModel.getByCode(
                    inviteCode,
                );
                if (
                    loginUser.email &&
                    inviteLink.email.toLowerCase() !==
                        loginUser.email.toLowerCase()
                ) {
                    Logger.error(
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
            identifyUser(loginUser);
            analytics.track({
                userId: loginUser.userUuid,
                event: 'user.logged_in',
                properties: {
                    loginProvider: 'google',
                },
            });

            if (
                Array.isArray(openIdUser.openId.groups) &&
                openIdUser.openId.groups.length &&
                loginUser.organizationUuid
            )
                await this.groupsModel.addUserToGroupsIfExist({
                    userUuid: loginUser.userUuid,
                    groups: openIdUser.openId.groups,
                    organizationUuid: loginUser.organizationUuid,
                });

            return loginUser;
        }

        // User already logged in? Link openid identity to logged-in user
        if (sessionUser?.userId) {
            await this.openIdIdentityModel.createIdentity({
                userId: sessionUser.userId,
                issuer: openIdUser.openId.issuer,
                subject: openIdUser.openId.subject,
                email: openIdUser.openId.email,
                issuerType: openIdUser.openId.issuerType,
                refreshToken,
            });
            await this.tryVerifyUserEmail(sessionUser, openIdUser.openId.email);
            analytics.track({
                userId: sessionUser.userUuid,
                event: 'user.identity_linked',
                properties: {
                    loginProvider: 'google',
                },
            });

            if (
                Array.isArray(openIdUser.openId.groups) &&
                openIdUser.openId.groups.length &&
                sessionUser.organizationUuid
            )
                await this.groupsModel.addUserToGroupsIfExist({
                    userUuid: sessionUser.userUuid,
                    groups: openIdUser.openId.groups,
                    organizationUuid: sessionUser.organizationUuid,
                });

            return sessionUser;
        }

        // Create user
        const createdUser = await this.activateUserWithOpenId(
            openIdUser,
            inviteCode,
        );
        await this.tryVerifyUserEmail(createdUser, openIdUser.openId.email);

        if (
            Array.isArray(openIdUser.openId.groups) &&
            openIdUser.openId.groups.length &&
            createdUser.organizationUuid
        )
            await this.groupsModel.addUserToGroupsIfExist({
                userUuid: createdUser.userUuid,
                groups: openIdUser.openId.groups,
                organizationUuid: createdUser.organizationUuid,
            });

        return createdUser;
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
            analytics.track({
                userId: user.userUuid,
                event: 'organization.updated',
                properties: {
                    type:
                        lightdashConfig.mode === LightdashMode.CLOUD_BETA
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

        identifyUser(completeUser);
        analytics.track({
            event: 'user.updated',
            userId: completeUser.userUuid,
            properties: {
                ...completeUser,
                jobTitle,
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
        await this.openIdIdentityModel.deleteIdentity(
            user.userId,
            openIdentity.issuer,
            openIdentity.email,
        );
        analytics.track({
            userId: user.userUuid,
            event: 'user.identity_removed',
            properties: {
                loginProvider: 'google',
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
        try {
            if (lightdashConfig.auth.disablePasswordAuthentication) {
                throw new ForbiddenError(
                    'Password credentials are not allowed',
                );
            }
            // TODO: move to authorization service layer
            const user = await this.userModel.getUserByPrimaryEmailAndPassword(
                email,
                password,
            );
            identifyUser(user);
            analytics.track({
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
            await this.userModel.updatePassword(user.userId, data.newPassword);
        } else {
            await this.userModel.createPassword(user.userId, data.newPassword);
        }
        analytics.track({
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
            data,
        );
        identifyUser(updatedUser);
        analytics.track({
            userId: updatedUser.userUuid,
            event: 'user.updated',
            properties: updatedUser,
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
        if (
            !isOpenIdUser(createUser) &&
            lightdashConfig.auth.disablePasswordAuthentication
        ) {
            throw new ForbiddenError('Password credentials are not allowed');
        }
        const user = await this.userModel.createUser(createUser);
        identifyUser({
            ...user,
            isMarketingOptedIn: user.isMarketingOptedIn,
        });
        analytics.track({
            event: 'user.created',
            userId: user.userUuid,
            properties: {
                userConnectionType: isOpenIdUser(createUser)
                    ? 'google'
                    : 'password',
            },
        });
        if (isOpenIdUser(createUser)) {
            analytics.track({
                userId: user.userUuid,
                event: 'user.identity_linked',
                properties: {
                    loginProvider: 'google',
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
            analytics.track({
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
            analytics.track({
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
        return user;
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
            lightdashConfig.mode === LightdashMode.PR ||
            lightdashConfig.mode === LightdashMode.DEV
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

        await analytics.track({
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

    private static async generateGoogleAccessToken(
        refreshToken: string,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            refresh.requestNewAccessToken(
                'google',
                refreshToken,
                (err: any, accessToken: string) => {
                    if (err || !accessToken) {
                        reject(err);
                        return;
                    }
                    resolve(accessToken);
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

    /**
     * This method is used on the scheduler to perform the actions on Google Drive for that user
     * @param user
     * @returns accessToken
     */
    async getRefreshToken(userUuid: string): Promise<string> {
        return this.userModel.getRefreshToken(userUuid);
    }
}
