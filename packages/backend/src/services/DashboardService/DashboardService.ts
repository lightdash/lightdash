import { subject } from '@casl/ability';
import {
    AbilityAction,
    assertRegisteredAccount,
    BulkActionable,
    canMutateVerifiedContent,
    computeContentDraftStaleness,
    ContentAsCodeType,
    ContentType,
    CreateDashboard,
    CreateDashboardWithCharts,
    CreateSavedChart,
    CreateSchedulerAndTargetsWithoutIds,
    Dashboard,
    DashboardDAO,
    DashboardTab,
    DashboardTileTypes,
    DashboardVersionedFields,
    DetailedViewStatistics,
    ExploreType,
    ExportContentPayload,
    ExportContentRequest,
    ForbiddenError,
    generateSlug,
    getItemId,
    getSchedulerResourceTypeAndId,
    hasChartsInDashboard,
    isDashboardChartTileType,
    isDashboardScheduler,
    isDashboardUnversionedFields,
    isDashboardVersionedFields,
    isJwtUser,
    isUserWithOrg,
    isValidFrequency,
    isValidTimezone,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
    ParameterError,
    PossibleAbilities,
    RegisteredAccount,
    SCHEDULER_TASKS,
    SchedulerAndTargets,
    SchedulerFormat,
    SchedulerResourceType,
    SchedulerRun,
    SchedulerRunStatus,
    SessionUser,
    TogglePinnedItemInfo,
    UpdateDashboard,
    UpdateMultipleDashboards,
    UserDashboardsSummary,
    type Account,
    type ChartFieldUpdates,
    type ChartVersionDifference,
    type ChartVersionSummary,
    type ContentDraftStaleness,
    type ContentVerificationInfo,
    type CreateDashboardSqlChartTile,
    type DashboardBasicDetailsWithTileTypes,
    type DashboardCustomMetricUpdateResult,
    type DashboardHistory,
    type DashboardTileTarget,
    type DashboardVersion,
    type DuplicateDashboardParams,
    type Explore,
    type ExploreError,
    type UpdateDashboardCustomMetric,
    type UUID,
    type UuidOrSlug,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import { type Knex } from 'knex';
import { uniq } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import {
    CreateDashboardOrVersionEvent,
    LightdashAnalytics,
    SchedulerDashboardUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { getAccountWriteContext, toSessionUser } from '../../auth/account';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../config/parseConfig';
import { getSchedulerTargetType } from '../../database/entities/scheduler';
// CaslAuditWrapper is now used via this.createAuditedAbility() from BaseService
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { getChartFieldUsageChanges } from '../../models/CatalogModel/utils';
import { ContentAsCodeProjectSettingsModel } from '../../models/ContentAsCodeProjectSettingsModel';
import { ContentAsCodeSnapshotModel } from '../../models/ContentAsCodeSnapshotModel';
import {
    ContentDraftModel,
    pruneUnchangedDraftFields,
    type ContentDraft,
    type ContentDraftBase,
} from '../../models/ContentDraftModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { PinnedListModel } from '../../models/PinnedListModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SearchModel } from '../../models/SearchModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { createTwoColumnTiles } from '../../utils/dashboardTileUtils';
import { BaseService } from '../BaseService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import type { SchedulerService } from '../SchedulerService/SchedulerService';
import type {
    SoftDeletableService,
    SoftDeleteOptions,
} from '../SoftDeletableService';
import {
    spaceContextsByUuid,
    SpacePermissionService,
} from '../SpaceService/SpacePermissionService';
import { hasDirectAccessToSpace } from '../SpaceService/SpaceService';

type DashboardServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    dashboardModel: DashboardModel;
    spaceModel: SpaceModel;
    analyticsModel: AnalyticsModel;
    pinnedListModel: PinnedListModel;
    schedulerModel: SchedulerModel;
    searchModel: SearchModel;
    schedulerService: SchedulerService;
    savedChartModel: SavedChartModel;
    savedSqlModel: SavedSqlModel;
    savedChartService: SavedChartService;
    schedulerClient: SchedulerClient;
    contentAsCodeProjectSettingsModel: ContentAsCodeProjectSettingsModel;
    contentAsCodeSnapshotModel: ContentAsCodeSnapshotModel;
    contentDraftModel: ContentDraftModel;
    slackClient: SlackClient;
    projectModel: ProjectModel;
    catalogModel: CatalogModel;
    organizationModel: OrganizationModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    spacePermissionService: SpacePermissionService;
    contentVerificationModel: ContentVerificationModel;
};

type ContentAsCodeDeleteOptions = SoftDeleteOptions & {
    contentAsCodePolicyChecked?: boolean;
};

type DashboardDraftOverlay = Partial<
    Pick<
        DashboardDAO,
        | 'name'
        | 'description'
        | 'tiles'
        | 'filters'
        | 'tabs'
        | 'config'
        | 'spaceUuid'
    >
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const assertDashboardDraftOverlay: (
    draft: unknown,
) => asserts draft is DashboardDraftOverlay = (draft) => {
    if (!isRecord(draft)) {
        throw new Error('Dashboard draft must be an object');
    }
    const validators: Record<
        keyof DashboardDraftOverlay,
        (value: unknown) => boolean
    > = {
        name: (value) => typeof value === 'string',
        description: (value) => typeof value === 'string',
        tiles: Array.isArray,
        filters: isRecord,
        tabs: Array.isArray,
        config: isRecord,
        spaceUuid: (value) => typeof value === 'string',
    };
    for (const [field, validate] of Object.entries(validators)) {
        if (
            Object.prototype.hasOwnProperty.call(draft, field) &&
            draft[field] !== undefined &&
            !validate(draft[field])
        ) {
            throw new Error(`Invalid dashboard draft field: ${field}`);
        }
    }
};

export class DashboardService
    extends BaseService
    implements BulkActionable<Knex>, SoftDeletableService
{
    private lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    dashboardModel: DashboardModel;

    spaceModel: SpaceModel;

    analyticsModel: AnalyticsModel;

    pinnedListModel: PinnedListModel;

    schedulerModel: SchedulerModel;

    searchModel: SearchModel;

    schedulerService: SchedulerService;

    savedChartModel: SavedChartModel;

    savedSqlModel: SavedSqlModel;

    savedChartService: SavedChartService;

    catalogModel: CatalogModel;

    projectModel: ProjectModel;

    organizationModel: OrganizationModel;

    organizationMemberProfileModel: OrganizationMemberProfileModel;

    schedulerClient: SchedulerClient;

    contentAsCodeProjectSettingsModel: ContentAsCodeProjectSettingsModel;

    contentAsCodeSnapshotModel: ContentAsCodeSnapshotModel;

    contentDraftModel: ContentDraftModel;

    slackClient: SlackClient;

    spacePermissionService: SpacePermissionService;

    contentVerificationModel: ContentVerificationModel;

    async scheduleExportContent(
        account: Account,
        dashboardUuidOrSlug: UuidOrSlug,
        data: ExportContentRequest,
    ) {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);

        if (
            ![
                SchedulerFormat.IMAGE,
                SchedulerFormat.CSV,
                SchedulerFormat.XLSX,
            ].includes(data.format)
        ) {
            throw new ParameterError('Unsupported export format');
        }

        const auditedAbility = this.createAuditedAbility(account);
        if (data.format === SchedulerFormat.IMAGE) {
            // Image export renders the dashboard in a headless browser using a
            // real session, so it is not available to embed/JWT callers.
            assertRegisteredAccount(account);
            const { inheritsFromOrgOrProject, access } =
                await this.spacePermissionService.resolveAccess(
                    account.user.userUuid,
                    {
                        type: 'dashboard',
                        dashboardUuid: dashboard.uuid,
                        spaceUuid: dashboard.spaceUuid,
                    },
                );

            if (
                auditedAbility.cannot(
                    'view',
                    subject('Dashboard', {
                        organizationUuid: dashboard.organizationUuid,
                        projectUuid: dashboard.projectUuid,
                        inheritsFromOrgOrProject,
                        access,
                        metadata: {
                            dashboardUuid: dashboard.uuid,
                            dashboardName: dashboard.name,
                        },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        } else if (
            auditedAbility.cannot(
                'manage',
                subject('ExportCsv', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Embed/JWT callers have no DB user; carry the encoded token so the
        // scheduler worker can rebuild the anonymous account to run the tile
        // queries under the same access it was granted.
        const encodedJwt = isJwtUser(account)
            ? account.authentication.source
            : undefined;

        const payload: ExportContentPayload = {
            resourceType: SchedulerResourceType.DASHBOARD,
            resourceUuid: dashboard.uuid,
            format: data.format,
            options: data.options ?? {},
            dashboardFilters: data.dashboardFilters,
            dateZoomGranularity: data.dateZoomGranularity,
            customViewportWidth: data.customViewportWidth,
            selectedTabs: data.selectedTabs ?? null,
            parameters: data.parameters,
            organizationUuid: dashboard.organizationUuid,
            projectUuid: dashboard.projectUuid,
            userUuid: account.user.id,
            encodedJwt,
            schedulerUuid: undefined,
        };

        const { jobId } = await this.schedulerClient.scheduleTask(
            SCHEDULER_TASKS.EXPORT_CONTENT,
            payload,
        );

        return { jobId };
    }

    constructor({
        lightdashConfig,
        analytics,
        dashboardModel,
        spaceModel,
        analyticsModel,
        pinnedListModel,
        schedulerModel,
        searchModel,
        schedulerService,
        savedChartModel,
        savedSqlModel,
        savedChartService,
        schedulerClient,
        contentAsCodeProjectSettingsModel,
        contentAsCodeSnapshotModel,
        contentDraftModel,
        slackClient,
        projectModel,
        catalogModel,
        organizationModel,
        organizationMemberProfileModel,
        spacePermissionService,
        contentVerificationModel,
    }: DashboardServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.dashboardModel = dashboardModel;
        this.spaceModel = spaceModel;
        this.analyticsModel = analyticsModel;
        this.pinnedListModel = pinnedListModel;
        this.schedulerModel = schedulerModel;
        this.searchModel = searchModel;
        this.schedulerService = schedulerService;
        this.savedChartModel = savedChartModel;
        this.savedSqlModel = savedSqlModel;
        this.savedChartService = savedChartService;
        this.projectModel = projectModel;
        this.catalogModel = catalogModel;
        this.organizationModel = organizationModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.schedulerClient = schedulerClient;
        this.contentAsCodeProjectSettingsModel =
            contentAsCodeProjectSettingsModel;
        this.contentAsCodeSnapshotModel = contentAsCodeSnapshotModel;
        this.contentDraftModel = contentDraftModel;
        this.slackClient = slackClient;
        this.spacePermissionService = spacePermissionService;
        this.contentVerificationModel = contentVerificationModel;
    }

    async verifyDashboard(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
    ): Promise<ContentVerificationInfo> {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { organizationUuid, projectUuid } = dashboard;

        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
                }),
            )
        ) {
            throw new ForbiddenError('Only admins can verify dashboards');
        }

        await this.contentVerificationModel.verify(
            ContentType.DASHBOARD,
            dashboard.uuid,
            projectUuid,
            user.userUuid,
        );

        const verification = await this.contentVerificationModel.getByContent(
            ContentType.DASHBOARD,
            dashboard.uuid,
        );

        if (!verification) {
            throw new Error('Failed to verify dashboard');
        }

        this.analytics.track({
            event: 'content_verification.created',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                contentType: ContentType.DASHBOARD,
                contentId: dashboard.uuid,
            },
        });

        return verification;
    }

    async unverifyDashboard(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
    ): Promise<void> {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { organizationUuid, projectUuid } = dashboard;

        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                'Only admins can remove dashboard verification',
            );
        }

        await this.contentVerificationModel.unverify(
            ContentType.DASHBOARD,
            dashboard.uuid,
        );

        this.analytics.track({
            event: 'content_verification.deleted',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                contentType: ContentType.DASHBOARD,
                contentId: dashboard.uuid,
            },
        });
    }

    static getCreateEventProperties(
        dashboard: DashboardDAO,
    ): CreateDashboardOrVersionEvent['properties'] {
        const dimensionFilterCount = dashboard.filters?.dimensions?.length ?? 0;
        const metricFilterCount = dashboard.filters?.metrics?.length ?? 0;

        return {
            title: dashboard.name,
            description: dashboard.description,

            projectId: dashboard.projectUuid,
            dashboardId: dashboard.uuid,
            filtersCount: dimensionFilterCount + metricFilterCount,
            dimensionFilterCount,
            metricFilterCount,
            tilesCount: dashboard.tiles.length,
            chartTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.SAVED_CHART,
            ).length,
            sqlChartTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.SQL_CHART,
            ).length,
            markdownTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.MARKDOWN,
            ).length,
            loomTilesCount: dashboard.tiles.filter(
                ({ type }) => type === DashboardTileTypes.LOOM,
            ).length,
            tabsCount: dashboard.tabs.length,
            parametersCount: Object.keys(dashboard.parameters || {}).length,
        };
    }

    // Draft payloads are untrusted JSON, so narrow instead of casting.
    private static collectDraftSavedChartUuids(
        drafts: ContentDraft[],
    ): Set<string> {
        const chartUuids = new Set<string>();
        drafts.forEach(({ draft }) => {
            const { tiles } = draft as { tiles?: unknown };
            if (!Array.isArray(tiles)) return;
            tiles.forEach((tile) => {
                if (typeof tile !== 'object' || tile === null) return;
                const { properties } = tile as { properties?: unknown };
                if (typeof properties !== 'object' || properties === null)
                    return;
                const { savedChartUuid } = properties as {
                    savedChartUuid?: unknown;
                };
                if (typeof savedChartUuid === 'string') {
                    chartUuids.add(savedChartUuid);
                }
            });
        });
        return chartUuids;
    }

    private async deleteOrphanedChartsInDashboards(
        user: SessionUser,
        projectUuid: UUID,
        dashboardUuid: UUID,
    ) {
        const orphanedCharts =
            await this.dashboardModel.getOrphanedCharts(dashboardUuid);

        // A chart saved into a dashboard exists before the dashboard version
        // that references it. When the author's save was held back as a draft,
        // no version references the chart, so the next published save would
        // permanently delete a chart the draft still points at.
        const draftChartUuids = DashboardService.collectDraftSavedChartUuids(
            await this.contentDraftModel.listOpenForContent(
                projectUuid,
                'dashboard',
                dashboardUuid,
            ),
        );
        const deletableCharts = orphanedCharts.filter(
            (chart) => !draftChartUuids.has(chart.uuid),
        );

        await Promise.all(
            deletableCharts.map(async (chart) => {
                try {
                    const deletedChart =
                        await this.savedChartModel.permanentDelete(chart.uuid);
                    this.analytics.track({
                        event: 'saved_chart.deleted',
                        userId: user.userUuid,
                        properties: {
                            savedQueryId: deletedChart.uuid,
                            projectId: deletedChart.projectUuid,
                            softDelete: false,
                            viaDashboardGrant: false,
                            grantOnly: false,
                        },
                    });
                } catch (error) {
                    // A retried save may have already deleted the orphan.
                    // Don't fail the whole save response for it.
                    if (error instanceof NotFoundError) {
                        this.logger.warn(
                            `Skipping already-deleted orphan chart ${chart.uuid} for dashboard ${dashboardUuid}`,
                        );
                        return;
                    }
                    throw error;
                }
            }),
        );
    }

    /**
     * Duplicates a chart that belongs to a dashboard.
     * Used when duplicating dashboards or duplicating tabs with dashboard charts.
     */
    private async duplicateChartForDashboard({
        chartUuid,
        projectUuid,
        dashboardUuid,
        user,
    }: {
        chartUuid: UUID;
        projectUuid: UUID;
        dashboardUuid: UUID;
        user: SessionUser;
    }): Promise<string> {
        const chartToDuplicate = await this.savedChartModel.get(
            chartUuid,
            undefined,
            { projectUuid },
        );
        // Tile payloads can name any chart uuid; require view access on the
        // source chart before copying it into the target dashboard. Dashboard
        // grants only count while the copy stays inside the owning dashboard:
        // a grant must never move content beyond the dashboard it covers.
        const staysInOwningDashboard =
            chartToDuplicate.dashboardUuid === dashboardUuid;
        const sourceContext = await this.spacePermissionService.resolveAccess(
            user.userUuid,
            staysInOwningDashboard
                ? {
                      type: 'dashboard',
                      dashboardUuid,
                      spaceUuid: chartToDuplicate.spaceUuid,
                  }
                : {
                      type: 'space',
                      spaceUuid: chartToDuplicate.spaceUuid,
                  },
        );
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: chartToDuplicate.organizationUuid,
                    projectUuid: chartToDuplicate.projectUuid,
                    inheritsFromOrgOrProject:
                        sourceContext.inheritsFromOrgOrProject,
                    access: sourceContext.access,
                    metadata: {
                        spaceUuid: chartToDuplicate.spaceUuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the chart being duplicated",
            );
        }
        if (!chartToDuplicate.dashboardUuid) {
            throw new ParameterError(
                'We cannot duplicate a chart that is not part of a dashboard',
            );
        }
        const duplicatedChart = await this.savedChartModel.create(
            projectUuid,
            user.userUuid,
            {
                ...chartToDuplicate,
                spaceUuid: null,
                dashboardUuid,
                updatedByUser: {
                    userUuid: user.userUuid,
                    firstName: user.firstName,
                    lastName: user.lastName,
                },
                slug: chartToDuplicate.slug,
            },
        );

        // Best effort: the chart has already been duplicated at this point, so
        // missing explore metadata should not fail the parent dashboard copy.
        let cachedExplore: Explore | ExploreError | undefined;
        try {
            cachedExplore = await this.projectModel.getExploreFromCache(
                projectUuid,
                duplicatedChart.tableName,
            );
            await this.updateChartFieldUsage(projectUuid, cachedExplore, {
                oldChartFields: {
                    metrics: [],
                    dimensions: [],
                },
                newChartFields: {
                    metrics: duplicatedChart.metricQuery.metrics,
                    dimensions: duplicatedChart.metricQuery.dimensions,
                },
            });
        } catch (error) {
            this.logger.warn(
                `Skipping duplicated chart enrichment for chart ${duplicatedChart.uuid}`,
                {
                    error,
                    projectUuid,
                    tableName: duplicatedChart.tableName,
                },
            );
        }

        this.analytics.track({
            event: 'saved_chart.created',
            userId: user.userUuid,
            properties: {
                ...SavedChartService.getCreateEventProperties(duplicatedChart, {
                    viaDashboardGrant: sourceContext.access.some(
                        (row) => row.grantedVia === 'dashboard',
                    ),
                    grantOnly: sourceContext.directOnly,
                }),
                dashboardId: duplicatedChart.dashboardUuid ?? undefined,
                duplicated: true,
                virtualViewId:
                    cachedExplore?.type === ExploreType.VIRTUAL
                        ? cachedExplore.name
                        : undefined,
            },
        });

        return duplicatedChart.uuid;
    }

    async getAllByProject(
        user: SessionUser,
        projectUuid: UUID,
        chartUuid?: string,
        includePrivate?: boolean,
    ): Promise<DashboardBasicDetailsWithTileTypes[]> {
        const dashboards = await this.dashboardModel.getAllByProject(
            projectUuid,
            chartUuid,
        );
        const spaceUuids = [
            ...new Set(dashboards.map((dashboard) => dashboard.spaceUuid)),
        ];
        const resolvedSpaceContexts =
            await this.spacePermissionService.resolveAccessBatch(
                user.userUuid,
                spaceUuids.map((spaceUuid) => ({
                    type: 'space' as const,
                    spaceUuid,
                })),
            );
        const spaceContexts = spaceContextsByUuid(resolvedSpaceContexts);

        const dashboardsWithContext = dashboards.flatMap((dashboard) => {
            const spaceContext = spaceContexts[dashboard.spaceUuid];
            return spaceContext ? [{ dashboard, spaceContext }] : [];
        });
        const auditedAbility = this.createAuditedAbility(user);
        const accessResults = auditedAbility.canBulk(
            'view',
            dashboardsWithContext.map(({ dashboard, spaceContext }) =>
                subject('Dashboard', {
                    ...spaceContext,
                    metadata: { dashboardUuid: dashboard.uuid },
                }),
            ),
        );

        return dashboardsWithContext
            .filter(({ spaceContext }, index) =>
                includePrivate
                    ? accessResults[index]
                    : accessResults[index] &&
                      hasDirectAccessToSpace(user, spaceContext),
            )
            .map(({ dashboard }) => dashboard);
    }

    async getByIdOrSlug(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        options?: { projectUuid?: string },
    ): Promise<Dashboard> {
        const dashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            {
                projectUuid: options?.projectUuid,
            },
        );

        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.resolveAccess(user.userUuid, {
                type: 'dashboard',
                dashboardUuid: dashboardDao.uuid,
                spaceUuid: dashboardDao.spaceUuid,
            });
        const dashboard = {
            ...dashboardDao,
            inheritsFromOrgOrProject,
            access,
        };

        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...dashboard,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        void this.analyticsModel
            .addDashboardViewEvent(dashboard.uuid, user.userUuid)
            .catch((err) => {
                this.logger.warn('dashboard view event failed', {
                    dashboardUuid: dashboard.uuid,
                    err: err instanceof Error ? err.message : String(err),
                });
            });

        this.analytics.track({
            event: 'dashboard.view',
            userId: user.userUuid,
            properties: {
                dashboardId: dashboard.uuid,
                organizationId: dashboard.organizationUuid,
                projectId: dashboard.projectUuid,
                parametersCount: Object.keys(dashboard.parameters || {}).length,
            },
        });

        // Wide observability event for diagnosing stale dashboard filter references
        // (e.g. PROD-5931). Best-effort — never block the request on logging errors.
        void this.logDashboardLoadedEvent(dashboard).catch((err) => {
            this.logger.warn('dashboard.loaded log failed', {
                dashboardUuid: dashboard.uuid,
                err: err instanceof Error ? err.message : String(err),
            });
        });

        return dashboard;
    }

    async getViewStats(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        options?: { projectUuid?: string },
    ): Promise<DetailedViewStatistics> {
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            { projectUuid: options?.projectUuid },
        );
        const spaceContext = await this.spacePermissionService.resolveAccess(
            user.userUuid,
            {
                type: 'dashboard',
                dashboardUuid: dashboard.uuid,
                spaceUuid: dashboard.spaceUuid,
            },
        );
        const auditedAbility = this.createAuditedAbility(user);

        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...spaceContext,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        return this.analyticsModel.getDashboardViewStats(dashboard.uuid);
    }

    // The published dashboard with the caller's own unpublished draft applied
    // on top. Only interactive read paths should use this: `getByIdOrSlug`
    // stays published-only so machine consumers — scheduled deliveries,
    // exports, Google Sheets syncs, AI tools — cannot serve one user's draft
    // to everyone by forgetting to opt out.
    async getByIdOrSlugForViewer(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        options?: { projectUuid?: string },
    ): Promise<Dashboard> {
        const dashboard = await this.getByIdOrSlug(
            user,
            dashboardUuidOrSlug,
            options,
        );
        return this.applyOpenDraftOverlay(user, dashboard);
    }

    async getDashboardCharts(
        user: SessionUser,
        projectUuid: UUID,
        dashboardUuidOrSlug: UuidOrSlug,
        page: number,
        pageSize: number,
    ): ReturnType<SearchModel['getDashboardCharts']> {
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            { projectUuid },
        );
        const spaceContext = await this.spacePermissionService.resolveAccess(
            user.userUuid,
            {
                type: 'dashboard',
                dashboardUuid: dashboard.uuid,
                spaceUuid: dashboard.spaceUuid,
            },
        );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...spaceContext,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        return this.searchModel.getDashboardCharts(
            projectUuid,
            dashboard.uuid,
            page,
            pageSize,
        );
    }

    private async logDashboardLoadedEvent(dashboard: Dashboard): Promise<void> {
        const STALE_SAMPLE_CAP = 10;

        const cachedExploreNames = new Set(
            await this.projectModel.getCachedExploreNames(
                dashboard.projectUuid,
            ),
        );

        const chartTileUuids = dashboard.tiles
            .filter(isDashboardChartTileType)
            .map((tile) => tile.properties.savedChartUuid)
            .filter((uuid): uuid is string => Boolean(uuid));

        const chartInfos = chartTileUuids.length
            ? await this.savedChartModel.getInfoForAvailableFilters(
                  chartTileUuids,
              )
            : [];

        const chartTables = new Set(
            chartInfos.map((chart) => chart.tableName).filter(Boolean),
        );
        const chartTablesMissing = [...chartTables].filter(
            (name) => !cachedExploreNames.has(name),
        );

        const staleFilterTargets: Array<{
            path: string;
            tableName: string;
            fieldId: string;
        }> = [];
        const staleTileTargets: Array<{
            path: string;
            tableName: string;
            fieldId: string;
        }> = [];

        const dimensions = dashboard.filters?.dimensions ?? [];
        dimensions.forEach((dim, dimIndex) => {
            const target = dim.target as
                | {
                      tableName?: string;
                      fieldId?: string;
                      isSqlColumn?: boolean;
                  }
                | undefined;
            if (
                target?.tableName &&
                target.fieldId &&
                !target.isSqlColumn &&
                !cachedExploreNames.has(target.tableName)
            ) {
                staleFilterTargets.push({
                    path: `dimensions[${dimIndex}].target`,
                    tableName: target.tableName,
                    fieldId: target.fieldId,
                });
            }

            const { tileTargets } = dim as {
                tileTargets?: Record<string, unknown>;
            };
            if (tileTargets) {
                Object.entries(tileTargets).forEach(([tileUuid, raw]) => {
                    if (!raw || typeof raw !== 'object') {
                        return;
                    }
                    const tt = raw as {
                        tableName?: string;
                        fieldId?: string;
                        isSqlColumn?: boolean;
                    };
                    if (
                        tt.tableName &&
                        tt.fieldId &&
                        !tt.isSqlColumn &&
                        !cachedExploreNames.has(tt.tableName)
                    ) {
                        staleTileTargets.push({
                            path: `dimensions[${dimIndex}].tileTargets.${tileUuid}`,
                            tableName: tt.tableName,
                            fieldId: tt.fieldId,
                        });
                    }
                });
            }
        });

        const filterDimensionCount = dimensions.length;
        const filterMetricCount = dashboard.filters?.metrics?.length ?? 0;
        const tileTargetCount = dimensions.reduce(
            (acc, dim) =>
                acc +
                Object.keys(
                    (dim as { tileTargets?: Record<string, unknown> })
                        .tileTargets ?? {},
                ).length,
            0,
        );

        this.logger.info('dashboard.loaded', {
            projectUuid: dashboard.projectUuid,
            organizationUuid: dashboard.organizationUuid,
            dashboardUuid: dashboard.uuid,
            dashboardVersionUuid: dashboard.versionUuid,

            tileCount: dashboard.tiles.length,
            chartTileCount: chartTileUuids.length,
            filterDimensionCount,
            filterMetricCount,
            tileTargetCount,

            cachedExploreCount: cachedExploreNames.size,
            chartTablesMissingCount: chartTablesMissing.length,
            staleFilterTargetCount: staleFilterTargets.length,
            staleTileTargetCount: staleTileTargets.length,

            chartTablesMissing: chartTablesMissing.slice(0, STALE_SAMPLE_CAP),
            staleFilterTargets: staleFilterTargets.slice(0, STALE_SAMPLE_CAP),
            staleTileTargets: staleTileTargets.slice(0, STALE_SAMPLE_CAP),
        });
    }

    static findChartsThatBelongToDashboard(
        dashboard: Pick<Dashboard, 'tiles'>,
    ): string[] {
        return dashboard.tiles.reduce<string[]>((acc, tile) => {
            if (
                isDashboardChartTileType(tile) &&
                !!tile.properties.belongsToDashboard &&
                !!tile.properties.savedChartUuid
            ) {
                return [...acc, tile.properties.savedChartUuid];
            }
            return acc;
        }, []);
    }

    private async updateChartFieldUsage(
        projectUuid: UUID,
        chartExplore: Explore | ExploreError,
        chartFields: ChartFieldUpdates,
    ) {
        const fieldUsageChanges = await getChartFieldUsageChanges(
            projectUuid,
            chartExplore,
            chartFields,
            this.catalogModel.findTablesCachedExploreUuid.bind(
                this.catalogModel,
            ),
        );

        await this.catalogModel.updateFieldsChartUsage(
            projectUuid,
            fieldUsageChanges,
        );
    }

    private async assertWriteSpaceBelongsToProject(
        projectUuid: UUID,
        spaceUuid: UUID,
    ) {
        const space = await this.spaceModel.get(spaceUuid);

        if (space.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                'Embed token does not allow writing to this project space',
            );
        }

        return space;
    }

    private async assertDashboardTilesBelongToWriteSpace(
        user: SessionUser,
        tiles: CreateDashboard['tiles'],
        writeSpaceUuid: UUID,
        projectUuid: UUID,
    ) {
        const savedChartUuids = [
            ...new Set(
                tiles
                    .filter(
                        (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
                    )
                    .map((tile) => tile.properties.savedChartUuid)
                    .filter((uuid): uuid is string => !!uuid),
            ),
        ];

        await Promise.all(
            savedChartUuids.map(async (savedChartUuid) => {
                const savedChart = await this.savedChartModel.get(
                    savedChartUuid,
                    undefined,
                    { projectUuid },
                );

                if (savedChart.spaceUuid !== writeSpaceUuid) {
                    throw new ForbiddenError(
                        'Embed token does not allow saving charts from outside the write space',
                    );
                }

                const spaceAccessContext =
                    await this.spacePermissionService.resolveAccess(
                        user.userUuid,
                        { type: 'space', spaceUuid: savedChart.spaceUuid },
                    );
                const auditedAbility = this.createAuditedAbility(user);
                if (
                    auditedAbility.cannot(
                        'view',
                        subject('SavedChart', {
                            ...savedChart,
                            inheritsFromOrgOrProject:
                                spaceAccessContext.inheritsFromOrgOrProject,
                            access: spaceAccessContext.access,
                            metadata: {
                                savedChartUuid: savedChart.uuid,
                                savedChartName: savedChart.name,
                            },
                        }),
                    )
                ) {
                    throw new ForbiddenError(
                        'Embed token does not allow viewing this chart',
                    );
                }
            }),
        );

        const savedSqlUuids = [
            ...new Set(
                tiles
                    .filter(
                        (tile) => tile.type === DashboardTileTypes.SQL_CHART,
                    )
                    .map(
                        (tile) =>
                            (tile as CreateDashboardSqlChartTile).properties
                                .savedSqlUuid,
                    )
                    .filter((uuid): uuid is string => !!uuid),
            ),
        ];

        await Promise.all(
            savedSqlUuids.map(async (savedSqlUuid) => {
                const savedSqlChart = await this.savedSqlModel.getByUuid(
                    savedSqlUuid,
                    { projectUuid },
                );

                if (savedSqlChart.space.uuid !== writeSpaceUuid) {
                    throw new ForbiddenError(
                        'Embed token does not allow saving SQL charts from outside the write space',
                    );
                }

                const spaceAccessContext =
                    await this.spacePermissionService.resolveAccess(
                        user.userUuid,
                        { type: 'space', spaceUuid: savedSqlChart.space.uuid },
                    );
                const auditedAbility = this.createAuditedAbility(user);
                if (
                    auditedAbility.cannot(
                        'view',
                        subject('SavedChart', {
                            ...spaceAccessContext,
                            metadata: {
                                savedSqlUuid: savedSqlChart.savedSqlUuid,
                            },
                        }),
                    )
                ) {
                    throw new ForbiddenError(
                        'Embed token does not allow viewing this SQL chart',
                    );
                }
            }),
        );
    }

    private async getCreateDashboardContext(
        account: Account,
        projectUuid: UUID,
        dashboard: CreateDashboard,
    ): Promise<{ user: SessionUser; dashboard: CreateDashboard }> {
        const { user, embedWriteActions } = getAccountWriteContext(account);

        if (!embedWriteActions) {
            return { user, dashboard };
        }

        await this.assertWriteSpaceBelongsToProject(
            projectUuid,
            embedWriteActions.spaceUuid,
        );
        await this.assertDashboardTilesBelongToWriteSpace(
            user,
            dashboard.tiles,
            embedWriteActions.spaceUuid,
            projectUuid,
        );

        return {
            user,
            dashboard: {
                ...dashboard,
                spaceUuid: embedWriteActions.spaceUuid,
            },
        };
    }

    private async getDashboardWriteContext(
        account: Account,
        projectUuid: UUID | undefined,
    ): Promise<{
        user: SessionUser;
        embedWriteActions?: { spaceUuid: UUID };
    }> {
        const context = getAccountWriteContext(account);

        if (context.embedWriteActions) {
            if (!projectUuid) {
                throw new ForbiddenError(
                    'Project UUID is required for embedded write actions',
                );
            }

            await this.assertWriteSpaceBelongsToProject(
                projectUuid,
                context.embedWriteActions.spaceUuid,
            );
        }

        return context;
    }

    async createFromAccount(
        account: Account,
        projectUuid: UUID,
        dashboard: CreateDashboard,
    ): Promise<Dashboard> {
        const { user, dashboard: dashboardToCreate } =
            await this.getCreateDashboardContext(
                account,
                projectUuid,
                dashboard,
            );
        return this.create(user, projectUuid, dashboardToCreate);
    }

    async create(
        user: SessionUser,
        projectUuid: UUID,
        dashboard: CreateDashboard,
    ): Promise<Dashboard> {
        const resolvedSpaceUuid =
            dashboard.spaceUuid ??
            (await this.spacePermissionService.getFirstViewableSpaceUuid(
                user,
                projectUuid,
            ));
        const space = await this.spaceModel.get(resolvedSpaceUuid);
        if (space.projectUuid !== projectUuid) {
            throw new ForbiddenError('Space does not belong to this project');
        }

        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.resolveAccess(user.userUuid, {
                type: 'space',
                spaceUuid: space.uuid,
            });

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('Dashboard', {
                    organizationUuid: space.organizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        spaceUuid: space.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }
        if (dashboard.ownerUserUuid) {
            // Throws NotFoundError when the user is not an org member
            await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                space.organizationUuid,
                dashboard.ownerUserUuid,
            );
        }

        const createDashboard = {
            ...dashboard,
            slug: generateSlug(dashboard.name),
        };
        const newDashboard = await this.dashboardModel.create(
            space.uuid,
            createDashboard,
            user,
            projectUuid,
        );
        this.analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: DashboardService.getCreateEventProperties(newDashboard),
        });

        const dashboardDao = await this.dashboardModel.getByIdOrSlug(
            newDashboard.uuid,
        );

        return {
            ...dashboardDao,
            inheritsFromOrgOrProject,
            access,
        };
    }

    /**
     * Summary of dashboards owned by a user across all projects, used by the
     * offboarding flow when deleting an organization member. The caller must
     * be able to manage dashboards in every project where the user owns any.
     */
    async getUserDashboardsSummary(
        user: SessionUser,
        targetUserUuid: UUID,
    ): Promise<UserDashboardsSummary> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = user;

        // Throws NotFoundError when the user is not an org member
        const targetMember =
            await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                organizationUuid,
                targetUserUuid,
            );

        const summary =
            await this.dashboardModel.getDashboardsSummaryByOwner(
                targetUserUuid,
            );

        const auditedAbility = this.createAuditedAbility(user);
        const accessResults = auditedAbility.canBulk(
            'manage',
            summary.byProject.map((project) =>
                subject('Dashboard', {
                    organizationUuid: targetMember.organizationUuid,
                    projectUuid: project.projectUuid,
                    metadata: {
                        projectUuid: project.projectUuid,
                        projectName: project.projectName,
                    },
                }),
            ),
        );
        const projectsWithoutPermission = summary.byProject
            .filter((_, index) => !accessResults[index])
            .map((project) => project.projectName);

        if (projectsWithoutPermission.length > 0) {
            throw new ForbiddenError(
                `You do not have permission to manage dashboards in: ${projectsWithoutPermission.join(
                    ', ',
                )}`,
            );
        }

        return summary;
    }

    /**
     * Transfers ownership of all dashboards owned by one user to another,
     * used to keep ownership continuity when deleting an organization member.
     */
    async reassignUserDashboards(
        user: SessionUser,
        fromUserUuid: UUID,
        newOwnerUserUuid: UUID,
    ): Promise<{ reassignedCount: number }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = user;

        // Also validates fromUser membership and the caller's per-project access
        const summary = await this.getUserDashboardsSummary(user, fromUserUuid);

        if (summary.totalCount === 0) {
            return { reassignedCount: 0 };
        }

        // Throws NotFoundError when the new owner is not an org member
        await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
            organizationUuid,
            newOwnerUserUuid,
        );

        const reassignedCount = await this.dashboardModel.updateOwnerByUser(
            fromUserUuid,
            newOwnerUserUuid,
            summary.byProject.map((project) => project.projectUuid),
        );

        this.analytics.track({
            event: 'dashboard.ownership_reassigned',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                fromUserUuid,
                newOwnerUserUuid,
                reassignedCount,
            },
        });

        return { reassignedCount };
    }

    async duplicateFromAccount(
        account: Account,
        projectUuid: UUID,
        dashboardUuidOrSlug: UuidOrSlug,
        data: DuplicateDashboardParams,
    ): Promise<Dashboard> {
        const { user, embedWriteActions } = await this.getDashboardWriteContext(
            account,
            projectUuid,
        );
        return this.duplicate(user, projectUuid, dashboardUuidOrSlug, data, {
            targetSpaceUuid: embedWriteActions?.spaceUuid,
            sourceSpaceUuid: embedWriteActions?.spaceUuid,
        });
    }

    async duplicate(
        user: SessionUser,
        projectUuid: UUID,
        dashboardUuidOrSlug: UuidOrSlug,
        data: DuplicateDashboardParams,
        options?: { targetSpaceUuid?: string; sourceSpaceUuid?: string },
    ): Promise<Dashboard> {
        const dashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            { projectUuid },
        );
        if (
            options?.sourceSpaceUuid &&
            dashboardDao.spaceUuid !== options.sourceSpaceUuid
        ) {
            throw new ForbiddenError(
                'Embed token does not allow duplicating dashboards from outside the write space',
            );
        }
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.resolveAccess(user.userUuid, {
                type: 'space',
                spaceUuid: dashboardDao.spaceUuid,
            });
        const dashboard = {
            ...dashboardDao,
            inheritsFromOrgOrProject,
            access,
        };
        const targetSpaceUuid = options?.targetSpaceUuid ?? dashboard.spaceUuid;
        const targetSpaceAccess =
            await this.spacePermissionService.resolveAccess(user.userUuid, {
                type: 'space',
                spaceUuid: targetSpaceUuid,
            });
        if (targetSpaceAccess.projectUuid !== projectUuid) {
            throw new ForbiddenError(
                'Target space does not belong to this project',
            );
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            options?.sourceSpaceUuid &&
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                'Embed token does not allow viewing this dashboard',
            );
        }

        if (
            auditedAbility.cannot(
                'create',
                subject('Dashboard', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid,
                    inheritsFromOrgOrProject:
                        targetSpaceAccess.inheritsFromOrgOrProject,
                    access: targetSpaceAccess.access,
                    metadata: {
                        spaceUuid: targetSpaceUuid,
                        dashboardName: data.dashboardName,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        const newTabsMap = dashboard.tabs.map((tab) => ({
            uuid: tab.uuid,
            newUuid: uuidv4(), // generate new uuid for copied tabs
        }));

        const newTabs: DashboardTab[] = dashboard.tabs.map((tab) => ({
            ...tab,
            uuid: newTabsMap.find((tabMap) => tabMap.uuid === tab.uuid)
                ?.newUuid!,
        }));

        const duplicatedDashboard = {
            ...dashboard,
            tiles: dashboard.tiles.map((tile) => ({
                ...tile,
                tabUuid: newTabsMap.find((tab) => tab.uuid === tile.tabUuid)
                    ?.newUuid!,
            })),
            description: data.dashboardDesc,
            name: data.dashboardName,
            slug: dashboard.slug,
            tabs: newTabs,
        };

        const newDashboard = await this.dashboardModel.create(
            targetSpaceUuid,
            duplicatedDashboard,
            user,
            projectUuid,
        );

        if (hasChartsInDashboard(newDashboard)) {
            const tileUuidMap = new Map<string, string>();

            const updatedTiles = await Promise.all(
                newDashboard.tiles.map(async (tile) => {
                    if (
                        isDashboardChartTileType(tile) &&
                        tile.properties.belongsToDashboard &&
                        tile.properties.savedChartUuid
                    ) {
                        const newChartUuid =
                            await this.duplicateChartForDashboard({
                                chartUuid: tile.properties.savedChartUuid,
                                projectUuid: newDashboard.projectUuid,
                                dashboardUuid: newDashboard.uuid,
                                user,
                            });

                        const newTileUuid = uuidv4();
                        tileUuidMap.set(tile.uuid, newTileUuid);

                        return {
                            ...tile,
                            uuid: newTileUuid,
                            properties: {
                                ...tile.properties,
                                savedChartUuid: newChartUuid,
                            },
                        };
                    }
                    return tile;
                }),
            );

            const remapTileTargets = (
                tileTargets: Record<string, DashboardTileTarget> | undefined,
            ): Record<string, DashboardTileTarget> | undefined => {
                if (!tileTargets) return undefined;
                return Object.fromEntries(
                    Object.entries(tileTargets).map(([key, value]) => [
                        tileUuidMap.get(key) ?? key,
                        value,
                    ]),
                );
            };

            const remappedFilters: typeof newDashboard.filters = {
                dimensions: newDashboard.filters.dimensions.map((filter) => ({
                    ...filter,
                    tileTargets: remapTileTargets(filter.tileTargets),
                })),
                metrics: newDashboard.filters.metrics.map((filter) => ({
                    ...filter,
                    tileTargets: remapTileTargets(filter.tileTargets),
                })),
                tableCalculations: newDashboard.filters.tableCalculations.map(
                    (filter) => ({
                        ...filter,
                        tileTargets: remapTileTargets(filter.tileTargets),
                    }),
                ),
            };

            await this.dashboardModel.addVersion(
                newDashboard.uuid,
                {
                    tiles: [...updatedTiles],
                    filters: remappedFilters,
                    tabs: newTabs,
                },
                user,
                projectUuid,
            );
        }

        const dashboardProperties =
            DashboardService.getCreateEventProperties(newDashboard);
        this.analytics.track({
            event: 'dashboard.created',
            userId: user.userUuid,
            properties: { ...dashboardProperties, duplicated: true },
        });

        this.analytics.track({
            event: 'duplicated_dashboard_created',
            userId: user.userUuid,
            properties: {
                ...dashboardProperties,
                newDashboardId: newDashboard.uuid,
                duplicateOfDashboardId: dashboard.uuid,
            },
        });

        const updatedNewDashboard = await this.dashboardModel.getByIdOrSlug(
            newDashboard.uuid,
        );

        return {
            ...updatedNewDashboard,
            inheritsFromOrgOrProject:
                targetSpaceAccess.inheritsFromOrgOrProject,
            access: targetSpaceAccess.access,
        };
    }

    async updateFromAccount(
        account: Account,
        dashboardUuidOrSlug: UuidOrSlug,
        dashboard: UpdateDashboard,
        options?: { projectUuid?: string },
    ): Promise<Dashboard> {
        const { user, embedWriteActions } = await this.getDashboardWriteContext(
            account,
            options?.projectUuid,
        );
        const existingDashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            {
                projectUuid: options?.projectUuid,
            },
        );
        if (
            embedWriteActions &&
            existingDashboardDao.spaceUuid !== embedWriteActions.spaceUuid
        ) {
            throw new ForbiddenError(
                'Embed token does not allow writing to this dashboard space',
            );
        }

        if (embedWriteActions) {
            if (
                isDashboardUnversionedFields(dashboard) &&
                dashboard.spaceUuid &&
                dashboard.spaceUuid !== embedWriteActions.spaceUuid
            ) {
                throw new ForbiddenError(
                    'Embed token does not allow moving dashboards outside the write space',
                );
            }

            if (isDashboardVersionedFields(dashboard)) {
                await this.assertDashboardTilesBelongToWriteSpace(
                    user,
                    dashboard.tiles,
                    embedWriteActions.spaceUuid,
                    options?.projectUuid ?? existingDashboardDao.projectUuid,
                );
            }
        }

        return this.update(user, dashboardUuidOrSlug, dashboard, options);
    }

    private async canManageContentAsCode(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        const project = await this.projectModel.get(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        return auditedAbility.can(
            'manage',
            subject('ContentAsCode', {
                projectUuid: project.projectUuid,
                organizationUuid: project.organizationUuid,
                upstreamProjectUuid: project.upstreamProjectUuid,
                type: project.type,
                createdByUserUuid: project.createdByUserUuid,
                metadata: { slug: '' },
            }),
        );
    }

    private async assertCanDeleteGitBackedDashboard(
        user: SessionUser,
        dashboard: Pick<DashboardDAO, 'projectUuid' | 'slug'>,
    ): Promise<void> {
        const settings = await this.contentAsCodeProjectSettingsModel.get(
            dashboard.projectUuid,
        );
        if (!settings?.syncEnabled) return;

        const snapshot = await this.contentAsCodeSnapshotModel.get(
            dashboard.projectUuid,
            ContentAsCodeType.DASHBOARD,
            dashboard.slug,
        );
        if (snapshot === undefined) return;
        if (await this.canManageContentAsCode(user, dashboard.projectUuid)) {
            return;
        }

        throw new ForbiddenError(
            'This dashboard is managed by Content as Code and can only be deleted by a Content as Code manager.',
            { contentAsCodeManaged: true },
        );
    }

    private static mergeDraftIntoDashboard<T extends DashboardDAO>(
        dashboard: T,
        draft: unknown,
    ): T {
        assertDashboardDraftOverlay(draft);
        const fields = draft;
        return {
            ...dashboard,
            ...(fields.name !== undefined && { name: fields.name }),
            ...(fields.description !== undefined && {
                description: fields.description,
            }),
            ...(fields.tiles !== undefined && { tiles: fields.tiles }),
            ...(fields.filters !== undefined && { filters: fields.filters }),
            ...(fields.tabs !== undefined && { tabs: fields.tabs }),
            ...(fields.config !== undefined && { config: fields.config }),
            ...(fields.spaceUuid !== undefined && {
                spaceUuid: fields.spaceUuid,
            }),
        };
    }

    // Drafts mode: with content_as_code.sync on, every save of GIT-BACKED
    // content becomes an unpublished draft that only its author sees, for
    // any role; the repo is the only publisher, through a reviewed
    // write-back and an upload. Content never uploaded as code (no
    // last-applied snapshot row) publishes normally — drafts exist to
    // protect the repo contract, not to intercept every save in the project.
    private async maybeStoreDraft(
        user: SessionUser,
        existingDashboardDao: DashboardDAO,
        dashboardFields: object,
    ): Promise<Dashboard | undefined> {
        const base = await this.resolveDraftBase(existingDashboardDao);
        if (base === null) return undefined;
        return this.storeDraft(
            user,
            existingDashboardDao,
            dashboardFields,
            base,
        );
    }

    // The upload snapshot a draft starts from, or null when the save should
    // publish normally
    private async resolveDraftBase(
        existingDashboardDao: Pick<DashboardDAO, 'projectUuid' | 'slug'>,
    ): Promise<ContentDraftBase | null> {
        const settings = await this.contentAsCodeProjectSettingsModel.get(
            existingDashboardDao.projectUuid,
        );
        if (!settings?.syncEnabled) return null;
        const snapshot = await this.contentAsCodeSnapshotModel.get(
            existingDashboardDao.projectUuid,
            ContentAsCodeType.DASHBOARD,
            existingDashboardDao.slug,
        );
        if (snapshot === undefined) return null;
        return { snapshot: snapshot.snapshot, hash: snapshot.snapshotHash };
    }

    private async storeDraft(
        user: SessionUser,
        existingDashboardDao: DashboardDAO,
        dashboardFields: object,
        base: ContentDraftBase,
    ): Promise<Dashboard> {
        DashboardService.mergeDraftIntoDashboard(
            existingDashboardDao,
            dashboardFields,
        );
        const stored = await this.contentDraftModel.upsertOpenDraft({
            projectUuid: existingDashboardDao.projectUuid,
            contentType: 'dashboard',
            contentUuid: existingDashboardDao.uuid,
            slug: existingDashboardDao.slug,
            authorUserUuid: user.userUuid,
            draft: pruneUnchangedDraftFields(
                existingDashboardDao,
                dashboardFields,
            ),
            base,
        });
        const overlaid = DashboardService.mergeDraftIntoDashboard(
            existingDashboardDao,
            stored.draft,
        );
        const space = await this.spacePermissionService.resolveAccess(
            user.userUuid,
            { type: 'space', spaceUuid: overlaid.spaceUuid },
        );
        return {
            ...overlaid,
            inheritsFromOrgOrProject: space.inheritsFromOrgOrProject,
            access: space.access,
            hasUnpublishedChanges: true,
        };
    }

    private async applyOpenDraftOverlay(
        user: SessionUser,
        dashboard: Dashboard,
    ): Promise<Dashboard> {
        try {
            const settings = await this.contentAsCodeProjectSettingsModel.get(
                dashboard.projectUuid,
            );
            if (!settings?.syncEnabled) return dashboard;
            const draft = await this.contentDraftModel.findOpenDraft(
                dashboard.projectUuid,
                'dashboard',
                dashboard.uuid,
                user.userUuid,
            );
            if (draft) {
                try {
                    const overlaid = DashboardService.mergeDraftIntoDashboard(
                        dashboard,
                        draft.draft,
                    );
                    const draftStaleness = await this.getDraftStaleness(
                        dashboard,
                        draft,
                    );
                    return {
                        ...overlaid,
                        hasUnpublishedChanges: true,
                        ...(draftStaleness && { draftStaleness }),
                    };
                } catch (error) {
                    this.logger.warn(
                        'Draft overlay failed; serving published dashboard',
                        {
                            projectUuid: dashboard.projectUuid,
                            dashboardUuid: dashboard.uuid,
                            draftUuid: draft.uuid,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                    );
                    return {
                        ...dashboard,
                        draftOverlayError: {
                            code: 'invalid_dashboard_draft',
                            draftUuid: draft.uuid,
                        },
                    };
                }
            }
            const dismissedDraft =
                await this.contentDraftModel.findLatestDismissedDraft(
                    dashboard.projectUuid,
                    'dashboard',
                    dashboard.uuid,
                    user.userUuid,
                );
            const dashboardForViewer = dismissedDraft
                ? { ...dashboard, dismissedDraftUuid: dismissedDraft.uuid }
                : dashboard;
            // Reviewers get an entry point when others have open drafts here
            if (
                await this.canManageContentAsCode(user, dashboard.projectUuid)
            ) {
                const awaiting =
                    await this.contentDraftModel.countOpenForContent(
                        dashboard.projectUuid,
                        'dashboard',
                        dashboard.uuid,
                        user.userUuid,
                    );
                if (awaiting > 0) {
                    return {
                        ...dashboardForViewer,
                        draftsAwaitingReview: awaiting,
                    };
                }
            }
            return dashboardForViewer;
        } catch (error) {
            this.logger.warn('Draft overlay failed', error);
            return dashboard;
        }
    }

    // The repo moved past the snapshot the draft started from
    private async getDraftStaleness(
        dashboard: Pick<DashboardDAO, 'projectUuid' | 'slug'>,
        draft: ContentDraft,
    ): Promise<ContentDraftStaleness | null> {
        if (!draft.baseSnapshotHash) return null;
        const current = await this.contentAsCodeSnapshotModel.get(
            dashboard.projectUuid,
            ContentAsCodeType.DASHBOARD,
            dashboard.slug,
        );
        if (!current || current.snapshotHash === draft.baseSnapshotHash) {
            return null;
        }
        return computeContentDraftStaleness({
            draftUuid: draft.uuid,
            contentType: 'dashboard',
            base: draft.baseSnapshot,
            current: current.snapshot,
            overlay: draft.draft,
        });
    }

    async update(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        dashboard: UpdateDashboard,
        options?: { projectUuid?: string },
    ): Promise<Dashboard> {
        const existingDashboardDao = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            {
                projectUuid: options?.projectUuid,
            },
        );
        const { preserveVerification, ...dashboardFields } = dashboard;

        const currentSpace = await this.spacePermissionService.resolveAccess(
            user.userUuid,
            {
                type: 'dashboard',
                dashboardUuid: existingDashboardDao.uuid,
                spaceUuid: existingDashboardDao.spaceUuid,
            },
        );
        const auditedAbility = this.createAuditedAbility(user);
        const canUpdateDashboardInCurrentSpace = auditedAbility.can(
            'update',
            subject('Dashboard', {
                ...currentSpace,
                metadata: { dashboardUuid: existingDashboardDao.uuid },
            }),
        );

        if (!canUpdateDashboardInCurrentSpace) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        await this.assertCanMutateVerifiedDashboard({
            user,
            dashboardUuid: existingDashboardDao.uuid,
            projectUuid: existingDashboardDao.projectUuid,
            organizationUuid: existingDashboardDao.organizationUuid,
        });

        const draftResult = await this.maybeStoreDraft(
            user,
            existingDashboardDao,
            dashboardFields,
        );
        if (draftResult) return draftResult;

        const verificationAfterUpdate =
            await this.getVerificationAfterDashboardUpdate({
                user,
                dashboardUuid: existingDashboardDao.uuid,
                projectUuid: existingDashboardDao.projectUuid,
                organizationUuid: existingDashboardDao.organizationUuid,
                preserveVerification,
            });

        if (isDashboardUnversionedFields(dashboardFields)) {
            if (dashboardFields.spaceUuid) {
                const newSpace =
                    await this.spacePermissionService.resolveAccess(
                        user.userUuid,
                        { type: 'space', spaceUuid: dashboardFields.spaceUuid },
                    );
                const canUpdateDashboardInNewSpace = auditedAbility.can(
                    'update',
                    subject('Dashboard', {
                        ...newSpace,
                        metadata: { dashboardUuid: existingDashboardDao.uuid },
                    }),
                );
                if (!canUpdateDashboardInNewSpace) {
                    throw new ForbiddenError(
                        "You don't have access to the space this dashboard is being moved to",
                    );
                }
            }

            if (dashboardFields.colorPaletteUuid) {
                const palette = await this.organizationModel.findColorPalette(
                    existingDashboardDao.organizationUuid,
                    dashboardFields.colorPaletteUuid,
                );
                if (!palette) {
                    throw new ParameterError(
                        'Color palette does not belong to this organization',
                    );
                }
            }

            if (dashboardFields.ownerUserUuid) {
                // Throws NotFoundError when the user is not an org member
                await this.organizationMemberProfileModel.getOrganizationMemberByUuid(
                    existingDashboardDao.organizationUuid,
                    dashboardFields.ownerUserUuid,
                );
            }

            const updatedDashboard = await this.dashboardModel.update(
                existingDashboardDao.uuid,
                {
                    name: dashboardFields.name,
                    description: dashboardFields.description,
                    spaceUuid: dashboardFields.spaceUuid,
                    colorPaletteUuid: dashboardFields.colorPaletteUuid,
                    ownerUserUuid: dashboardFields.ownerUserUuid,
                },
            );

            this.analytics.track({
                event: 'dashboard.updated',
                userId: user.userUuid,
                properties: {
                    dashboardId: updatedDashboard.uuid,
                    projectId: updatedDashboard.projectUuid,
                    tilesCount: updatedDashboard.tiles.length,
                    chartTilesCount: updatedDashboard.tiles.filter(
                        (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
                    ).length,
                    markdownTilesCount: updatedDashboard.tiles.filter(
                        (tile) => tile.type === DashboardTileTypes.MARKDOWN,
                    ).length,
                    loomTilesCount: updatedDashboard.tiles.filter(
                        (tile) => tile.type === DashboardTileTypes.LOOM,
                    ).length,
                    filtersCount:
                        (updatedDashboard.filters?.dimensions?.length ?? 0) +
                        (updatedDashboard.filters?.metrics?.length ?? 0),
                    dimensionFilterCount:
                        updatedDashboard.filters?.dimensions?.length ?? 0,
                    metricFilterCount:
                        updatedDashboard.filters?.metrics?.length ?? 0,
                    lockedFilterCount: [
                        ...(updatedDashboard.filters?.dimensions ?? []),
                        ...(updatedDashboard.filters?.metrics ?? []),
                    ].filter(
                        (filter) => (filter.lockedTabUuids?.length ?? 0) > 0,
                    ).length,
                },
            });
        }

        if (isDashboardVersionedFields(dashboardFields)) {
            const dashboardTileTypes = Array.from(
                new Set(dashboardFields.tiles.map((t) => t.type)),
            );

            // Handle chart duplication for dashboard charts that appear multiple times
            // This happens when duplicating a dashboard tab with charts saved directly to the dashboard
            // We detect duplicates by finding chart UUIDs that appear more than once
            // Step 1: Count occurrences of each chart UUID for dashboard charts
            const chartUuidOccurrences = new Map<string, number>();
            dashboardFields.tiles.forEach((tile) => {
                if (
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.belongsToDashboard &&
                    tile.properties.savedChartUuid
                ) {
                    const chartUuid = tile.properties.savedChartUuid;
                    chartUuidOccurrences.set(
                        chartUuid,
                        (chartUuidOccurrences.get(chartUuid) ?? 0) + 1,
                    );
                }
            });

            // Step 2: Find chart UUIDs that need duplication (appear more than once)
            const chartUuidsToDuplicate = new Set(
                [...chartUuidOccurrences.entries()]
                    .filter(([, count]) => count > 1)
                    .map(([uuid]) => uuid),
            );

            // Step 3: Create duplicated charts for all tiles that need them (except the first occurrence)
            const seenChartUuids = new Set<string>();
            const chartDuplicationPromises: Promise<{
                tileIndex: number;
                newChartUuid: UUID;
            }>[] = [];

            dashboardFields.tiles.forEach((tile, index) => {
                if (
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.belongsToDashboard &&
                    tile.properties.savedChartUuid &&
                    chartUuidsToDuplicate.has(tile.properties.savedChartUuid)
                ) {
                    const chartUuid = tile.properties.savedChartUuid;
                    if (seenChartUuids.has(chartUuid)) {
                        // This is a subsequent occurrence - needs duplication
                        chartDuplicationPromises.push(
                            this.duplicateChartForDashboard({
                                chartUuid,
                                projectUuid: existingDashboardDao.projectUuid,
                                dashboardUuid: existingDashboardDao.uuid,
                                user,
                            }).then((newChartUuid) => ({
                                tileIndex: index,
                                newChartUuid,
                            })),
                        );
                    } else {
                        // First occurrence - keep the original
                        seenChartUuids.add(chartUuid);
                    }
                }
            });

            // Step 4: Wait for all duplications and build the final tiles array
            const duplicatedCharts = await Promise.all(
                chartDuplicationPromises,
            );
            const duplicatedChartsByTileIndex = new Map(
                duplicatedCharts.map((d) => [d.tileIndex, d.newChartUuid]),
            );

            const tilesToSave = dashboardFields.tiles.map((tile, index) => {
                const newChartUuid = duplicatedChartsByTileIndex.get(index);
                if (
                    newChartUuid &&
                    tile.type === DashboardTileTypes.SAVED_CHART
                ) {
                    return {
                        ...tile,
                        properties: {
                            ...tile.properties,
                            savedChartUuid: newChartUuid,
                        },
                    };
                }
                return tile;
            });

            const updatedDashboard = await this.dashboardModel.addVersion(
                existingDashboardDao.uuid,
                {
                    tiles: tilesToSave,
                    filters: dashboardFields.filters,
                    parameters: dashboardFields.parameters,
                    tabs: dashboardFields.tabs || [],
                    config: dashboardFields.config,
                },
                user,
                existingDashboardDao.projectUuid,
            );
            this.analytics.track({
                event: 'dashboard_version.created',
                userId: user.userUuid,
                properties:
                    DashboardService.getCreateEventProperties(updatedDashboard),
            });
            await this.deleteOrphanedChartsInDashboards(
                user,
                existingDashboardDao.projectUuid,
                existingDashboardDao.uuid,
            );
        }

        if (!verificationAfterUpdate) {
            await this.contentVerificationModel.unverify(
                ContentType.DASHBOARD,
                existingDashboardDao.uuid,
            );
        }

        const updatedNewDashboard = await this.dashboardModel.getByIdOrSlug(
            existingDashboardDao.uuid,
        );
        const updatedSpace = await this.spacePermissionService.resolveAccess(
            user.userUuid,
            {
                type: 'dashboard',
                dashboardUuid: updatedNewDashboard.uuid,
                spaceUuid: updatedNewDashboard.spaceUuid,
            },
        );

        return {
            ...updatedNewDashboard,
            inheritsFromOrgOrProject: updatedSpace.inheritsFromOrgOrProject,
            access: updatedSpace.access,
        };
    }

    private async getVerificationAfterDashboardUpdate({
        user,
        dashboardUuid,
        projectUuid,
        organizationUuid,
        preserveVerification,
    }: {
        user: SessionUser;
        dashboardUuid: string;
        projectUuid: string;
        organizationUuid: string;
        preserveVerification?: boolean;
    }): Promise<ContentVerificationInfo | null> {
        const verification = await this.contentVerificationModel.getByContent(
            ContentType.DASHBOARD,
            dashboardUuid,
        );
        if (!verification || preserveVerification === false) return null;

        const auditedAbility = this.createAuditedAbility(user);
        const canManageVerification = auditedAbility.can(
            'manage',
            subject('ContentVerification', {
                organizationUuid,
                projectUuid,
                metadata: { dashboardUuid },
            }),
        );
        const isVerifier = verification.verifiedBy.userUuid === user.userUuid;

        if (canManageVerification || isVerifier) return verification;

        if (preserveVerification === true) {
            throw new ForbiddenError(
                'Only admins or the verifier can preserve dashboard verification',
            );
        }

        return null;
    }

    /**
     * Write-through edit of a dashboard registry custom metric: swaps the
     * registry entry and re-versions every dashboard-owned chart whose
     * snapshot references it, atomically. `dryRun` reports the affected
     * charts without writing (the impact preview).
     */
    async updateCustomMetric(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        payload: UpdateDashboardCustomMetric,
        options?: { projectUuid?: string },
    ): Promise<DashboardCustomMetricUpdateResult> {
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            { projectUuid: options?.projectUuid },
        );

        const currentSpace = await this.spacePermissionService.resolveAccess(
            user.userUuid,
            {
                type: 'dashboard',
                dashboardUuid: dashboard.uuid,
                spaceUuid: dashboard.spaceUuid,
            },
        );
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !auditedAbility.can(
                'update',
                subject('Dashboard', {
                    ...currentSpace,
                    metadata: { dashboardUuid: dashboard.uuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }
        await this.assertCanMutateVerifiedDashboard({
            user,
            dashboardUuid: dashboard.uuid,
            projectUuid: dashboard.projectUuid,
            organizationUuid: dashboard.organizationUuid,
        });

        // The write-through mutates published content and chart versions
        // directly, which the content-as-code draft lifecycle can't represent.
        if ((await this.resolveDraftBase(dashboard)) !== null) {
            throw new ParameterError(
                'Shared metrics cannot be edited on a dashboard managed as code. Publish or discard its draft workflow first.',
            );
        }

        const { metric, dryRun = false } = payload;
        const registry = dashboard.config?.customMetrics ?? [];
        const metricId = getItemId(metric);
        const existingIndex = registry.findIndex(
            (entry) => getItemId(entry) === metricId,
        );
        // Identity is the lookup key, so a rename or table change can never
        // match an entry — chart sorts/filters/config reference the field id.
        if (existingIndex < 0) {
            throw new NotFoundError(
                `Custom metric "${metric.name}" is not in this dashboard's registry. A metric's name and table identify it and cannot be changed`,
            );
        }

        // One query finds the affected charts; full chart data is fetched
        // only for those, since each needs a rewritten version anyway.
        const affectedChartUuids =
            await this.dashboardModel.getDashboardOwnedChartUuidsUsingMetric(
                dashboard.uuid,
                metric.table,
                metric.name,
            );
        const affected = await Promise.all(
            affectedChartUuids.map((chartUuid) =>
                this.savedChartModel.get(chartUuid),
            ),
        );

        const updatedRegistry = [
            ...registry.slice(0, existingIndex),
            metric,
            ...registry.slice(existingIndex + 1),
        ];
        const affectedCharts = affected.map((chart) => ({
            uuid: chart.uuid,
            name: chart.name,
        }));

        if (!dryRun) {
            await this.savedChartModel.transaction(async (tx) => {
                await this.dashboardModel.updateLatestVersionConfig(
                    dashboard.uuid,
                    {
                        isDateZoomDisabled: false,
                        ...dashboard.config,
                        customMetrics: updatedRegistry,
                    },
                    tx,
                );
                await Promise.all(
                    affected.map((chart) =>
                        this.savedChartModel.createVersion(
                            chart.uuid,
                            {
                                ...chart,
                                metricQuery: {
                                    ...chart.metricQuery,
                                    additionalMetrics: (
                                        chart.metricQuery.additionalMetrics ??
                                        []
                                    ).map((chartMetric) =>
                                        getItemId(chartMetric) === metricId
                                            ? metric
                                            : chartMetric,
                                    ),
                                },
                            },
                            user,
                            tx,
                        ),
                    ),
                );
            });
        }

        return { customMetrics: updatedRegistry, affectedCharts, dryRun };
    }

    private async assertCanMutateVerifiedDashboard({
        user,
        dashboardUuid,
        projectUuid,
        organizationUuid,
    }: {
        user: SessionUser;
        dashboardUuid: string;
        projectUuid: string;
        organizationUuid: string;
    }): Promise<void> {
        const verification = await this.contentVerificationModel.getByContent(
            ContentType.DASHBOARD,
            dashboardUuid,
        );
        if (
            !canMutateVerifiedContent(
                this.createAuditedAbility(user),
                { organizationUuid, projectUuid },
                verification,
                user.userUuid,
            )
        ) {
            throw new ForbiddenError(
                'This dashboard is verified. You need permission to edit verified content, or ask an admin to unverify it first.',
            );
        }
    }

    async togglePinning(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
    ): Promise<TogglePinnedItemInfo> {
        const existingDashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.resolveAccess(user.userUuid, {
                type: 'dashboard',
                dashboardUuid: existingDashboardDao.uuid,
                spaceUuid: existingDashboardDao.spaceUuid,
            });
        const existingDashboard = {
            ...existingDashboardDao,
            inheritsFromOrgOrProject,
            access,
        };

        const { projectUuid, organizationUuid, pinnedListUuid, spaceUuid } =
            existingDashboard;
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('PinnedItems', {
                    projectUuid,
                    organizationUuid,
                    metadata: { dashboardUuid: existingDashboard.uuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...existingDashboard,
                    metadata: {
                        dashboardUuid: existingDashboard.uuid,
                        dashboardName: existingDashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        if (pinnedListUuid) {
            await this.pinnedListModel.deleteItem({
                pinnedListUuid,
                dashboardUuid: existingDashboard.uuid,
            });
        } else {
            await this.pinnedListModel.addItem({
                projectUuid,
                dashboardUuid: existingDashboard.uuid,
            });
        }

        const pinnedList = await this.pinnedListModel.getPinnedListAndItems(
            existingDashboard.projectUuid,
        );

        this.analytics.track({
            event: 'pinned_list.updated',
            userId: user.userUuid,
            properties: {
                projectId: existingDashboard.projectUuid,
                organizationId: existingDashboard.organizationUuid,
                location: 'homepage',
                pinnedListId: pinnedList.pinnedListUuid,
                pinnedItems: pinnedList.items,
            },
        });

        return {
            projectUuid,
            spaceUuid,
            pinnedListUuid: pinnedList.pinnedListUuid,
            isPinned: !!pinnedList.items.find(
                (item) => item.dashboardUuid === existingDashboard.uuid,
            ),
        };
    }

    async updateMultiple(
        user: SessionUser,
        projectUuid: UUID,
        dashboards: UpdateMultipleDashboards[],
    ): Promise<Dashboard[]> {
        const auditedAbility = this.createAuditedAbility(user);
        const dashboardContexts = await Promise.all(
            dashboards.map(async (dashboardToUpdate) => {
                const dashboard = await this.dashboardModel.getByIdOrSlug(
                    dashboardToUpdate.uuid,
                );
                const currentSpaceContext =
                    await this.spacePermissionService.resolveAccess(
                        user.userUuid,
                        {
                            type: 'dashboard',
                            dashboardUuid: dashboard.uuid,
                            spaceUuid: dashboard.spaceUuid,
                        },
                    );
                const canUpdateDashboardInCurrentSpace = auditedAbility.can(
                    'update',
                    subject('Dashboard', {
                        ...currentSpaceContext,
                        metadata: { dashboardUuid: dashboard.uuid },
                    }),
                );
                const newSpaceContext =
                    await this.spacePermissionService.resolveAccess(
                        user.userUuid,
                        {
                            type: 'space',
                            spaceUuid: dashboardToUpdate.spaceUuid,
                        },
                    );
                const canUpdateDashboardInNewSpace = auditedAbility.can(
                    'update',
                    subject('Dashboard', {
                        ...newSpaceContext,
                        metadata: { dashboardUuid: dashboardToUpdate.uuid },
                    }),
                );
                return {
                    dashboardToUpdate,
                    dashboard,
                    hasAccess:
                        canUpdateDashboardInCurrentSpace &&
                        canUpdateDashboardInNewSpace,
                };
            }),
        );

        if (dashboardContexts.some(({ hasAccess }) => !hasAccess)) {
            throw new ForbiddenError(
                "You don't have access to some of the dashboards you are trying to update.",
            );
        }

        await Promise.all(
            dashboardContexts.map(async ({ dashboard }) => {
                await this.assertCanMutateVerifiedDashboard({
                    user,
                    dashboardUuid: dashboard.uuid,
                    projectUuid: dashboard.projectUuid,
                    organizationUuid: dashboard.organizationUuid,
                });
            }),
        );

        const draftBases = await Promise.all(
            dashboardContexts.map(({ dashboard }) =>
                this.resolveDraftBase(dashboard),
            ),
        );
        // Draft upserts are idempotent and happen before the transactional
        // published update, so a retry cannot duplicate or partially publish.
        const draftResults = await Promise.all(
            dashboardContexts.map(
                async ({ dashboardToUpdate, dashboard }, index) => {
                    const base = draftBases[index];
                    return base === null
                        ? undefined
                        : this.storeDraft(
                              user,
                              dashboard,
                              dashboardToUpdate,
                              base,
                          );
                },
            ),
        );

        const directUpdates = dashboards.filter(
            (_dashboard, index) => draftBases[index] === null,
        );
        const updatedDashboards =
            directUpdates.length > 0
                ? await this.dashboardModel.updateMultiple(
                      projectUuid,
                      directUpdates,
                  )
                : [];

        const updatedDashboardsWithSpacesAccess = updatedDashboards.map(
            async (dashboard) => {
                const dashboardSpaceContext =
                    await this.spacePermissionService.resolveAccess(
                        user.userUuid,
                        {
                            type: 'dashboard',
                            dashboardUuid: dashboard.uuid,
                            spaceUuid: dashboard.spaceUuid,
                        },
                    );
                return {
                    ...dashboard,
                    inheritsFromOrgOrProject:
                        dashboardSpaceContext.inheritsFromOrgOrProject,
                    access: dashboardSpaceContext.access,
                };
            },
        );

        const directResults = await Promise.all(
            updatedDashboardsWithSpacesAccess,
        );
        const directResultsByUuid = new Map(
            directResults.map((dashboard) => [dashboard.uuid, dashboard]),
        );
        this.analytics.track({
            event: 'dashboard.updated_multiple',
            userId: user.userUuid,
            properties: {
                dashboardIds: dashboards.map((dashboard) => dashboard.uuid),
                projectId: projectUuid,
            },
        });
        return dashboards.map((dashboard, index) => {
            const result =
                draftResults[index] ?? directResultsByUuid.get(dashboard.uuid);
            if (!result) throw new NotFoundError('Dashboard not found');
            return result;
        });
    }

    async delete(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        options?: ContentAsCodeDeleteOptions,
    ): Promise<void> {
        const dashboardToDelete = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            {
                projectUuid: options?.projectUuid,
            },
        );
        const { organizationUuid, projectUuid, spaceUuid, tiles } =
            dashboardToDelete;

        if (!options?.bypassPermissions) {
            const { inheritsFromOrgOrProject, access } =
                await this.spacePermissionService.resolveAccess(user.userUuid, {
                    type: 'dashboard',
                    dashboardUuid: dashboardToDelete.uuid,
                    spaceUuid,
                });
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'delete',
                    subject('Dashboard', {
                        organizationUuid,
                        projectUuid,
                        inheritsFromOrgOrProject,
                        access,
                        metadata: { dashboardUuid: dashboardToDelete.uuid },
                    }),
                )
            ) {
                throw new ForbiddenError(
                    "You don't have access to the space this dashboard belongs to",
                );
            }

            await this.assertCanMutateVerifiedDashboard({
                user,
                dashboardUuid: dashboardToDelete.uuid,
                projectUuid,
                organizationUuid,
            });
        }

        await this.assertCanDeleteGitBackedDashboard(user, dashboardToDelete);

        if (hasChartsInDashboard(dashboardToDelete)) {
            try {
                await Promise.all(
                    tiles.map(async (tile) => {
                        if (
                            isDashboardChartTileType(tile) &&
                            tile.properties.belongsToDashboard &&
                            tile.properties.savedChartUuid
                        ) {
                            const chartInDashboard =
                                await this.savedChartModel.get(
                                    tile.properties.savedChartUuid,
                                );

                            const cachedExplore =
                                await this.projectModel.getExploreFromCache(
                                    projectUuid,
                                    chartInDashboard.tableName,
                                );

                            await this.updateChartFieldUsage(
                                projectUuid,
                                cachedExplore,
                                {
                                    oldChartFields: {
                                        metrics:
                                            chartInDashboard.metricQuery
                                                .metrics,
                                        dimensions:
                                            chartInDashboard.metricQuery
                                                .dimensions,
                                    },
                                    newChartFields: {
                                        metrics: [],
                                        dimensions: [],
                                    },
                                },
                            );
                        }
                    }),
                );
            } catch (error) {
                this.logger.error(
                    `Error updating chart field usage for dashboard ${dashboardToDelete.uuid}`,
                    error,
                );
            }
        }

        const resolvedUuid = dashboardToDelete.uuid;
        if (this.lightdashConfig.softDelete.enabled) {
            await this.softDelete(user, resolvedUuid, {
                bypassPermissions: true, // perms checked above
                contentAsCodePolicyChecked: true,
            });
        } else {
            await this.permanentDelete(user, resolvedUuid, {
                bypassPermissions: true, // perms checked above
                contentAsCodePolicyChecked: true,
            });
        }

        this.analytics.track({
            event: 'dashboard.deleted',
            userId: user.userUuid,
            properties: {
                dashboardId: dashboardToDelete.uuid,
                projectId: dashboardToDelete.projectUuid,
                softDelete: this.lightdashConfig.softDelete.enabled,
            },
        });
    }

    async softDelete(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        options?: ContentAsCodeDeleteOptions,
    ): Promise<void> {
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'delete', {
                type: 'Dashboard',
                metadata: { dashboardUuid: dashboard.uuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
        } else {
            const { inheritsFromOrgOrProject, access } =
                await this.spacePermissionService.resolveAccess(user.userUuid, {
                    type: 'dashboard',
                    dashboardUuid: dashboard.uuid,
                    spaceUuid: dashboard.spaceUuid,
                });
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'delete',
                    subject('Dashboard', {
                        organizationUuid: dashboard.organizationUuid,
                        projectUuid: dashboard.projectUuid,
                        inheritsFromOrgOrProject,
                        access,
                        metadata: { dashboardUuid: dashboard.uuid },
                    }),
                )
            ) {
                throw new ForbiddenError(
                    "You don't have access to the space this dashboard belongs to",
                );
            }

            await this.assertCanMutateVerifiedDashboard({
                user,
                dashboardUuid: dashboard.uuid,
                projectUuid: dashboard.projectUuid,
                organizationUuid: dashboard.organizationUuid,
            });
        }

        if (!options?.contentAsCodePolicyChecked) {
            await this.assertCanDeleteGitBackedDashboard(user, dashboard);
        }

        const deletedDashboard = await this.dashboardModel.softDelete(
            dashboard.uuid,
            user.userUuid,
        );

        await this.schedulerService.softDeleteByDashboardUuid(
            user,
            dashboard.uuid,
            {
                projectUuid: deletedDashboard.projectUuid,
                organizationUuid: deletedDashboard.organizationUuid,
            },
            { bypassPermissions: true }, // dashboard delete authorized above
        );
    }

    async restore(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        options?: SoftDeleteOptions,
    ): Promise<void> {
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            { deleted: true, projectUuid: options?.projectUuid },
        );

        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DeletedContent',
                metadata: { dashboardUuid: dashboard.uuid },
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            });
        } else {
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'manage',
                    subject('DeletedContent', {
                        organizationUuid: dashboard.organizationUuid,
                        projectUuid: dashboard.projectUuid,
                        metadata: { dashboardUuid: dashboard.uuid },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        }

        await this.dashboardModel.restore(dashboard.uuid);

        await this.schedulerService.restoreByDashboardUuid(
            user,
            dashboard.uuid,
            {
                projectUuid: dashboard.projectUuid,
                organizationUuid: dashboard.organizationUuid,
            },
            { bypassPermissions: true }, // dashboard restore authorized above
        );

        this.analytics.track({
            event: 'dashboard.restored',
            userId: user.userUuid,
            properties: {
                dashboardId: dashboard.uuid,
                projectId: dashboard.projectUuid,
            },
        });
    }

    async permanentDelete(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        options?: ContentAsCodeDeleteOptions,
    ): Promise<void> {
        // 'any' so this works whether called directly on a soft-deleted
        // dashboard (restore-then-purge flow) or via `delete()` on a
        // not-yet-deleted dashboard (when softDelete config is off).
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            dashboardUuidOrSlug,
            { deleted: 'any', projectUuid: options?.projectUuid },
        );
        if (options?.bypassPermissions) {
            this.logBypassEvent(user, 'manage', {
                type: 'DeletedContent',
                metadata: { dashboardUuid: dashboard.uuid },
                organizationUuid: user.organizationUuid ?? 'unknown',
            });
        } else {
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'manage',
                    subject('DeletedContent', {
                        organizationUuid: dashboard.organizationUuid,
                        projectUuid: dashboard.projectUuid,
                        metadata: { dashboardUuid: dashboard.uuid },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        }

        if (!options?.contentAsCodePolicyChecked) {
            await this.assertCanDeleteGitBackedDashboard(user, dashboard);
        }

        await this.dashboardModel.permanentDelete(dashboard.uuid);
    }

    async getSchedulers(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        searchQuery?: string,
        paginateArgs?: KnexPaginateArgs,
        includeLatestRun?: boolean,
    ): Promise<KnexPaginatedData<SchedulerAndTargets[]>> {
        const dashboard = await this.checkCreateScheduledDeliveryAccess(
            user,
            dashboardUuidOrSlug,
        );
        const auditedAbility = this.createAuditedAbility(user);
        const canManageAll = auditedAbility.can(
            'manage',
            subject('ScheduledDeliveries', {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            }),
        );
        const schedulers = await this.schedulerModel.getSchedulers({
            projectUuid: dashboard.projectUuid,
            organizationUuid: dashboard.organizationUuid,
            paginateArgs,
            searchQuery,
            filters: {
                resourceType: 'dashboard',
                resourceUuids: [dashboard.uuid],
                ...(canManageAll
                    ? {}
                    : { createdByUserUuids: [user.userUuid] }),
            },
        });

        if (!includeLatestRun) {
            return schedulers;
        }

        return this.schedulerModel.attachLatestRunToSchedulers(schedulers);
    }

    async getSchedulerRuns(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        schedulerUuid: UUID,
        paginateArgs?: KnexPaginateArgs,
        searchQuery?: string,
        sort?: { column: string; direction: 'asc' | 'desc' },
        filters?: {
            statuses?: SchedulerRunStatus[];
            destinations?: string[];
        },
    ): Promise<KnexPaginatedData<SchedulerRun[]>> {
        const scheduler = await this.schedulerModel.getScheduler(schedulerUuid);
        const dashboard =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const auditedAbility = this.createAuditedAbility(user);
        // Authorize before revealing whether the scheduler belongs to this
        // dashboard, so unauthorized callers can't distinguish 404 (wrong
        // dashboard) from 403 (right dashboard, no access).
        if (
            auditedAbility.cannot(
                'manage',
                subject('ScheduledDeliveries', {
                    organizationUuid: dashboard.organizationUuid,
                    projectUuid: dashboard.projectUuid,
                    userUuid: scheduler.createdBy,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        schedulerUuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (scheduler.dashboardUuid !== dashboard.uuid) {
            throw new NotFoundError('Scheduler not found');
        }
        return this.schedulerModel.getProjectSchedulerRuns({
            projectUuid: dashboard.projectUuid,
            paginateArgs,
            searchQuery,
            sort,
            filters: {
                schedulerUuids: [schedulerUuid],
                statuses: filters?.statuses,
                destinations: filters?.destinations,
            },
        });
    }

    async createScheduler(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        newScheduler: CreateSchedulerAndTargetsWithoutIds,
    ): Promise<SchedulerAndTargets> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        if (!isValidFrequency(newScheduler.cron)) {
            throw new ParameterError(
                'Frequency not allowed, custom input is limited to hourly',
            );
        }

        if (!isValidTimezone(newScheduler.timezone)) {
            throw new ParameterError('Timezone string is not valid');
        }

        if (!newScheduler.targets || !Array.isArray(newScheduler.targets)) {
            throw new ParameterError(
                'Targets is required and must be an array',
            );
        }

        const dashboard = await this.checkCreateScheduledDeliveryAccess(
            user,
            dashboardUuidOrSlug,
        );
        const { projectUuid, organizationUuid } = dashboard;

        if (newScheduler.format === SchedulerFormat.GSHEETS) {
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'manage',
                    subject('GoogleSheets', {
                        organizationUuid,
                        projectUuid,
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        }

        const scheduler = await this.schedulerModel.createScheduler({
            ...newScheduler,
            createdBy: user.userUuid,
            dashboardUuid: dashboard.uuid,
            savedChartUuid: null,
            savedSqlUuid: null,
        });
        const createSchedulerData: SchedulerDashboardUpsertEvent = {
            userId: user.userUuid,
            event: 'scheduler.created',
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                schedulerId: scheduler.schedulerUuid,
                ...getSchedulerResourceTypeAndId(scheduler),
                cronExpression: scheduler.cron,
                format: scheduler.format,
                cronString: cronstrue.toString(scheduler.cron, {
                    verbose: true,
                    throwExceptionOnParseError: false,
                }),
                targets:
                    scheduler.format === SchedulerFormat.GSHEETS
                        ? []
                        : scheduler.targets.map(getSchedulerTargetType),
                filtersUpdatedNum:
                    isDashboardScheduler(scheduler) && scheduler.filters
                        ? scheduler.filters.length
                        : 0,
                timeZone: scheduler.timezone,
                includeLinks: scheduler.includeLinks,
                plainTextEmail: scheduler.plainTextEmail,
            },
        };
        this.analytics.track(createSchedulerData);

        await this.slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );

        const { schedulerTimezone: defaultTimezone } =
            await this.projectModel.get(projectUuid);

        await this.schedulerClient.generateDailyJobsForScheduler(
            scheduler,
            {
                organizationUuid,
                projectUuid,
                userUuid: user.userUuid,
            },
            defaultTimezone,
        );
        return scheduler;
    }

    private async checkCreateScheduledDeliveryAccess(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
    ): Promise<Dashboard> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.resolveAccess(user.userUuid, {
                type: 'dashboard',
                dashboardUuid: dashboardDao.uuid,
                spaceUuid: dashboardDao.spaceUuid,
            });
        const dashboard = {
            ...dashboardDao,
            inheritsFromOrgOrProject,
            access,
        };
        const { organizationUuid, projectUuid } = dashboard;
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('ScheduledDeliveries', {
                    organizationUuid,
                    projectUuid,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...dashboard,
                    metadata: {
                        dashboardUuid: dashboard.uuid,
                        dashboardName: dashboard.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to the space this dashboard belongs to",
            );
        }

        return {
            ...dashboard,
        };
    }

    async hasAccess(
        action: AbilityAction,
        actor: {
            user: SessionUser;
            projectUuid: UUID;
        },
        resource: {
            dashboardUuid: UUID;
            spaceUuid?: string;
        },
    ) {
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            resource.dashboardUuid,
        );
        if (dashboard.projectUuid !== actor.projectUuid) {
            throw new NotFoundError('Dashboard not found');
        }
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.resolveAccess(
                actor.user.userUuid,
                {
                    type: 'dashboard',
                    dashboardUuid: dashboard.uuid,
                    spaceUuid: dashboard.spaceUuid,
                },
            );

        const auditedAbility = this.createAuditedAbility(actor.user);
        const isActorAllowedToPerformAction = auditedAbility.can(
            action,
            subject('Dashboard', {
                organizationUuid: actor.user.organizationUuid || '',
                projectUuid: actor.projectUuid,
                inheritsFromOrgOrProject,
                access,
                metadata: { dashboardUuid: dashboard.uuid },
            }),
        );

        if (!isActorAllowedToPerformAction) {
            throw new ForbiddenError(
                `You don't have access to ${action} this dashboard`,
            );
        }

        if (resource.spaceUuid && dashboard.spaceUuid !== resource.spaceUuid) {
            const newSpace = await this.spacePermissionService.resolveAccess(
                actor.user.userUuid,
                { type: 'space', spaceUuid: resource.spaceUuid },
            );

            const isActorAllowedToPerformActionInNewSpace = auditedAbility.can(
                action,
                subject('Dashboard', {
                    organizationUuid: newSpace.organizationUuid,
                    projectUuid: actor.projectUuid,
                    inheritsFromOrgOrProject: newSpace.inheritsFromOrgOrProject,
                    access: newSpace.access,
                    metadata: { dashboardUuid: dashboard.uuid },
                }),
            );

            if (!isActorAllowedToPerformActionInNewSpace) {
                throw new ForbiddenError(
                    `You don't have access to ${action} this dashboard in the new space`,
                );
            }
        }
    }

    async getHistory(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
    ): Promise<DashboardHistory> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.resolveAccess(user.userUuid, {
                type: 'dashboard',
                dashboardUuid: dashboardDao.uuid,
                spaceUuid: dashboardDao.spaceUuid,
            });
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Dashboard', {
                    ...dashboardDao,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        dashboardUuid: dashboardDao.uuid,
                        dashboardName: dashboardDao.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to view the version history of this dashboard",
            );
        }

        const versions = await this.dashboardModel.getLatestVersionSummaries(
            dashboardDao.uuid,
        );

        this.analytics.track({
            event: 'dashboard_history.view',
            userId: user.userUuid,
            properties: {
                projectId: dashboardDao.projectUuid,
                dashboardId: dashboardDao.uuid,
                versionCount: versions.length,
            },
        });

        return { history: versions };
    }

    async getVersion(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        versionUuid: UUID,
    ): Promise<DashboardVersion> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);
        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.resolveAccess(user.userUuid, {
                type: 'dashboard',
                dashboardUuid: dashboardDao.uuid,
                spaceUuid: dashboardDao.spaceUuid,
            });
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Dashboard', {
                    ...dashboardDao,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        dashboardUuid: dashboardDao.uuid,
                        dashboardName: dashboardDao.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to view this dashboard version",
            );
        }

        const [versionSummary, dashboard] = await Promise.all([
            this.dashboardModel.getVersionSummaryByUuid(
                dashboardDao.uuid,
                versionUuid,
            ),
            this.dashboardModel.getVersionByUuid(
                dashboardDao.uuid,
                versionUuid,
            ),
        ]);

        if (!dashboard) {
            throw new NotFoundError('Dashboard version not found');
        }

        // Construct a full dashboard object from the version
        const fullDashboard: Dashboard = {
            ...dashboardDao,
            tiles: dashboard.tiles,
            filters: dashboard.filters,
            parameters: dashboard.parameters,
            tabs: dashboard.tabs,
            config: dashboard.config,
            updatedAt: dashboard.updatedAt,
            updatedByUser: dashboard.updatedByUser,
            inheritsFromOrgOrProject,
            access,
        };

        // Check if this is the current version
        const isCurrentVersion = dashboardDao.versionUuid === versionUuid;

        // Calculate chart version differences only if not the current version
        const chartVersionDifferences: ChartVersionDifference[] = [];

        if (!isCurrentVersion) {
            // Get current tiles with saved charts
            const currentChartTiles = dashboardDao.tiles.filter(
                (tile) =>
                    isDashboardChartTileType(tile) &&
                    tile.properties.savedChartUuid,
            );

            // Get version tiles with dashboard-owned charts (only these are rolled back)
            const versionChartTiles = dashboard.tiles.filter(
                (tile) =>
                    isDashboardChartTileType(tile) &&
                    tile.properties.savedChartUuid &&
                    tile.properties.belongsToDashboard === true,
            );

            // Compare charts that exist in the version
            const versionChartDifferencesPromises = versionChartTiles
                .filter(isDashboardChartTileType)
                .filter((tile) => tile.properties.savedChartUuid)
                .map(async (versionTile) => {
                    const chartUuid = versionTile.properties.savedChartUuid!;
                    const currentTile = currentChartTiles.find(
                        (tile) =>
                            isDashboardChartTileType(tile) &&
                            tile.properties.savedChartUuid === chartUuid,
                    );

                    let currentChartVersion: ChartVersionSummary | null = null;
                    let selectedChartVersion: ChartVersionSummary | null = null;

                    try {
                        // Get the current (latest) chart version
                        currentChartVersion =
                            (await this.savedChartModel.getLatestVersionSummary(
                                chartUuid,
                            )) ?? null;

                        // Get the chart version that was active when the dashboard version was created
                        selectedChartVersion =
                            (await this.savedChartModel.getVersionSummaryAtTimestamp(
                                chartUuid,
                                dashboard.updatedAt,
                            )) ?? null;
                    } catch (error) {
                        // Chart might have been deleted or inaccessible
                        this.logger.debug(
                            `Could not fetch chart versions for ${chartUuid}: ${error}`,
                        );
                    }

                    return {
                        tileUuid: versionTile.uuid,
                        chartUuid,
                        chartName: versionTile.properties.chartName || null,
                        currentVersion: currentChartVersion,
                        selectedVersion: selectedChartVersion,
                    };
                });

            const versionChartDifferences = await Promise.all(
                versionChartDifferencesPromises,
            );
            chartVersionDifferences.push(...versionChartDifferences);
        }

        return {
            ...versionSummary,
            dashboard: fullDashboard,
            chartVersionDifferences,
        };
    }

    async rollback(
        user: SessionUser,
        dashboardUuidOrSlug: UuidOrSlug,
        versionUuid: UUID,
    ): Promise<void> {
        const dashboardDao =
            await this.dashboardModel.getByIdOrSlug(dashboardUuidOrSlug);

        // Check if trying to rollback to current version
        if (dashboardDao.versionUuid === versionUuid) {
            this.logger.info(
                `Ignoring rollback request - version ${versionUuid} is already the current version for dashboard ${dashboardDao.uuid}`,
            );
            return;
        }

        const { inheritsFromOrgOrProject, access } =
            await this.spacePermissionService.resolveAccess(user.userUuid, {
                type: 'dashboard',
                dashboardUuid: dashboardDao.uuid,
                spaceUuid: dashboardDao.spaceUuid,
            });
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Dashboard', {
                    ...dashboardDao,
                    inheritsFromOrgOrProject,
                    access,
                    metadata: {
                        dashboardUuid: dashboardDao.uuid,
                        dashboardName: dashboardDao.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                "You don't have access to rollback this dashboard",
            );
        }

        const targetVersion = await this.dashboardModel.getVersionByUuid(
            dashboardDao.uuid,
            versionUuid,
        );

        if (!targetVersion) {
            throw new NotFoundError('Dashboard version not found');
        }

        // Rollback dashboard and all owned charts in a single transaction
        await this.savedChartModel.transaction(async (tx) => {
            // Rollback dashboard version
            await this.dashboardModel.addVersion(
                dashboardDao.uuid,
                {
                    tiles: targetVersion.tiles,
                    filters: targetVersion.filters,
                    parameters: targetVersion.parameters,
                    tabs: targetVersion.tabs,
                    config: targetVersion.config,
                },
                user,
                dashboardDao.projectUuid,
                tx,
            );

            // Only rollback charts that belong to the dashboard
            const uniqueChartUuids = [
                ...new Set(
                    targetVersion.tiles
                        .filter(
                            (tile) =>
                                isDashboardChartTileType(tile) &&
                                tile.properties.savedChartUuid &&
                                tile.properties.belongsToDashboard === true,
                        )
                        .map((tile) =>
                            isDashboardChartTileType(tile)
                                ? tile.properties.savedChartUuid!
                                : '',
                        )
                        .filter(Boolean),
                ),
            ];

            // Rollback each dashboard-owned chart to its version at the target dashboard version time
            if (uniqueChartUuids.length > 0) {
                this.logger.info(
                    `Rolling back ${uniqueChartUuids.length} dashboard-owned charts`,
                );

                await Promise.all(
                    uniqueChartUuids.map(async (chartUuid) => {
                        const result =
                            await this.savedChartModel.rollbackToVersionAtTimestamp(
                                chartUuid,
                                targetVersion.updatedAt,
                                user,
                                tx,
                            );

                        if (result) {
                            this.logger.info(`Rolled back chart ${chartUuid}`);
                        } else {
                            this.logger.warn(
                                `No chart version found for ${chartUuid} at timestamp ${targetVersion.updatedAt}. Chart may have been created after this dashboard version.`,
                            );
                        }
                    }),
                );
            } else {
                this.logger.info('No dashboard-owned charts to rollback');
            }
        });

        this.analytics.track({
            event: 'dashboard_version.rollback',
            userId: user.userUuid,
            properties: {
                projectId: dashboardDao.projectUuid,
                dashboardId: dashboardDao.uuid,
                versionId: versionUuid,
            },
        });
    }

    async moveToSpace(
        user: SessionUser,
        {
            projectUuid,
            itemUuid: dashboardUuid,
            targetSpaceUuid,
        }: {
            projectUuid: UUID;
            itemUuid: UUID;
            targetSpaceUuid: UUID | null;
        },
        {
            tx,
            checkForAccess = true,
            trackEvent = true,
        }: {
            tx?: Knex;
            checkForAccess?: boolean;
            trackEvent?: boolean;
        } = {},
    ) {
        if (!targetSpaceUuid) {
            throw new ParameterError(
                'You cannot move a dashboard outside of a space',
            );
        }

        if (checkForAccess) {
            await this.hasAccess(
                'update',
                { user, projectUuid },
                { dashboardUuid, spaceUuid: targetSpaceUuid },
            );

            const dashboard =
                await this.dashboardModel.getByIdOrSlug(dashboardUuid);
            await this.assertCanMutateVerifiedDashboard({
                user,
                dashboardUuid: dashboard.uuid,
                projectUuid: dashboard.projectUuid,
                organizationUuid: dashboard.organizationUuid,
            });
        }
        await this.dashboardModel.moveToSpace(
            {
                projectUuid,
                itemUuid: dashboardUuid,
                targetSpaceUuid,
            },
            { tx },
        );

        if (trackEvent) {
            this.analytics.track({
                event: 'dashboard.moved',
                userId: user.userUuid,
                properties: {
                    projectId: projectUuid,
                    dashboardId: dashboardUuid,
                    targetSpaceId: targetSpaceUuid,
                },
            });
        }
    }

    async createDashboardWithCharts(
        account: RegisteredAccount,
        projectUuid: UUID,
        data: CreateDashboardWithCharts,
    ): Promise<Dashboard> {
        const user = toSessionUser(account);
        // 1. Create empty dashboard
        const emptyDashboard: CreateDashboard = {
            name: data.name,
            description: data.description,
            spaceUuid: data.spaceUuid,
            tiles: [],
            tabs: [],
        };

        // Permissions are checked in the create method
        const dashboard = await this.create(user, projectUuid, emptyDashboard);

        try {
            const chartPromises = data.charts.map(
                (chartData: CreateSavedChart) => {
                    const chartDataWithDashboard: CreateSavedChart = {
                        ...chartData,
                        dashboardUuid: dashboard.uuid,
                        spaceUuid: undefined,
                    };

                    return this.savedChartService.create(
                        account,
                        projectUuid,
                        chartDataWithDashboard,
                    );
                },
            );

            const savedCharts = await Promise.all(chartPromises);

            const tiles = createTwoColumnTiles(
                savedCharts,
                dashboard.tabs?.[0]?.uuid,
            );

            const updateFields: DashboardVersionedFields = {
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                tiles,
                tabs: dashboard.tabs || [],
            };

            await this.update(user, dashboard.uuid, updateFields);

            return await this.getByIdOrSlug(user, dashboard.uuid);
        } catch (error) {
            try {
                await this.delete(user, dashboard.uuid);
            } catch (deleteError) {
                this.logger.error(
                    'Failed to cleanup dashboard after creation error',
                    deleteError,
                );
            }
            throw error;
        }
    }
}
