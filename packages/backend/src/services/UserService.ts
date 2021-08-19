import {
    SessionUser,
    CreateInviteLink,
    InviteLink,
    CreateOrganizationUser,
    LightdashUser,
} from 'common';

import { nanoid } from 'nanoid';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { NotExistsError } from '../errors';
import { analytics, identifyUser } from '../analytics/client';
import { UserModel } from '../models/UserModel';
import { mapDbUserDetailsToLightdashUser } from '../models/User';

type UserServiceDependencies = {
    inviteLinkModel: InviteLinkModel;
    userModel: UserModel;
};

export class UserService {
    private readonly inviteLinkModel: InviteLinkModel;

    private readonly userModel: UserModel;

    constructor({ inviteLinkModel, userModel }: UserServiceDependencies) {
        this.inviteLinkModel = inviteLinkModel;
        this.userModel = userModel;
    }

    async create(
        createOrganizationUser: CreateOrganizationUser,
    ): Promise<LightdashUser> {
        const user = await this.userModel.createUser(createOrganizationUser);
        const lightdashUser = mapDbUserDetailsToLightdashUser(user);
        identifyUser(lightdashUser);
        analytics.track({
            event: 'user.created',
            userId: lightdashUser.userUuid,
        });
        return lightdashUser;
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
