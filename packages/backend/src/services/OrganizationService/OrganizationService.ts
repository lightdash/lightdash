import { subject } from '@casl/ability';
import {
    Account,
    AllowedEmailDomains,
    assertIsAccountWithOrg,
    convertProjectRoleToOrganizationRole,
    CreateColorPalette,
    CreateGroup,
    CreateOrganization,
    FeatureFlags,
    ForbiddenError,
    Group,
    GroupSort,
    GroupWithMembers,
    isSystemRole,
    isUserWithOrg,
    KnexPaginateArgs,
    KnexPaginatedData,
    LightdashMode,
    NotFoundError,
    OnbordingRecord,
    Organization,
    OrganizationColorPalette,
    OrganizationColorPaletteWithIsActive,
    OrganizationMemberProfile,
    OrganizationMemberProfileUpdate,
    OrganizationMemberProfileWithGroups,
    OrganizationMemberRole,
    OrganizationMemberSort,
    OrganizationProject,
    ParameterError,
    ProjectType,
    resolveEffectiveOrganizationSettings,
    SessionUser,
    UpdateAllowedEmailDomains,
    UpdateColorPalette,
    UpdateOrganization,
    validateOrganizationEmailDomains,
    validateOrganizationNameOrThrow,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { groupBy } from 'lodash';
import {
    LightdashAnalytics,
    OnboardingFlow,
} from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../models/GroupsModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { RolesModel } from '../../models/RolesModel';
import { UserModel } from '../../models/UserModel';
import { wrapSentryTransaction } from '../../utils';
import {
    getOrganizationSystemRoleScopes,
    validateOrganizationScopesCanBeGranted,
} from '../../utils/organizationRolePermissions';
import { assertHumanManagedMutation } from '../AgentPermissionService/assertHumanManagedMutation';
import { BaseService } from '../BaseService';
import { getOrganizationSettingsInstanceDefaults } from '../OrganizationSettingsService/getInstanceDefaults';
import { isAnalyticsProjectEnabled } from '../ProjectService/analyticsProject/analyticsProjectClient';

export type OrganizationServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    organizationModel: OrganizationModel;
    projectModel: ProjectModel;
    onboardingModel: OnboardingModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    userModel: UserModel;
    groupsModel: GroupsModel;
    organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;
    featureFlagModel: FeatureFlagModel;
    rolesModel: RolesModel;
    organizationSettingsModel: Pick<OrganizationSettingsModel, 'get'>;
    onOrganizationCreated?: (args: {
        user: SessionUser;
        organizationUuid: string;
    }) => Promise<void>;
};

export class OrganizationService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly organizationModel: OrganizationModel;

    private readonly projectModel: ProjectModel;

    private readonly onboardingModel: OnboardingModel;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    private readonly userModel: UserModel;

    private readonly organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;

    private readonly groupsModel: GroupsModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly rolesModel: RolesModel;

    private readonly organizationSettingsModel: Pick<
        OrganizationSettingsModel,
        'get'
    >;

    private readonly onOrganizationCreated: OrganizationServiceArguments['onOrganizationCreated'];

    constructor({
        lightdashConfig,
        analytics,
        organizationModel,
        projectModel,
        onboardingModel,
        organizationMemberProfileModel,
        userModel,
        groupsModel,
        organizationAllowedEmailDomainsModel,
        featureFlagModel,
        rolesModel,
        organizationSettingsModel,
        onOrganizationCreated,
    }: OrganizationServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.organizationModel = organizationModel;
        this.projectModel = projectModel;
        this.onboardingModel = onboardingModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.userModel = userModel;
        this.organizationAllowedEmailDomainsModel =
            organizationAllowedEmailDomainsModel;
        this.groupsModel = groupsModel;
        this.featureFlagModel = featureFlagModel;
        this.rolesModel = rolesModel;
        this.organizationSettingsModel = organizationSettingsModel;
        this.onOrganizationCreated = onOrganizationCreated;
    }

    async get(account: Account): Promise<Organization> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;

        const [needsProject, organization, settings] = await Promise.all([
            this.projectModel
                .hasProjects(organizationUuid)
                .then((hasProjects) => !hasProjects),
            this.organizationModel.get(organizationUuid),
            this.organizationSettingsModel.get(organizationUuid),
        ]);
        // Every member gets the effective captures switch so the data app
        // builder can hide its capture affordances; GET /org/settings is
        // admin-only.
        const { dataAppCapturesEnabled } = resolveEffectiveOrganizationSettings(
            settings,
            getOrganizationSettingsInstanceDefaults(this.lightdashConfig),
        );
        return {
            ...organization,
            needsProject,
            dataAppCapturesEnabled: dataAppCapturesEnabled !== false,
            pgWire: this.getPgWireConnectionDetails(account, organizationUuid),
        };
    }

    private getPgWireConnectionDetails(
        account: Account,
        organizationUuid: string,
    ): Organization['pgWire'] {
        const { port, host, ssl } = this.lightdashConfig.pgWire;
        const enabled = port !== undefined;
        const tlsRequired = ssl.mode === 'require';

        // The connection details (host/port) are infra endpoints, so only
        // expose them to org admins. `enabled` is a capability flag every org
        // member needs to gate the settings tab, so it's returned to all.
        const isOrgAdmin = this.createAuditedAbility(account).can(
            'manage',
            subject('Organization', { organizationUuid }),
        );
        if (!isOrgAdmin) {
            return { enabled, tlsRequired, host: null, port: null };
        }

        let resolvedHost = host ?? null;
        if (resolvedHost === null) {
            try {
                resolvedHost = new URL(this.lightdashConfig.siteUrl).hostname;
            } catch {
                resolvedHost = null;
            }
        }
        return {
            enabled,
            tlsRequired,
            host: resolvedHost,
            port: port ?? null,
        };
    }

    async getOrganizationByUuid(
        organizationUuid: string,
    ): Promise<Organization> {
        return this.organizationModel.get(organizationUuid);
    }

    async updateOrg(
        user: SessionUser,
        data: UpdateOrganization,
    ): Promise<void> {
        const { organizationUuid, userUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (data.name) {
            validateOrganizationNameOrThrow(data.name);
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
                defaultColourPaletteUpdated:
                    data.colorPaletteUuid !== undefined,
                defaultProjectUuidUpdated:
                    data.defaultProjectUuid !== undefined,
            },
        });
    }

    async delete(organizationUuid: string, user: SessionUser): Promise<void> {
        const organization = await this.organizationModel.get(organizationUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
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

        const isTrackingAnonymizedByUserUuid =
            await this.userModel.getIsTrackingAnonymizedByUserUuids(userUuids);

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
                    isTrackingAnonymized:
                        isTrackingAnonymizedByUserUuid[orgUser.userUuid] ??
                        false,
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
        googleOidcOnly?: boolean,
        sort?: OrganizationMemberSort,
    ): Promise<KnexPaginatedData<OrganizationMemberProfile[]>> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }
        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'view',
                subject('OrganizationMemberProfile', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { pagination, data: organizationMembers } = includeGroups
            ? await this.organizationMemberProfileModel.getOrganizationMembersAndGroups(
                  {
                      organizationUuid,
                      includeGroups,
                      paginateArgs,
                      searchQuery,
                      googleOidcOnly,
                      sort,
                  },
              )
            : await this.organizationMemberProfileModel.getOrganizationMembers({
                  organizationUuid,
                  paginateArgs,
                  searchQuery,
                  sort,
                  googleOidcOnly,
              });

        const accessResults = auditedAbility.canBulk(
            'view',
            organizationMembers.map((member) =>
                subject('OrganizationMemberProfile', {
                    ...member,
                    metadata: { userUuid: member.userUuid },
                }),
            ),
        );
        let members = organizationMembers.filter(
            (_, index) => accessResults[index],
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
                if (!groupAccess) {
                    return member;
                }
                // A group can carry a custom-role UUID instead of a system
                // role. It isn't convertible to an org role, so surface it as
                // roleUuid and keep the member's own org role.
                if (isSystemRole(groupAccess.role)) {
                    return {
                        ...member,
                        role: convertProjectRoleToOrganizationRole(
                            groupAccess.role,
                        ),
                    };
                }
                return {
                    ...member,
                    roleUuid: groupAccess.role,
                };
            });
        }

        return {
            data: members,
            pagination,
        };
    }

    async getProjects(account: Account): Promise<OrganizationProject[]> {
        const { organizationUuid } = account.organization;
        if (organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }

        const auditedAbility = this.createAuditedAbility(account);
        const projects = await wrapSentryTransaction(
            'OrganizationService.getProjects.getAllByOrganizationUuid',
            { organizationUuid },
            async () =>
                this.projectModel.getAllByOrganizationUuid(organizationUuid),
        );

        const accessResults = auditedAbility.canBulk(
            'view',
            projects.map((project) =>
                subject('Project', {
                    organizationUuid,
                    projectUuid: project.projectUuid,
                    metadata: {
                        projectUuid: project.projectUuid,
                        projectName: project.name,
                    },
                }),
            ),
        );

        const analyticsEnabled =
            projects.some(
                (project) => project.provisioningSource === 'analytics',
            ) &&
            (await isAnalyticsProjectEnabled(
                this.featureFlagModel,
                organizationUuid,
            ));

        return projects.filter(
            (project, index) =>
                accessResults[index] &&
                (project.provisioningSource !== 'analytics' ||
                    (analyticsEnabled &&
                        (auditedAbility.can(
                            'manage',
                            subject('Organization', { organizationUuid }),
                        ) ||
                            auditedAbility.can(
                                'view',
                                subject('SystemAnalytics', {
                                    organizationUuid,
                                    projectUuid: project.projectUuid,
                                }),
                            )))),
        );
    }

    async getOnboarding(user: SessionUser): Promise<OnbordingRecord> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }
        return this.onboardingModel.getByOrganizationUuid(organizationUuid);
    }

    async setOnboardingSuccessDate(user: SessionUser): Promise<void> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { shownSuccessAt } = await this.getOnboarding(user);
        if (shownSuccessAt) {
            throw new NotFoundError('Can not override "shown success" date');
        }
        return this.onboardingModel.update(user.organizationUuid, {
            shownSuccessAt: new Date(),
        });
    }

    /** @deprecated Only used by the deprecated get-member-by-uuid endpoint; use getUsers instead. */
    async getMemberByUuid(
        user: SessionUser,
        memberUuid: string,
    ): Promise<OrganizationMemberProfile> {
        const { organizationUuid } = user;
        const auditedAbility = this.createAuditedAbility(user);
        if (
            organizationUuid === undefined ||
            auditedAbility.cannot('view', 'OrganizationMemberProfile')
        ) {
            throw new ForbiddenError();
        }
        const member =
            await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                organizationUuid,
                memberUuid,
            );
        if (
            auditedAbility.cannot(
                'view',
                subject('OrganizationMemberProfile', {
                    ...member,
                    metadata: { userUuid: member.userUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return member;
    }

    /** @deprecated Only used by the deprecated get-member-by-email endpoint; use getUsers instead. */
    async getMemberByEmail(
        user: SessionUser,
        email: string,
    ): Promise<OrganizationMemberProfile> {
        const { organizationUuid } = user;
        const auditedAbility = this.createAuditedAbility(user);
        if (
            organizationUuid === undefined ||
            auditedAbility.cannot('view', 'OrganizationMemberProfile')
        ) {
            throw new ForbiddenError();
        }
        const member =
            await this.organizationMemberProfileModel.getOrganizationMemberByEmail(
                organizationUuid,
                email,
            );

        if (
            auditedAbility.cannot(
                'view',
                subject('OrganizationMemberProfile', {
                    ...member,
                    metadata: { userUuid: member.userUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return member;
    }

    /** @deprecated Only used by the deprecated update-member endpoint; use RolesService.upsertOrganizationUserRoleAssignment instead. */
    async updateMember(
        authenticatedUser: SessionUser,
        memberUserUuid: string,
        data: OrganizationMemberProfileUpdate,
    ): Promise<OrganizationMemberProfile> {
        await assertHumanManagedMutation({
            organizationUuid: authenticatedUser.organizationUuid,
            ability: authenticatedUser.ability,
            oauth: false,
            database: this.rolesModel.db,
            featureFlagModel: this.featureFlagModel,
        });
        if (!isUserWithOrg(authenticatedUser)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = authenticatedUser;
        const auditedAbility = this.createAuditedAbility(authenticatedUser);
        if (
            auditedAbility.cannot(
                'update',
                subject('OrganizationMemberProfile', {
                    organizationUuid,
                    metadata: { userUuid: memberUserUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (data.role !== undefined) {
            await validateOrganizationScopesCanBeGranted({
                user: authenticatedUser,
                organizationUuid,
                grantedScopes: getOrganizationSystemRoleScopes(data.role, {
                    includePersonalAccessToken:
                        this.lightdashConfig.auth?.pat?.enabled === true &&
                        this.lightdashConfig.auth.pat.allowedOrgRoles.includes(
                            data.role,
                        ),
                }),
                rolesModel: this.rolesModel,
            });
            const organization =
                await this.organizationModel.get(organizationUuid);
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

        // The model refuses to demote the organization's last active admin.
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
            throw new NotFoundError('Organization not found');
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
            throw new NotFoundError('Organization not found');
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
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
        const { enabled: newOnboardingEnabled } =
            await this.featureFlagModel.get({
                user,
                featureFlagId: FeatureFlags.NewOnboarding,
            });
        const onboardingFlow: OnboardingFlow = newOnboardingEnabled
            ? 'new'
            : 'legacy';
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
                onboardingFlow,
            },
        });
        this.analytics.track({
            event: 'onboarding.step_completed',
            userId: user.userUuid,
            properties: {
                step: 'org_created',
                stepIndex: 3,
                onboardingFlow,
                organizationId: org.organizationUuid,
            },
        });
        await this.userModel.joinOrg(
            user.userUuid,
            org.organizationUuid,
            OrganizationMemberRole.ADMIN,
            undefined,
        );
        this.analytics.group({
            userId: user.userUuid,
            groupId: org.organizationUuid,
            traits: { name: org.name },
        });
        if (this.onOrganizationCreated) {
            try {
                const organizationUser =
                    await this.userModel.findSessionUserAndOrgByUuid(
                        user.userUuid,
                        org.organizationUuid,
                    );
                // Await before returning so the frontend's feature-flag refetch sees the overrides.
                await this.onOrganizationCreated({
                    user: organizationUser,
                    organizationUuid: org.organizationUuid,
                });
            } catch (error) {
                Sentry.captureException(error);
                Logger.error(
                    `Failed to run organization creation hook for organization ${
                        org.organizationUuid
                    }: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
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
        user: SessionUser,
        createGroup: CreateGroup,
    ): Promise<GroupWithMembers> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            user.organizationUuid === undefined ||
            auditedAbility.cannot(
                'create',
                subject('Group', {
                    organizationUuid: user.organizationUuid,
                    metadata: { groupName: createGroup.name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const groupWithMembers = await this.groupsModel.createGroup({
            createdByUserUuid: user.userUuid,
            createGroup: {
                organizationUuid: user.organizationUuid,
                ...createGroup,
            },
        });

        this.analytics.track({
            userId: user.userUuid,
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
        user: SessionUser,
        includeMembers?: number,
        paginateArgs?: KnexPaginateArgs,
        searchQuery?: string,
        sort?: GroupSort,
    ): Promise<KnexPaginatedData<Group[] | GroupWithMembers[]>> {
        if (user.organizationUuid === undefined) {
            throw new ForbiddenError();
        }
        const { pagination, data: groups } = await this.groupsModel.find(
            {
                organizationUuid: user.organizationUuid,
                searchQuery,
                sort,
            },
            paginateArgs,
        );

        const auditedAbility = this.createAuditedAbility(user);
        const accessResults = auditedAbility.canBulk(
            'view',
            groups.map((group) =>
                subject('Group', {
                    ...group,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            ),
        );
        const allowedGroups = groups.filter((_, index) => accessResults[index]);

        if (includeMembers === undefined) {
            return {
                pagination,
                data: allowedGroups,
            };
        }

        // fetch members for each group
        const { data: groupMembers } = await this.groupsModel.findGroupMembers({
            organizationUuid: user.organizationUuid,
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

    async createColorPalette(
        user: SessionUser,
        data: CreateColorPalette,
    ): Promise<OrganizationColorPalette> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !user.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('OrganizationColorPalette', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Validate colors array
        if (!data.colors || data.colors.length !== 20) {
            throw new ParameterError('Color palette must contain 20 colors');
        }

        const palette = await this.organizationModel.createColorPalette(
            user.organizationUuid,
            data,
        );

        this.analytics.track({
            event: 'organization_color_palette.created',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid,
                colorPaletteId: palette.colorPaletteUuid,
            },
        });

        return palette;
    }

    async getColorPalettes(
        account: Account,
    ): Promise<OrganizationColorPaletteWithIsActive[]> {
        const { organizationUuid } = account.organization;

        if (!organizationUuid) {
            throw new NotFoundError('Organization not found');
        }

        return this.organizationModel.getColorPalettes(organizationUuid);
    }

    async updateColorPalette(
        user: SessionUser,
        colorPaletteUuid: string,
        data: UpdateColorPalette,
    ): Promise<OrganizationColorPalette> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !user.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('OrganizationColorPalette', {
                    organizationUuid: user.organizationUuid,
                    metadata: { colorPaletteUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (data.colors && data.colors.length !== 20) {
            throw new ParameterError('Color palette must contain 20 colors');
        }

        const updatedPalette = await this.organizationModel.updateColorPalette(
            user.organizationUuid,
            colorPaletteUuid,
            data,
        );

        return updatedPalette;
    }

    async deleteColorPalette(
        user: SessionUser,
        colorPaletteUuid: string,
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !user.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('OrganizationColorPalette', {
                    organizationUuid: user.organizationUuid,
                    metadata: { colorPaletteUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.organizationModel.deleteColorPalette(
            user.organizationUuid,
            colorPaletteUuid,
        );
    }

    async setActiveColorPalette(
        user: SessionUser,
        colorPaletteUuid: string,
    ): Promise<OrganizationColorPalette> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !user.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('OrganizationColorPalette', {
                    organizationUuid: user.organizationUuid,
                    metadata: { colorPaletteUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const palette = await this.organizationModel.setActiveColorPalette(
            user.organizationUuid,
            colorPaletteUuid,
        );

        this.analytics.track({
            event: 'organization_color_palette.activated',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid,
                colorPaletteId: palette.colorPaletteUuid,
            },
        });

        return palette;
    }

    async getImpersonationEnabled(user: SessionUser): Promise<boolean> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }
        // Impersonators need to read the setting to know the action is available
        const auditedAbility = this.createAuditedAbility(user);
        const canReadSetting =
            auditedAbility.can(
                'update',
                subject('Organization', { organizationUuid }),
            ) ||
            auditedAbility.can(
                'impersonate',
                subject('User', { organizationUuid, isActive: true }),
            );
        if (!canReadSetting) {
            throw new ForbiddenError();
        }
        const flag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.UserImpersonation,
        });
        if (!flag.enabled) {
            return false;
        }
        return this.organizationModel.getImpersonationEnabled(organizationUuid);
    }

    async updateImpersonationEnabled(
        user: SessionUser,
        enabled: boolean,
    ): Promise<void> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const flag = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.UserImpersonation,
        });
        if (!flag.enabled) {
            throw new ForbiddenError(
                'User impersonation is not enabled for this instance',
            );
        }
        await this.organizationModel.updateImpersonationEnabled(
            organizationUuid,
            enabled,
        );
    }
}
