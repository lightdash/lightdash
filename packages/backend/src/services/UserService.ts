import { SessionUser, CreateInviteLink, InviteLink } from 'common';

import { nanoid } from 'nanoid';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { NotExistsError } from '../errors';
import { analytics } from '../analytics/client';

type UserServiceDependencies = {
    inviteLinkModel: InviteLinkModel;
};

export class UserService {
    private inviteLinkModel: InviteLinkModel;

    constructor({ inviteLinkModel }: UserServiceDependencies) {
        this.inviteLinkModel = inviteLinkModel;
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
}
