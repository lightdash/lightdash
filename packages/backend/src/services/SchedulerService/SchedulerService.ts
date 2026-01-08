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
    GoogleSheetsTransientError,
    InvalidUser,
    isChartCreateScheduler,
    isChartScheduler,
    isCreateSchedulerSlackTarget,
    isDashboardCreateScheduler,
    isDashboardScheduler,
    isSchedulerGsheetsOptions,
    isUserWithOrg,
    isValidFrequency,
    isValidTimezone,
    JobStatusType,
    KnexPaginateArgs,
    KnexPaginatedData,
    MissingConfigError,
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
    SchedulerTaskName,
    SchedulerWithLogs,
    SessionUser,
    UnexpectedGoogleSheetsError,
    UpdateSchedulerAndTargetsWithoutId,
    UserSchedulersSummary,
    type Account,
} from '@lightdash/common';
import cronstrue from 'cronstrue';
import {
    LightdashAnalytics,
    SchedulerDashboardUpsertEvent,
    SchedulerUpsertEvent,
} from '../../analytics/LightdashAnalytics';
import { GoogleDriveClient } from '../../clients/Google/GoogleDriveClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { LightdashConfig } from '../../config/parseConfig';
import {
    getSchedulerTargetType,
    SchedulerLogDb,
} from '../../database/entities/scheduler';
import { CaslAuditWrapper } from '../../logging/caslAuditWrapper';
import { logAuditEvent } from '../../logging/winston';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserModel } from '../../models/UserModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { getAdjustedCronByOffset } from '../../utils/cronUtils';
import { BaseService } from '../BaseService';
import { UserService } from '../UserService';

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
    userModel: UserModel;
    googleDriveClient: GoogleDriveClient;
    userService: UserService;
    jobModel: JobModel;
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

    userModel: UserModel;

    googleDriveClient: GoogleDriveClient;

    userService: UserService;

    jobModel: JobModel;

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
        userModel,
        googleDriveClient,
        userService,
        jobModel,
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
        this.userModel = userModel;
        this.googleDriveClient = googleDriveClient;
        this.userService = userService;
        this.jobModel = jobModel;
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
        // admins can manage all scheduled deliveries,
        // everyone below can only manage their own scheduled deliveries
        const scheduler = await this.schedulerModel.getScheduler(schedulerUuid);
        const resource = await this.getSchedulerResource(scheduler);
        const { organizationUuid, projectUuid } = resource;

        const canManageDeliveries = user.ability.can(
            'manage',
            subject('ScheduledDeliveries', {
                organizationUuid,
                projectUuid,
                userUuid: scheduler.createdBy,
            }),
        );

        if (!canManageDeliveries) {
            throw new ForbiddenError();
        }

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

        if (
            !updatedScheduler.targets ||
            !Array.isArray(updatedScheduler.targets)
        ) {
            throw new ParameterError(
                'Targets is required and must be an array',
            );
        }

        // Validate Google Sheets file if format is GSHEETS
        if (updatedScheduler.format === SchedulerFormat.GSHEETS) {
            if (!isSchedulerGsheetsOptions(updatedScheduler.options)) {
                throw new ParameterError(
                    'Google Sheets format requires valid gsheets options',
                );
            }

            try {
                const refreshToken = await this.userService.getRefreshToken(
                    user.userUuid,
                );
                await this.googleDriveClient.assertFileIsGoogleSheet(
                    refreshToken,
                    updatedScheduler.options.gdriveId,
                );
            } catch (error) {
                if (error instanceof UnexpectedGoogleSheetsError) {
                    throw error; // Already has clear user-facing message
                }
                if (error instanceof GoogleSheetsTransientError) {
                    throw error; // Allow transient errors to propagate for retry
                }
                throw new MissingConfigError(
                    'Unable to validate Google Sheets file. Please ensure you have connected your Google account.',
                );
            }
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

    async reassignSchedulerOwner(
        user: SessionUser,
        projectUuid: string,
        schedulerUuids: string[],
        newOwnerUserUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        if (schedulerUuids.length === 0) {
            throw new ParameterError('At least one scheduler UUID is required');
        }

        // Get project to validate it exists and get organizationUuid
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const { organizationUuid } = projectSummary;

        // Validate all schedulers belong to the project
        const schedulers = await this.schedulerModel.getSchedulersByUuid(
            projectUuid,
            schedulerUuids,
        );

        if (schedulers.length !== schedulerUuids.length) {
            const foundUuids = new Set(schedulers.map((s) => s.schedulerUuid));
            const missingUuids = schedulerUuids.filter(
                (uuid) => !foundUuids.has(uuid),
            );
            throw new NotFoundError(
                `Schedulers not found or not in project: ${missingUuids.join(
                    ', ',
                )}`,
            );
        }

        // Check user has manage:ScheduledDeliveries permission for each scheduler
        // Admins can manage all schedulers, editors can only manage their own
        for (const scheduler of schedulers) {
            if (
                user.ability.cannot(
                    'manage',
                    subject('ScheduledDeliveries', {
                        organizationUuid,
                        projectUuid,
                        userUuid: scheduler.createdBy,
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
        }

        // Validate new owner exists, is a member of the organization, and can create scheduled deliveries
        let newOwner: SessionUser | undefined;

        try {
            newOwner = await this.userModel.findSessionUserAndOrgByUuid(
                newOwnerUserUuid,
                organizationUuid,
            );
        } catch (error) {
            // `findSessionUserAndOrgByUuid` throws invalid user, we convert it here to NotFoundError - related issue: https://github.com/lightdash/lightdash/issues/11603
            if (error instanceof InvalidUser) {
                throw new NotFoundError(
                    'New owner not found or not a member of the organization',
                );
            }

            throw error;
        }

        if (!newOwner) {
            throw new NotFoundError(
                'New owner not found or not a member of the organization',
            );
        }

        if (
            newOwner.ability.cannot(
                'create',
                subject('ScheduledDeliveries', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'New owner does not have permission to create scheduled deliveries',
            );
        }

        // Check if any schedulers are GSHEETS format - new owner must have Google refresh token
        const hasGsheetsSchedulers = schedulers.some(
            (s) => s.format === SchedulerFormat.GSHEETS,
        );
        if (hasGsheetsSchedulers) {
            try {
                await this.userModel.getRefreshToken(newOwnerUserUuid);
            } catch (error) {
                if (error instanceof NotFoundError) {
                    throw new ForbiddenError(
                        'New owner must have an active Google connection to take ownership of Google Sheets scheduled deliveries',
                    );
                }
                throw error;
            }
        }

        // Update ownership
        await this.schedulerModel.updateOwner(schedulerUuids, newOwnerUserUuid);

        // Fetch and return updated schedulers with targets
        const updatedSchedulers = await this.schedulerModel.getSchedulersByUuid(
            projectUuid,
            schedulerUuids,
        );

        // Track analytics event
        this.analytics.track({
            userId: user.userUuid,
            event: 'scheduler.ownership_reassigned',
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                schedulerUuids,
                newOwnerUserUuid,
            },
        });

        return updatedSchedulers;
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
            throw new NotFoundError(
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

    /**
     * Get a summary of schedulers owned by a user.
     * Used to show scheduler count when deleting a user.
     * Only returns projects where the calling user can view scheduled deliveries.
     */
    async getUserSchedulersSummary(
        user: SessionUser,
        targetUserUuid: string,
    ): Promise<UserSchedulersSummary> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const { organizationUuid } = user;

        // Validate target user exists and is in the same organization
        try {
            await this.userModel.findSessionUserAndOrgByUuid(
                targetUserUuid,
                organizationUuid,
            );
        } catch (error) {
            if (error instanceof InvalidUser) {
                throw new NotFoundError(
                    'User not found or not a member of the organization',
                );
            }
            throw error;
        }

        const summary = await this.schedulerModel.getSchedulersSummaryByOwner(
            targetUserUuid,
        );

        // Check user can manage scheduled deliveries in all projects
        const projectsWithoutPermission = summary.byProject
            .filter((project) =>
                user.ability.cannot(
                    'manage',
                    subject('ScheduledDeliveries', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                ),
            )
            .map((project) => project.projectName);

        if (projectsWithoutPermission.length > 0) {
            throw new ForbiddenError(
                `You do not have permission to view scheduled deliveries in: ${projectsWithoutPermission.join(
                    ', ',
                )}`,
            );
        }

        return summary;
    }

    /**
     * Reassign all schedulers from one user to another.
     * Used when deleting a user to transfer their schedulers.
     */
    async reassignUserSchedulers(
        user: SessionUser,
        fromUserUuid: string,
        newOwnerUserUuid: string,
    ): Promise<{ reassignedCount: number }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const { organizationUuid } = user;

        // Validate fromUser exists and is in the same organization
        try {
            await this.userModel.findSessionUserAndOrgByUuid(
                fromUserUuid,
                organizationUuid,
            );
        } catch (error) {
            if (error instanceof InvalidUser) {
                throw new NotFoundError(
                    'User not found or not a member of the organization',
                );
            }
            throw error;
        }

        // Get scheduler summary to find which projects have schedulers
        const summary = await this.schedulerModel.getSchedulersSummaryByOwner(
            fromUserUuid,
        );

        if (summary.totalCount === 0) {
            return { reassignedCount: 0 };
        }

        // Check calling user has manage:ScheduledDeliveries permission on ALL projects
        const projectsUserCannotManage: string[] = [];
        for (const project of summary.byProject) {
            if (
                user.ability.cannot(
                    'manage',
                    subject('ScheduledDeliveries', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectsUserCannotManage.push(project.projectName);
            }
        }

        if (projectsUserCannotManage.length > 0) {
            throw new ForbiddenError(
                `You do not have permission to manage scheduled deliveries in: ${projectsUserCannotManage.join(
                    ', ',
                )}`,
            );
        }

        // Validate new owner exists and is a member of the organization
        let newOwner: SessionUser | undefined;
        try {
            newOwner = await this.userModel.findSessionUserAndOrgByUuid(
                newOwnerUserUuid,
                organizationUuid,
            );
        } catch (error) {
            if (error instanceof InvalidUser) {
                // `findSessionUserAndOrgByUuid` throws invalid user, we convert it here to NotFoundError - related issue: https://github.com/lightdash/lightdash/issues/11603
                throw new NotFoundError(
                    'New owner not found or not a member of the organization',
                );
            }
            throw error;
        }

        if (!newOwner) {
            throw new NotFoundError(
                'New owner not found or not a member of the organization',
            );
        }

        // Validate new owner has create:ScheduledDeliveries permission in ALL projects
        const projectsWithoutPermission: string[] = [];
        for (const project of summary.byProject) {
            if (
                newOwner.ability.cannot(
                    'create',
                    subject('ScheduledDeliveries', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectsWithoutPermission.push(project.projectName);
            }
        }

        if (projectsWithoutPermission.length > 0) {
            throw new ForbiddenError(
                `New owner does not have permission to create scheduled deliveries in: ${projectsWithoutPermission.join(
                    ', ',
                )}`,
            );
        }

        // Check if user has any GSHEETS schedulers - new owner must have Google refresh token
        if (summary.hasGsheetsSchedulers) {
            try {
                await this.userModel.getRefreshToken(newOwnerUserUuid);
            } catch (error) {
                if (error instanceof NotFoundError) {
                    throw new ForbiddenError(
                        'New owner must have an active Google connection to take ownership of Google Sheets scheduled deliveries',
                    );
                }
                throw error;
            }
        }

        // Update ownership - only for projects where permissions were validated
        const validatedProjectUuids = summary.byProject.map(
            (p) => p.projectUuid,
        );

        // Update ownership
        const reassignedCount = await this.schedulerModel.updateOwnerByUser(
            fromUserUuid,
            newOwnerUserUuid,
            validatedProjectUuids,
        );

        // Track analytics event
        this.analytics.track({
            userId: user.userUuid,
            event: 'scheduler.user_ownership_reassigned',
            properties: {
                organizationId: organizationUuid,
                fromUserUuid,
                newOwnerUserUuid,
                reassignedCount,
                projectCount: summary.byProject.length,
            },
        });

        return { reassignedCount };
    }

    async checkForStuckJobs(): Promise<{
        runningCount: number;
        warningCount: number;
        errorCount: number;
    }> {
        this.logger.info('Starting check for stuck jobs');

        const runningJobs = await this.schedulerClient.getRecentRunningJobs();

        const now = new Date();
        const THIRTY_MINUTES_MS = 30 * 60 * 1000;
        const ONE_HOUR_MS = 60 * 60 * 1000;
        const ONE_MINUTE_MS = 60 * 1000;

        // Categorize jobs by duration
        const jobsToLog: Array<{
            job: typeof runningJobs[number];
            durationMinutes: number;
        }> = [];
        let warningCount = 0;

        runningJobs.forEach((job) => {
            const durationMs = now.getTime() - job.lockedAt.getTime();
            const durationMinutes = Math.round(durationMs / ONE_MINUTE_MS);

            const logContext = {
                jobId: job.id,
                taskIdentifier: job.taskIdentifier,
                lockedAt: job.lockedAt.toISOString(),
                durationMinutes,
            };

            if (durationMs >= ONE_HOUR_MS) {
                // Over 1 hour: log error and schedule for DB logging
                this.logger.error(
                    `Stuck job detected (over 1 hour): ${job.taskIdentifier} (job ${job.id}) running for ${durationMinutes} min`,
                    logContext,
                );
                jobsToLog.push({ job, durationMinutes });
            } else if (durationMs >= THIRTY_MINUTES_MS) {
                // Over 30 minutes: log warning only
                warningCount += 1;
                this.logger.warn(
                    `Potentially stuck job (over 30 min): ${job.taskIdentifier} (job ${job.id}) running for ${durationMinutes} min`,
                    logContext,
                );
            }
        });

        // Log all error jobs to DB in parallel
        await Promise.all(
            jobsToLog.map(({ job, durationMinutes }) =>
                this.schedulerModel.logSchedulerJob({
                    task: job.taskIdentifier as SchedulerTaskName,
                    schedulerUuid: job.payload.schedulerUuid as
                        | string
                        | undefined,
                    jobId: job.id,
                    scheduledTime: job.runAt,
                    status: SchedulerJobStatus.ERROR,
                    details: {
                        error: 'This job took longer than expected and was stopped after 1 hour—please try again. If the issue persists, contact support.',
                        lockedAt: job.lockedAt.toISOString(),
                        lockedBy: job.lockedBy,
                        projectUuid: job.payload.projectUuid as
                            | string
                            | undefined,
                        organizationUuid: job.payload.organizationUuid as
                            | string
                            | undefined,
                        createdByUserUuid: job.payload.userUuid as
                            | string
                            | undefined,
                    },
                }),
            ),
        );

        // Update Lightdash job status to ERROR for compile project jobs
        await Promise.all(
            jobsToLog.map(({ job }) =>
                this.jobModel.update(job.payload.jobUuid as string, {
                    jobStatus: JobStatusType.ERROR,
                }),
            ),
        );

        // Remove stuck jobs from graphile queue to prevent indefinite running
        if (jobsToLog.length > 0) {
            const jobIdsToFail = jobsToLog.map(({ job }) => job.id);
            await this.schedulerClient.failJobs(jobIdsToFail);
            this.logger.info(
                `Removed ${jobIdsToFail.length} stuck jobs from queue`,
                { jobIds: jobIdsToFail },
            );
        }

        const errorCount = jobsToLog.length;

        this.logger.info(
            `Completed stuck job check: ${runningJobs.length} running, ${warningCount} warnings (30-60 min), ${errorCount} errors (>1 hour)`,
        );

        return { runningCount: runningJobs.length, warningCount, errorCount };
    }
}
