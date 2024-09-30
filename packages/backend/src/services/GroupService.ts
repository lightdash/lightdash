import { subject } from '@casl/ability';
import {
    ForbiddenError,
    Group,
    GroupMember,
    GroupMembership,
    GroupWithMembers,
    ProjectGroupAccess,
    SessionUser,
    UpdateGroupWithMembers,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { UpdateDBProjectGroupAccess } from '../database/entities/projectGroupAccess';
import { GroupsModel } from '../models/GroupsModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { BaseService } from './BaseService';

type GroupServiceArguments = {
    analytics: LightdashAnalytics;
    groupsModel: GroupsModel;
    projectModel: ProjectModel;
};

export class GroupsService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly groupsModel: GroupsModel;

    private readonly projectModel: ProjectModel;

    constructor(args: GroupServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.groupsModel = args.groupsModel;
        this.projectModel = args.projectModel;
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
        const groupMembership = await this.groupsModel.addGroupMember(member);
        if (groupMembership) {
            const updatedGroup = await this.groupsModel.getGroupWithMembers(
                member.groupUuid,
            );
            this.analytics.track({
                userId: actor.userUuid,
                event: 'group.updated',
                properties: {
                    organizationId: updatedGroup.organizationUuid,
                    groupId: updatedGroup.uuid,
                    name: updatedGroup.name,
                    countUsersInGroup: updatedGroup.memberUuids.length,
                    viaSso: false,
                },
            });
        }
        return groupMembership;
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
        const isGroupMemberRemoved = await this.groupsModel.removeGroupMember(
            member,
        );

        if (isGroupMemberRemoved) {
            const updatedGroup = await this.groupsModel.getGroupWithMembers(
                member.groupUuid,
            );
            this.analytics.track({
                userId: actor.userUuid,
                event: 'group.updated',
                properties: {
                    organizationId: updatedGroup.organizationUuid,
                    groupId: updatedGroup.uuid,
                    name: updatedGroup.name,
                    countUsersInGroup: updatedGroup.memberUuids.length,
                    viaSso: false,
                },
            });
        }
        return isGroupMemberRemoved;
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
        this.analytics.track({
            userId: actor.userUuid,
            event: 'group.deleted',
            properties: {
                organizationId: group.organizationUuid,
                groupId: group.uuid,
            },
        });
    }

    async get(
        actor: SessionUser,
        groupUuid: string,
        includeMembers?: number,
        offset?: number,
    ): Promise<Group | GroupWithMembers> {
        const group =
            includeMembers === undefined
                ? await this.groupsModel.getGroup(groupUuid)
                : await this.groupsModel.getGroupWithMembers(
                      groupUuid,
                      includeMembers,
                      offset,
                  );

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

    async update(
        actor: SessionUser,
        groupUuid: string,
        update: UpdateGroupWithMembers,
    ): Promise<Group | GroupWithMembers> {
        const group = await this.groupsModel.getGroup(groupUuid);
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
        const updatedGroup = await this.groupsModel.updateGroup(
            groupUuid,
            update,
        );
        this.analytics.track({
            userId: actor.userUuid,
            event: 'group.updated',
            properties: {
                organizationId: updatedGroup.organizationUuid,
                groupId: updatedGroup.uuid,
                name: updatedGroup.name,
                countUsersInGroup: updatedGroup.memberUuids.length,
                viaSso: false,
            },
        });
        return updatedGroup;
    }

    async getGroupMembers(
        actor: SessionUser,
        groupUuid: string,
    ): Promise<GroupMember[]> {
        const group = await this.groupsModel.getGroupWithMembers(groupUuid);
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
        return group.members;
    }

    async addProjectAccess(
        actor: SessionUser,
        { groupUuid, projectUuid, role }: ProjectGroupAccess,
    ): Promise<ProjectGroupAccess> {
        const group = await this.groupsModel.getGroup(groupUuid);
        const project = await this.projectModel.get(projectUuid);

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

        if (
            actor.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (project.organizationUuid !== group.organizationUuid) {
            throw new ForbiddenError();
        }

        const groupProjectAccess = await this.groupsModel.addProjectAccess({
            groupUuid,
            projectUuid,
            role,
        });

        return {
            projectUuid,
            groupUuid: groupProjectAccess.group_uuid,
            role: groupProjectAccess.role,
        };
    }

    async removeProjectAccess(
        actor: SessionUser,
        {
            groupUuid,
            projectUuid,
        }: Pick<ProjectGroupAccess, 'groupUuid' | 'projectUuid'>,
    ) {
        const group = await this.groupsModel.getGroup(groupUuid);
        const project = await this.projectModel.get(projectUuid);

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

        if (
            actor.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (project.organizationUuid !== group.organizationUuid) {
            throw new ForbiddenError();
        }

        const removed = await this.groupsModel.removeProjectAccess({
            groupUuid,
            projectUuid,
        });

        return removed;
    }

    async updateProjectAccess(
        actor: SessionUser,
        {
            groupUuid,
            projectUuid,
        }: Pick<ProjectGroupAccess, 'groupUuid' | 'projectUuid'>,
        updateAttributes: UpdateDBProjectGroupAccess,
    ): Promise<ProjectGroupAccess> {
        const group = await this.groupsModel.getGroup(groupUuid);
        const project = await this.projectModel.get(projectUuid);

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

        if (
            actor.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (project.organizationUuid !== group.organizationUuid) {
            throw new ForbiddenError();
        }

        const updated = await this.groupsModel.updateProjectAccess(
            { groupUuid, projectUuid },
            updateAttributes,
        );

        return {
            projectUuid: updated.project_uuid,
            groupUuid: updated.group_uuid,
            role: updated.role,
        };
    }
}
