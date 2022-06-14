import {
    ActivateUser,
    AuthorizationError,
    CompleteUserArgs,
    CreateInviteLink,
    CreatePasswordResetLink,
    CreateUserArgs,
    DeleteOpenIdentity,
    ExpiredError,
    ForbiddenError,
    InviteLink,
    isOpenIdUser,
    LightdashMode,
    LightdashUser,
    NotExistsError,
    NotFoundError,
    OpenIdIdentitySummary,
    OpenIdUser,
    OrganizationMemberRole,
    ParameterError,
    PasswordReset,
    SessionUser,
    UpdateUserArgs,
} from '@lightdash/common';
import { nanoid } from 'nanoid';
import { analytics, identifyUser } from '../analytics/client';
import EmailClient from '../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../config/lightdashConfig';
import { updatePassword } from '../database/entities/passwordLogins';
import { PersonalAccessTokenModel } from '../models/DashboardModel/PersonalAccessTokenModel';
import { EmailModel } from '../models/EmailModel';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { OpenIdIdentityModel } from '../models/OpenIdIdentitiesModel';
import { OrganizationMemberProfileModel } from '../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../models/OrganizationModel';
import { PasswordResetLinkModel } from '../models/PasswordResetLinkModel';
import { SessionModel } from '../models/SessionModel';
import { UserModel } from '../models/UserModel';

type UserServiceDependencies = {
    inviteLinkModel: InviteLinkModel;
    userModel: UserModel;
    sessionModel: SessionModel;
    emailModel: EmailModel;
    openIdIdentityModel: OpenIdIdentityModel;
    passwordResetLinkModel: PasswordResetLinkModel;
    emailClient: EmailClient;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    organizationModel: OrganizationModel;
    personalAccessTokenModel: PersonalAccessTokenModel;
};

export class UserService {
    private readonly inviteLinkModel: InviteLinkModel;

    private readonly userModel: UserModel;

    private readonly sessionModel: SessionModel;

    private readonly emailModel: EmailModel;

    private readonly openIdIdentityModel: OpenIdIdentityModel;

    private readonly passwordResetLinkModel: PasswordResetLinkModel;

    private readonly emailClient: EmailClient;

    private readonly organizationMemberProfileModel;

    private readonly organizationModel: OrganizationModel;

    private readonly personalAccessTokenModel: PersonalAccessTokenModel;

    constructor({
        inviteLinkModel,
        userModel,
        sessionModel,
        emailModel,
        openIdIdentityModel,
        emailClient,
        passwordResetLinkModel,
        organizationModel,
        organizationMemberProfileModel,
        personalAccessTokenModel,
    }: UserServiceDependencies) {
        this.inviteLinkModel = inviteLinkModel;
        this.userModel = userModel;
        this.sessionModel = sessionModel;
        this.emailModel = emailModel;
        this.openIdIdentityModel = openIdIdentityModel;
        this.passwordResetLinkModel = passwordResetLinkModel;
        this.emailClient = emailClient;
        this.organizationModel = organizationModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.personalAccessTokenModel = personalAccessTokenModel;
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
        if (
            !(await this.verifyUserEmail(
                inviteLink.organisationUuid,
                userEmail,
            ))
        ) {
            throw new AuthorizationError('Email domain not allowed');
        }
        if (inviteLink.email !== userEmail) {
            throw new AuthorizationError('Email does not match the invite');
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
        return user;
    }

    async delete(user: SessionUser, userUuidToDelete: string): Promise<void> {
        if (user.organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

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

        if (!(await this.verifyUserEmail(organizationUuid, email))) {
            throw new AuthorizationError('Email domain not allowed');
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
        if (!existingUserWithEmail) {
            const pendingUser = await this.userModel.createPendingUser(
                organizationUuid,
                {
                    email,
                    firstName: '',
                    lastName: '',
                    role: user.ability.can(
                        'manage',
                        'OrganizationMemberProfile',
                    )
                        ? role || OrganizationMemberRole.MEMBER
                        : OrganizationMemberRole.MEMBER,
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
    ): Promise<SessionUser> {
        const loginUser = await this.userModel.findSessionUserByOpenId(
            openIdUser.openId.issuer,
            openIdUser.openId.subject,
        );

        // Identity already exists. Update the identity attributes and login the user
        if (loginUser) {
            await this.openIdIdentityModel.updateIdentityByOpenId(
                openIdUser.openId,
            );
            identifyUser(loginUser);
            analytics.track({
                userId: loginUser.userUuid,
                event: 'user.logged_in',
                properties: {
                    loginProvider: 'google',
                },
            });
            return loginUser;
        }

        // User already logged in? Link openid identity to logged-in user
        if (sessionUser?.userId) {
            if (
                !(await this.verifyUserEmail(
                    sessionUser.organizationUuid,
                    openIdUser.openId.email,
                ))
            ) {
                throw new AuthorizationError('Email domain not allowed');
            }
            await this.openIdIdentityModel.createIdentity({
                userId: sessionUser.userId,
                issuer: openIdUser.openId.issuer,
                subject: openIdUser.openId.subject,
                email: openIdUser.openId.email,
            });
            analytics.track({
                userId: sessionUser.userUuid,
                event: 'user.identity_linked',
                properties: {
                    loginProvider: 'google',
                },
            });
            return sessionUser;
        }

        // Create user
        return this.activateUserWithOpenId(openIdUser, inviteCode);
    }

    async activateUserWithOpenId(
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
        const user = await this.registerNewUserWithOrg(openIdUser);
        return this.userModel.findSessionUserByUUID(user.userUuid);
    }

    async completeUserSetup(
        user: SessionUser,
        {
            organizationName,
            jobTitle,
            isTrackingAnonymized,
            isMarketingOptedIn,
        }: CompleteUserArgs,
    ): Promise<LightdashUser> {
        if (organizationName) {
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
                },
            });
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

    async verifyUserEmail(
        organisationUuid: string,
        email: string,
    ): Promise<boolean> {
        const { allowedEmailDomains } = await this.organizationModel.get(
            organisationUuid,
        );
        return (
            allowedEmailDomains.length === 0 ||
            allowedEmailDomains.some((allowedEmailDomain) =>
                email.endsWith(`@${allowedEmailDomain}`),
            )
        );
    }

    async getLinkedIdentities({
        userId,
    }: Pick<SessionUser, 'userId'>): Promise<OpenIdIdentitySummary[]> {
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

    async updatePassword(
        userId: number,
        userUuid: string,
        data: { password: string; newPassword: string },
    ): Promise<void> {
        // Todo: Move to authorization service layer
        let user: LightdashUser;
        try {
            user = await this.userModel.getUserByUuidAndPassword(
                userUuid,
                data.password,
            );
        } catch (e) {
            if (e instanceof NotFoundError) {
                throw new AuthorizationError('Password not recognized.');
            }
            throw e;
        }
        await updatePassword(userId, data.newPassword);
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

    async registerNewUserWithOrg(createUser: CreateUserArgs | OpenIdUser) {
        if (
            !lightdashConfig.allowMultiOrgs &&
            (await this.userModel.hasUsers())
        ) {
            throw new ForbiddenError('User already registered');
        }
        if (
            !isOpenIdUser(createUser) &&
            lightdashConfig.auth.disablePasswordAuthentication
        ) {
            throw new ForbiddenError('Password credentials are not allowed');
        }

        const user = await this.userModel.createNewUserWithOrg(createUser);
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
        analytics.track({
            event: 'organization.created',
            userId: user.userUuid,
            properties: {
                type:
                    lightdashConfig.mode === LightdashMode.CLOUD_BETA
                        ? 'cloud'
                        : 'self-hosted',
                organizationId: user.organizationUuid,
                organizationName: user.organizationName,
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

    async loginWithPersonalAccessToken(token: string): Promise<LightdashUser> {
        const results = await this.userModel.findUserByPersonalAccessToken(
            token,
        );
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
}
