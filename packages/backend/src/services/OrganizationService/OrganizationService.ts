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
    GroupWithMembers,
    isSystemRole,
    isUserWithOrg,
    KnexPaginateArgs,
    KnexPaginatedData,
    LightdashMode,
    MissingConfigError,
    NotFoundError,
    OnbordingRecord,
    Organization,
    OrganizationBrand,
    OrganizationBrandColor,
    OrganizationBrandFont,
    OrganizationBrandLogo,
    OrganizationColorPalette,
    OrganizationColorPaletteWithIsActive,
    OrganizationMemberProfile,
    OrganizationMemberProfileUpdate,
    OrganizationMemberProfileWithGroups,
    OrganizationMemberRole,
    OrganizationProject,
    ParameterError,
    SaveOrganizationBrandRequest,
    SessionUser,
    UnexpectedServerError,
    UpdateAllowedEmailDomains,
    UpdateColorPalette,
    UpdateOrganization,
    validateOrganizationEmailDomains,
    validateOrganizationNameOrThrow,
} from '@lightdash/common';
import { groupBy } from 'lodash';
import fetch from 'node-fetch';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../models/GroupsModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { wrapSentryTransaction } from '../../utils';
import { BaseService } from '../BaseService';

const BRANDFETCH_API_URL = 'https://api.brandfetch.io/v2/brands';

// Subset of the Brandfetch Brand API response we care about
// https://docs.brandfetch.com/reference/brand-api
type BrandfetchBrandResponse = {
    name?: string | null;
    description?: string | null;
    logos?: Array<{
        type?: string | null;
        theme?: string | null;
        formats?: Array<{
            src?: string | null;
            format?: string | null;
        }> | null;
    }> | null;
    colors?: Array<{
        hex?: string | null;
        type?: string | null;
        brightness?: number | null;
    }> | null;
    fonts?: Array<{
        name?: string | null;
        type?: string | null;
        origin?: string | null;
    }> | null;
};

type OrganizationServiceArguments = {
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
    }

    async get(account: Account): Promise<Organization> {
        assertIsAccountWithOrg(account);

        const needsProject = !(await this.projectModel.hasProjects(
            account.organization.organizationUuid,
        ));

        const organization = await this.organizationModel.get(
            account.organization.organizationUuid,
        );
        return {
            ...organization,
            needsProject,
            pgWire: this.getPgWireConnectionDetails(
                account,
                account.organization.organizationUuid,
            ),
        };
    }

    private getPgWireConnectionDetails(
        account: Account,
        organizationUuid: string,
    ): Organization['pgWire'] {
        const { port, host } = this.lightdashConfig.pgWire;
        const enabled = port !== undefined;

        // The connection details (host/port) are infra endpoints, so only
        // expose them to org admins. `enabled` is a capability flag every org
        // member needs to gate the settings tab, so it's returned to all.
        const isOrgAdmin = this.createAuditedAbility(account).can(
            'manage',
            subject('Organization', { organizationUuid }),
        );
        if (!isOrgAdmin) {
            return { enabled, host: null, port: null };
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

    async getBrand(account: Account): Promise<OrganizationBrand | null> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const brand = await this.organizationModel.findBrand(organizationUuid);
        return brand ?? null;
    }

    private static normalizeBrandDomain(domain: string): string {
        // Accept full URLs ("https://acme.com/about") or bare domains ("acme.com")
        const withoutProtocol = domain
            .trim()
            .toLowerCase()
            .replace(/^[a-z]+:\/\//, '');
        const hostname = withoutProtocol.split(/[/?#:]/)[0];
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/.test(hostname)) {
            throw new ParameterError(`Invalid domain: ${domain}`);
        }
        return hostname;
    }

    private static mapBrandfetchResponse(
        data: BrandfetchBrandResponse,
    ): Pick<
        OrganizationBrand,
        'name' | 'description' | 'logos' | 'colors' | 'fonts'
    > {
        const logos = (data.logos ?? []).flatMap((logo) =>
            (logo?.formats ?? []).reduce<OrganizationBrandLogo[]>(
                (acc, format) => {
                    if (format?.src) {
                        acc.push({
                            type: logo?.type ?? 'other',
                            theme: logo?.theme ?? null,
                            url: format.src,
                            format: format.format ?? null,
                        });
                    }
                    return acc;
                },
                [],
            ),
        );
        const colors = (data.colors ?? []).reduce<OrganizationBrandColor[]>(
            (acc, color) => {
                if (color?.hex) {
                    acc.push({
                        hex: color.hex,
                        type: color.type ?? 'other',
                        brightness: color.brightness ?? null,
                    });
                }
                return acc;
            },
            [],
        );
        const fonts = (data.fonts ?? []).reduce<OrganizationBrandFont[]>(
            (acc, font) => {
                if (font?.name) {
                    acc.push({
                        name: font.name,
                        type: font.type ?? 'other',
                        origin: font.origin ?? null,
                    });
                }
                return acc;
            },
            [],
        );
        return {
            name: data.name ?? null,
            description: data.description ?? null,
            logos,
            colors,
            fonts,
        };
    }

    /**
     * Fetch a brand profile from Brandfetch for the given domain WITHOUT
     * persisting it. Used to populate the appearance form so the user can
     * review and edit before saving (and revert if they change their mind).
     */
    async fetchBrandFromDomain(
        account: Account,
        domain: string,
    ): Promise<OrganizationBrand> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const apiKey = this.lightdashConfig.brandfetch?.apiKey;
        if (!apiKey) {
            throw new MissingConfigError(
                'Brandfetch is not configured. Set BRANDFETCH_API_KEY to enable fetching brand profiles.',
            );
        }

        const normalizedDomain =
            OrganizationService.normalizeBrandDomain(domain);

        const response = await fetch(
            `${BRANDFETCH_API_URL}/${encodeURIComponent(normalizedDomain)}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            },
        );

        if (response.status === 404) {
            throw new NotFoundError(
                `No brand found for domain "${normalizedDomain}"`,
            );
        }
        if (!response.ok) {
            this.logger.error('Brandfetch request failed', {
                organizationUuid,
                domain: normalizedDomain,
                status: response.status,
            });
            throw new UnexpectedServerError(
                `Brandfetch request failed with status ${response.status}`,
            );
        }

        let data: BrandfetchBrandResponse;
        try {
            data = (await response.json()) as BrandfetchBrandResponse;
        } catch {
            throw new UnexpectedServerError(
                'Brandfetch returned an invalid response',
            );
        }

        this.logger.info('Fetched organization brand from Brandfetch', {
            organizationUuid,
            domain: normalizedDomain,
        });

        return {
            organizationUuid,
            domain: normalizedDomain,
            ...OrganizationService.mapBrandfetchResponse(data),
            updatedAt: new Date(),
        };
    }

    /**
     * Persist the brand appearance exactly as edited by the user. Does not call
     * Brandfetch — stores the provided colors, logos, fonts and domain as-is.
     */
    async saveBrand(
        account: Account,
        request: SaveOrganizationBrandRequest,
    ): Promise<OrganizationBrand> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const normalizedDomain = OrganizationService.normalizeBrandDomain(
            request.domain,
        );

        const brand = await this.organizationModel.updateBrand(
            organizationUuid,
            {
                domain: normalizedDomain,
                name: request.name,
                description: request.description,
                logos: request.logos,
                colors: request.colors,
                fonts: request.fonts,
            },
        );

        this.logger.info('Saved organization brand', {
            organizationUuid,
            domain: normalizedDomain,
        });

        return brand;
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
        googleOidcOnly?: boolean,
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
                  organizationUuid,
                  includeGroups,
                  paginateArgs,
                  searchQuery,
                  googleOidcOnly,
              )
            : await this.organizationMemberProfileModel.getOrganizationMembers({
                  organizationUuid,
                  paginateArgs,
                  searchQuery,
                  googleOidcOnly,
              });

        let members = organizationMembers.filter((member) =>
            auditedAbility.can(
                'view',
                subject('OrganizationMemberProfile', {
                    ...member,
                    metadata: { userUuid: member.userUuid },
                }),
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
                    // A group can carry a custom-role UUID instead of a system
                    // role. Those aren't convertible to an org role, so fall back
                    // to the member's own org role rather than throwing.
                    role:
                        groupAccess?.role && isSystemRole(groupAccess.role)
                            ? convertProjectRoleToOrganizationRole(
                                  groupAccess.role,
                              )
                            : member.role,
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

        return projects.filter((project) =>
            auditedAbility.can(
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
    ): Promise<KnexPaginatedData<Group[] | GroupWithMembers[]>> {
        if (user.organizationUuid === undefined) {
            throw new ForbiddenError();
        }
        const { pagination, data: groups } = await this.groupsModel.find(
            {
                organizationUuid: user.organizationUuid,
                searchQuery,
            },
            paginateArgs,
        );

        const auditedAbility = this.createAuditedAbility(user);
        const allowedGroups = groups.filter((group) =>
            auditedAbility.can(
                'view',
                subject('Group', {
                    ...group,
                    metadata: {
                        groupUuid: group.uuid,
                        groupName: group.name,
                    },
                }),
            ),
        );

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
                'update',
                subject('Organization', {
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
                'update',
                subject('Organization', {
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
                'update',
                subject('Organization', {
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
                'update',
                subject('Organization', {
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

        return palette;
    }

    async getImpersonationEnabled(user: SessionUser): Promise<boolean> {
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
