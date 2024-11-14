import { subject } from '@casl/ability';
import {
    AllowedEmailDomains,
    convertProjectRoleToOrganizationRole,
    CreateGroup,
    CreateOrganization,
    ForbiddenError,
    Group,
    GroupWithMembers,
    isUserWithOrg,
    KnexPaginateArgs,
    KnexPaginatedData,
    LightdashMode,
    NotExistsError,
    OnbordingRecord,
    Organization,
    OrganizationMemberProfile,
    OrganizationMemberProfileUpdate,
    OrganizationMemberProfileWithGroups,
    OrganizationMemberRole,
    OrganizationProject,
    ParameterError,
    SessionUser,
    UpdateAllowedEmailDomains,
    UpdateOrganization,
    validateOrganizationEmailDomains,
} from '@lightdash/common';
import { groupBy } from 'lodash';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { GroupsModel } from '../../models/GroupsModel';
import { InviteLinkModel } from '../../models/InviteLinkModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

type OrganizationServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    organizationModel: OrganizationModel;
    projectModel: ProjectModel;
    onboardingModel: OnboardingModel;
    inviteLinkModel: InviteLinkModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    userModel: UserModel;

    groupsModel: GroupsModel;
    organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;
};

export class OrganizationService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly organizationModel: OrganizationModel;

    private readonly projectModel: ProjectModel;

    private readonly onboardingModel: OnboardingModel;

    private readonly inviteLinkModel: InviteLinkModel;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    private readonly userModel: UserModel;

    private readonly organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;

    private readonly groupsModel: GroupsModel;

    constructor({
        lightdashConfig,
        analytics,
        organizationModel,
        projectModel,
        onboardingModel,
        inviteLinkModel,
        organizationMemberProfileModel,
        userModel,
        groupsModel,
        organizationAllowedEmailDomainsModel,
    }: OrganizationServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.organizationModel = organizationModel;
        this.projectModel = projectModel;
        this.onboardingModel = onboardingModel;
        this.inviteLinkModel = inviteLinkModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.userModel = userModel;
        this.organizationAllowedEmailDomainsModel =
            organizationAllowedEmailDomainsModel;
        this.groupsModel = groupsModel;
    }

    async get(user: SessionUser): Promise<Organization> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const needsProject = !(await this.projectModel.hasProjects(
            user.organizationUuid,
        ));

        const organization = await this.organizationModel.get(
            user.organizationUuid,
        );
        return {
            ...organization,
            needsProject,
        };
    }

    async updateOrg(
        { organizationUuid, organizationName, userUuid, ability }: SessionUser,
        data: UpdateOrganization,
    ): Promise<void> {
        if (
            ability.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const org = await this.organizationModel.update(organizationUuid, data);
        this.analytics.track({
            userId: userUuid,
            event: 'organization.updated',
            properties: {
                type:
                    this.lightdashConfig.mode === LightdashMode.CLOUD_BETA
                        ? 'cloud'
                        : 'self-hosted',
                organizationId: organizationUuid,
                organizationName: org.name,
                defaultProjectUuid: org.defaultProjectUuid,
                defaultColourPaletteUpdated: data.chartColors !== undefined,
                defaultProjectUuidUpdated:
                    data.defaultProjectUuid !== undefined,
            },
        });
    }

    async delete(organizationUuid: string, user: SessionUser): Promise<void> {
        const organization = await this.organizationModel.get(organizationUuid);
        if (
            user.ability.cannot(
                'delete',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { data: orgUsers } =
            await this.organizationMemberProfileModel.getOrganizationMembers({
                organizationUuid,
            });

        const userUuids = orgUsers.map((orgUser) => orgUser.userUuid);

        await this.organizationModel.deleteOrgAndUsers(
            organizationUuid,
            userUuids,
        );

        orgUsers.forEach((orgUser) => {
            this.analytics.track({
                event: 'user.deleted',
                userId: user.userUuid, // track the user who deleted the org members
                properties: {
                    context: 'delete_org_member',
                    firstName: orgUser.firstName,
                    lastName: orgUser.lastName,
                    email: orgUser.email,
                    organizationId: organizationUuid,
                    deletedUserId: orgUser.userUuid,
                },
            });
        });

        this.analytics.track({
            event: 'organization.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                organizationName: organization.name,
                type:
                    this.lightdashConfig.mode === LightdashMode.CLOUD_BETA
                        ? 'cloud'
                        : 'self-hosted',
            },
        });
    }

    async getUsers(
        user: SessionUser,
        includeGroups?: number,
        paginateArgs?: KnexPaginateArgs,
        searchQuery?: string,
        projectUuid?: string,
    ): Promise<KnexPaginatedData<OrganizationMemberProfile[]>> {
        const { organizationUuid } = user;

        if (
            user.ability.cannot(
                'view',
                subject('OrganizationMemberProfile', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

        const { pagination, data: organizationMembers } = includeGroups
            ? await this.organizationMemberProfileModel.getOrganizationMembersAndGroups(
                  organizationUuid,
                  includeGroups,
                  paginateArgs,
                  searchQuery,
              )
            : await this.organizationMemberProfileModel.getOrganizationMembers({
                  organizationUuid,
                  paginateArgs,
                  searchQuery,
              });

        let members = organizationMembers.filter((member) =>
            user.ability.can(
                'view',
                subject('OrganizationMemberProfile', member),
            ),
        );

        // If projectUuid is set, then we can check what's the user role in that project
        // At this point we only care about groups, because a user can be a member in the org,
        // and still have a group that allows them access to the project
        // In this case, we'll return the group's role instead of the member's role
        // So we can properly list them on `space access` form.
        if (projectUuid && includeGroups) {
            // If includeGroups > 0, then members is an array of OrganizationMemberProfileWithGroups
            // even though the type is not inferred correctly from `getOrganizationMembersAndGroups`
            const projectGroupAccesses =
                await this.projectModel.getProjectGroupAccesses(projectUuid);
            members = members.map((member) => {
                const memberWithGroup =
                    member as OrganizationMemberProfileWithGroups;
                const groups = memberWithGroup.groups.map(
                    (group) => group.uuid,
                );
                const groupAccess = projectGroupAccesses.find((access) =>
                    groups.includes(access.groupUuid),
                );
                return {
                    ...member,
                    role: groupAccess?.role
                        ? convertProjectRoleToOrganizationRole(groupAccess.role)
                        : member.role,
                };
            });
        }

        return {
            data: members,
            pagination,
        };
    }

    async getProjects(user: SessionUser): Promise<OrganizationProject[]> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const projects = await this.projectModel.getAllByOrganizationUuid(
            organizationUuid,
        );

        return projects.filter((project) =>
            user.ability.can(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            ),
        );
    }

    async getOnboarding(user: SessionUser): Promise<OnbordingRecord> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        return this.onboardingModel.getByOrganizationUuid(organizationUuid);
    }

    async setOnboardingSuccessDate(user: SessionUser): Promise<void> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { shownSuccessAt } = await this.getOnboarding(user);
        if (shownSuccessAt) {
            throw new NotExistsError('Can not override "shown success" date');
        }
        return this.onboardingModel.update(user.organizationUuid, {
            shownSuccessAt: new Date(),
        });
    }

    async getMemberByUuid(
        user: SessionUser,
        memberUuid: string,
    ): Promise<OrganizationMemberProfile> {
        const { organizationUuid } = user;
        if (
            organizationUuid === undefined ||
            user.ability.cannot('view', 'OrganizationMemberProfile')
        ) {
            throw new ForbiddenError();
        }
        const member =
            await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                organizationUuid,
                memberUuid,
            );
        if (
            user.ability.cannot(
                'view',
                subject('OrganizationMemberProfile', member),
            )
        ) {
            throw new ForbiddenError();
        }
        return member;
    }

    async updateMember(
        authenticatedUser: SessionUser,
        memberUserUuid: string,
        data: OrganizationMemberProfileUpdate,
    ): Promise<OrganizationMemberProfile> {
        if (!isUserWithOrg(authenticatedUser)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = authenticatedUser;
        if (
            authenticatedUser.ability.cannot(
                'update',
                subject('OrganizationMemberProfile', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        // Race condition between check and delete
        const [admin, ...remainingAdmins] =
            await this.organizationMemberProfileModel.getOrganizationAdmins(
                organizationUuid,
            );
        if (remainingAdmins.length === 0 && admin.userUuid === memberUserUuid) {
            throw new ForbiddenError(
                'Organization must have at least one admin',
            );
        }
        if (data.role !== undefined) {
            const organization = await this.organizationModel.get(
                organizationUuid,
            );
            this.analytics.track({
                userId: authenticatedUser.userUuid,
                event: 'permission.updated',
                properties: {
                    userId: authenticatedUser.userUuid,
                    userIdUpdated: memberUserUuid,
                    organizationPermissions: data.role,
                    projectPermissions: {
                        name: organization.name,
                        role: data.role,
                    },
                    newUser: false,
                    generatedInvite: false,
                },
            });
        }

        return this.organizationMemberProfileModel.updateOrganizationMember(
            organizationUuid,
            memberUserUuid,
            data,
        );
    }

    async getAllowedEmailDomains(
        user: SessionUser,
    ): Promise<AllowedEmailDomains> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

        const allowedEmailDomains =
            await this.organizationAllowedEmailDomainsModel.findAllowedEmailDomains(
                organizationUuid,
            );
        if (!allowedEmailDomains) {
            return {
                organizationUuid,
                emailDomains: [],
                role: OrganizationMemberRole.VIEWER,
                projects: [],
            };
        }
        return allowedEmailDomains;
    }

    async updateAllowedEmailDomains(
        user: SessionUser,
        data: UpdateAllowedEmailDomains,
    ): Promise<AllowedEmailDomains> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }

        if (
            user.ability.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const error = validateOrganizationEmailDomains(data.emailDomains);

        if (error) {
            throw new ParameterError(error);
        }

        const allowedEmailDomains =
            await this.organizationAllowedEmailDomainsModel.upsertAllowedEmailDomains(
                { ...data, organizationUuid },
            );
        this.analytics.track({
            event: 'organization_allowed_email_domains.updated',
            userId: user.userUuid,
            properties: {
                organizationId: allowedEmailDomains.organizationUuid,
                emailDomainsCount: allowedEmailDomains.emailDomains.length,
                role: allowedEmailDomains.role,
                projectIds: allowedEmailDomains.projects.map(
                    (p) => p.projectUuid,
                ),
                projectRoles: allowedEmailDomains.projects.map((p) => p.role),
            },
        });

        return allowedEmailDomains;
    }

    async createAndJoinOrg(
        user: SessionUser,
        data: CreateOrganization,
    ): Promise<void> {
        if (
            !this.lightdashConfig.allowMultiOrgs &&
            (await this.userModel.hasUsers()) &&
            (await this.organizationModel.hasOrgs())
        ) {
            throw new ForbiddenError(
                'Cannot register user in a new organization. Ask an existing admin for an invite link.',
            );
        }
        if (isUserWithOrg(user)) {
            throw new ForbiddenError('User already has an organization');
        }
        const org = await this.organizationModel.create(data);
        this.analytics.track({
            event: 'organization.created',
            userId: user.userUuid,
            properties: {
                type:
                    this.lightdashConfig.mode === LightdashMode.CLOUD_BETA
                        ? 'cloud'
                        : 'self-hosted',
                organizationId: org.organizationUuid,
                organizationName: org.name,
            },
        });
        await this.userModel.joinOrg(
            user.userUuid,
            org.organizationUuid,
            OrganizationMemberRole.ADMIN,
            undefined,
        );
        await this.analytics.track({
            userId: user.userUuid,
            event: 'user.joined_organization',
            properties: {
                organizationId: org.organizationUuid,
                role: OrganizationMemberRole.ADMIN,
                projectIds: [],
            },
        });
    }

    async addGroupToOrganization(
        actor: SessionUser,
        createGroup: CreateGroup,
    ): Promise<GroupWithMembers> {
        if (
            actor.organizationUuid === undefined ||
            actor.ability.cannot(
                'create',
                subject('Group', {
                    organizationUuid: actor.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const groupWithMembers = await this.groupsModel.createGroup({
            createdByUserUuid: actor.userUuid,
            createGroup: {
                organizationUuid: actor.organizationUuid,
                ...createGroup,
            },
        });

        this.analytics.track({
            userId: actor.userUuid,
            event: 'group.created',
            properties: {
                organizationId: groupWithMembers.organizationUuid,
                groupId: groupWithMembers.uuid,
                name: groupWithMembers.name,
                countUsersInGroup: groupWithMembers.memberUuids.length,
                viaSso: false,
                context: 'create_group',
            },
        });
        return groupWithMembers;
    }

    async listGroupsInOrganization(
        actor: SessionUser,
        includeMembers?: number,
        paginateArgs?: KnexPaginateArgs,
        searchQuery?: string,
    ): Promise<KnexPaginatedData<Group[] | GroupWithMembers[]>> {
        if (actor.organizationUuid === undefined) {
            throw new ForbiddenError();
        }
        const { pagination, data: groups } = await this.groupsModel.find(
            {
                organizationUuid: actor.organizationUuid,
                searchQuery,
            },
            paginateArgs,
        );

        const allowedGroups = groups.filter((group) =>
            actor.ability.can('view', subject('Group', group)),
        );

        if (includeMembers === undefined) {
            return {
                pagination,
                data: allowedGroups,
            };
        }

        // fetch members for each group
        const { data: groupMembers } = await this.groupsModel.findGroupMembers({
            organizationUuid: actor.organizationUuid,
            groupUuids: allowedGroups.map((group) => group.uuid),
        });
        const groupMembersMap = groupBy(groupMembers, 'groupUuid');

        return {
            pagination,
            data: allowedGroups.map<GroupWithMembers>((group) => ({
                ...group,
                members: groupMembersMap[group.uuid] || [],
                memberUuids: (groupMembersMap[group.uuid] || []).map(
                    (member) => member.userUuid,
                ),
            })),
        };
    }
}
