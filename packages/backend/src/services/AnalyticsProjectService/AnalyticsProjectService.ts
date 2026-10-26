import {
    AnalyticsHistoryBackfillStatus,
    AnalyticsProjectStatus,
    ConflictError,
    ContentType,
    EnsureAnalyticsProjectResult,
    ForbiddenError,
    getContentAsCodePathFromLtreePath,
    getLtreePathFromContentAsCodePath,
    isUserWithOrg,
    NotFoundError,
    SessionUser,
} from '@lightdash/common';
import memoize from 'lodash/memoize';
import pLimit from 'p-limit';
import { UsageQueryHistoryBackfill } from '../../analytics/eventStream/UsageQueryHistoryBackfill';
import {
    analyticsContentAsCode,
    analyticsDefaultSpace,
} from '../../analytics/systemExplores/sampleContent';
import type { LightdashConfig } from '../../config/parseConfig';
import { type ContentVerificationModel } from '../../models/ContentVerificationModel';
import { type DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import { type SavedChartModel } from '../../models/SavedChartModel';
import { type SpaceModel } from '../../models/SpaceModel';
import { UsageQueryHistoryModel } from '../../models/UsageQueryHistoryModel';
import { UserModel } from '../../models/UserModel';
import type { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';
import { type CoderService } from '../CoderService/CoderService';
import {
    analyticsExploreNames,
    createAnalyticsExplores,
} from '../ProjectService/analyticsProject/createAnalyticsExplores';
import { ProjectService } from '../ProjectService/ProjectService';

type Dependencies = {
    lightdashConfig: Pick<LightdashConfig, 'usageEvents'>;
    queryHistoryModel: Pick<QueryHistoryModel, 'database'>;
    schedulerClient: Pick<
        SchedulerClient,
        'getUsageHistoryBackfillJob' | 'scheduleUsageHistoryBackfill'
    >;
    coderService: Pick<CoderService, 'upsertChart' | 'upsertDashboard'>;
    contentVerificationModel: Pick<
        ContentVerificationModel,
        'getByContentUuids'
    >;
    dashboardModel: Pick<DashboardModel, 'find' | 'getByIdOrSlug'>;
    savedChartModel: Pick<SavedChartModel, 'get' | 'find'>;
    spaceModel: Pick<SpaceModel, 'get' | 'find'>;
    projectModel: Pick<
        ProjectModel,
        | 'getAllByOrganizationUuid'
        | 'getAnalyticsModelCounts'
        | 'runInAnalyticsProvisioningLock'
        | 'saveExploresToCache'
    >;
    projectService: Pick<
        ProjectService,
        | 'assertAnalyticsProjectAdministration'
        | 'ensureAnalyticsProject'
        | 'delete'
    >;
    userModel: Pick<UserModel, 'invalidateSessionUserCache'>;
};

// Definitions are static for the running release; compile once, not per status request.
const expectedModelCounts = memoize(() =>
    createAnalyticsExplores().map((explore) => ({
        name: explore.name,
        fields: Object.values(explore.tables).reduce(
            (total, table) =>
                total +
                Object.keys(table.dimensions).length +
                Object.keys(table.metrics).length,
            0,
        ),
        hiddenJoins: explore.joinedTables.filter((join) => join.hidden).length,
    })),
);

export class AnalyticsProjectService extends BaseService {
    // Settings checks share one bounded engine per API process; concurrent tabs
    // for the same org share the check rather than starting another export.
    private readonly historyCheckQueue = pLimit(1);

    private readonly historyChecks = new Map<
        string,
        Promise<AnalyticsHistoryBackfillStatus>
    >();

    constructor(private readonly dependencies: Dependencies) {
        super();
    }

    private async authorize(user: SessionUser): Promise<string> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        await this.dependencies.projectService.assertAnalyticsProjectAdministration(
            user,
        );
        return user.organizationUuid;
    }

    private async assertBackfill(user: SessionUser): Promise<string> {
        const org = await this.authorize(user);
        const projects =
            await this.dependencies.projectModel.getAllByOrganizationUuid(org);
        if (
            !projects.some(
                (project) => project.provisioningSource === 'analytics',
            )
        )
            throw new NotFoundError('Analytics project not found');
        if (
            !this.dependencies.lightdashConfig.usageEvents.enabled ||
            !this.dependencies.lightdashConfig.usageEvents.s3
        )
            throw new ConflictError('Usage history storage is not configured');
        return org;
    }

    async getBackfillStatus(
        user: SessionUser,
    ): Promise<AnalyticsHistoryBackfillStatus> {
        const org = await this.assertBackfill(user);
        const job =
            await this.dependencies.schedulerClient.getUsageHistoryBackfillJob(
                org,
            );
        if (job.running)
            return {
                running: true,
                missingQueries: 0,
                existingQueries: 0,
                pendingQueries: 0,
                from: null,
                to: null,
            };
        let check = this.historyChecks.get(org);
        if (!check) {
            check = this.historyCheckQueue(() =>
                new UsageQueryHistoryBackfill(
                    this.dependencies.lightdashConfig.usageEvents.s3!,
                    new UsageQueryHistoryModel(
                        this.dependencies.queryHistoryModel.database,
                    ),
                ).inspect(org),
            ).finally(() => this.historyChecks.delete(org));
            this.historyChecks.set(org, check);
        }
        const status = await check;
        return {
            ...status,
            ...(job.failed && status.missingQueries > 0
                ? {
                      error: 'The previous backfill failed. You can retry safely.',
                  }
                : {}),
        };
    }

    async backfill(user: SessionUser): Promise<void> {
        const org = await this.assertBackfill(user);
        // Eligibility is rechecked in the worker. A direct rerun is always safe.
        await this.dependencies.schedulerClient.scheduleUsageHistoryBackfill({
            organizationUuid: org,
            userUuid: user.userUuid,
            projectUuid: '',
            schedulerUuid: undefined,
        });
    }

    async getStatus(user: SessionUser): Promise<AnalyticsProjectStatus> {
        const organizationUuid = await this.authorize(user);
        const projects =
            await this.dependencies.projectModel.getAllByOrganizationUuid(
                organizationUuid,
            );
        const project = projects.find(
            (candidate) => candidate.provisioningSource === 'analytics',
        );
        if (!project) return { project: null };

        const dashboardSlugs = analyticsContentAsCode.map(
            ({ dashboard }) => dashboard.slug,
        );
        const chartSlugs = analyticsContentAsCode.flatMap(({ charts }) =>
            charts.map(({ slug }) => slug),
        );
        const [models, dashboards, charts] = await Promise.all([
            this.dependencies.projectModel.getAnalyticsModelCounts(
                project.projectUuid,
                analyticsExploreNames,
            ),
            this.dependencies.dashboardModel.find({
                projectUuid: project.projectUuid,
                slugs: dashboardSlugs,
            }),
            this.dependencies.savedChartModel.find({
                projectUuid: project.projectUuid,
                slugs: chartSlugs,
            }),
        ]);
        const verifications =
            await this.dependencies.contentVerificationModel.getByContentUuids(
                ContentType.DASHBOARD,
                dashboards.map(({ uuid }) => uuid),
            );
        // Ignore custom models, dashboards and charts when checking managed content.
        const modelsAreCurrent = expectedModelCounts().every((expected) =>
            models.some(
                (model) =>
                    model.name === expected.name &&
                    model.fields === expected.fields &&
                    model.hiddenJoins === expected.hiddenJoins,
            ),
        );
        return {
            project: {
                projectUuid: project.projectUuid,
                name: project.name,
                slug: project.slug ?? null,
                url: `/projects/${project.slug ?? project.projectUuid}/tables`,
                createdAt: new Date(project.createdAt).toISOString(),
                hasContentUpdates:
                    !modelsAreCurrent ||
                    dashboards.length !== dashboardSlugs.length ||
                    charts.length !== chartSlugs.length ||
                    dashboards.some(({ uuid }) => !verifications.has(uuid)),
            },
        };
    }

    async ensure(user: SessionUser): Promise<EnsureAnalyticsProjectResult> {
        const result =
            await this.dependencies.projectService.ensureAnalyticsProject(user);
        await this.installSampleContent(user);
        if (
            result.created &&
            isUserWithOrg(user) &&
            this.dependencies.lightdashConfig.usageEvents.enabled &&
            this.dependencies.lightdashConfig.usageEvents.s3
        ) {
            try {
                // Provisioning has already queued initial raw-event processing.
                // This uses the same serial queue and fills retained DB gaps next.
                await this.dependencies.schedulerClient.scheduleUsageHistoryBackfill(
                    {
                        organizationUuid: user.organizationUuid,
                        projectUuid: result.projectUuid,
                        userUuid: user.userUuid,
                    },
                );
            } catch {
                // Creation succeeded. Settings still offers a data-derived retry.
                this.logger.error(
                    'Failed to enqueue initial query history backfill',
                    {
                        organizationUuid: user.organizationUuid,
                        projectUuid: result.projectUuid,
                    },
                );
            }
        }
        return result;
    }

    async installSampleContent(user: SessionUser): Promise<void> {
        const organizationUuid = await this.authorize(user);
        await this.dependencies.projectModel.runInAnalyticsProvisioningLock(
            organizationUuid,
            async () => {
                const projects =
                    await this.dependencies.projectModel.getAllByOrganizationUuid(
                        organizationUuid,
                    );
                const project = projects.find(
                    (candidate) => candidate.provisioningSource === 'analytics',
                );
                if (!project)
                    throw new NotFoundError('Analytics project not found');
                // The org lock serializes syncs; interrupted uploads are retryable.
                /* eslint-disable no-await-in-loop */
                for (const { dashboard, charts } of analyticsContentAsCode) {
                    for (const chart of charts) {
                        const existing = await this.dependencies.savedChartModel
                            .get(chart.slug, undefined, {
                                projectUuid: project.projectUuid,
                                deleted: 'any',
                            })
                            .catch((error: unknown) => {
                                if (error instanceof NotFoundError) return null;
                                throw error;
                            });
                        if (
                            existing &&
                            (existing.slug !== chart.slug ||
                                existing.dashboardSlug !== dashboard.slug)
                        ) {
                            throw new ConflictError(
                                `Chart slug ${chart.slug} belongs to content outside its managed dashboard`,
                            );
                        }
                    }
                }
                // Refresh backend-owned models before uploading charts that may
                // reference newly shipped explores, dimensions or metrics.
                await this.dependencies.projectModel.saveExploresToCache(
                    project.projectUuid,
                    createAnalyticsExplores(),
                    true,
                );
                for (const { dashboard, charts } of analyticsContentAsCode) {
                    const [existingDashboard] =
                        await this.dependencies.dashboardModel.find({
                            projectUuid: project.projectUuid,
                            slug: dashboard.slug,
                        });
                    const storedDashboard =
                        existingDashboard ??
                        (await this.dependencies.dashboardModel
                            .getByIdOrSlug(dashboard.slug, {
                                projectUuid: project.projectUuid,
                                deleted: true,
                            })
                            .catch((error: unknown) => {
                                if (error instanceof NotFoundError) return null;
                                throw error;
                            }));
                    // Keep inherited access when syncing or restoring a dashboard.
                    const existingSpace = storedDashboard
                        ? await this.dependencies.spaceModel.get(
                              storedDashboard.spaceUuid,
                          )
                        : undefined;
                    const spaceSlug = existingSpace
                        ? getContentAsCodePathFromLtreePath(existingSpace.path)
                        : dashboard.spaceSlug;
                    const matchingSpaces =
                        await this.dependencies.spaceModel.find({
                            projectUuid: project.projectUuid,
                            path: getLtreePathFromContentAsCodePath(spaceSlug),
                        });
                    if (
                        matchingSpaces.length > 1 ||
                        (existingSpace &&
                            matchingSpaces[0]?.uuid !== existingSpace.uuid)
                    ) {
                        throw new ConflictError(
                            `Cannot safely resolve the space for dashboard ${dashboard.slug}`,
                        );
                    }
                    const options = {
                        spaceNames: {
                            [spaceSlug]:
                                existingSpace?.name ??
                                analyticsDefaultSpace.name,
                        },
                        publicSpaceCreate: true,
                        force: true,
                    };
                    const dashboardContent = { ...dashboard, spaceSlug };
                    // Restore the dashboard before uploading any owned charts.
                    if (!existingDashboard) {
                        await this.dependencies.coderService.upsertDashboard(
                            user,
                            project.projectUuid,
                            dashboard.slug,
                            {
                                ...dashboardContent,
                                verified: false,
                                tiles: [],
                                filters: {
                                    dimensions: [],
                                    metrics: [],
                                    tableCalculations: [],
                                },
                            },
                            options,
                        );
                    }
                    for (const chart of charts) {
                        await this.dependencies.coderService.upsertChart(
                            user,
                            project.projectUuid,
                            chart.slug,
                            { ...chart, spaceSlug },
                            options,
                        );
                    }
                    await this.dependencies.coderService.upsertDashboard(
                        user,
                        project.projectUuid,
                        dashboard.slug,
                        dashboardContent,
                        options,
                    );
                }
                /* eslint-enable no-await-in-loop */
            },
        );
    }

    async delete(user: SessionUser, projectUuid: string): Promise<void> {
        const organizationUuid = await this.authorize(user);
        await this.dependencies.projectModel.runInAnalyticsProvisioningLock(
            organizationUuid,
            async () => {
                const projects =
                    await this.dependencies.projectModel.getAllByOrganizationUuid(
                        organizationUuid,
                    );
                const project = projects.find(
                    (candidate) =>
                        candidate.projectUuid === projectUuid &&
                        candidate.provisioningSource === 'analytics',
                );
                if (!project) {
                    throw new NotFoundError('Analytics project not found');
                }
                await this.dependencies.projectService.delete(
                    project.projectUuid,
                    user,
                );
                this.dependencies.userModel.invalidateSessionUserCache(
                    user.userUuid,
                );
            },
        );
    }
}
