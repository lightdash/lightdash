import { subject } from '@casl/ability';
import {
    ForbiddenError,
    Group,
    GroupMembership,
    GroupWithMembers,
    SessionUser,
} from '@lightdash/common';
import { GroupsModel } from '../models/GroupsModel';

type GroupServiceDependencies = {
    groupsModel: GroupsModel;
};

export class GroupsService {
    private readonly groupsModel: GroupsModel;

    constructor(deps: GroupServiceDependencies) {
        this.groupsModel = deps.groupsModel;
    }

    async addGroupMember(
        actor: SessionUser,
        member: GroupMembership,
    ): Promise<GroupMembership | undefined> {
        const group = await this.groupsModel.getGroup(member.groupUuid);
        if (
            actor.ability.cannot(
                'update',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.groupsModel.addGroupMember(member);
    }

    async removeGroupMember(
        actor: SessionUser,
        member: GroupMembership,
    ): Promise<boolean> {
        const group = await this.groupsModel.getGroup(member.groupUuid);
        if (
            actor.ability.cannot(
                'update',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.groupsModel.removeGroupMember(member);
    }

    async delete(actor: SessionUser, groupUuid: string): Promise<void> {
        const group = await this.groupsModel.getGroup(groupUuid);
        if (
            actor.ability.cannot(
                'delete',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.groupsModel.deleteGroup(groupUuid);
    }

    async get(actor: SessionUser, groupUuid: string): Promise<Group> {
        const group = await this.groupsModel.getGroup(groupUuid);
        if (
            actor.ability.cannot(
                'view',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return group;
    }
}
