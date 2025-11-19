import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    ChartSummary,
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    DashboardDAO,
    ForbiddenError,
    getTimezoneLabel,
    getTzMinutesOffset,
    isChartCreateScheduler,
    isChartScheduler,
    isCreateSchedulerSlackTarget,
    isDashboardCreateScheduler,
    isDashboardScheduler,
    isUserWithOrg,
    isValidFrequency,
    isValidTimezone,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotExistsError,
    NotFoundError,
    ParameterError,
    ScheduledJobs,
    Scheduler,
    SchedulerAndTargets,
    SchedulerCronUpdate,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerRun,
    SchedulerRunLogsResponse,
    SchedulerRunStatus,
    SchedulerWithLogs,
    SessionUser,
    UpdateSchedulerAndTargetsWithoutId,
    type Account,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import {
    LightdashAnalytics,
    SchedulerDashboardUpsertEvent,
    SchedulerUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../config/parseConfig';
import {
    getSchedulerTargetType,
    SchedulerLogDb,
} from '../../database/entities/scheduler';
import { CaslAuditWrapper } from '../../logging/caslAuditWrapper';
import { logAuditEvent } from '../../logging/winston';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { getAdjustedCronByOffset } from '../../utils/cronUtils';
import { BaseService } from '../BaseService';

type SchedulerServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    schedulerModel: SchedulerModel;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
};

export class SchedulerService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    schedulerModel: SchedulerModel;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    schedulerClient: SchedulerClient;

    slackClient: SlackClient;

    projectModel: ProjectModel;

    constructor({
        lightdashConfig,
        analytics,
        schedulerModel,
        dashboardModel,
        savedChartModel,
        spaceModel,
        schedulerClient,
        slackClient,
        projectModel,
    }: SchedulerServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.schedulerModel = schedulerModel;
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
        this.schedulerClient = schedulerClient;
        this.slackClient = slackClient;
        this.projectModel = projectModel;
    }

    private async getSchedulerResource(
        scheduler: Scheduler,
    ): Promise<ChartSummary | DashboardDAO> {
        return isChartScheduler(scheduler)
            ? this.savedChartModel.getSummary(scheduler.savedChartUuid)
            : this.dashboardModel.getByIdOrSlug(scheduler.dashboardUuid);
    }

    public async getCreateSchedulerResource(
        scheduler: CreateSchedulerAndTargets,
    ): Promise<ChartSummary | DashboardDAO> {
        if (isChartCreateScheduler(scheduler)) {
            return this.savedChartModel.getSummary(scheduler.savedChartUuid);
        }
        if (isDashboardCreateScheduler(scheduler)) {
            return this.dashboardModel.getByIdOrSlug(scheduler.dashboardUuid);
        }
        throw new ParameterError('Invalid scheduler type');
    }

    private async checkUserCanUpdateSchedulerResource(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<{
        scheduler: Scheduler;
        resource: ChartSummary | DashboardDAO;
    }> {
        // editors can "manage" scheduled deliveries,
        // which means they can edit scheduled deliveries created from other users, even admins
        // however, interactive users can only "create" scheduled deliveries,
        // which means they can only edit their own scheduled deliveries
        const scheduler = await this.schedulerModel.getScheduler(schedulerUuid);
        const resource = await this.getSchedulerResource(scheduler);
        const { organizationUuid, projectUuid } = resource;

        const canManageDeliveries = user.ability.can(
            'manage',
            subject('ScheduledDeliveries', {
                organizationUuid,
                projectUuid,
            }),
        );
        const canCreateDeliveries = user.ability.can(
            'create',
            subject('ScheduledDeliveries', {
                organizationUuid,
                projectUuid,
            }),
        );

        const canManageGoogleSheets = user.ability.can(
            'manage',
            subject('GoogleSheets', {
                organizationUuid,
                projectUuid,
            }),
        );

        if (
            !canManageGoogleSheets &&
            scheduler.format === SchedulerFormat.GSHEETS
        ) {
            throw new ForbiddenError();
        }

        const isDeliveryOwner = scheduler.createdBy === user.userUuid;

        if (canManageDeliveries || (canCreateDeliveries && isDeliveryOwner)) {
            return { scheduler, resource };
        }

        throw new ForbiddenError();
    }

    private async checkViewResource(
        user: SessionUser,
        scheduler: CreateSchedulerAndTargets,
    ) {
        if (scheduler.savedChartUuid) {
            const { organizationUuid, spaceUuid, projectUuid } =
                await this.savedChartModel.getSummary(scheduler.savedChartUuid);

            const [space] = await this.spaceModel.find({ spaceUuid });
            const access = await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                spaceUuid,
            );
            if (
                user.ability.cannot(
                    'view',
                    subject('SavedChart', {
                        organizationUuid,
                        projectUuid,
                        isPrivate: space.isPrivate,
                        access,
                    }),
                )
            )
                throw new ForbiddenError();
        } else if (scheduler.dashboardUuid) {
            const { organizationUuid, spaceUuid, projectUuid } =
                await this.dashboardModel.getByIdOrSlug(
                    scheduler.dashboardUuid,
                );
            const [space] = await this.spaceModel.find({ spaceUuid });
            const spaceAccess = await this.spaceModel.getUserSpaceAccess(
                user.userUuid,
                spaceUuid,
            );

            if (
                user.ability.cannot(
                    'view',
                    subject('Dashboard', {
                        organizationUuid,
                        projectUuid,
                        isPrivate: space.isPrivate,
                        access: spaceAccess,
                    }),
                )
            )
                throw new ForbiddenError();
        } else {
            throw new ParameterError(
                'Missing savedChartUuid and dashboardUuid on scheduler',
            );
        }
    }

    async getAllSchedulers(): Promise<SchedulerAndTargets[]> {
        return this.schedulerModel.getAllSchedulers();
    }

    async getSchedulers(
        user: SessionUser,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
        searchQuery?: string,
        sort?: { column: string; direction: 'asc' | 'desc' },
        filters?: {
            createdByUserUuids?: string[];
            formats?: string[];
            resourceType?: 'chart' | 'dashboard';
            resourceUuids?: string[];
            destinations?: string[];
        },
        includeLatestRun?: boolean,
    ): Promise<KnexPaginatedData<SchedulerAndTargets[]>> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        // Only allow editors to view all schedulers
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const schedulers = await this.schedulerModel.getSchedulers({
            projectUuid,
            paginateArgs,
            searchQuery,
            sort,
            filters,
        });

        if (!includeLatestRun) {
            return schedulers;
        }

        const schedulerUuids = schedulers.data.map(
            (scheduler) => scheduler.schedulerUuid,
        );

        if (schedulerUuids.length === 0) {
            return schedulers;
        }

        const runs = await this.schedulerModel.getSchedulerRuns({
            projectUuid,
            sort: { column: 'scheduledTime', direction: 'desc' },
            filters: {
                schedulerUuids,
            },
        });

        const latestRunByScheduler = new Map<string, SchedulerRun>();
        runs.data.forEach((run) => {
            if (!latestRunByScheduler.has(run.schedulerUuid)) {
                latestRunByScheduler.set(run.schedulerUuid, run);
            }
        });

        return {
            ...schedulers,
            data: schedulers.data.map((scheduler) => ({
                ...scheduler,
                latestRun:
                    latestRunByScheduler.get(scheduler.schedulerUuid) ?? null,
            })),
        };
    }

    async getScheduler(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<SchedulerAndTargets> {
        return this.schedulerModel.getSchedulerAndTargets(schedulerUuid);
    }

    async getSchedulerDefaultTimezone(schedulerUuid: string | undefined) {
        if (!schedulerUuid) return 'UTC'; // When it is sendNow there is not schedulerUuid

        const scheduler = await this.schedulerModel.getSchedulerAndTargets(
            schedulerUuid,
        );
        const { projectUuid } = await this.getSchedulerResource(scheduler);
        const project = await this.projectModel.get(projectUuid);
        return project.schedulerTimezone;
    }

    async updateScheduler(
        user: SessionUser,
        schedulerUuid: string,
        updatedScheduler: UpdateSchedulerAndTargetsWithoutId,
    ): Promise<SchedulerAndTargets> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        if (!isValidFrequency(updatedScheduler.cron)) {
            throw new ParameterError(
                'Frequency not allowed, custom input is limited to hourly',
            );
        }

        if (!isValidTimezone(updatedScheduler.timezone)) {
            throw new ParameterError('Timezone string is not valid');
        }

        const {
            resource: { organizationUuid, projectUuid },
        } = await this.checkUserCanUpdateSchedulerResource(user, schedulerUuid);

        await this.schedulerClient.deleteScheduledJobs(schedulerUuid);
        await this.schedulerModel.deleteScheduledLogs(schedulerUuid);

        const scheduler = await this.schedulerModel.updateScheduler({
            ...updatedScheduler,
            schedulerUuid,
        });
        const updateSchedulerEventData:
            | SchedulerUpsertEvent
            | SchedulerDashboardUpsertEvent = {
            userId: user.userUuid,
            event: 'scheduler.updated',
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                schedulerId: scheduler.schedulerUuid,
                resourceType: isChartScheduler(scheduler)
                    ? 'chart'
                    : 'dashboard',
                cronExpression: scheduler.cron,
                format: scheduler.format,
                cronString: cronstrue.toString(scheduler.cron, {
                    verbose: true,
                    throwExceptionOnParseError: false,
                }),
                resourceId: isChartScheduler(scheduler)
                    ? scheduler.savedChartUuid
                    : scheduler.dashboardUuid,
                targets:
                    scheduler.format === SchedulerFormat.GSHEETS
                        ? []
                        : scheduler.targets.map(getSchedulerTargetType),
                ...(isDashboardScheduler(scheduler) && {
                    filtersUpdatedNum: scheduler.filters
                        ? scheduler.filters.length
                        : 0,
                }),
                timeZone: getTimezoneLabel(scheduler.timezone),
                includeLinks: scheduler.includeLinks !== false,
            },
        };
        this.analytics.track(updateSchedulerEventData);
        await this.slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );

        // We only generate jobs if the scheduler is enabled
        if (scheduler.enabled) {
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
        }

        return scheduler;
    }

    async setSchedulerEnabled(
        user: SessionUser,
        schedulerUuid: string,
        enabled: boolean,
    ): Promise<SchedulerAndTargets> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        await this.checkUserCanUpdateSchedulerResource(user, schedulerUuid);

        // Remove scheduled jobs, even if the scheduler is not enabled
        await this.schedulerClient.deleteScheduledJobs(schedulerUuid);
        await this.schedulerModel.deleteScheduledLogs(schedulerUuid);

        const scheduler = await this.schedulerModel.setSchedulerEnabled(
            schedulerUuid,
            enabled,
        );

        if (enabled) {
            const defaultTimezone = await this.getSchedulerDefaultTimezone(
                schedulerUuid,
            );
            const { organizationUuid, projectUuid } =
                await this.getCreateSchedulerResource(scheduler);

            // If the scheduler is enabled, we need to generate the daily jobs
            await this.schedulerClient.generateDailyJobsForScheduler(
                scheduler,
                {
                    organizationUuid,
                    projectUuid,
                    userUuid: scheduler.createdBy,
                },
                defaultTimezone,
            );
        }

        return scheduler;
    }

    async deleteScheduler(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<void> {
        const {
            scheduler,
            resource: { organizationUuid, projectUuid },
        } = await this.checkUserCanUpdateSchedulerResource(user, schedulerUuid);
        await this.schedulerClient.deleteScheduledJobs(schedulerUuid);
        await this.schedulerModel.deleteScheduler(schedulerUuid);
        await this.schedulerModel.deleteScheduledLogs(schedulerUuid);

        this.analytics.track({
            userId: user.userUuid,
            event: 'scheduler.deleted',
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                schedulerId: scheduler.schedulerUuid,
                resourceType: isChartScheduler(scheduler)
                    ? 'chart'
                    : 'dashboard',
                resourceId: isChartScheduler(scheduler)
                    ? scheduler.savedChartUuid
                    : scheduler.dashboardUuid,
            },
        });
    }

    async getScheduledJobs(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<ScheduledJobs[]> {
        await this.checkUserCanUpdateSchedulerResource(user, schedulerUuid);
        return this.schedulerClient.getScheduledJobs(schedulerUuid);
    }

    async logSchedulerJob(log: CreateSchedulerLog): Promise<void> {
        await this.schedulerModel.logSchedulerJob(log);
    }

    async getCsvUrl(user: SessionUser, jobId: string) {
        const job = await this.schedulerModel.getCsvUrl(jobId, user.userUuid);
        if (
            user.ability.cannot(
                'view',
                subject('JobStatus', {
                    projectUuid: job.details?.projectUuid,
                    organizationUuid: job.details?.organizationUuid,
                    createdByUserUuid: job.details?.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (job.status === 'error') {
            throw new NotExistsError(
                job.details?.error ?? 'Unable to download CSV',
            );
        }
        return job;
    }

    async getSchedulerLogs(
        user: SessionUser,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
        searchQuery?: string,
        filters?: {
            statuses?: SchedulerJobStatus[];
            createdByUserUuids?: string[];
            destinations?: string[];
        },
    ): Promise<KnexPaginatedData<SchedulerWithLogs>> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        // Only allow editors to view scheduler logs
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const schedulerLogs = await this.schedulerModel.getSchedulerLogs({
            projectUuid,
            paginateArgs,
            searchQuery,
            filters,
        });

        this.analytics.track({
            userId: user.userUuid,
            event: 'scheduled_deliveries.dashboard_viewed',
            properties: {
                projectId: projectUuid,
                organizationId: user.organizationUuid,
                numScheduledDeliveries: schedulerLogs.data.schedulers.length,
            },
        });
        return schedulerLogs;
    }

    async getJobStatus(
        account: Account,
        jobId: string,
    ): Promise<Pick<SchedulerLogDb, 'status' | 'details'>> {
        assertIsAccountWithOrg(account);
        const job = await this.schedulerModel.getJobStatus(jobId);
        if (
            account.user.ability.cannot(
                'view',
                subject('JobStatus', {
                    organizationUuid: job.details?.organizationUuid,
                    projectUuid: job.details?.projectUuid,
                    createdByUserUuid: job.details?.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { status: job.status, details: job.details };
    }

    async setJobStatus(
        jobId: string,
        status: SchedulerJobStatus,
    ): Promise<void> {
        await this.schedulerModel.setJobStatus(jobId, status);
    }

    async sendScheduler(
        user: SessionUser,
        scheduler: CreateSchedulerAndTargets,
    ) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (!scheduler.name) {
            throw new ParameterError(
                'You must give a name to this scheduled delivery',
            );
        }
        if (
            scheduler.targets.length === 0 &&
            scheduler.format !== SchedulerFormat.GSHEETS
        ) {
            throw new ParameterError(
                'You must specify at least 1 destination before sending a scheduled delivery',
            );
        }
        if (!isValidTimezone(scheduler.timezone)) {
            throw new ParameterError('Timezone string is not valid');
        }

        await this.checkViewResource(user, scheduler);

        const slackChannels = scheduler.targets
            .filter(isCreateSchedulerSlackTarget)
            .map((target) => target.channel);
        await this.slackClient.joinChannels(
            user.organizationUuid,
            slackChannels,
        );

        const { organizationUuid, projectUuid } =
            await this.getCreateSchedulerResource(scheduler);

        return this.schedulerClient.addScheduledDeliveryJob(
            new Date(),
            {
                ...scheduler,
                organizationUuid,
                projectUuid,
                userUuid: user.userUuid,
            },
            undefined,
        );
    }

    async sendSchedulerByUuid(user: SessionUser, schedulerUuid: string) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const {
            scheduler,
            resource: { organizationUuid, projectUuid },
        } = await this.checkUserCanUpdateSchedulerResource(user, schedulerUuid);

        return this.schedulerClient.addScheduledDeliveryJob(
            new Date(),
            {
                ...scheduler,
                organizationUuid,
                projectUuid,
                userUuid: user.userUuid,
                schedulerUuid,
            },
            schedulerUuid,
        );
    }

    async updateSchedulersWithDefaultTimezone(
        user: SessionUser,
        projectUuid: string,
        {
            oldDefaultProjectTimezone,
            newDefaultProjectTimezone,
        }: {
            oldDefaultProjectTimezone: string;
            newDefaultProjectTimezone: string;
        },
    ) {
        const schedulers = await this.schedulerModel.getSchedulerForProject(
            projectUuid,
        );

        const schedulerUpdatePromises = schedulers.reduce<
            Promise<SchedulerCronUpdate>[]
        >((acc, s) => {
            // Only calculate updates for schedulers using project default timezone
            if (s.timezone) {
                return acc;
            }

            const schedulerUpdates = async () => {
                await this.checkUserCanUpdateSchedulerResource(
                    user,
                    s.schedulerUuid,
                );

                const tzOffsetMin = getTzMinutesOffset(
                    oldDefaultProjectTimezone,
                    newDefaultProjectTimezone,
                );

                const adjustedcron = getAdjustedCronByOffset(
                    s.cron,
                    tzOffsetMin,
                );

                return {
                    schedulerUuid: s.schedulerUuid,
                    cron: adjustedcron,
                };
            };

            acc.push(schedulerUpdates());

            return acc;
        }, []);

        const schedulerUpdates = await Promise.all(schedulerUpdatePromises);

        await this.schedulerModel.bulkUpdateSchedulersCron(schedulerUpdates);
    }

    async getSchedulerRuns(
        user: SessionUser,
        projectUuid: string,
        paginateArgs?: KnexPaginateArgs,
        searchQuery?: string,
        sort?: { column: string; direction: 'asc' | 'desc' },
        filters?: {
            schedulerUuids?: string[];
            statuses?: SchedulerRunStatus[];
            createdByUserUuids?: string[];
            destinations?: string[];
            resourceType?: 'chart' | 'dashboard';
            resourceUuids?: string[];
        },
    ): Promise<KnexPaginatedData<SchedulerRun[]>> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);

        const auditedAbility = new CaslAuditWrapper(user.ability, user, {
            auditLogger: logAuditEvent,
        });

        // Only allow editors to view scheduler runs
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const schedulerRuns = await this.schedulerModel.getSchedulerRuns({
            projectUuid,
            paginateArgs,
            searchQuery,
            sort,
            filters,
        });

        this.analytics.track({
            userId: user.userUuid,
            event: 'scheduled_delivery_runs.viewed',
            properties: {
                projectId: projectUuid,
                organizationId: user.organizationUuid,
                numRuns: schedulerRuns.data.length,
            },
        });

        return schedulerRuns;
    }

    async getRunLogs(
        user: SessionUser,
        runId: string,
    ): Promise<SchedulerRunLogsResponse> {
        // Fetch the run logs
        const runLogs = await this.schedulerModel.getRunLogs(runId);

        // Get project details for authorization check
        const scheduler = await this.schedulerModel.getScheduler(
            runLogs.schedulerUuid,
        );

        // Determine projectUuid based on resource type
        let projectUuid: string;
        if (scheduler.savedChartUuid) {
            try {
                const chart = await this.savedChartModel.get(
                    scheduler.savedChartUuid,
                );
                projectUuid = chart.projectUuid;
            } catch (error) {
                throw new NotFoundError(
                    'Chart referenced by scheduler no longer exists',
                );
            }
        } else if (scheduler.dashboardUuid) {
            try {
                const dashboard = await this.dashboardModel.getByIdOrSlug(
                    scheduler.dashboardUuid,
                );
                projectUuid = dashboard.projectUuid;
            } catch (error) {
                throw new NotFoundError(
                    'Dashboard referenced by scheduler no longer exists',
                );
            }
        } else {
            throw new NotFoundError('Scheduler resource not found');
        }

        const projectSummary = await this.projectModel.getSummary(projectUuid);

        const auditedAbility = new CaslAuditWrapper(user.ability, user, {
            auditLogger: logAuditEvent,
        });

        // Only allow editors to view run logs
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                    uuid: projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        this.analytics.track({
            userId: user.userUuid,
            event: 'scheduled_delivery_run_logs.viewed',
            properties: {
                runId,
                schedulerUuid: runLogs.schedulerUuid,
                organizationId: user.organizationUuid,
                projectId: projectUuid,
                numLogs: runLogs.logs.length,
            },
        });

        return runLogs;
    }
}
