import { subject } from '@casl/ability';
import {
    Account,
    AlertAsCode,
    AlreadyExistsError,
    ApiAlertAsCodeListResponse,
    ApiAlertAsCodeUpsertResponse,
    ApiChartAsCodeListResponse,
    ApiDashboardAsCodeListResponse,
    ApiGoogleSheetsSyncAsCodeListResponse,
    ApiGoogleSheetsSyncAsCodeUpsertResponse,
    ApiScheduledDeliveryAsCodeListResponse,
    ApiScheduledDeliveryAsCodeUpsertResponse,
    ApiSpaceAsCodeListResponse,
    ApiSpaceAsCodeUpsertResponse,
    ApiVirtualViewAsCodeListResponse,
    ApiVirtualViewAsCodeUpsertResponse,
    assertUnreachable,
    ChartAsCode,
    ChartAsCodeInternalization,
    ChartGoogleSheetsSyncAsCode,
    ChartScheduledDeliveryAsCode,
    ChartSummary,
    ContentAsCodeType,
    ContentType,
    CreateSavedChart,
    CreateSchedulerTarget,
    currentVersion,
    DashboardAsCode,
    DashboardAsCodeInternalization,
    DashboardChartTileAsCode,
    DashboardDAO,
    DashboardFilterRule,
    DashboardGoogleSheetsSyncAsCode,
    DashboardMarkdownTileAsCode,
    DashboardScheduledDeliveryAsCode,
    DashboardSqlChartTileAsCode,
    DashboardTileAsCode,
    DashboardTileTarget,
    DashboardTileTypes,
    DimensionType,
    Explore,
    ExploreType,
    ForbiddenError,
    friendlyName,
    getContentAsCodePathFromLtreePath,
    getLtreePathFromContentAsCodePath,
    getParameterReferences,
    isChartScheduler,
    isDashboardScheduler,
    isEmailTarget,
    isExploreError,
    isGoogleChatTarget,
    isMsTeamsTarget,
    isSchedulerCsvOptions,
    isSchedulerGsheetsOptions,
    isSchedulerImageOptions,
    isSlackTarget,
    NotFoundError,
    NotificationFrequency,
    OrganizationMemberRole,
    ParameterError,
    Project,
    ProjectType,
    PromotionAction,
    PromotionChanges,
    SavedChartDAO,
    ScheduledDeliveryAsCode,
    ScheduledDeliveryFormatAsCode,
    ScheduledDeliveryTargetAsCode,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    snakeCaseName,
    Space,
    SpaceAsCode,
    SpaceAsCodeAction,
    SpaceMemberRole,
    SqlChartAsCode,
    UpdatedByUser,
    validateEmail,
    VirtualViewAsCode,
    type ContentVerificationInfo,
    type DashboardTileWithSlug,
    type Filters,
    type GoogleSheetsSyncAsCode,
    type SpaceSummaryBase,
} from '@lightdash/common';
import type { Knex } from 'knex';
import isEqual from 'lodash/isEqual';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { getAccountApiAccessContext } from '../../auth/account';
import { LightdashConfig } from '../../config/parseConfig';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { GroupsModel } from '../../models/GroupsModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import {
    SpaceModel,
    type ResolvedSpaceCodeUserAccess,
} from '../../models/SpaceModel';
import type { RawSpaceDirectAccess } from '../../models/SpacePermissionModel';
import { UserModel } from '../../models/UserModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { DashboardService } from '../DashboardService/DashboardService';
import { ProjectService } from '../ProjectService/ProjectService';
import { PromoteService } from '../PromoteService/PromoteService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SchedulerService } from '../SchedulerService/SchedulerService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import {
    getChartContentAsCodePermissionChecks,
    type ContentAsCodeSqlPermissionCheckResult,
    type CurrentChartSqlItems,
} from './chartPermissions';
import {
    getChartSlugForTileUuid,
    getConfigWithDateZoomTileSlugs,
    getConfigWithDateZoomTileUuids,
    getFiltersWithTileSlugs,
    getFiltersWithTileUuids,
    isAnyChartTile,
} from './dashboardReferences';
import { normalizeFilterIds, stripFilterIds } from './filterIds';
import { ScheduledContentCoder } from './handlers/ScheduledContentCoder';
import { VirtualViewCoder } from './handlers/VirtualViewCoder';
import { paginateAsCode } from './pagination';
import {
    getDashboardScheduledDeliveryFiltersWithTileSlugs,
    getDashboardScheduledDeliveryFiltersWithTileUuids,
    getDashboardTabSlug,
    getDashboardTabUuid,
    getScheduledDeliveryFormat,
    getScheduledDeliveryTargetKey,
    getScheduledDeliveryTargetsAsCode,
} from './scheduledContent';

type ContentAsCodeSpaceContentMetadata = {
    savedChartUuid?: string;
    dashboardUuid?: string;
    savedSqlUuid?: string | null;
};

type CoderServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    savedChartModel: SavedChartModel;
    savedSqlModel: SavedSqlModel;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    schedulerModel: SchedulerModel;
    schedulerService: SchedulerService;
    savedChartService: SavedChartService;
    dashboardService: DashboardService;
    schedulerClient: SchedulerClient;
    promoteService: PromoteService;
    spacePermissionService: SpacePermissionService;
    contentVerificationModel: ContentVerificationModel;
    projectService?: ProjectService;
    groupsModel: GroupsModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    userModel: UserModel;
};

type UpsertContentAsCodeOptions = {
    skipSpaceCreate?: boolean;
    publicSpaceCreate?: boolean;
    force?: boolean;
    spaceNames?: Record<string, string>;
    mode?: 'upsert' | 'create';
};

export class CoderService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    savedChartModel: SavedChartModel;

    savedSqlModel: SavedSqlModel;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    schedulerModel: SchedulerModel;

    schedulerService: SchedulerService;

    savedChartService: SavedChartService;

    dashboardService: DashboardService;

    schedulerClient: SchedulerClient;

    promoteService: PromoteService;

    spacePermissionService: SpacePermissionService;

    contentVerificationModel: ContentVerificationModel;

    projectService?: ProjectService;

    groupsModel: GroupsModel;

    organizationMemberProfileModel: OrganizationMemberProfileModel;

    userModel: UserModel;

    private readonly virtualViewCoder: VirtualViewCoder;

    private readonly scheduledContentCoder: ScheduledContentCoder;

    static getChartContentAsCodePermissionChecks(
        nextChart: ChartAsCode,
        currentChart?: CurrentChartSqlItems,
    ): ContentAsCodeSqlPermissionCheckResult[] {
        return getChartContentAsCodePermissionChecks(nextChart, currentChart);
    }

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        savedChartModel,
        savedSqlModel,
        dashboardModel,
        spaceModel,
        schedulerModel,
        schedulerService,
        savedChartService,
        dashboardService,
        schedulerClient,
        promoteService,
        spacePermissionService,
        contentVerificationModel,
        projectService,
        groupsModel,
        organizationMemberProfileModel,
        userModel,
    }: CoderServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.savedChartModel = savedChartModel;
        this.savedSqlModel = savedSqlModel;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.schedulerModel = schedulerModel;
        this.schedulerService = schedulerService;
        this.savedChartService = savedChartService;
        this.dashboardService = dashboardService;
        this.schedulerClient = schedulerClient;
        this.promoteService = promoteService;
        this.spacePermissionService = spacePermissionService;
        this.contentVerificationModel = contentVerificationModel;
        this.projectService = projectService;
        this.groupsModel = groupsModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.userModel = userModel;
        this.virtualViewCoder = new VirtualViewCoder({
            projectModel,
            projectService,
        });
        this.scheduledContentCoder = new ScheduledContentCoder({
            projectModel,
            savedChartModel,
            dashboardModel,
            schedulerModel,
            schedulerService,
            savedChartService,
            dashboardService,
        });
    }

    async getVirtualViews(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
    ): Promise<ApiVirtualViewAsCodeListResponse['results']> {
        return this.virtualViewCoder.list(user, projectUuid, slugs);
    }

    async upsertVirtualView(
        account: Account,
        projectUuid: string,
        slug: string,
        virtualView: VirtualViewAsCode,
        force = false,
    ): Promise<ApiVirtualViewAsCodeUpsertResponse['results']> {
        return this.virtualViewCoder.upsert(
            account,
            projectUuid,
            slug,
            virtualView,
            force,
        );
    }

    private static handleContentAsCodeSqlPermissionChecks({
        checks,
        auditedAbility,
        project,
        slug,
    }: {
        checks: ContentAsCodeSqlPermissionCheckResult[];
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        project: Pick<Project, 'projectUuid' | 'organizationUuid'>;
        slug: string;
    }) {
        const missingChecks = checks.filter(({ check }) => {
            switch (check) {
                case 'customSqlDimension':
                    return auditedAbility.cannot(
                        'manage',
                        subject('CustomFields', {
                            organizationUuid: project.organizationUuid,
                            projectUuid: project.projectUuid,
                            metadata: { slug },
                        }),
                    );
                case 'sqlTableCalculation':
                    return auditedAbility.cannot(
                        'manage',
                        subject('CustomSqlTableCalculations', {
                            organizationUuid: project.organizationUuid,
                            projectUuid: project.projectUuid,
                            metadata: { slug },
                        }),
                    );
                default:
                    return assertUnreachable(
                        check,
                        `Unknown content-as-code SQL permission check: ${check}`,
                    );
            }
        });

        if (missingChecks.length === 0) return;
        throw new ForbiddenError(
            missingChecks.map(({ message }) => message).join('; '),
        );
    }

    private static transformSpaces(
        spaces: Pick<SpaceSummaryBase, 'uuid' | 'name' | 'path'>[],
    ): SpaceAsCode[] {
        return spaces.map((space) => ({
            contentType: ContentAsCodeType.SPACE,
            spaceName: space.name,
            slug: getContentAsCodePathFromLtreePath(space.path),
        }));
    }

    private static assertObjectKeys(
        value: unknown,
        allowedKeys: readonly string[],
        label: string,
    ): asserts value is Record<string, unknown> {
        if (
            typeof value !== 'object' ||
            value === null ||
            Array.isArray(value)
        ) {
            throw new ParameterError(`${label} must be an object`);
        }
        const unknownKeys = Object.keys(value).filter(
            (key) => !allowedKeys.includes(key),
        );
        if (unknownKeys.length > 0) {
            throw new ParameterError(
                `${label} contains unknown properties: ${unknownKeys.join(', ')}`,
            );
        }
    }

    private static normalizeSpaceAsCode(spaceInput: SpaceAsCode): SpaceAsCode {
        CoderService.assertObjectKeys(
            spaceInput,
            ['contentType', 'version', 'spaceName', 'slug', 'access'],
            'Space',
        );
        if (spaceInput.contentType !== ContentAsCodeType.SPACE) {
            throw new ParameterError('Invalid space contentType');
        }
        if (spaceInput.version !== undefined && spaceInput.version !== 1) {
            throw new ParameterError(
                `Unsupported space version ${spaceInput.version}`,
            );
        }
        if (
            typeof spaceInput.spaceName !== 'string' ||
            !spaceInput.spaceName.trim()
        ) {
            throw new ParameterError('Space name is required');
        }
        if (
            typeof spaceInput.slug !== 'string' ||
            spaceInput.slug !== spaceInput.slug.trim() ||
            !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(spaceInput.slug) ||
            getContentAsCodePathFromLtreePath(
                getLtreePathFromContentAsCodePath(spaceInput.slug),
            ) !== spaceInput.slug
        ) {
            throw new ParameterError(
                'Space slug must be a canonical hierarchy path',
            );
        }
        if (spaceInput.access === undefined) {
            return {
                contentType: ContentAsCodeType.SPACE,
                ...(spaceInput.version === 1 ? { version: 1 as const } : {}),
                spaceName: spaceInput.spaceName,
                slug: spaceInput.slug,
            };
        }
        if (spaceInput.version !== 1) {
            throw new ParameterError(
                'Space access requires space schema version 1',
            );
        }

        CoderService.assertObjectKeys(
            spaceInput.access,
            [
                'inheritParentPermissions',
                'projectMemberAccessRole',
                'users',
                'groups',
            ],
            'Space access',
        );
        const { access } = spaceInput;
        if (typeof access.inheritParentPermissions !== 'boolean') {
            throw new ParameterError(
                'inheritParentPermissions must be a boolean',
            );
        }
        const validRoles = new Set(Object.values(SpaceMemberRole));
        if (
            access.projectMemberAccessRole !== null &&
            !validRoles.has(access.projectMemberAccessRole)
        ) {
            throw new ParameterError(
                'projectMemberAccessRole must be viewer, editor, admin, or null',
            );
        }
        if (!Array.isArray(access.users) || !Array.isArray(access.groups)) {
            throw new ParameterError(
                'Space access users and groups must be arrays',
            );
        }

        const users = access.users.map((entry, index) => {
            CoderService.assertObjectKeys(
                entry,
                ['email', 'role'],
                `Space access user ${index + 1}`,
            );
            if (
                typeof entry.email !== 'string' ||
                !validateEmail(entry.email.trim())
            ) {
                throw new ParameterError(
                    `Space access user ${index + 1} has an invalid email`,
                );
            }
            if (!validRoles.has(entry.role)) {
                throw new ParameterError(
                    `Space access user ${entry.email} has an invalid role`,
                );
            }
            return {
                email: entry.email.trim().toLowerCase(),
                role: entry.role,
            };
        });
        const duplicateEmails = users
            .map(({ email }) => email)
            .filter((email, index, emails) => emails.indexOf(email) !== index);
        if (duplicateEmails.length > 0) {
            throw new ParameterError(
                `Space access contains duplicate users: ${[
                    ...new Set(duplicateEmails),
                ].join(', ')}`,
            );
        }

        const groups = access.groups.map((entry, index) => {
            CoderService.assertObjectKeys(
                entry,
                ['name', 'role'],
                `Space access group ${index + 1}`,
            );
            if (typeof entry.name !== 'string' || !entry.name.trim()) {
                throw new ParameterError(
                    `Space access group ${index + 1} requires a name`,
                );
            }
            if (!validRoles.has(entry.role)) {
                throw new ParameterError(
                    `Space access group ${entry.name} has an invalid role`,
                );
            }
            return { name: entry.name, role: entry.role };
        });
        const duplicateGroups = groups
            .map(({ name }) => name)
            .filter((name, index, names) => names.indexOf(name) !== index);
        if (duplicateGroups.length > 0) {
            throw new ParameterError(
                `Space access contains duplicate groups: ${[
                    ...new Set(duplicateGroups),
                ].join(', ')}`,
            );
        }

        return {
            contentType: ContentAsCodeType.SPACE,
            version: 1,
            spaceName: spaceInput.spaceName,
            slug: spaceInput.slug,
            access: {
                inheritParentPermissions: access.inheritParentPermissions,
                projectMemberAccessRole: access.projectMemberAccessRole,
                users: users.sort((left, right) =>
                    left.email.localeCompare(right.email),
                ),
                groups: groups.sort((left, right) =>
                    left.name.localeCompare(right.name),
                ),
            },
        };
    }

    async getSpaces(
        account: Account,
        projectUuid: string,
    ): Promise<ApiSpaceAsCodeListResponse['results']> {
        const { user } = getAccountApiAccessContext(account);
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError('You are not allowed to download spaces');
        }

        const allProjectSpaces =
            await this.spaceModel.getSpacesByProjectUuid(projectUuid);
        const projectSpaces = allProjectSpaces.filter(
            (space) => !space.isDefaultUserSpace,
        );
        const accessibleSpaceUuids = new Set(
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                projectSpaces.map(({ uuid }) => uuid),
            ),
        );
        const rawAccess = await this.spacePermissionService.getRawDirectAccess(
            projectSpaces.map(({ uuid }) => uuid),
        );
        const directUserEmails = [
            ...new Set(
                Object.values(rawAccess)
                    .flatMap(({ users }) => users)
                    .flatMap(({ email }) =>
                        email === null ? [] : [email.toLowerCase()],
                    ),
            ),
        ];
        const organizationMembers =
            await this.organizationMemberProfileModel.findOrganizationMembersByEmails(
                project.organizationUuid,
                directUserEmails,
            );
        const membersByUuid = new Map(
            organizationMembers.map((member) => [member.userUuid, member]),
        );
        const memberEmailCounts = organizationMembers.reduce<
            Map<string, number>
        >((counts, member) => {
            const email = member.email.toLowerCase();
            counts.set(email, (counts.get(email) ?? 0) + 1);
            return counts;
        }, new Map());
        const rawGroups = Object.values(rawAccess).flatMap(
            ({ groups }) => groups,
        );
        const uniqueRawGroups = [
            ...new Map(
                rawGroups.map((group) => [group.groupUuid, group]),
            ).values(),
        ];
        const portableGroupUuids = new Set(
            (
                await Promise.all(
                    uniqueRawGroups.map(async (group) => {
                        if (group.name === null) return null;
                        const matches = (
                            await this.groupsModel.find({
                                organizationUuid: project.organizationUuid,
                                name: group.name,
                            })
                        ).data;
                        return matches.length === 1 &&
                            matches[0].uuid === group.groupUuid
                            ? group.groupUuid
                            : null;
                    }),
                )
            ).filter((groupUuid): groupUuid is string => groupUuid !== null),
        );
        const pathCounts = allProjectSpaces.reduce<Map<string, number>>(
            (counts, space) =>
                counts.set(space.path, (counts.get(space.path) ?? 0) + 1),
            new Map(),
        );
        const spaces: SpaceAsCode[] = [];
        const skipped: ApiSpaceAsCodeListResponse['results']['skipped'] = [];
        const skippedPaths = new Set<string>();
        const skippedSpaceUuids = new Set<string>();
        const spacesByUuid = new Map(
            allProjectSpaces.map((space) => [space.uuid, space]),
        );

        projectSpaces
            .filter(({ uuid }) => accessibleSpaceUuids.has(uuid))
            .sort((left, right) => {
                const depthDifference =
                    left.path.split('.').length - right.path.split('.').length;
                return depthDifference || left.path.localeCompare(right.path);
            })
            .forEach((space) => {
                const slug = getContentAsCodePathFromLtreePath(space.path);
                if ((pathCounts.get(space.path) ?? 0) > 1) {
                    skippedSpaceUuids.add(space.uuid);
                    if (!skippedPaths.has(space.path)) {
                        skipped.push({
                            slug,
                            reason: 'Multiple spaces use this hierarchy path',
                        });
                        skippedPaths.add(space.path);
                    }
                    return;
                }
                const directParentPath = space.path.includes('.')
                    ? space.path.slice(0, space.path.lastIndexOf('.'))
                    : null;
                if (
                    (directParentPath === null) !==
                    (space.parentSpaceUuid === null)
                ) {
                    skippedSpaceUuids.add(space.uuid);
                    skipped.push({
                        slug,
                        reason: 'Space parent does not match its hierarchy path',
                    });
                    return;
                }
                const visitedAncestorUuids = new Set<string>();
                let ancestorUuid = space.parentSpaceUuid;
                let descendantPath = space.path;
                while (ancestorUuid !== null) {
                    if (visitedAncestorUuids.has(ancestorUuid)) {
                        skippedSpaceUuids.add(space.uuid);
                        skipped.push({
                            slug,
                            reason: 'Space hierarchy contains a parent cycle',
                        });
                        return;
                    }
                    visitedAncestorUuids.add(ancestorUuid);
                    const ancestor = spacesByUuid.get(ancestorUuid);
                    const expectedAncestorPath = descendantPath.slice(
                        0,
                        descendantPath.lastIndexOf('.'),
                    );
                    if (
                        !ancestor ||
                        ancestor.isDefaultUserSpace ||
                        !accessibleSpaceUuids.has(ancestorUuid) ||
                        skippedSpaceUuids.has(ancestorUuid)
                    ) {
                        skippedSpaceUuids.add(space.uuid);
                        skipped.push({
                            slug,
                            reason: skippedSpaceUuids.has(ancestorUuid)
                                ? 'An ancestor space could not be exported portably'
                                : 'An ancestor space is not accessible for portable export',
                        });
                        return;
                    }
                    if (ancestor.path !== expectedAncestorPath) {
                        skippedSpaceUuids.add(space.uuid);
                        skipped.push({
                            slug,
                            reason: 'Space parent does not match its hierarchy path',
                        });
                        return;
                    }
                    descendantPath = ancestor.path;
                    ancestorUuid = ancestor.parentSpaceUuid;
                }

                const directAccess = rawAccess[space.uuid] ?? {
                    users: [],
                    groups: [],
                };
                const metadataOnlySpace: SpaceAsCode = {
                    contentType: ContentAsCodeType.SPACE,
                    spaceName: space.name,
                    slug,
                };
                if (
                    directAccess.users.some(
                        ({ userUuid, email, isInternal }) => {
                            if (isInternal || email === null) return true;
                            const member = membersByUuid.get(userUuid);
                            const normalizedEmail = email.toLowerCase();
                            return (
                                member === undefined ||
                                member.email.toLowerCase() !==
                                    normalizedEmail ||
                                memberEmailCounts.get(normalizedEmail) !== 1
                            );
                        },
                    )
                ) {
                    spaces.push(metadataOnlySpace);
                    skipped.push({
                        slug,
                        reason: 'Direct access contains a user without a portable organization identity',
                    });
                    return;
                }
                if (
                    directAccess.groups.some(
                        ({ groupUuid, name }) =>
                            name === null || !portableGroupUuids.has(groupUuid),
                    )
                ) {
                    spaces.push(metadataOnlySpace);
                    skipped.push({
                        slug,
                        reason: 'Direct access contains a group without a portable name',
                    });
                    return;
                }

                const users = directAccess.users.map(({ email, role }) => ({
                    email: email!.toLowerCase(),
                    role,
                }));
                const groups = directAccess.groups.map(({ name, role }) => ({
                    name: name!,
                    role,
                }));
                if (
                    new Set(users.map(({ email }) => email)).size !==
                        users.length ||
                    new Set(groups.map(({ name }) => name)).size !==
                        groups.length
                ) {
                    spaces.push(metadataOnlySpace);
                    skipped.push({
                        slug,
                        reason: 'Direct access contains ambiguous portable principals',
                    });
                    return;
                }

                spaces.push({
                    ...metadataOnlySpace,
                    version: 1,
                    access: {
                        inheritParentPermissions:
                            space.inheritParentPermissions,
                        projectMemberAccessRole: space.projectMemberAccessRole,
                        users: users.sort((left, right) =>
                            left.email.localeCompare(right.email),
                        ),
                        groups: groups.sort((left, right) =>
                            left.name.localeCompare(right.name),
                        ),
                    },
                });
            });

        return { spaces, skipped };
    }

    private async assertSpaceUploaderRetainsManage({
        user,
        auditedAbility,
        project,
        parentSpaceUuid,
        access,
        trx,
        resolvedUserAccess,
    }: {
        user: SessionUser;
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        project: Pick<Project, 'projectUuid' | 'organizationUuid'>;
        parentSpaceUuid: string | null;
        access: NonNullable<SpaceAsCode['access']>;
        trx: Knex;
        resolvedUserAccess: ResolvedSpaceCodeUserAccess[];
    }): Promise<void> {
        let inheritsFromOrgOrProject =
            access.inheritParentPermissions && parentSpaceUuid === null;
        const proposedUserAccess: Array<{
            userUuid: string;
            role: SpaceMemberRole;
        }> = [];

        if (access.inheritParentPermissions && parentSpaceUuid !== null) {
            const parentContext =
                await this.spacePermissionService.getSpaceAccessContext(
                    user.userUuid,
                    parentSpaceUuid,
                    { trx },
                );
            inheritsFromOrgOrProject = parentContext.inheritsFromOrgOrProject;
            proposedUserAccess.push(...parentContext.access);
        }
        const directActorAccess = resolvedUserAccess.find(
            ({ userUuid }) => userUuid === user.userUuid,
        );
        if (directActorAccess) {
            proposedUserAccess.push({
                userUuid: user.userUuid,
                role: directActorAccess.role,
            });
        }
        if (
            access.projectMemberAccessRole !== null &&
            ((await this.projectModel.hasProjectMembership(
                project.projectUuid,
                user.userUuid,
                { trx },
            )) ||
                (user.role !== undefined &&
                    user.role !== OrganizationMemberRole.MEMBER))
        ) {
            proposedUserAccess.push({
                userUuid: user.userUuid,
                role: access.projectMemberAccessRole,
            });
        }

        const requestedGroups = access.groups.filter(
            ({ role }) => role === SpaceMemberRole.ADMIN,
        );
        if (requestedGroups.length > 0) {
            const groups = (
                await Promise.all(
                    requestedGroups.map(({ name }) =>
                        this.groupsModel.find(
                            {
                                organizationUuid: project.organizationUuid,
                                name,
                            },
                            undefined,
                            { trx },
                        ),
                    ),
                )
            ).flatMap(({ data }) => data);
            if (groups.length !== requestedGroups.length) {
                // Let transactional principal validation report missing or
                // ambiguous groups instead of masking it as a lockout.
                return;
            }
            const memberships = await this.groupsModel.findUserInGroups(
                {
                    userUuid: user.userUuid,
                    organizationUuid: project.organizationUuid,
                    groupUuids: groups.map(({ uuid }) => uuid),
                },
                { trx },
            );
            if (
                memberships.some(({ userUuid }) => userUuid === user.userUuid)
            ) {
                proposedUserAccess.push({
                    userUuid: user.userUuid,
                    role: SpaceMemberRole.ADMIN,
                });
            }
        }

        if (
            auditedAbility.cannot(
                'manage',
                subject('Space', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                    inheritsFromOrgOrProject,
                    access: proposedUserAccess,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Space access would remove your permission to manage the space',
            );
        }
    }

    private async validateSpaceAccessPrincipals(
        organizationUuid: string,
        access: NonNullable<SpaceAsCode['access']>,
    ): Promise<void> {
        const members =
            await this.organizationMemberProfileModel.findOrganizationMembersByEmails(
                organizationUuid,
                access.users.map(({ email }) => email),
            );
        const membersByEmail = members.reduce<Map<string, typeof members>>(
            (map, member) => {
                const email = member.email.toLowerCase();
                map.set(email, [...(map.get(email) ?? []), member]);
                return map;
            },
            new Map(),
        );
        access.users.forEach(({ email }) => {
            const matches = membersByEmail.get(email) ?? [];
            if (matches.length === 0) {
                throw new ParameterError(
                    `User ${email} is not a member of this organization`,
                );
            }
            if (matches.length > 1) {
                throw new ParameterError(
                    `User email ${email} is ambiguous in this organization`,
                );
            }
        });

        const groupMatches = await Promise.all(
            access.groups.map(async ({ name }) => ({
                name,
                matches: (
                    await this.groupsModel.find({
                        organizationUuid,
                        name,
                    })
                ).data,
            })),
        );
        groupMatches.forEach(({ name, matches }) => {
            if (matches.length === 0) {
                throw new ParameterError(
                    `Group ${name} does not exist in this organization`,
                );
            }
            if (matches.length > 1) {
                throw new ParameterError(
                    `Group name ${name} is ambiguous in this organization`,
                );
            }
        });
    }

    private async hasNonPortableDirectSpaceAccess(
        organizationUuid: string,
        access: RawSpaceDirectAccess,
    ): Promise<boolean> {
        const emails = access.users.flatMap(({ email }) =>
            email === null ? [] : [email.toLowerCase()],
        );
        const members =
            await this.organizationMemberProfileModel.findOrganizationMembersByEmails(
                organizationUuid,
                [...new Set(emails)],
            );
        const membersByUuid = new Map(
            members.map((member) => [member.userUuid, member]),
        );
        const memberEmailCounts = members.reduce<Map<string, number>>(
            (counts, member) => {
                const email = member.email.toLowerCase();
                counts.set(email, (counts.get(email) ?? 0) + 1);
                return counts;
            },
            new Map(),
        );
        if (
            access.users.some(({ userUuid, email, isInternal }) => {
                if (isInternal || email === null) return true;
                const normalizedEmail = email.toLowerCase();
                const member = membersByUuid.get(userUuid);
                return (
                    member === undefined ||
                    member.email.toLowerCase() !== normalizedEmail ||
                    memberEmailCounts.get(normalizedEmail) !== 1
                );
            })
        ) {
            return true;
        }

        const portableGroups = await Promise.all(
            access.groups.map(async ({ groupUuid, name }) => {
                if (name === null) return false;
                const matches = (
                    await this.groupsModel.find({ organizationUuid, name })
                ).data;
                return matches.length === 1 && matches[0].uuid === groupUuid;
            }),
        );
        return portableGroups.some((portable) => !portable);
    }

    async upsertSpace(
        account: Account,
        projectUuid: string,
        spaceInput: SpaceAsCode,
        options: {
            skipSpaceCreate?: boolean;
            publicSpaceCreate?: boolean;
        } = {},
    ): Promise<ApiSpaceAsCodeUpsertResponse['results']> {
        const { user } = getAccountApiAccessContext(account);
        const desiredSpace = CoderService.normalizeSpaceAsCode(spaceInput);
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }
        const auditedAbility = this.createAuditedAbility(account);
        CoderService.checkContentAsCodeWriteAccess({
            auditedAbility,
            project,
            slug: desiredSpace.slug,
        });

        const path = getLtreePathFromContentAsCodePath(desiredSpace.slug);
        const matches = await this.spaceModel.findByProjectAndPath(
            projectUuid,
            path,
        );
        if (matches.some(({ isDefaultUserSpace }) => isDefaultUserSpace)) {
            throw new ParameterError(
                `Generated personal space "${desiredSpace.slug}" cannot be managed as code`,
            );
        }
        if (matches.length > 1) {
            throw new ParameterError(
                `Multiple spaces use hierarchy path "${desiredSpace.slug}"`,
            );
        }
        const existingSpace = matches[0];
        if (!existingSpace && options.skipSpaceCreate) {
            throw new NotFoundError(
                `Space ${desiredSpace.slug} does not exist, skipping creation`,
            );
        }

        const parentPath = path.includes('.')
            ? path.slice(0, path.lastIndexOf('.'))
            : null;
        let parentSpace = null;
        if (parentPath !== null) {
            let parentMatches = await this.spaceModel.findByProjectAndPath(
                projectUuid,
                parentPath,
            );
            if (
                parentMatches.length === 0 &&
                desiredSpace.access === undefined &&
                !existingSpace
            ) {
                const parentSlug =
                    getContentAsCodePathFromLtreePath(parentPath);
                const parentPathSegment = parentPath.slice(
                    parentPath.lastIndexOf('.') + 1,
                );
                await this.upsertSpace(
                    account,
                    projectUuid,
                    {
                        contentType: ContentAsCodeType.SPACE,
                        spaceName: friendlyName(parentPathSegment),
                        slug: parentSlug,
                    },
                    options,
                );
                parentMatches = await this.spaceModel.findByProjectAndPath(
                    projectUuid,
                    parentPath,
                );
            }
            if (
                parentMatches.some(
                    ({ isDefaultUserSpace }) => isDefaultUserSpace,
                )
            ) {
                throw new ParameterError(
                    `Generated personal space "${getContentAsCodePathFromLtreePath(
                        parentPath,
                    )}" cannot be used as an as-code parent`,
                );
            }
            if (parentMatches.length !== 1) {
                throw new ParameterError(
                    parentMatches.length === 0
                        ? `Parent space "${getContentAsCodePathFromLtreePath(
                              parentPath,
                          )}" must exist before "${desiredSpace.slug}"`
                        : `Multiple spaces use parent hierarchy path "${getContentAsCodePathFromLtreePath(
                              parentPath,
                          )}"`,
                );
            }
            [parentSpace] = parentMatches;
        }
        const parentSpaceUuid = parentSpace?.uuid ?? null;
        if (
            existingSpace &&
            existingSpace.parentSpaceUuid !== parentSpaceUuid
        ) {
            throw new ParameterError(
                `Existing space "${desiredSpace.slug}" has an inconsistent parent`,
            );
        }

        const metadataChanged =
            !existingSpace || existingSpace.name !== desiredSpace.spaceName;
        if (
            existingSpace &&
            desiredSpace.access === undefined &&
            !metadataChanged
        ) {
            if (
                !(await this.spacePermissionService.can(
                    'view',
                    user,
                    existingSpace.uuid,
                ))
            ) {
                throw new ForbiddenError(
                    `You don't have permission to view space "${desiredSpace.slug}"`,
                );
            }
            return { action: SpaceAsCodeAction.NO_CHANGES };
        }

        if (existingSpace) {
            if (
                !(await this.spacePermissionService.can(
                    'manage',
                    user,
                    existingSpace.uuid,
                ))
            ) {
                throw new ForbiddenError(
                    `You don't have permission to manage space "${desiredSpace.slug}"`,
                );
            }
        } else {
            if (
                auditedAbility.cannot(
                    'create',
                    subject('Space', {
                        organizationUuid: project.organizationUuid,
                        projectUuid,
                        metadata: { spaceName: desiredSpace.spaceName },
                    }),
                )
            ) {
                throw new ForbiddenError(
                    `You don't have permission to create space "${desiredSpace.slug}"`,
                );
            }
            if (
                parentSpaceUuid !== null &&
                !(await this.spacePermissionService.can(
                    'manage',
                    user,
                    parentSpaceUuid,
                ))
            ) {
                throw new ForbiddenError(
                    `You don't have permission to create a child of space "${getContentAsCodePathFromLtreePath(
                        parentPath!,
                    )}"`,
                );
            }
        }

        const rawAccess = existingSpace
            ? ((
                  await this.spacePermissionService.getRawDirectAccess([
                      existingSpace.uuid,
                  ])
              )[existingSpace.uuid] ?? { users: [], groups: [] })
            : { users: [], groups: [] };
        const hasNonPortableDirectAccess =
            desiredSpace.access !== undefined && existingSpace !== undefined
                ? await this.hasNonPortableDirectSpaceAccess(
                      project.organizationUuid,
                      rawAccess,
                  )
                : false;
        const warnings =
            desiredSpace.access && hasNonPortableDirectAccess
                ? [
                      'Applying this access policy will remove direct service-account, internal-user, or unresolved user/group grants that cannot be represented as code',
                  ]
                : [];

        if (desiredSpace.access) {
            await this.validateSpaceAccessPrincipals(
                project.organizationUuid,
                desiredSpace.access,
            );
        }

        let accessChanged = desiredSpace.access !== undefined;
        if (
            existingSpace &&
            desiredSpace.access &&
            !hasNonPortableDirectAccess
        ) {
            const currentAccess = {
                inheritParentPermissions:
                    existingSpace.inheritParentPermissions,
                projectMemberAccessRole: existingSpace.projectMemberAccessRole,
                users: rawAccess.users
                    .map(({ email, role }) => ({
                        email: email!.toLowerCase(),
                        role,
                    }))
                    .sort((left, right) =>
                        left.email.localeCompare(right.email),
                    ),
                groups: rawAccess.groups
                    .map(({ name, role }) => ({ name: name!, role }))
                    .sort((left, right) => left.name.localeCompare(right.name)),
            };
            accessChanged = !isEqual(currentAccess, desiredSpace.access);
        }
        if (existingSpace && !metadataChanged && !accessChanged) {
            return { action: SpaceAsCodeAction.NO_CHANGES };
        }

        const applyInput = {
            projectUuid,
            userId: user.userId,
            actorUserUuid: user.userUuid,
            actorServiceAccountUuid:
                account.authentication.type === 'service-account'
                    ? account.authentication.serviceAccountUuid
                    : null,
            spaceUuid: existingSpace?.uuid ?? null,
            name: desiredSpace.spaceName,
            path,
            parentSpaceUuid,
            inheritParentPermissionsOnCreate:
                parentSpace?.inheritParentPermissions ??
                options.publicSpaceCreate === true,
            ...(desiredSpace.access === undefined && parentSpaceUuid !== null
                ? { copyParentAccessOnLegacyCreate: true }
                : {}),
            ...(desiredSpace.access ? { access: desiredSpace.access } : {}),
        };
        await this.spaceModel.applySpaceAsCode(applyInput, {
            beforeMutation: async (trx, { userAccess }) => {
                const reloadedUser =
                    await this.userModel.findSessionUserAndOrgByUuid(
                        user.userUuid,
                        project.organizationUuid,
                        { trx },
                    );
                if (!reloadedUser.isActive) {
                    throw new ForbiddenError(
                        'The authenticated user is no longer active',
                    );
                }
                const currentUser: SessionUser = {
                    ...reloadedUser,
                    requestContext: user.requestContext,
                    serviceAccount: user.serviceAccount,
                };
                const currentAbility = this.createAuditedAbility(currentUser);
                CoderService.checkContentAsCodeWriteAccess({
                    auditedAbility: currentAbility,
                    project,
                    slug: desiredSpace.slug,
                });

                if (
                    existingSpace &&
                    !(await this.spacePermissionService.can(
                        'manage',
                        currentUser,
                        existingSpace.uuid,
                        { trx },
                    ))
                ) {
                    throw new ForbiddenError(
                        `You don't have permission to manage space "${desiredSpace.slug}"`,
                    );
                }
                if (
                    !existingSpace &&
                    currentAbility.cannot(
                        'create',
                        subject('Space', {
                            organizationUuid: project.organizationUuid,
                            projectUuid,
                            metadata: {
                                spaceName: desiredSpace.spaceName,
                            },
                        }),
                    )
                ) {
                    throw new ForbiddenError(
                        `You don't have permission to create space "${desiredSpace.slug}"`,
                    );
                }
                if (
                    !existingSpace &&
                    parentSpaceUuid !== null &&
                    !(await this.spacePermissionService.can(
                        'manage',
                        currentUser,
                        parentSpaceUuid,
                        { trx },
                    ))
                ) {
                    throw new ForbiddenError(
                        `You don't have permission to create a child of space "${getContentAsCodePathFromLtreePath(
                            parentPath!,
                        )}"`,
                    );
                }
                if (desiredSpace.access) {
                    await this.assertSpaceUploaderRetainsManage({
                        user: currentUser,
                        auditedAbility: currentAbility,
                        project,
                        parentSpaceUuid,
                        access: desiredSpace.access!,
                        trx,
                        resolvedUserAccess: userAccess,
                    });
                }
            },
        });

        return {
            action: existingSpace
                ? SpaceAsCodeAction.UPDATE
                : SpaceAsCodeAction.CREATE,
            ...(warnings.length > 0 ? { warnings } : {}),
        };
    }

    private static transformChart(
        chart: SavedChartDAO,
        spaceSummary: Pick<SpaceSummaryBase, 'uuid' | 'name' | 'path'>[],
        dashboardSlugs: Record<string, string>,
        verificationMap: Map<string, ContentVerificationInfo>,
    ): ChartAsCode {
        const contentSpace = spaceSummary.find(
            (space) => space.uuid === chart.spaceUuid,
        );
        if (!contentSpace) {
            throw new NotFoundError(`Space ${chart.spaceUuid} not found`);
        }

        const spaceSlug = getContentAsCodePathFromLtreePath(contentSpace.path);

        return {
            name: chart.name,
            description: chart.description,
            tableName: chart.tableName,
            updatedAt: chart.updatedAt,
            metricQuery: chart.metricQuery,
            chartConfig: chart.chartConfig,
            pivotConfig: chart.pivotConfig,
            dashboardSlug: chart.dashboardUuid
                ? dashboardSlugs[chart.dashboardUuid]
                : undefined,
            slug: chart.slug,
            tableConfig: chart.tableConfig,
            spaceSlug,
            version: currentVersion,
            contentType: ContentAsCodeType.CHART,
            downloadedAt: new Date(),
            parameters: chart.parameters,
            verified: verificationMap.has(chart.uuid) ? true : undefined,
            verification: verificationMap.get(chart.uuid) ?? null,
        };
    }

    private static transformSqlChart(
        sqlChart: {
            name: string;
            description: string | null;
            slug: string;
            sql: string;
            limit: number;
            config: SqlChartAsCode['config'];
            chartKind: SqlChartAsCode['chartKind'];
            lastUpdatedAt: Date;
        },
        spacePath: string,
    ): SqlChartAsCode {
        const spaceSlug = getContentAsCodePathFromLtreePath(spacePath);

        return {
            name: sqlChart.name,
            description: sqlChart.description,
            slug: sqlChart.slug,
            sql: sqlChart.sql,
            limit: sqlChart.limit,
            config: sqlChart.config,
            chartKind: sqlChart.chartKind,
            updatedAt: sqlChart.lastUpdatedAt,
            spaceSlug,
            version: currentVersion,
            contentType: ContentAsCodeType.SQL_CHART,
            downloadedAt: new Date(),
        };
    }

    static isUuid(id: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
        );
    }

    static getChartSlugForTileUuid = getChartSlugForTileUuid;

    static getFiltersWithTileSlugs = getFiltersWithTileSlugs;

    static getFiltersWithTileUuids = getFiltersWithTileUuids;

    static getConfigWithDateZoomTileSlugs = getConfigWithDateZoomTileSlugs;

    static getConfigWithDateZoomTileUuids = getConfigWithDateZoomTileUuids;

    private static transformDashboard(
        dashboard: DashboardDAO,
        spaceSummary: Pick<SpaceSummaryBase, 'uuid' | 'name' | 'path'>[],
        verificationMap: Map<string, ContentVerificationInfo>,
    ): DashboardAsCode {
        const contentSpace = spaceSummary.find(
            (space) => space.uuid === dashboard.spaceUuid,
        );
        if (!contentSpace) {
            throw new NotFoundError(`Space ${dashboard.spaceUuid} not found`);
        }

        const spaceSlug = getContentAsCodePathFromLtreePath(contentSpace.path);

        const tilesWithoutUuids: DashboardTileAsCode[] = dashboard.tiles.map(
            (tile): DashboardTileAsCode => {
                if (isAnyChartTile(tile)) {
                    if (tile.type === DashboardTileTypes.SAVED_CHART) {
                        const chartTile: DashboardChartTileAsCode = {
                            ...tile,
                            type: DashboardTileTypes.SAVED_CHART,
                            uuid: undefined,
                            tileSlug: CoderService.getChartSlugForTileUuid(
                                dashboard,
                                tile.uuid,
                            ),
                            properties: {
                                title: tile.properties.title,
                                hideTitle: tile.properties.hideTitle,
                                chartSlug: tile.properties.chartSlug ?? null,
                                chartName:
                                    tile.properties.chartName ?? undefined,
                            },
                        };
                        return chartTile;
                    }

                    const sqlTile: DashboardSqlChartTileAsCode = {
                        ...tile,
                        type: DashboardTileTypes.SQL_CHART,
                        uuid: undefined,
                        tileSlug: CoderService.getChartSlugForTileUuid(
                            dashboard,
                            tile.uuid,
                        ),
                        properties: {
                            title: tile.properties.title,
                            hideTitle: tile.properties.hideTitle,
                            chartSlug: tile.properties.chartSlug ?? null,
                            chartName: tile.properties.chartName,
                        },
                    };
                    return sqlTile;
                }

                if (tile.type === DashboardTileTypes.MARKDOWN) {
                    const markdownTile: DashboardMarkdownTileAsCode = {
                        ...tile,
                        type: DashboardTileTypes.MARKDOWN,
                        uuid: undefined,
                        tileSlug: undefined,
                        properties: {
                            title: tile.properties.title,
                            content: tile.properties.content,
                            hideFrame: tile.properties.hideFrame,
                        },
                    };
                    return markdownTile;
                }

                // Other non-chart tiles already match the as-code shape
                return {
                    ...tile,
                    tileSlug: undefined,
                    uuid: undefined,
                };
            },
            [],
        );

        const dashboardAsCode: DashboardAsCode = {
            name: dashboard.name,
            description: dashboard.description,
            updatedAt: dashboard.updatedAt,
            tiles: tilesWithoutUuids,

            filters: CoderService.getFiltersWithTileSlugs(dashboard),
            tabs: dashboard.tabs,
            slug: dashboard.slug,
            ...(dashboard.config
                ? {
                      config: CoderService.getConfigWithDateZoomTileSlugs(
                          dashboard,
                      ),
                  }
                : {}),
            ...(dashboard.parameters
                ? { parameters: dashboard.parameters }
                : {}),

            spaceSlug,
            version: currentVersion,
            contentType: ContentAsCodeType.DASHBOARD,
            downloadedAt: new Date(),
            verified: verificationMap.has(dashboard.uuid) ? true : undefined,
            verification: verificationMap.get(dashboard.uuid) ?? null,
        };

        return dashboardAsCode;
    }

    async convertTileWithSlugsToUuids(
        projectUuid: string,
        tiles: DashboardTileAsCode[],
    ): Promise<DashboardTileWithSlug[]> {
        const chartSlugs: string[] = tiles.reduce<string[]>((acc, tile) => {
            if (!isAnyChartTile(tile) || tile.properties.chartSlug == null) {
                return acc;
            }

            return [...acc, tile.properties.chartSlug];
        }, []);

        const withResolvedTileUuid = (
            tile: DashboardTileAsCode,
            chartInfo?: { uuid: string; isSql: boolean },
        ): DashboardTileWithSlug => {
            if (!isAnyChartTile(tile)) {
                return {
                    ...tile,
                    uuid: tile.uuid ?? uuidv4(),
                } as DashboardTileWithSlug;
            }

            const isSqlChart =
                chartInfo?.isSql ?? tile.type === DashboardTileTypes.SQL_CHART;

            if (isSqlChart) {
                return {
                    ...tile,
                    uuid: tile.uuid ?? uuidv4(),
                    type: DashboardTileTypes.SQL_CHART,
                    properties: {
                        ...tile.properties,
                        chartSlug: tile.properties.chartSlug ?? null,
                        savedSqlUuid: chartInfo?.uuid ?? null,
                    },
                } as DashboardTileWithSlug;
            }

            return {
                ...tile,
                uuid: tile.uuid ?? uuidv4(),
                type: DashboardTileTypes.SAVED_CHART,
                properties: {
                    ...tile.properties,
                    chartSlug: tile.properties.chartSlug ?? null,
                    savedChartUuid: chartInfo?.uuid ?? null,
                },
            } as DashboardTileWithSlug;
        };

        if (chartSlugs.length === 0) {
            return tiles.map((tile) => withResolvedTileUuid(tile));
        }

        // Query both regular charts and SQL charts in parallel
        const [charts, sqlChartRows] = await Promise.all([
            this.savedChartModel.find({
                slugs: chartSlugs,
                projectUuid,
                excludeChartsSavedInDashboard: false,
                includeOrphanChartsWithinDashboard: true,
            }),
            this.savedSqlModel.find({
                slugs: chartSlugs,
                projectUuid,
            }),
        ]);

        // Create a unified map of slug -> { uuid, isSql } for both chart types
        const chartSlugToInfo = new Map<
            string,
            { uuid: string; isSql: boolean }
        >();
        charts.forEach((chart) =>
            chartSlugToInfo.set(chart.slug, { uuid: chart.uuid, isSql: false }),
        );
        sqlChartRows.forEach((row) =>
            chartSlugToInfo.set(row.slug, {
                uuid: row.saved_sql_uuid,
                isSql: true,
            }),
        );

        return tiles.map((tile) => {
            if (isAnyChartTile(tile)) {
                const { chartSlug } = tile.properties;
                if (chartSlug == null) {
                    return withResolvedTileUuid(tile);
                }
                const chartInfo = chartSlugToInfo.get(chartSlug);
                return withResolvedTileUuid(tile, chartInfo);
            }

            return withResolvedTileUuid(tile);
        });
    }

    /*
    Dashboard or chart ids can be uuids or slugs
     We need to convert uuids to slugs before making the query
    */
    async convertIdsToSlugs(
        type: 'dashboard' | 'chart',
        ids: string[] | undefined,
    ) {
        if (!ids) return ids; // return [] or undefined

        const uuids = ids?.filter((id) => CoderService.isUuid(id));
        let uuidsToSlugs: string[] = [];

        if (uuids.length > 0) {
            if (type === 'dashboard') {
                const dashboardSlugs =
                    await this.dashboardModel.getSlugsForUuids(uuids);
                uuidsToSlugs = Object.values(dashboardSlugs);
            } else if (type === 'chart') {
                uuidsToSlugs =
                    await this.savedChartModel.getSlugsForUuids(uuids);
            }
        }
        const slugs = ids?.filter((id) => !CoderService.isUuid(id)) ?? [];

        return [...uuidsToSlugs, ...slugs];
    }

    static getMissingIds(
        ids: string[] | undefined,
        items: Pick<SavedChartDAO | DashboardDAO, 'slug' | 'uuid'>[],
    ) {
        return ids
            ? ids.reduce<string[]>((acc, id) => {
                  const exists = items.some(
                      (item) => id === item.uuid || id === item.slug,
                  );
                  if (!exists) {
                      acc.push(id);
                  }
                  return acc;
              }, [])
            : [];
    }

    private async filterPrivateContent<
        T extends
            | DashboardDAO
            | SavedChartDAO
            | (ChartSummary & { updatedAt: Date })
            | Pick<
                  DashboardDAO,
                  'uuid' | 'name' | 'spaceUuid' | 'description' | 'slug'
              >,
    >(
        user: SessionUser,
        project: Project,
        content: T[],
        spaces: SpaceSummaryBase[],
    ): Promise<T[]> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.can(
                'manage',
                subject('Project', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            // User is an admin, return all content
            return content;
        }

        const spaceUuids = spaces.map((s) => s.uuid);

        const accessibleSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaceUuids,
            );

        const accessibleSet = new Set(accessibleSpaceUuids);
        return content.filter((c) => accessibleSet.has(c.spaceUuid));
    }

    /*
    @param dashboardIds: Dashboard ids can be uuids or slugs, if undefined return all dashboards, if [] we return no dashboards
    @returns: DashboardAsCode[]
    */
    async getDashboards(
        user: SessionUser,
        projectUuid: string,
        dashboardIds: string[] | undefined,
        offset?: number,
        languageMap?: boolean,
    ): Promise<ApiDashboardAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download dashboards',
            );
        }

        const slugs = await this.convertIdsToSlugs('dashboard', dashboardIds);

        if (slugs?.length === 0) {
            this.logger.warn(
                `No dashboards to download for project ${projectUuid} with ids ${dashboardIds?.join(
                    ', ',
                )}`,
            );
            return {
                dashboards: [],
                languageMap: undefined,
                missingIds: dashboardIds || [],
                spaces: [],
                total: 0,
                offset: 0,
            };
        }

        const dashboardSummaries = await this.dashboardModel.find({
            projectUuid,
            slugs,
        });
        const spaceUuids = dashboardSummaries.map((chart) => chart.spaceUuid);
        // get all spaces to map  spaceSlug
        const spaces = await this.spaceModel.find({ spaceUuids });

        const dashboardSummariesWithAccess = await this.filterPrivateContent(
            user,
            project,
            dashboardSummaries,
            spaces,
        );
        const {
            page: limitedDashboardSummaries,
            total: dashboardsTotal,
            offset: newOffset,
        } = paginateAsCode({
            items: dashboardSummariesWithAccess,
            offset,
            pageSize: this.lightdashConfig.contentAsCode.maxDownloads,
        });

        const dashboardPromises = limitedDashboardSummaries.map((dash) =>
            this.dashboardModel.getByIdOrSlug(dash.uuid),
        );
        const dashboards = await Promise.all(dashboardPromises);

        const missingIds = CoderService.getMissingIds(dashboardIds, dashboards);
        if (missingIds.length > 0) {
            this.logger.warn(
                `Missing filtered dashboards for project ${projectUuid} with ids ${missingIds.join(
                    ', ',
                )}`,
            );
        }

        const dashboardsWithAccess = await this.filterPrivateContent(
            user,
            project,
            dashboards,
            spaces,
        );

        const dashboardUuidsForVerification = dashboardsWithAccess.map(
            (d) => d.uuid,
        );
        const dashboardVerificationMap =
            await this.contentVerificationModel.getByContentUuids(
                ContentType.DASHBOARD,
                dashboardUuidsForVerification,
            );

        const transformedDashboards = dashboardsWithAccess.map((dashboard) =>
            CoderService.transformDashboard(
                dashboard,
                spaces,
                dashboardVerificationMap,
            ),
        );

        return {
            dashboards: transformedDashboards,
            languageMap: languageMap
                ? transformedDashboards.map((dashboard) => {
                      try {
                          return new DashboardAsCodeInternalization().getLanguageMap(
                              dashboard,
                          );
                      } catch (e: unknown) {
                          this.logger.error(
                              `Error getting language map for dashboard ${dashboard.slug}`,
                              e,
                          );
                          return undefined;
                      }
                  })
                : undefined,
            missingIds,
            spaces: CoderService.transformSpaces(
                spaces.filter((s) =>
                    dashboardsWithAccess.some((d) => d.spaceUuid === s.uuid),
                ),
            ),
            total: dashboardsTotal,
            offset: newOffset,
        };
    }

    async getCharts(
        user: SessionUser,
        projectUuid: string,
        chartIds?: string[],
        offset?: number,
        languageMap?: boolean,
    ): Promise<ApiChartAsCodeListResponse['results']> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        // Filter charts based on user permissions (from private spaces)
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError('You are not allowed to download charts');
        }

        const slugs = await this.convertIdsToSlugs('chart', chartIds);
        if (slugs?.length === 0) {
            this.logger.warn(
                `No charts to download for project ${projectUuid} with ids ${chartIds?.join(
                    ', ',
                )}`,
            );
            return {
                charts: [],
                languageMap: undefined,
                missingIds: chartIds || [],
                spaces: [],
                total: 0,
                offset: 0,
            };
        }

        const chartSummaries = await this.savedChartModel.find({
            projectUuid,
            slugs,
            excludeChartsSavedInDashboard: false,
            includeOrphanChartsWithinDashboard: true,
        });
        const spaceUuids = chartSummaries.map((chart) => chart.spaceUuid);
        // get all spaces to map  spaceSlug
        const spaces = await this.spaceModel.find({ spaceUuids });
        const chartsSummariesWithAccess = await this.filterPrivateContent(
            user,
            project,
            chartSummaries,
            spaces,
        );
        const {
            page: limitedChartSummaries,
            total: chartsTotal,
            offset: newOffset,
        } = paginateAsCode({
            items: chartsSummariesWithAccess,
            offset,
            pageSize: this.lightdashConfig.contentAsCode.maxDownloads,
        });

        const chartPromises = limitedChartSummaries.map((chart) =>
            this.savedChartModel.get(chart.uuid),
        );
        const charts = await Promise.all(chartPromises);

        // get all spaces to map  dashboardSlug
        const dashboardUuids = charts.reduce<string[]>((acc, chart) => {
            if (chart.dashboardUuid) {
                acc.push(chart.dashboardUuid);
            }
            return acc;
        }, []);
        const dashboards =
            await this.dashboardModel.getSlugsForUuids(dashboardUuids);

        const chartUuids = charts.map((chart) => chart.uuid);
        const chartVerificationMap =
            await this.contentVerificationModel.getByContentUuids(
                ContentType.CHART,
                chartUuids,
            );

        const transformedCharts = charts.map((chart) =>
            CoderService.transformChart(
                chart,
                spaces,
                dashboards,
                chartVerificationMap,
            ),
        );

        const missingIds = CoderService.getMissingIds(chartIds, charts);

        return {
            charts: transformedCharts,
            languageMap: languageMap
                ? transformedCharts.map((chart) => {
                      try {
                          return new ChartAsCodeInternalization().getLanguageMap(
                              chart,
                          );
                      } catch (e: unknown) {
                          this.logger.error(
                              `Error getting language map for chart ${chart.slug}`,
                              e,
                          );
                          return undefined;
                      }
                  })
                : undefined,
            missingIds,
            spaces: CoderService.transformSpaces(
                spaces.filter((s) =>
                    limitedChartSummaries.some((c) => c.spaceUuid === s.uuid),
                ),
            ),
            total: chartsTotal,
            offset: newOffset,
        };
    }

    async getCurrentContentVersionBySlug(
        user: SessionUser,
        projectUuid: string,
        type: 'dashboard' | 'chart',
        slug: string,
    ): Promise<{ contentUuid: string; versionUuid: string | null }> {
        const { name: projectName, organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName, type, slug },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        switch (type) {
            case 'dashboard': {
                const [dashboard] = await this.dashboardModel.find({
                    projectUuid,
                    slugs: [slug],
                });
                if (!dashboard) {
                    throw new NotFoundError(
                        `Dashboard with slug "${slug}" not found`,
                    );
                }

                const currentDashboard =
                    await this.dashboardModel.getByIdOrSlug(dashboard.uuid);
                return {
                    contentUuid: dashboard.uuid,
                    versionUuid: currentDashboard.versionUuid,
                };
            }
            case 'chart': {
                const [chart] = await this.savedChartModel.find({
                    projectUuid,
                    slugs: [slug],
                    excludeChartsSavedInDashboard: false,
                    includeOrphanChartsWithinDashboard: true,
                });
                if (!chart) {
                    throw new NotFoundError(
                        `Chart with slug "${slug}" not found`,
                    );
                }

                const version =
                    await this.savedChartModel.getLatestVersionSummary(
                        chart.uuid,
                    );
                return {
                    contentUuid: chart.uuid,
                    versionUuid: version?.versionUuid ?? null,
                };
            }
            default:
                return assertUnreachable(type, 'Invalid content type');
        }
    }

    async getSqlCharts(
        user: SessionUser,
        projectUuid: string,
        chartIds?: string[],
        offset?: number,
    ): Promise<{
        sqlCharts: SqlChartAsCode[];
        missingIds: string[];
        spaces: SpaceAsCode[];
        total: number;
        offset: number;
    }> {
        const project = await this.projectModel.get(projectUuid);
        if (!project) {
            throw new NotFoundError(`Project ${projectUuid} not found`);
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You are not allowed to download SQL charts',
            );
        }

        // For SQL charts, we use slugs directly (no UUID to slug conversion needed)
        // since SQL charts are only identified by slug in the as-code workflow
        const slugs = chartIds;

        if (slugs?.length === 0) {
            return {
                sqlCharts: [],
                missingIds: chartIds || [],
                spaces: [],
                total: 0,
                offset: 0,
            };
        }

        const sqlChartRows = await this.savedSqlModel.find({
            projectUuid,
            slugs,
        });

        // Filter SQL charts by space access
        const sqlChartSpaceUuids = sqlChartRows.map((row) => row.space_uuid);
        const sqlChartSpaces = await this.spaceModel.find({
            spaceUuids: sqlChartSpaceUuids,
        });
        const sqlChartsWithAccess = await this.filterPrivateContent(
            user,
            project,
            sqlChartRows.map((row) => ({
                uuid: row.saved_sql_uuid,
                name: row.name,
                spaceUuid: row.space_uuid,
                description: row.description ?? undefined,
                slug: row.slug,
            })),
            sqlChartSpaces,
        );

        // Filter rows by access permissions first
        const sqlChartSlugsWithAccess = new Set(
            sqlChartsWithAccess.map((c) => c.slug),
        );
        const accessibleSqlChartRows = sqlChartRows.filter((row) =>
            sqlChartSlugsWithAccess.has(row.slug),
        );

        // Apply pagination to the filtered results
        const maxResults = this.lightdashConfig.contentAsCode.maxDownloads;
        const {
            page: paginatedSqlChartRows,
            total: sqlChartsTotal,
            offset: newOffset,
        } = paginateAsCode({
            items: accessibleSqlChartRows,
            offset,
            pageSize: maxResults,
        });

        const transformedSqlCharts = paginatedSqlChartRows.map((row) =>
            CoderService.transformSqlChart(
                {
                    name: row.name,
                    description: row.description,
                    slug: row.slug,
                    sql: row.sql,
                    limit: row.limit,
                    config: row.config as SqlChartAsCode['config'],
                    chartKind: row.chart_kind,
                    lastUpdatedAt: row.last_version_updated_at,
                },
                row.path,
            ),
        );

        // Calculate missing IDs
        const foundSlugs = new Set(sqlChartRows.map((c) => c.slug));
        const missingIds = chartIds
            ? chartIds.filter((id) => !foundSlugs.has(id))
            : [];

        return {
            sqlCharts: transformedSqlCharts,
            missingIds,
            spaces: CoderService.transformSpaces(
                sqlChartSpaces.filter((s) =>
                    paginatedSqlChartRows.some(
                        (row) => row.space_uuid === s.uuid,
                    ),
                ),
            ),
            total: sqlChartsTotal,
            offset: newOffset,
        };
    }

    static getDashboardTabSlug = getDashboardTabSlug;

    static getDashboardTabUuid = getDashboardTabUuid;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
        contentType?: ContentAsCodeType.SCHEDULED_DELIVERY,
    ): Promise<ApiScheduledDeliveryAsCodeListResponse['results']>;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs: string[] | undefined,
        contentType: ContentAsCodeType.ALERT,
    ): Promise<ApiAlertAsCodeListResponse['results']>;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs: string[] | undefined,
        contentType: ContentAsCodeType.GOOGLE_SHEETS_SYNC,
    ): Promise<ApiGoogleSheetsSyncAsCodeListResponse['results']>;

    async getScheduledDeliveries(
        user: SessionUser,
        projectUuid: string,
        slugs?: string[],
        contentType:
            | ContentAsCodeType.SCHEDULED_DELIVERY
            | ContentAsCodeType.ALERT
            | ContentAsCodeType.GOOGLE_SHEETS_SYNC = ContentAsCodeType.SCHEDULED_DELIVERY,
    ): Promise<
        | ApiScheduledDeliveryAsCodeListResponse['results']
        | ApiAlertAsCodeListResponse['results']
        | ApiGoogleSheetsSyncAsCodeListResponse['results']
    > {
        switch (contentType) {
            case ContentAsCodeType.ALERT:
                return this.scheduledContentCoder.getScheduledDeliveries(
                    user,
                    projectUuid,
                    slugs,
                    ContentAsCodeType.ALERT,
                );
            case ContentAsCodeType.GOOGLE_SHEETS_SYNC:
                return this.scheduledContentCoder.getScheduledDeliveries(
                    user,
                    projectUuid,
                    slugs,
                    ContentAsCodeType.GOOGLE_SHEETS_SYNC,
                );
            case ContentAsCodeType.SCHEDULED_DELIVERY:
                return this.scheduledContentCoder.getScheduledDeliveries(
                    user,
                    projectUuid,
                    slugs,
                    ContentAsCodeType.SCHEDULED_DELIVERY,
                );
            default:
                return assertUnreachable(
                    contentType,
                    'Unknown scheduled content type',
                );
        }
    }

    async upsertScheduledDelivery(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        delivery:
            | ScheduledDeliveryAsCode
            | AlertAsCode
            | GoogleSheetsSyncAsCode,
        force = false,
    ): Promise<
        | ApiScheduledDeliveryAsCodeUpsertResponse['results']
        | ApiAlertAsCodeUpsertResponse['results']
        | ApiGoogleSheetsSyncAsCodeUpsertResponse['results']
    > {
        return this.scheduledContentCoder.upsertScheduledDelivery(
            user,
            projectUuid,
            slug,
            delivery,
            force,
        );
    }

    private async syncVerification({
        user,
        projectUuid,
        organizationUuid,
        contentType,
        contentUuid,
        verified,
    }: {
        user: SessionUser;
        projectUuid: string;
        organizationUuid: string;
        contentType: ContentType;
        contentUuid: string;
        verified: boolean | undefined;
    }): Promise<void> {
        if (verified === undefined) return;

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
                    metadata: { contentType, contentUuid },
                }),
            )
        ) {
            // Warn and skip so CI pipelines run by non-admin deployers don't fail.
            this.logger.warn(
                `User ${user.userUuid} cannot ${
                    verified ? 'verify' : 'unverify'
                } ${contentType} ${contentUuid}; skipping verification sync.`,
            );
            return;
        }

        const current = await this.contentVerificationModel.getByContent(
            contentType,
            contentUuid,
        );
        const isCurrentlyVerified = current !== null;

        if (verified && !isCurrentlyVerified) {
            await this.contentVerificationModel.verify(
                contentType,
                contentUuid,
                projectUuid,
                user.userUuid,
            );
            this.analytics.track({
                event: 'content_verification.created',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    contentType,
                    contentId: contentUuid,
                },
            });
        } else if (!verified && isCurrentlyVerified) {
            await this.contentVerificationModel.unverify(
                contentType,
                contentUuid,
            );
            this.analytics.track({
                event: 'content_verification.deleted',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    contentType,
                    contentId: contentUuid,
                },
            });
        }
    }

    async upsertChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        chartAsCode: ChartAsCode,
        options: UpsertContentAsCodeOptions = {},
    ) {
        const {
            skipSpaceCreate,
            publicSpaceCreate,
            force,
            spaceNames,
            mode = 'upsert',
        } = options;
        const shouldUpdateExistingContent = mode === 'upsert';
        const shouldUseExactSlug = mode === 'upsert';
        const project = await this.projectModel.get(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        const { canUploadAnyContent, allowSpaceCreate } =
            CoderService.checkContentAsCodeWriteAccess({
                auditedAbility,
                project,
                slug,
            });

        // Default optional fields when missing (e.g. user-authored YAML)
        const chartWithDefaults = {
            ...chartAsCode,
            updatedAt: chartAsCode.updatedAt ?? new Date(),
            tableConfig: chartAsCode.tableConfig ?? { columnOrder: [] },
            metricQuery: {
                ...chartAsCode.metricQuery,
                filters: normalizeFilterIds(chartAsCode.metricQuery.filters),
            },
        };

        // Create mode treats the requested slug as a base for a new unique
        // slug instead of updating content that already owns it.
        const existingCharts = shouldUpdateExistingContent
            ? await this.savedChartModel.find({
                  slug,
                  projectUuid,
                  excludeChartsSavedInDashboard: false,
                  includeOrphanChartsWithinDashboard: true,
              })
            : [];
        if (existingCharts.length > 1) {
            throw new AlreadyExistsError(
                `There are multiple charts with the same identifier ${slug}`,
            );
        }
        const [chart] = existingCharts;

        // If chart does not exist, we can't use promoteService,
        // since it relies on information that's not available in ChartAsCode, and other uuids
        if (chart === undefined) {
            if (!canUploadAnyContent) {
                CoderService.handleContentAsCodeSqlPermissionChecks({
                    checks: CoderService.getChartContentAsCodePermissionChecks(
                        chartWithDefaults,
                    ),
                    auditedAbility,
                    project,
                    slug,
                });

                await this.assertCreateAccessForSpaceSlug({
                    user,
                    auditedAbility,
                    projectUuid,
                    spaceSlug: chartWithDefaults.spaceSlug,
                    subjectType: 'SavedChart',
                    errorMessage: `You don't have access to create charts in space "${chartWithDefaults.spaceSlug}"`,
                });
            }

            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    chartWithDefaults.spaceSlug,
                    user,
                    skipSpaceCreate,
                    publicSpaceCreate,
                    spaceNames,
                    allowSpaceCreate,
                );
            // Fetched once, reused by the placeholder-dashboard check below
            const spaceAccessContexts = canUploadAnyContent
                ? null
                : await this.spacePermissionService.getSpacesAccessContext(
                      user.userUuid,
                      [space.uuid],
                  );
            if (spaceAccessContexts !== null) {
                await this.assertSpaceContentAccess({
                    userUuid: user.userUuid,
                    auditedAbility,
                    action: 'create',
                    subjectType: 'SavedChart',
                    spaceUuids: [space.uuid],
                    errorMessage: `You don't have access to create charts in space "${chartWithDefaults.spaceSlug}"`,
                    accessContexts: spaceAccessContexts,
                });
            }

            console.info(
                `Creating chart "${chartWithDefaults.name}" on project ${projectUuid}`,
            );

            let createChart: CreateSavedChart & {
                updatedByUser: UpdatedByUser;
                slug: string;
                forceSlug: boolean;
            };

            if (chartWithDefaults.dashboardSlug) {
                const [dashboard] = await this.dashboardModel.find({
                    projectUuid,
                    slug: chartWithDefaults.dashboardSlug,
                });

                let dashboardUuid: string = dashboard?.uuid;
                if (!dashboard) {
                    if (spaceAccessContexts !== null) {
                        await this.assertSpaceContentAccess({
                            userUuid: user.userUuid,
                            auditedAbility,
                            action: 'create',
                            subjectType: 'Dashboard',
                            spaceUuids: [space.uuid],
                            errorMessage: `You don't have access to create dashboards in space "${chartWithDefaults.spaceSlug}"`,
                            accessContexts: spaceAccessContexts,
                        });
                    }
                    // Charts within dashboards need a dashboard first,
                    // so we will create a placeholder dashboard for this
                    // which we can update later
                    console.debug(
                        'Creating placeholder dashboard for chart within dashboard',
                        chartWithDefaults.slug,
                    );
                    const newDashboard = await this.dashboardModel.create(
                        space.uuid,
                        {
                            name: friendlyName(chartWithDefaults.dashboardSlug),
                            tiles: [],
                            slug: chartWithDefaults.dashboardSlug,
                            forceSlug: shouldUseExactSlug,
                            tabs: [],
                        },
                        user,
                        projectUuid,
                    );

                    dashboardUuid = newDashboard.uuid;
                } else if (!canUploadAnyContent) {
                    // Chart lives in the dashboard, not the YAML space.
                    // Mirrors SavedChartService: only SavedChart create in
                    // the dashboard's space is required.
                    if (!dashboard.spaceUuid) {
                        throw new ForbiddenError(
                            `You don't have access to create charts in dashboard "${chartWithDefaults.dashboardSlug}"`,
                        );
                    }
                    await this.assertSpaceContentAccess({
                        userUuid: user.userUuid,
                        auditedAbility,
                        action: 'create',
                        subjectType: 'SavedChart',
                        spaceUuids: [dashboard.spaceUuid],
                        errorMessage: `You don't have access to create charts in dashboard "${chartWithDefaults.dashboardSlug}"`,
                    });
                }
                createChart = {
                    ...chartWithDefaults,
                    spaceUuid: null,
                    dashboardUuid,
                    updatedByUser: user,
                    forceSlug: shouldUseExactSlug,
                };
            } else {
                createChart = {
                    ...chartWithDefaults,
                    spaceUuid: space.uuid,
                    dashboardUuid: null,
                    updatedByUser: user,
                    forceSlug: shouldUseExactSlug,
                };
            }

            const newChart = await this.savedChartModel.create(
                projectUuid,
                user.userUuid,
                createChart,
            );

            await this.syncVerification({
                user,
                projectUuid,
                organizationUuid: project.organizationUuid,
                contentType: ContentType.CHART,
                contentUuid: newChart.uuid,
                verified: chartAsCode.verified,
            });

            console.info(
                `Finished creating chart "${chartWithDefaults.name}" on project ${projectUuid}`,
            );
            const promotionChanges: PromotionChanges = {
                charts: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            ...newChart,
                            spaceSlug: chartWithDefaults.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                chartWithDefaults.spaceSlug,
                            ),
                            oldUuid: newChart.uuid,
                        },
                    },
                ],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
                dashboards: [],
            };
            return promotionChanges;
        }
        console.info(
            `Updating chart "${chartWithDefaults.name}" on project ${projectUuid}`,
        );
        const targetSpace = !canUploadAnyContent
            ? await this.findAccessibleSpace(
                  projectUuid,
                  chartWithDefaults.spaceSlug,
                  user,
              )
            : undefined;
        if (!canUploadAnyContent) {
            if (
                targetSpace === undefined &&
                !skipSpaceCreate &&
                !allowSpaceCreate
            ) {
                throw new ForbiddenError(
                    `You don't have access to create space "${chartWithDefaults.spaceSlug}"`,
                );
            }

            // find() coalesces spaceUuid to the dashboard's space for
            // dashboard-contained charts, so this covers both kinds
            if (!chart.spaceUuid) {
                throw new ForbiddenError(
                    `You don't have access to update chart "${slug}"`,
                );
            }

            await this.assertSpaceContentAccess({
                userUuid: user.userUuid,
                auditedAbility,
                action: 'update',
                subjectType: 'SavedChart',
                spaceUuids: [
                    ...(targetSpace ? [targetSpace.uuid] : []),
                    ...(chart.spaceUuid ? [chart.spaceUuid] : []),
                ],
                metadata: { savedChartUuid: chart.uuid },
                errorMessage: `You don't have access to update chart "${slug}"`,
            });

            const currentChart = await this.savedChartModel.get(chart.uuid);
            CoderService.handleContentAsCodeSqlPermissionChecks({
                checks: CoderService.getChartContentAsCodePermissionChecks(
                    chartWithDefaults,
                    currentChart,
                ),
                auditedAbility,
                project,
                slug,
            });
        }

        const { space } = await this.getOrCreateSpace(
            projectUuid,
            chartWithDefaults.spaceSlug,
            user,
            skipSpaceCreate,
            undefined,
            spaceNames,
            allowSpaceCreate,
        );
        if (!canUploadAnyContent && space.uuid !== targetSpace?.uuid) {
            await this.assertSpaceContentAccess({
                userUuid: user.userUuid,
                auditedAbility,
                action: 'update',
                subjectType: 'SavedChart',
                spaceUuids: [space.uuid],
                metadata: { savedChartUuid: chart.uuid },
                errorMessage: `You don't have access to update chart "${slug}"`,
            });
        }

        const { promotedChart, upstreamChart } =
            await this.promoteService.getPromoteCharts(
                user,
                projectUuid, // We use the same projectUuid for both promoted and upstream
                chart.uuid,
                true, // includeOrphanChartsWithinDashboard
                chart, // upstream === promoted project, reuse the chart we already loaded
            );
        const updatedChart = {
            ...promotedChart,
            chart: {
                ...promotedChart.chart,
                ...chartWithDefaults,
                projectUuid,
                organizationUuid: project.organizationUuid,
            },
        };

        //  we force the new space on the upstreamChart
        if (upstreamChart.chart) upstreamChart.chart.spaceUuid = space.uuid;
        let promotionChanges: PromotionChanges =
            await this.promoteService.getChartChanges(
                updatedChart,
                upstreamChart,
            );
        if (force) {
            promotionChanges = {
                ...promotionChanges,
                charts: promotionChanges.charts.map((c) =>
                    c.action === PromotionAction.NO_CHANGES
                        ? { ...c, action: PromotionAction.UPDATE }
                        : c,
                ),
            };
        }
        promotionChanges = await this.promoteService.upsertCharts(
            user,
            promotionChanges,
        );

        await this.syncVerification({
            user,
            projectUuid,
            organizationUuid: project.organizationUuid,
            contentType: ContentType.CHART,
            contentUuid: chart.uuid,
            verified: chartAsCode.verified,
        });

        console.info(
            `Finished updating chart "${chartWithDefaults.name}" on project ${projectUuid}: ${promotionChanges.charts[0].action}`,
        );

        return promotionChanges;
    }

    async upsertSqlChart(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        sqlChartAsCode: SqlChartAsCode,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        force?: boolean,
        spaceNames?: Record<string, string>,
    ): Promise<PromotionChanges> {
        const project = await this.projectModel.get(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        const { canUploadAnyContent, allowSpaceCreate } =
            CoderService.checkContentAsCodeWriteAccess({
                auditedAbility,
                project,
                slug,
            });

        // Default updatedAt to now when missing (e.g. user-authored YAML)
        const sqlChartWithDefaults = {
            ...sqlChartAsCode,
            updatedAt: sqlChartAsCode.updatedAt ?? new Date(),
        };

        const sqlChartRows = await this.savedSqlModel.find({
            slugs: [slug],
            projectUuid,
        });
        const existingSqlChart = sqlChartRows[0];

        // SQL chart uploads mirror SavedSqlService. Check CustomSql before
        // resolving the space so a rejection cannot orphan a new space.
        const isUpdate = existingSqlChart !== undefined;
        if (
            auditedAbility.cannot(
                'manage',
                subject('CustomSql', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                    metadata:
                        existingSqlChart !== undefined
                            ? { savedSqlUuid: existingSqlChart.saved_sql_uuid }
                            : {},
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (!isUpdate && !canUploadAnyContent) {
            await this.assertCreateAccessForSpaceSlug({
                user,
                auditedAbility,
                projectUuid,
                spaceSlug: sqlChartWithDefaults.spaceSlug,
                subjectType: 'SavedChart',
                metadata: { savedSqlUuid: null },
                errorMessage: `You don't have access to create Saved SQL chart "${slug}"`,
            });
        }

        const { space, created: spaceCreated } = await this.getOrCreateSpace(
            projectUuid,
            sqlChartAsCode.spaceSlug,
            user,
            skipSpaceCreate,
            publicSpaceCreate,
            spaceNames,
            allowSpaceCreate,
        );

        const savedChartAction = isUpdate ? 'update' : 'create';
        await this.assertSpaceContentAccess({
            userUuid: user.userUuid,
            auditedAbility,
            action: savedChartAction,
            subjectType: 'SavedChart',
            spaceUuids: [
                space.uuid,
                ...(existingSqlChart ? [existingSqlChart.space_uuid] : []),
            ],
            metadata: {
                savedSqlUuid: existingSqlChart?.saved_sql_uuid ?? null,
            },
            errorMessage: `You don't have access to ${savedChartAction} Saved SQL chart "${slug}"`,
        });

        if (existingSqlChart === undefined) {
            // Create new SQL chart
            this.logger.info(
                `Creating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
            );

            const { savedSqlUuid } = await this.savedSqlModel.create(
                user.userUuid,
                projectUuid,
                {
                    name: sqlChartAsCode.name,
                    description: sqlChartAsCode.description,
                    sql: sqlChartAsCode.sql,
                    limit: sqlChartAsCode.limit,
                    config: sqlChartAsCode.config,
                    spaceUuid: space.uuid,
                    slug: sqlChartAsCode.slug, // Force the slug from the YAML file
                },
            );

            this.logger.info(
                `Finished creating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
            );

            // Note: We use a minimal object for the promotion changes since SQL charts
            // don't have the same structure as regular charts. The CLI only uses the action.
            const promotionChanges: PromotionChanges = {
                charts: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            uuid: savedSqlUuid,
                            name: sqlChartAsCode.name,
                            slug: sqlChartAsCode.slug,
                            spaceSlug: sqlChartAsCode.spaceSlug,
                        } as PromotionChanges['charts'][0]['data'],
                    },
                ],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
                dashboards: [],
            };
            return promotionChanges;
        }

        // Update existing SQL chart
        this.logger.info(
            `Updating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
        );

        await this.savedSqlModel.update({
            userUuid: user.userUuid,
            savedSqlUuid: existingSqlChart.saved_sql_uuid,
            sqlChart: {
                unversionedData: {
                    name: sqlChartAsCode.name,
                    description: sqlChartAsCode.description,
                    spaceUuid: space.uuid,
                },
                versionedData: {
                    sql: sqlChartAsCode.sql,
                    limit: sqlChartAsCode.limit,
                    config: sqlChartAsCode.config,
                },
            },
        });

        this.logger.info(
            `Finished updating SQL chart "${sqlChartAsCode.name}" on project ${projectUuid}`,
        );

        const promotionChanges: PromotionChanges = {
            charts: [
                {
                    action: PromotionAction.UPDATE,
                    data: {
                        uuid: existingSqlChart.saved_sql_uuid,
                        name: sqlChartAsCode.name,
                        slug: sqlChartAsCode.slug,
                        spaceSlug: sqlChartAsCode.spaceSlug,
                    } as PromotionChanges['charts'][0]['data'],
                },
            ],
            spaces: spaceCreated
                ? [{ action: PromotionAction.CREATE, data: space }]
                : [],
            dashboards: [],
        };
        return promotionChanges;
    }

    private async findAccessibleSpace(
        projectUuid: string,
        spaceSlug: string,
        user: SessionUser,
    ): Promise<SpaceSummaryBase | undefined> {
        const [space] = await this.spaceModel.find({
            path: getLtreePathFromContentAsCodePath(spaceSlug),
            projectUuid,
        });

        if (
            space !== undefined &&
            !(await this.spacePermissionService.can('view', user, space.uuid))
        ) {
            throw new ForbiddenError(
                `You don't have access to the private space "${spaceSlug}"`,
            );
        }

        return space;
    }

    private async getClosestAncestorSpaceAccessContext(
        userUuid: string,
        projectUuid: string,
        spaceSlug: string,
    ) {
        const spaceUuid = await this.spaceModel.findClosestAncestorByPath({
            path: getLtreePathFromContentAsCodePath(spaceSlug),
            projectUuid,
        });
        if (spaceUuid === null) return undefined;

        const accessContexts =
            await this.spacePermissionService.getSpacesAccessContext(userUuid, [
                spaceUuid,
            ]);
        return accessContexts[spaceUuid];
    }

    // Throws unless the caller can write content as code. `canUploadAnyContent`
    // (manage:ContentAsCode) allows uploading any content, so the granular
    // space/SQL checks below don't apply.
    private static checkContentAsCodeWriteAccess({
        auditedAbility,
        project,
        slug,
    }: {
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        project: Pick<
            Project,
            | 'projectUuid'
            | 'organizationUuid'
            | 'upstreamProjectUuid'
            | 'type'
            | 'createdByUserUuid'
        >;
        slug: string;
    }): { canUploadAnyContent: boolean; allowSpaceCreate: boolean } {
        const contentAsCodeSubject = subject('ContentAsCode', {
            projectUuid: project.projectUuid,
            organizationUuid: project.organizationUuid,
            upstreamProjectUuid: project.upstreamProjectUuid,
            type: project.type,
            createdByUserUuid: project.createdByUserUuid,
            metadata: { slug },
        });
        const canUploadAnyContent = auditedAbility.can(
            'manage',
            contentAsCodeSubject,
        );
        if (auditedAbility.cannot('create', contentAsCodeSubject)) {
            throw new ForbiddenError(
                `You don't have permission to upload content as code to this project (content slug "${slug}")`,
            );
        }
        const allowSpaceCreate =
            canUploadAnyContent ||
            auditedAbility.can(
                'create',
                subject('Space', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            );
        return { canUploadAnyContent, allowSpaceCreate };
    }

    private async assertSpaceContentAccess({
        userUuid,
        auditedAbility,
        action,
        subjectType,
        spaceUuids,
        metadata,
        errorMessage,
        accessContexts,
    }: {
        userUuid: string;
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        action: 'create' | 'update';
        subjectType: 'SavedChart' | 'Dashboard';
        spaceUuids: string[];
        metadata?: ContentAsCodeSpaceContentMetadata;
        errorMessage: string;
        // Pre-fetched contexts to avoid refetching for the same spaces
        accessContexts?: Awaited<
            ReturnType<SpacePermissionService['getSpacesAccessContext']>
        >;
    }): Promise<void> {
        const uniqueSpaceUuids = [...new Set(spaceUuids)];
        if (uniqueSpaceUuids.length === 0) return;
        const spaceAccessContexts =
            accessContexts ??
            (await this.spacePermissionService.getSpacesAccessContext(
                userUuid,
                uniqueSpaceUuids,
            ));
        const lacksAccess = uniqueSpaceUuids.some((spaceUuid) =>
            auditedAbility.cannot(
                action,
                subject(subjectType, {
                    ...spaceAccessContexts[spaceUuid],
                    ...(metadata !== undefined ? { metadata } : {}),
                }),
            ),
        );
        if (lacksAccess) {
            throw new ForbiddenError(errorMessage);
        }
    }

    // Target space missing: gate create on the closest existing ancestor
    // BEFORE creating the space, so a denied create can't orphan a space.
    private async assertCreateAccessForSpaceSlug({
        user,
        auditedAbility,
        projectUuid,
        spaceSlug,
        subjectType,
        metadata,
        errorMessage,
    }: {
        user: SessionUser;
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        projectUuid: string;
        spaceSlug: string;
        subjectType: 'SavedChart' | 'Dashboard';
        metadata?: ContentAsCodeSpaceContentMetadata;
        errorMessage: string;
    }): Promise<void> {
        const targetSpace = await this.findAccessibleSpace(
            projectUuid,
            spaceSlug,
            user,
        );
        if (targetSpace !== undefined) return;
        const ancestorSpaceAccessContext =
            await this.getClosestAncestorSpaceAccessContext(
                user.userUuid,
                projectUuid,
                spaceSlug,
            );
        if (
            ancestorSpaceAccessContext !== undefined &&
            auditedAbility.cannot(
                'create',
                subject(subjectType, {
                    ...ancestorSpaceAccessContext,
                    ...(metadata !== undefined ? { metadata } : {}),
                }),
            )
        ) {
            throw new ForbiddenError(errorMessage);
        }
    }

    // Tiles reference charts by slug with no permission filter; ensure the
    // caller can view every referenced chart in its own space.
    private async assertTileChartsViewAccess({
        userUuid,
        auditedAbility,
        projectUuid,
        tiles,
    }: {
        userUuid: string;
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        projectUuid: string;
        tiles: DashboardAsCode['tiles'];
    }): Promise<void> {
        const chartSlugs = tiles.reduce<string[]>((acc, tile) => {
            if (!isAnyChartTile(tile) || tile.properties.chartSlug == null) {
                return acc;
            }
            return [...acc, tile.properties.chartSlug];
        }, []);
        if (chartSlugs.length === 0) return;

        const [charts, sqlChartRows] = await Promise.all([
            this.savedChartModel.find({
                slugs: chartSlugs,
                projectUuid,
                excludeChartsSavedInDashboard: false,
                includeOrphanChartsWithinDashboard: true,
            }),
            this.savedSqlModel.find({
                slugs: chartSlugs,
                projectUuid,
            }),
        ]);
        const referencedCharts = [
            ...charts.map((chart) => ({
                slug: chart.slug,
                spaceUuid: chart.spaceUuid,
                metadata: { savedChartUuid: chart.uuid },
            })),
            ...sqlChartRows.map((row) => ({
                slug: row.slug,
                spaceUuid: row.space_uuid,
                metadata: { savedSqlUuid: row.saved_sql_uuid },
            })),
        ];
        if (referencedCharts.length === 0) return;

        const spaceAccessContexts =
            await this.spacePermissionService.getSpacesAccessContext(userUuid, [
                ...new Set(referencedCharts.map((chart) => chart.spaceUuid)),
            ]);
        const inaccessibleChartSlugs = referencedCharts
            .filter((chart) =>
                auditedAbility.cannot(
                    'view',
                    subject('SavedChart', {
                        ...spaceAccessContexts[chart.spaceUuid],
                        metadata: chart.metadata,
                    }),
                ),
            )
            .map((chart) => chart.slug);
        if (inaccessibleChartSlugs.length > 0) {
            throw new ForbiddenError(
                `You don't have access to chart(s) referenced by this dashboard: ${inaccessibleChartSlugs.join(
                    ', ',
                )}`,
            );
        }
    }

    private async assertDashboardUpdateAccess({
        userUuid,
        auditedAbility,
        dashboard,
        additionalSpaceUuids = [],
    }: {
        userUuid: string;
        auditedAbility: ReturnType<CoderService['createAuditedAbility']>;
        dashboard: { uuid: string; slug: string; spaceUuid: string | null };
        additionalSpaceUuids?: string[];
    }): Promise<void> {
        if (!dashboard.spaceUuid) {
            throw new ForbiddenError(
                `You don't have access to update dashboard "${dashboard.slug}"`,
            );
        }
        await this.assertSpaceContentAccess({
            userUuid,
            auditedAbility,
            action: 'update',
            subjectType: 'Dashboard',
            spaceUuids: [dashboard.spaceUuid, ...additionalSpaceUuids],
            metadata: { dashboardUuid: dashboard.uuid },
            errorMessage: `You don't have access to update dashboard "${dashboard.slug}"`,
        });
    }

    async getOrCreateSpace(
        projectUuid: string,
        spaceSlug: string,
        user: SessionUser,
        skipSpaceCreate?: boolean,
        publicSpaceCreate?: boolean,
        spaceNames?: Record<string, string>,
        allowSpaceCreate = false,
    ): Promise<{ space: SpaceSummaryBase; created: boolean }> {
        const existingSpace = await this.findAccessibleSpace(
            projectUuid,
            spaceSlug,
            user,
        );

        if (existingSpace !== undefined) {
            return { space: existingSpace, created: false };
        }
        if (skipSpaceCreate) {
            throw new NotFoundError(
                `Space ${spaceSlug} does not exist, skipping creation`,
            );
        }
        if (!allowSpaceCreate) {
            throw new ForbiddenError(
                `You don't have access to create space "${spaceSlug}"`,
            );
        }
        const path = getLtreePathFromContentAsCodePath(spaceSlug);

        const closestAncestorSpaceUuid =
            await this.spaceModel.findClosestAncestorByPath({
                path,
                projectUuid,
            });

        const closestAncestorSpace = closestAncestorSpaceUuid
            ? await this.spaceModel.getSpaceSummary(closestAncestorSpaceUuid)
            : null;

        const remainingPath = path
            .replace(closestAncestorSpace?.path ?? '', '') // remove the closest ancestor path
            .replace(/^\./, '') // remove the leading dot
            .split('.');

        let parentSpaceUuid = closestAncestorSpaceUuid;
        let parentPath = closestAncestorSpace?.path ?? '';
        const inheritParentPermissions =
            closestAncestorSpace?.inheritParentPermissions ??
            publicSpaceCreate === true;
        const newSpaces: Omit<
            Space,
            | 'queries'
            | 'dashboards'
            | 'access'
            | 'groupsAccess'
            | 'childSpaces'
            | 'inheritsFromOrgOrProject'
        >[] = [];

        for await (const currentPath of remainingPath) {
            if (!parentPath) {
                parentPath = currentPath;
            } else {
                parentPath = `${parentPath}.${currentPath}`;
            }

            // Use the original space name from space definition files if available,
            // otherwise fall back to deriving a name from the slug path segment
            const spaceName =
                spaceNames?.[getContentAsCodePathFromLtreePath(parentPath)] ??
                friendlyName(currentPath);

            const newSpace = await this.spaceModel.createSpace(
                {
                    inheritParentPermissions,
                    name: spaceName,
                    parentSpaceUuid,
                },
                {
                    projectUuid,
                    userId: user.userId,
                    path: parentPath,
                },
            );

            if (!newSpace.inheritParentPermissions) {
                if (parentSpaceUuid) {
                    const [ctx, groupsAccess] = await Promise.all([
                        this.spacePermissionService.getAllSpaceAccessContext(
                            parentSpaceUuid,
                        ),
                        this.spacePermissionService.getGroupAccess(
                            parentSpaceUuid,
                        ),
                    ]);

                    const userAccessPromises = ctx.access
                        .filter((a) => a.hasDirectAccess)
                        .map((a) =>
                            this.spaceModel.addSpaceAccess(
                                newSpace.uuid,
                                a.userUuid,
                                a.role,
                            ),
                        );

                    const groupAccessPromises = groupsAccess.map(
                        (groupAccess) =>
                            this.spaceModel.addSpaceGroupAccess(
                                newSpace.uuid,
                                groupAccess.groupUuid,
                                groupAccess.spaceRole,
                            ),
                    );

                    await Promise.all([
                        ...userAccessPromises,
                        ...groupAccessPromises,
                    ]);
                } else {
                    await this.spaceModel.addSpaceAccess(
                        newSpace.uuid,
                        user.userUuid,
                        SpaceMemberRole.ADMIN,
                    );
                }
            }

            parentSpaceUuid = newSpace.uuid;

            newSpaces.push(newSpace);
        }

        return {
            space: {
                ...newSpaces[newSpaces.length - 1],
                chartCount: 0,
                dashboardCount: 0,
                childSpaceCount: 0,
                appCount: 0,
            },
            created: true,
        };
    }

    async upsertDashboard(
        user: SessionUser,
        projectUuid: string,
        slug: string,
        dashboardAsCode: DashboardAsCode,
        options: UpsertContentAsCodeOptions = {},
    ): Promise<PromotionChanges> {
        const {
            skipSpaceCreate,
            publicSpaceCreate,
            force,
            spaceNames,
            mode = 'upsert',
        } = options;
        const shouldUpdateExistingContent = mode === 'upsert';
        const shouldUseExactSlug = mode === 'upsert';
        const project = await this.projectModel.get(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        const { canUploadAnyContent, allowSpaceCreate } =
            CoderService.checkContentAsCodeWriteAccess({
                auditedAbility,
                project,
                slug,
            });

        // Default optional fields when missing (e.g. user-authored YAML)
        const dashboardWithDefaults = {
            ...dashboardAsCode,
            updatedAt: dashboardAsCode.updatedAt ?? new Date(),
            filters: {
                dimensions: dashboardAsCode.filters?.dimensions ?? [],
                metrics: dashboardAsCode.filters?.metrics ?? [],
                tableCalculations:
                    dashboardAsCode.filters?.tableCalculations ?? [],
            },
        };

        // Create mode treats the requested slug as a base for a new unique
        // slug instead of updating content that already owns it.
        const [dashboardSummary] = shouldUpdateExistingContent
            ? await this.dashboardModel.find({
                  slug,
                  projectUuid,
              })
            : [undefined];
        const tilesWithUuids = await this.convertTileWithSlugsToUuids(
            projectUuid,
            dashboardWithDefaults.tiles,
        );
        if (!canUploadAnyContent) {
            await this.assertTileChartsViewAccess({
                userUuid: user.userUuid,
                auditedAbility,
                projectUuid,
                tiles: dashboardWithDefaults.tiles,
            });
        }

        const dashboardFilters = CoderService.getFiltersWithTileUuids(
            dashboardWithDefaults,
            tilesWithUuids,
        );
        const dashboardConfig = dashboardWithDefaults.config
            ? CoderService.getConfigWithDateZoomTileUuids(
                  dashboardWithDefaults.config,
                  tilesWithUuids,
              )
            : dashboardWithDefaults.config;
        // If chart does not exist, we can't use promoteService,
        // since it relies on information that's not available in ChartAsCode, and other uuids
        if (dashboardSummary === undefined) {
            if (!canUploadAnyContent) {
                await this.assertCreateAccessForSpaceSlug({
                    user,
                    auditedAbility,
                    projectUuid,
                    spaceSlug: dashboardWithDefaults.spaceSlug,
                    subjectType: 'Dashboard',
                    errorMessage: `You don't have access to create dashboards in space "${dashboardWithDefaults.spaceSlug}"`,
                });
            }

            const { space, created: spaceCreated } =
                await this.getOrCreateSpace(
                    projectUuid,
                    dashboardWithDefaults.spaceSlug,
                    user,
                    skipSpaceCreate,
                    publicSpaceCreate,
                    spaceNames,
                    allowSpaceCreate,
                );
            if (!canUploadAnyContent) {
                await this.assertSpaceContentAccess({
                    userUuid: user.userUuid,
                    auditedAbility,
                    action: 'create',
                    subjectType: 'Dashboard',
                    spaceUuids: [space.uuid],
                    errorMessage: `You don't have access to create dashboards in space "${dashboardWithDefaults.spaceSlug}"`,
                });
            }

            const newDashboard = await this.dashboardModel.create(
                space.uuid,
                {
                    ...dashboardWithDefaults,
                    tiles: tilesWithUuids,
                    forceSlug: shouldUseExactSlug,
                    filters: dashboardFilters,
                    config: dashboardConfig,
                },
                user,
                projectUuid,
            );

            await this.syncVerification({
                user,
                projectUuid,
                organizationUuid: project.organizationUuid,
                contentType: ContentType.DASHBOARD,
                contentUuid: newDashboard.uuid,
                verified: dashboardAsCode.verified,
            });

            return {
                dashboards: [
                    {
                        action: PromotionAction.CREATE,
                        data: {
                            ...newDashboard,
                            spaceSlug: dashboardWithDefaults.spaceSlug,
                            spacePath: getContentAsCodePathFromLtreePath(
                                dashboardWithDefaults.spaceSlug,
                            ),
                        },
                    },
                ],
                charts: [],
                spaces: spaceCreated
                    ? [{ action: PromotionAction.CREATE, data: space }]
                    : [],
            };
        }
        // Use promote service to update existing dashboard

        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardSummary.uuid,
        );

        console.info(
            `Updating dashboard "${dashboard.name}" on project ${projectUuid}`,
        );

        const targetSpace = !canUploadAnyContent
            ? await this.findAccessibleSpace(
                  projectUuid,
                  dashboardWithDefaults.spaceSlug,
                  user,
              )
            : undefined;
        if (!canUploadAnyContent) {
            if (
                targetSpace === undefined &&
                !skipSpaceCreate &&
                !allowSpaceCreate
            ) {
                throw new ForbiddenError(
                    `You don't have access to create space "${dashboardWithDefaults.spaceSlug}"`,
                );
            }
            await this.assertDashboardUpdateAccess({
                userUuid: user.userUuid,
                auditedAbility,
                dashboard,
                additionalSpaceUuids: targetSpace ? [targetSpace.uuid] : [],
            });
        }

        const dashboardWithUuids = {
            ...dashboardWithDefaults,
            tiles: tilesWithUuids,
            config: dashboardConfig,
        };
        const { promotedDashboard, upstreamDashboard } =
            await this.promoteService.getPromotedDashboard(
                user,
                {
                    ...dashboard,
                    ...dashboardWithUuids,
                    filters: dashboardFilters,
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                },
                projectUuid, // We use the same projectUuid for both promoted and upstream
            );

        PromoteService.checkPromoteDashboardPermissions(
            auditedAbility,
            user.organizationUuid!,
            promotedDashboard,
            upstreamDashboard,
        );

        const { space } = await this.getOrCreateSpace(
            projectUuid,
            dashboardWithDefaults.spaceSlug,
            user,
            skipSpaceCreate,
            undefined,
            spaceNames,
            allowSpaceCreate,
        );
        if (!canUploadAnyContent && space.uuid !== targetSpace?.uuid) {
            await this.assertSpaceContentAccess({
                userUuid: user.userUuid,
                auditedAbility,
                action: 'update',
                subjectType: 'Dashboard',
                spaceUuids: [space.uuid],
                metadata: { dashboardUuid: dashboard.uuid },
                errorMessage: `You don't have access to update dashboard "${slug}"`,
            });
        }

        //  we force the new space on the upstreamDashboard
        if (upstreamDashboard.dashboard)
            upstreamDashboard.dashboard.spaceUuid = space.uuid;

        // TODO: Check permissions for all chart tiles
        // eslint-disable-next-line prefer-const
        let [promotionChanges, promotedCharts] =
            await this.promoteService.getPromotionDashboardChanges(
                user,
                promotedDashboard,
                upstreamDashboard,
                true, // includeOrphanChartsWithinDashboard
            );

        // TODO: Right now dashboards on promote service always update dashboards
        // See isDashboardUpdated for more details

        if (force) {
            promotionChanges = {
                ...promotionChanges,
                charts: promotionChanges.charts.map((c) =>
                    c.action === PromotionAction.NO_CHANGES
                        ? { ...c, action: PromotionAction.UPDATE }
                        : c,
                ),
            };
        }

        promotionChanges = await this.promoteService.getOrCreateDashboard(
            user,
            promotionChanges,
        );

        promotionChanges = await this.promoteService.upsertCharts(
            user,
            promotionChanges,
            promotionChanges.dashboards[0].data.uuid,
        );

        promotionChanges = await this.promoteService.updateDashboard(
            user,
            promotionChanges,
        );

        await this.syncVerification({
            user,
            projectUuid,
            organizationUuid: project.organizationUuid,
            contentType: ContentType.DASHBOARD,
            contentUuid: dashboard.uuid,
            verified: dashboardAsCode.verified,
        });

        console.info(
            `Finished updating dashboard "${dashboard.name}" on project ${projectUuid}: ${promotionChanges.dashboards[0].action}`,
        );
        return promotionChanges;
    }
}
