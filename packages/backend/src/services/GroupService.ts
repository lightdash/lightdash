import { subject } from '@casl/ability';
import {
    Account,
    ApiGroupAsCodeUpsertResponse,
    assertRegisteredAccount,
    FeatureFlags,
    ForbiddenError,
    Group,
    GroupAsCode,
    GroupMember,
    GroupMembership,
    GroupWithMembers,
    LightdashUser,
    ParameterError,
    ProjectGroupAccess,
    ProjectMemberRole,
    PromotionAction,
    RegisteredAccount,
    SessionUser,
    UpdateGroupWithMembers,
    validateEmail,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { UpdateDBProjectGroupAccess } from '../database/entities/projectGroupAccess';
import { GroupsModel } from '../models/GroupsModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { BaseService } from './BaseService';
import { FeatureFlagService } from './FeatureFlag/FeatureFlagService';

type GroupServiceArguments = {
    analytics: LightdashAnalytics;
    groupsModel: GroupsModel;
    projectModel: ProjectModel;
    featureFlagService: FeatureFlagService;
};

export class GroupsService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly groupsModel: GroupsModel;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagService: FeatureFlagService;

    constructor(args: GroupServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.groupsModel = args.groupsModel;
        this.projectModel = args.projectModel;
        this.featureFlagService = args.featureFlagService;
    }

    private validateGroupsAsCodeAccess(
        account: Account,
        organizationUuid: string,
    ): asserts account is RegisteredAccount {
        assertRegisteredAccount(account);
        if (account.organization.organizationUuid !== organizationUuid) {
            throw new ForbiddenError();
        }
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Group', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private static validateGroupAsCode(group: GroupAsCode): GroupAsCode {
        if (
            typeof group !== 'object' ||
            group === null ||
            Array.isArray(group)
        ) {
            throw new ParameterError('Group as code must be an object');
        }
        const unknownKeys = Object.keys(group).filter(
            (key) => !['version', 'name', 'members'].includes(key),
        );
        if (unknownKeys.length > 0) {
            throw new ParameterError(
                `Unknown group fields: ${unknownKeys.sort().join(', ')}`,
            );
        }
        if (group.version !== 1) {
            throw new ParameterError(
                `Unsupported group as-code version ${group.version}`,
            );
        }
        if (
            typeof group.name !== 'string' ||
            group.name.length === 0 ||
            group.name !== group.name.trim()
        ) {
            throw new ParameterError(
                'Group name must be non-empty and must not have surrounding whitespace',
            );
        }
        if (!Array.isArray(group.members)) {
            throw new ParameterError('Group members must be an array');
        }
        const normalizedMembers = group.members.map((email) => {
            if (typeof email !== 'string' || !validateEmail(email)) {
                throw new ParameterError(
                    `Invalid group member email: ${email}`,
                );
            }
            return email.toLowerCase();
        });
        const duplicateEmails = normalizedMembers.filter(
            (email, index) => normalizedMembers.indexOf(email) !== index,
        );
        if (duplicateEmails.length > 0) {
            throw new ParameterError(
                `Duplicate group member emails: ${[...new Set(duplicateEmails)]
                    .sort()
                    .join(', ')}`,
            );
        }
        return {
            version: 1,
            name: group.name,
            members: normalizedMembers.sort(),
        };
    }

    async getGroupsAsCode(
        account: Account,
        organizationUuid: string,
    ): Promise<GroupAsCode[]> {
        this.validateGroupsAsCodeAccess(account, organizationUuid);
        if (!(await this.isGroupServiceEnabled(account.user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const { data: groups } = await this.groupsModel.find({
            organizationUuid,
        });
        const { data: members } = await this.groupsModel.findGroupMembers({
            organizationUuid,
            groupUuids: groups.map((group) => group.uuid),
        });
        const membersByGroupUuid = members.reduce<Map<string, string[]>>(
            (map, member) => {
                const groupMembers = map.get(member.groupUuid) ?? [];
                groupMembers.push(member.email.toLowerCase());
                map.set(member.groupUuid, groupMembers);
                return map;
            },
            new Map(),
        );

        return groups
            .map((group) => ({
                version: 1 as const,
                name: group.name,
                members: (membersByGroupUuid.get(group.uuid) ?? []).sort(),
            }))
            .sort((left, right) => left.name.localeCompare(right.name));
    }

    async upsertGroupAsCode(
        account: Account,
        organizationUuid: string,
        groupInput: GroupAsCode,
    ): Promise<ApiGroupAsCodeUpsertResponse['results']> {
        this.validateGroupsAsCodeAccess(account, organizationUuid);
        if (!(await this.isGroupServiceEnabled(account.user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const group = GroupsService.validateGroupAsCode(groupInput);
        const result = await this.groupsModel.upsertGroupAsCode({
            organizationUuid,
            name: group.name,
            memberEmails: group.members,
            actorUserUuid: account.user.userUuid,
        });

        if (result.action !== PromotionAction.NO_CHANGES) {
            this.analytics.track({
                userId: account.user.userUuid,
                event:
                    result.action === PromotionAction.CREATE
                        ? 'group.created'
                        : 'group.updated',
                properties: {
                    organizationId: organizationUuid,
                    groupId: result.groupUuid,
                    name: group.name,
                    countUsersInGroup: group.members.length,
                    viaSso: false,
                    context: 'content_as_code',
                },
            });
        }

        return { action: result.action };
    }

    private async isGroupServiceEnabled(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<boolean> {
        const featureFlag = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.UserGroupsEnabled,
        });
        return featureFlag.enabled;
    }

    /** @deprecated Only used by the deprecated add-user-to-group endpoint; use update with the full member set instead. */
    async addGroupMember(
        user: SessionUser,
        member: GroupMembership,
    ): Promise<GroupMembership | undefined> {
        if (!(await this.isGroupServiceEnabled(user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        const group = await this.groupsModel.getGroup(member.groupUuid);
        if (
            auditedAbility.cannot(
                'update',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const [groupMembership] = await this.groupsModel.addGroupMembers(
            member.groupUuid,
            [member.userUuid],
        );
        if (groupMembership) {
            const updatedGroup = await this.groupsModel.getGroupWithMembers(
                member.groupUuid,
            );
            this.analytics.track({
                userId: user.userUuid,
                event: 'group.updated',
                properties: {
                    organizationId: updatedGroup.organizationUuid,
                    groupId: updatedGroup.uuid,
                    name: updatedGroup.name,
                    countUsersInGroup: updatedGroup.memberUuids.length,
                    viaSso: false,
                    context: 'add_member',
                },
            });
        }
        return groupMembership;
    }

    /** @deprecated Only used by the deprecated remove-user-from-group endpoint; use update with the full member set instead. */
    async removeGroupMember(
        user: SessionUser,
        member: GroupMembership,
    ): Promise<boolean> {
        if (!(await this.isGroupServiceEnabled(user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        const group = await this.groupsModel.getGroup(member.groupUuid);
        if (
            auditedAbility.cannot(
                'update',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const isGroupMemberRemoved =
            await this.groupsModel.removeGroupMember(member);

        if (isGroupMemberRemoved) {
            const updatedGroup = await this.groupsModel.getGroupWithMembers(
                member.groupUuid,
            );
            this.analytics.track({
                userId: user.userUuid,
                event: 'group.updated',
                properties: {
                    organizationId: updatedGroup.organizationUuid,
                    groupId: updatedGroup.uuid,
                    name: updatedGroup.name,
                    countUsersInGroup: updatedGroup.memberUuids.length,
                    viaSso: false,
                    context: 'remove_member',
                },
            });
        }
        return isGroupMemberRemoved;
    }

    async delete(user: SessionUser, groupUuid: string): Promise<void> {
        if (!(await this.isGroupServiceEnabled(user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        const group = await this.groupsModel.getGroup(groupUuid);
        if (
            auditedAbility.cannot(
                'delete',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.groupsModel.deleteGroup(groupUuid);
        this.analytics.track({
            userId: user.userUuid,
            event: 'group.deleted',
            properties: {
                organizationId: group.organizationUuid,
                groupId: group.uuid,
                context: 'delete_group',
            },
        });
    }

    async get(
        user: SessionUser,
        groupUuid: string,
        includeMembers?: number,
        offset?: number,
    ): Promise<Group | GroupWithMembers> {
        if (!(await this.isGroupServiceEnabled(user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const group =
            includeMembers === undefined
                ? await this.groupsModel.getGroup(groupUuid)
                : await this.groupsModel.getGroupWithMembers(
                      groupUuid,
                      includeMembers,
                      offset,
                  );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return group;
    }

    async update(
        user: SessionUser,
        groupUuid: string,
        update: UpdateGroupWithMembers,
    ): Promise<Group | GroupWithMembers> {
        if (!(await this.isGroupServiceEnabled(user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        const group = await this.groupsModel.getGroup(groupUuid);
        if (
            auditedAbility.cannot(
                'update',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const updatedGroup = await this.groupsModel.updateGroup({
            updatedByUserUuid: user.userUuid,
            groupUuid,
            update,
        });
        this.analytics.track({
            userId: user.userUuid,
            event: 'group.updated',
            properties: {
                organizationId: updatedGroup.organizationUuid,
                groupId: updatedGroup.uuid,
                name: updatedGroup.name,
                countUsersInGroup: updatedGroup.memberUuids.length,
                viaSso: false,
                context: 'update_group',
            },
        });
        return updatedGroup;
    }

    /** @deprecated Only used by the deprecated group members endpoint; use get with includeMembers instead. */
    async getGroupMembers(
        user: SessionUser,
        groupUuid: string,
    ): Promise<GroupMember[]> {
        if (!(await this.isGroupServiceEnabled(user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        const group = await this.groupsModel.getGroupWithMembers(groupUuid);
        if (
            auditedAbility.cannot(
                'view',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return group.members;
    }

    /** @deprecated Only used by the deprecated group project access endpoint; use RolesService.upsertProjectGroupRoleAssignment instead. */
    async addProjectAccess(
        user: SessionUser,
        { groupUuid, projectUuid, role }: ProjectGroupAccess,
    ): Promise<ProjectGroupAccess> {
        if (!(await this.isGroupServiceEnabled(user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        const group = await this.groupsModel.getGroup(groupUuid);
        const project = await this.projectModel.get(projectUuid);

        if (
            auditedAbility.cannot(
                'update',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            auditedAbility.cannot(
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
            role: groupProjectAccess.role_uuid || groupProjectAccess.role,
        };
    }

    /** @deprecated Only used by the deprecated group project access endpoint; use RolesService.deleteProjectRoleAssignment instead. */
    async removeProjectAccess(
        user: SessionUser,
        {
            groupUuid,
            projectUuid,
        }: Pick<ProjectGroupAccess, 'groupUuid' | 'projectUuid'>,
    ) {
        if (!(await this.isGroupServiceEnabled(user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        const group = await this.groupsModel.getGroup(groupUuid);
        const project = await this.projectModel.get(projectUuid);

        if (
            auditedAbility.cannot(
                'update',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            auditedAbility.cannot(
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

    /** @deprecated Only used by the deprecated group project access endpoint; use RolesService.updateProjectRoleAssignment instead. */
    async updateProjectAccess(
        user: SessionUser,
        {
            groupUuid,
            projectUuid,
        }: Pick<ProjectGroupAccess, 'groupUuid' | 'projectUuid'>,
        updateAttributes: UpdateDBProjectGroupAccess,
    ): Promise<ProjectGroupAccess> {
        if (!(await this.isGroupServiceEnabled(user))) {
            throw new ForbiddenError('Group service is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(user);
        const group = await this.groupsModel.getGroup(groupUuid);
        const project = await this.projectModel.get(projectUuid);

        if (
            auditedAbility.cannot(
                'update',
                subject('Group', {
                    organizationUuid: group.organizationUuid,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            auditedAbility.cannot(
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
            role: updated.role_uuid || updated.role,
        };
    }
}
