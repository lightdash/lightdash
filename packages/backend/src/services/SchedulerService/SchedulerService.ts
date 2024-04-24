import { subject } from '@casl/ability';
import {
    ChartSummary,
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    DashboardDAO,
    ForbiddenError,
    isChartScheduler,
    isCreateSchedulerSlackTarget,
    isDashboardScheduler,
    isUserWithOrg,
    ParameterError,
    ScheduledJobs,
    Scheduler,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    UpdateSchedulerAndTargetsWithoutId,
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
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { BaseService } from '../BaseService';

type SchedulerServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    schedulerModel: SchedulerModel;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

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

    constructor({
        lightdashConfig,
        analytics,
        schedulerModel,
        dashboardModel,
        savedChartModel,
        spaceModel,
        schedulerClient,
        slackClient,
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
    }

    private async getSchedulerResource(
        scheduler: Scheduler,
    ): Promise<ChartSummary | DashboardDAO> {
        return isChartScheduler(scheduler)
            ? this.savedChartModel.getSummary(scheduler.savedChartUuid)
            : this.dashboardModel.getById(scheduler.dashboardUuid);
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
                await this.dashboardModel.getById(scheduler.dashboardUuid);
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

    async getScheduler(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<SchedulerAndTargets> {
        return this.schedulerModel.getSchedulerAndTargets(schedulerUuid);
    }

    async updateScheduler(
        user: SessionUser,
        schedulerUuid: string,
        updatedScheduler: UpdateSchedulerAndTargetsWithoutId,
    ): Promise<SchedulerAndTargets> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
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
            },
        };
        this.analytics.track(updateSchedulerEventData);
        await this.slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );

        // We only generate jobs if the scheduler is enabled
        if (scheduler.enabled)
            await this.schedulerClient.generateDailyJobsForScheduler(scheduler);

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
            // If the scheduler is enabled, we need to generate the daily jobs
            await this.schedulerClient.generateDailyJobsForScheduler(scheduler);
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
                subject('CsvJobResult', {
                    createdByUserUuid: job.details?.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return job;
    }

    async getSchedulerLogs(user: SessionUser, projectUuid: string) {
        // Only allow editors to view scheduler logs
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const schedulerLogs = await this.schedulerModel.getSchedulerLogs(
            projectUuid,
        );

        this.analytics.track({
            userId: user.userUuid,
            event: 'scheduled_deliveries.dashboard_viewed',
            properties: {
                projectId: projectUuid,
                organizationId: user.organizationUuid,
                numScheduledDeliveries: schedulerLogs.schedulers.length,
            },
        });
        return schedulerLogs;
    }

    async getJobStatus(
        jobId: string,
    ): Promise<Pick<SchedulerLogDb, 'status' | 'details'>> {
        const job = await this.schedulerModel.getJobStatus(jobId);

        return { status: job.status, details: job.details };
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
        if (scheduler.targets.length === 0) {
            throw new ParameterError(
                'You must specify at least 1 destination before sending a scheduled delivery',
            );
        }

        await this.checkViewResource(user, scheduler);

        const slackChannels = scheduler.targets
            .filter(isCreateSchedulerSlackTarget)
            .map((target) => target.channel);
        await this.slackClient.joinChannels(
            user.organizationUuid,
            slackChannels,
        );

        return this.schedulerClient.addScheduledDeliveryJob(
            new Date(),
            scheduler,
            undefined,
        );
    }
}
