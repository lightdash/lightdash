import { subject } from '@casl/ability';
import {
    ChartSummary,
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    Dashboard,
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
import { analytics } from '../../analytics/client';
import {
    SchedulerDashboardUpsertEvent,
    SchedulerUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { schedulerClient, slackClient } from '../../clients/clients';
import { LightdashConfig } from '../../config/parseConfig';
import {
    getSchedulerTargetType,
    SchedulerLogDb,
} from '../../database/entities/scheduler';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { hasSpaceAccess } from '../SpaceService/SpaceService';

type ServiceDependencies = {
    lightdashConfig: LightdashConfig;
    schedulerModel: SchedulerModel;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;
};

export class SchedulerService {
    lightdashConfig: LightdashConfig;

    schedulerModel: SchedulerModel;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    spaceModel: SpaceModel;

    constructor({
        lightdashConfig,
        schedulerModel,
        dashboardModel,
        savedChartModel,
        spaceModel,
    }: ServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.schedulerModel = schedulerModel;
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
        this.spaceModel = spaceModel;
    }

    private async getSchedulerResource(
        scheduler: Scheduler,
    ): Promise<ChartSummary | Dashboard> {
        return isChartScheduler(scheduler)
            ? this.savedChartModel.getSummary(scheduler.savedChartUuid)
            : this.dashboardModel.getById(scheduler.dashboardUuid);
    }

    private async checkUserCanUpdateSchedulerResource(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<{ scheduler: Scheduler; resource: ChartSummary | Dashboard }> {
        const scheduler = await this.schedulerModel.getScheduler(schedulerUuid);
        const resource = await this.getSchedulerResource(scheduler);
        const { organizationUuid, projectUuid } = resource;
        if (
            isChartScheduler(scheduler) &&
            user.ability.cannot(
                'update',
                subject('SavedChart', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        } else if (
            user.ability.cannot(
                'update',
                subject('Dashboard', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { scheduler, resource };
    }

    private async checkViewResource(
        user: SessionUser,
        scheduler: CreateSchedulerAndTargets,
    ) {
        if (scheduler.savedChartUuid) {
            const { organizationUuid, spaceUuid, projectUuid } =
                await this.savedChartModel.getSummary(scheduler.savedChartUuid);

            const [space] = await this.spaceModel.find({ spaceUuid });
            if (
                user.ability.cannot(
                    'view',
                    subject('SavedChart', { organizationUuid, projectUuid }),
                ) ||
                !hasSpaceAccess(user, space)
            )
                throw new ForbiddenError();
        } else if (scheduler.dashboardUuid) {
            const { organizationUuid, spaceUuid, projectUuid } =
                await this.dashboardModel.getById(scheduler.dashboardUuid);
            const [space] = await this.spaceModel.find({ spaceUuid });

            if (
                user.ability.cannot(
                    'view',
                    subject('Dashboard', { organizationUuid, projectUuid }),
                ) ||
                !hasSpaceAccess(user, space)
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

        await schedulerClient.deleteScheduledJobs(schedulerUuid);
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
        analytics.track(updateSchedulerEventData);
        await slackClient.joinChannels(
            user.organizationUuid,
            SchedulerModel.getSlackChannels(scheduler.targets),
        );

        await schedulerClient.generateDailyJobsForScheduler(scheduler);

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
        await schedulerClient.deleteScheduledJobs(schedulerUuid);
        await this.schedulerModel.deleteScheduler(schedulerUuid);
        await this.schedulerModel.deleteScheduledLogs(schedulerUuid);

        analytics.track({
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
        return schedulerClient.getScheduledJobs(schedulerUuid);
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

        analytics.track({
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
        await slackClient.joinChannels(user.organizationUuid, slackChannels);

        return schedulerClient.addScheduledDeliveryJob(
            new Date(),
            scheduler,
            undefined,
        );
    }
}
