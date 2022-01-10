import {
    CreateInviteLink,
    CreateOrganizationUser,
    InviteLink,
    LightdashUser,
    PasswordResetLink,
    SessionUser,
} from 'common';
import { nanoid } from 'nanoid';
import { analytics, identifyUser } from '../analytics/client';
import EmailClient from '../emails/EmailClient';
import { ForbiddenError, NotExistsError } from '../errors';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { PasswordResetLinkModel } from '../models/PasswordResetLinkModel';
import { SessionModel } from '../models/SessionModel';
import { mapDbUserDetailsToLightdashUser } from '../models/User';
import { UserModel } from '../models/UserModel';

type UserServiceDependencies = {
    inviteLinkModel: InviteLinkModel;
    userModel: UserModel;
    sessionModel: SessionModel;
    passwordResetLinkModel: PasswordResetLinkModel;
    emailClient: typeof EmailClient;
};

export class UserService {
    private readonly inviteLinkModel: InviteLinkModel;

    private readonly userModel: UserModel;

    private readonly sessionModel: SessionModel;

    private readonly passwordResetLinkModel: PasswordResetLinkModel;

    private readonly emailClient: typeof EmailClient;

    constructor({
        inviteLinkModel,
        userModel,
        sessionModel,
        emailClient,
        passwordResetLinkModel,
    }: UserServiceDependencies) {
        this.inviteLinkModel = inviteLinkModel;
        this.userModel = userModel;
        this.sessionModel = sessionModel;
        this.passwordResetLinkModel = passwordResetLinkModel;
        this.emailClient = emailClient;
    }

    async create(
        createOrganizationUser: CreateOrganizationUser,
    ): Promise<LightdashUser> {
        const user = await this.userModel.createUser(createOrganizationUser);
        const lightdashUser = mapDbUserDetailsToLightdashUser(user);
        identifyUser(lightdashUser);
        analytics.track({
            organizationId: user.organization_uuid,
            event: 'user.created',
            userId: lightdashUser.userUuid,
        });
        return lightdashUser;
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
        inviteLink: CreateInviteLink,
    ): Promise<InviteLink> {
        const { organizationUuid } = user;
        const { expiresAt } = inviteLink;
        const inviteCode = nanoid(30);
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        await this.inviteLinkModel.create(
            inviteCode,
            expiresAt,
            organizationUuid,
        );
        analytics.track({
            organizationId: organizationUuid,
            userId: user.userUuid,
            event: 'invite_link.created',
        });
        return {
            inviteCode,
            expiresAt,
        };
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
        return {
            inviteCode,
            expiresAt: inviteLink.expiresAt,
        };
    }

    async getPasswordResetLink(code: string): Promise<PasswordResetLink> {
        return this.passwordResetLinkModel.getByCode(code);
    }

    async recoverPassword(data: { email: string }): Promise<void> {
        const user = await this.userModel.findUserByEmail(data.email);
        if (user) {
            const code = nanoid(30);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // expires in 1 day
            const link = await this.passwordResetLinkModel.create(
                code,
                expiresAt,
                data.email,
            );
            await this.emailClient.sendPasswordRecoveryEmail(data.email, link);
        }
    }

    async resetPassword(data: {
        code: string;
        newPassword: string;
    }): Promise<void> {
        const link = await this.passwordResetLinkModel.getByCode(data.code);
        // TODO: set user password
    }
}
