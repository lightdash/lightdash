import {
    CreateInitialUserArgs,
    CreateInviteLink,
    CreateOrganizationUser,
    CreatePasswordResetLink,
    InviteLink,
    LightdashMode,
    LightdashUser,
    OpenIdIdentitySummary,
    OpenIdUser,
    PasswordReset,
    SessionUser,
    UpdateUserArgs,
} from 'common';
import { nanoid } from 'nanoid';
import { analytics, identifyUser } from '../analytics/client';
import EmailClient from '../clients/EmailClient/EmailClient';
import { lightdashConfig } from '../config/lightdashConfig';
import { updatePassword } from '../database/entities/passwordLogins';
import {
    AuthorizationError,
    ForbiddenError,
    NotExistsError,
    NotFoundError,
} from '../errors';
import { EmailModel } from '../models/EmailModel';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { OpenIdIdentityModel } from '../models/OpenIdIdentitiesModel';
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
};

export class UserService {
    private readonly inviteLinkModel: InviteLinkModel;

    private readonly userModel: UserModel;

    private readonly sessionModel: SessionModel;

    private readonly emailModel: EmailModel;

    private readonly openIdIdentityModel: OpenIdIdentityModel;

    private readonly passwordResetLinkModel: PasswordResetLinkModel;

    private readonly emailClient: EmailClient;

    constructor({
        inviteLinkModel,
        userModel,
        sessionModel,
        emailModel,
        openIdIdentityModel,
        emailClient,
        passwordResetLinkModel,
    }: UserServiceDependencies) {
        this.inviteLinkModel = inviteLinkModel;
        this.userModel = userModel;
        this.sessionModel = sessionModel;
        this.emailModel = emailModel;
        this.openIdIdentityModel = openIdIdentityModel;
        this.passwordResetLinkModel = passwordResetLinkModel;
        this.emailClient = emailClient;
    }

    async create(
        createOrganizationUser: CreateOrganizationUser,
    ): Promise<LightdashUser> {
        const user = await this.userModel.createUser(createOrganizationUser);
        identifyUser(user);
        analytics.track({
            organizationId: user.organizationUuid,
            event: 'user.created',
            userId: user.userUuid,
            properties: {
                jobTitle: createOrganizationUser.jobTitle,
            },
        });
        return user;
    }

    async delete(user: SessionUser, userUuid: string): Promise<void> {
        if (user.organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

        const users = await this.userModel.getAllByOrganization(
            user.organizationUuid,
        );
        if (users.length <= 1) {
            throw new ForbiddenError(
                'Organization needs to have at least one user',
            );
        }

        await this.sessionModel.deleteAllByUserUuid(userUuid);

        await this.userModel.delete(userUuid);
        analytics.track({
            organizationId: user.organizationUuid,
            event: 'user.deleted',
            userId: user.userUuid,
            properties: {
                deletedUserUuid: userUuid,
            },
        });
    }

    async createOrganizationInviteLink(
        user: SessionUser,
        createInviteLink: CreateInviteLink,
    ): Promise<InviteLink> {
        const { organizationUuid } = user;
        const { expiresAt } = createInviteLink;
        const inviteCode = nanoid(30);
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const inviteLink = await this.inviteLinkModel.create(
            inviteCode,
            expiresAt,
            organizationUuid,
        );
        analytics.track({
            organizationId: organizationUuid,
            userId: user.userUuid,
            event: 'invite_link.created',
        });
        return inviteLink;
    }

    async revokeAllInviteLinks(user: SessionUser) {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        await this.inviteLinkModel.deleteByOrganization(organizationUuid);
        analytics.track({
            organizationId: organizationUuid,
            userId: user.userUuid,
            event: 'invite_link.all_revoked',
        });
    }

    async loginWithOpenId(
        openIdUser: OpenIdUser,
        sessionUser: SessionUser | undefined,
    ): Promise<SessionUser | undefined> {
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
                organizationId: loginUser.organizationUuid,
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
            await this.openIdIdentityModel.createIdentity({
                userId: sessionUser.userId,
                issuer: openIdUser.openId.issuer,
                subject: openIdUser.openId.subject,
                email: openIdUser.openId.email,
            });
            analytics.track({
                organizationId: sessionUser.organizationUuid,
                userId: sessionUser.userUuid,
                event: 'user.identity_linked',
                properties: {
                    loginProvider: 'google',
                },
            });
            return sessionUser;
        }
        return undefined;
    }

    async getLinkedIdentities({
        userId,
    }: Pick<SessionUser, 'userId'>): Promise<OpenIdIdentitySummary[]> {
        return this.openIdIdentityModel.getIdentitiesByUserId(userId);
    }

    async getInviteLink(inviteCode: string): Promise<InviteLink> {
        const inviteLink = await this.inviteLinkModel.findByCode(inviteCode);
        const now = new Date();
        if (inviteLink.expiresAt <= now) {
            try {
                await this.inviteLinkModel.deleteByCode(inviteLink.inviteCode);
            } catch (e) {
                throw new NotExistsError('Invite link not found');
            }
            throw new NotExistsError('Invite link expired');
        }
        return inviteLink;
    }

    async loginWithPassword(
        email: string,
        password: string,
    ): Promise<LightdashUser> {
        try {
            // TODO: move to authorization service layer
            const user = await this.userModel.getUserByPrimaryEmailAndPassword(
                email,
                password,
            );
            identifyUser(user);
            analytics.track({
                organizationId: user.organizationUuid,
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
            organizationId: user.organizationUuid,
            event: 'password.updated',
        });
    }

    async updateUser(
        userId: number,
        currentEmail: string | undefined,
        data: UpdateUserArgs,
    ): Promise<LightdashUser> {
        const user = await this.userModel.updateUser(
            userId,
            currentEmail,
            data,
        );
        identifyUser(user);
        analytics.track({
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            event: 'user.updated',
        });
        return user;
    }

    async registerInitialUser(createUser: CreateInitialUserArgs) {
        if (await this.userModel.hasUsers()) {
            throw new ForbiddenError('User already registered');
        }
        const user = await this.userModel.createInitialUser(createUser);
        identifyUser({
            ...user,
            isMarketingOptedIn: createUser.isMarketingOptedIn,
        });
        analytics.track({
            event: 'user.created',
            organizationId: user.organizationUuid,
            userId: user.userUuid,
            properties: {
                jobTitle: createUser.jobTitle,
            },
        });
        analytics.track({
            event: 'organization.created',
            userId: user.userUuid,
            organizationId: user.organizationUuid,
            properties: {
                type:
                    lightdashConfig.mode === LightdashMode.CLOUD_BETA
                        ? 'cloud'
                        : 'self-hosted',
                organizationId: user.organizationUuid,
                organizationName: user.organizationName,
            },
        });
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
                organizationId: user.organizationUuid,
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
                organizationId: user.organizationUuid,
                userId: user.userUuid,
                event: 'password_reset_link.used',
            });
        }
    }
}
