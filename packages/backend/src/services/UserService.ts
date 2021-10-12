import {
    SessionUser,
    CreateInviteLink,
    InviteLink,
    CreateOrganizationUser,
    LightdashUser,
    LightdashMode,
} from 'common';

import { nanoid } from 'nanoid';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { ForbiddenError, NotExistsError } from '../errors';
import { analytics, identifyUser } from '../analytics/client';
import { UserModel } from '../models/UserModel';
import { mapDbUserDetailsToLightdashUser } from '../models/User';
import { SessionModel } from '../models/SessionModel';
import { lightdashConfig } from '../config/lightdashConfig';

type UserServiceDependencies = {
    inviteLinkModel: InviteLinkModel;
    userModel: UserModel;
    sessionModel: SessionModel;
};

export class UserService {
    private readonly inviteLinkModel: InviteLinkModel;

    private readonly userModel: UserModel;

    private readonly sessionModel: SessionModel;

    constructor({
        inviteLinkModel,
        userModel,
        sessionModel,
    }: UserServiceDependencies) {
        this.inviteLinkModel = inviteLinkModel;
        this.userModel = userModel;
        this.sessionModel = sessionModel;
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
}
