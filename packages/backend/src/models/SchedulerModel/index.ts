import {
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    isChartScheduler,
    isCreateSchedulerSlackTarget,
    isDashboardScheduler,
    isSlackTarget,
    isUpdateSchedulerEmailTarget,
    isUpdateSchedulerSlackTarget,
    NotFoundError,
    Scheduler,
    SchedulerAndTargets,
    SchedulerEmailTarget,
    SchedulerJobStatus,
    SchedulerLog,
    SchedulerSlackTarget,
    SchedulerWithLogs,
    UpdateSchedulerAndTargets,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardsTableName } from '../../database/entities/dashboards';
import { ProjectTableName } from '../../database/entities/projects';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import {
    SchedulerDb,
    SchedulerEmailTargetDb,
    SchedulerEmailTargetTableName,
    SchedulerLogDb,
    SchedulerLogTableName,
    SchedulerSlackTargetDb,
    SchedulerSlackTargetTableName,
    SchedulerTableName,
} from '../../database/entities/scheduler';
import { SpaceTableName } from '../../database/entities/spaces';
import { UserTableName } from '../../database/entities/users';

type SchedulerModelArguments = {
    database: Knex;
};

const statusOrder = [
    SchedulerJobStatus.ERROR,
    SchedulerJobStatus.COMPLETED,
    SchedulerJobStatus.STARTED,
    SchedulerJobStatus.SCHEDULED,
].map((s) => s.toString());

export class SchedulerModel {
    private database: Knex;

    constructor(args: SchedulerModelArguments) {
        this.database = args.database;
    }

    static convertScheduler(scheduler: SchedulerDb): Scheduler {
        return {
            schedulerUuid: scheduler.scheduler_uuid,
            name: scheduler.name,
            message: scheduler.message,
            createdAt: scheduler.created_at,
            updatedAt: scheduler.updated_at,
            createdBy: scheduler.created_by,
            cron: scheduler.cron,
            savedChartUuid: scheduler.saved_chart_uuid,
            dashboardUuid: scheduler.dashboard_uuid,
            format: scheduler.format,
            options: scheduler.options,
            filters: scheduler.filters,
            customViewportWidth: scheduler.custom_viewport_width,
            thresholds: scheduler.thresholds || undefined,
            enabled: scheduler.enabled,
            notificationFrequency: scheduler.notification_frequency,
            selectedTabs: scheduler.selected_tabs,
        } as Scheduler;
    }

    static convertSlackTarget(
        scheduler: SchedulerSlackTargetDb,
    ): SchedulerSlackTarget {
        return {
            schedulerSlackTargetUuid: scheduler.scheduler_slack_target_uuid,
            createdAt: scheduler.created_at,
            updatedAt: scheduler.updated_at,
            schedulerUuid: scheduler.scheduler_uuid,
            channel: scheduler.channel,
        };
    }

    static convertEmailTarget(
        scheduler: SchedulerEmailTargetDb,
    ): SchedulerEmailTarget {
        return {
            schedulerEmailTargetUuid: scheduler.scheduler_email_target_uuid,
            createdAt: scheduler.created_at,
            updatedAt: scheduler.updated_at,
            schedulerUuid: scheduler.scheduler_uuid,
            recipient: scheduler.recipient,
        };
    }

    static getSlackChannels(
        targets: (SchedulerSlackTarget | SchedulerEmailTarget)[],
    ): string[] {
        return targets.reduce<string[]>((acc, target) => {
            if (isSlackTarget(target)) {
                return [...acc, target.channel];
            }
            return acc;
        }, []);
    }

    private async getSchedulersWithTargets(
        schedulers: SchedulerDb[],
    ): Promise<SchedulerAndTargets[]> {
        const slackTargets = await this.database(SchedulerSlackTargetTableName)
            .select()
            .whereIn(
                `${SchedulerSlackTargetTableName}.scheduler_uuid`,
                schedulers.map((s) => s.scheduler_uuid),
            );
        const emailTargets = await this.database(SchedulerEmailTargetTableName)
            .select()
            .whereIn(
                `${SchedulerEmailTargetTableName}.scheduler_uuid`,
                schedulers.map((s) => s.scheduler_uuid),
            );
        const targets = [
            ...slackTargets.map(SchedulerModel.convertSlackTarget),
            ...emailTargets.map(SchedulerModel.convertEmailTarget),
        ];

        return schedulers.map((scheduler) => ({
            ...SchedulerModel.convertScheduler(scheduler),
            targets: targets.filter(
                (target) => target.schedulerUuid === scheduler.scheduler_uuid,
            ),
        }));
    }

    async getAllSchedulers(): Promise<SchedulerAndTargets[]> {
        const schedulers = this.database(SchedulerTableName).select();
        return this.getSchedulersWithTargets(await schedulers);
    }

    async getChartSchedulers(
        savedChartUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        const schedulers = this.database(SchedulerTableName)
            .select()
            .where(`${SchedulerTableName}.saved_chart_uuid`, savedChartUuid)
            .orderBy([
                {
                    column: 'name',
                    order: 'asc',
                },
                {
                    column: 'created_at',
                    order: 'asc',
                },
            ]);
        return this.getSchedulersWithTargets(await schedulers);
    }

    async getDashboardSchedulers(
        dashboardUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        const schedulers = this.database(SchedulerTableName)
            .select()
            .where(`${SchedulerTableName}.dashboard_uuid`, dashboardUuid)
            .orderBy([
                {
                    column: 'name',
                    order: 'asc',
                },
                {
                    column: 'created_at',
                    order: 'asc',
                },
            ]);
        return this.getSchedulersWithTargets(await schedulers);
    }

    async getScheduler(schedulerUuid: string): Promise<Scheduler> {
        const [scheduler] = await this.database(SchedulerTableName)
            .select()
            .where(`${SchedulerTableName}.scheduler_uuid`, schedulerUuid);
        if (!scheduler) {
            throw new NotFoundError('Scheduler not found');
        }
        return SchedulerModel.convertScheduler(scheduler);
    }

    async getSchedulerAndTargets(
        schedulerUuid: string,
    ): Promise<SchedulerAndTargets> {
        const [scheduler] = await this.database(SchedulerTableName)
            .select()
            .where(`${SchedulerTableName}.scheduler_uuid`, schedulerUuid);
        if (!scheduler) {
            throw new NotFoundError('Scheduler not found');
        }
        const slackTargets = await this.database(SchedulerSlackTargetTableName)
            .select()
            .where(
                `${SchedulerSlackTargetTableName}.scheduler_uuid`,
                schedulerUuid,
            );
        const emailTargets = await this.database(SchedulerEmailTargetTableName)
            .select()
            .where(
                `${SchedulerEmailTargetTableName}.scheduler_uuid`,
                schedulerUuid,
            );

        const targets = [
            ...slackTargets.map(SchedulerModel.convertSlackTarget),
            ...emailTargets.map(SchedulerModel.convertEmailTarget),
        ];

        return {
            ...SchedulerModel.convertScheduler(scheduler),
            targets,
        };
    }

    async createScheduler(
        newScheduler: CreateSchedulerAndTargets,
    ): Promise<SchedulerAndTargets> {
        const schedulerUuid = await this.database.transaction(async (trx) => {
            const [scheduler] = await trx(SchedulerTableName)
                .insert({
                    name: newScheduler.name,
                    message: newScheduler.message,
                    format: newScheduler.format,
                    created_by: newScheduler.createdBy,
                    cron: newScheduler.cron,
                    saved_chart_uuid: newScheduler.savedChartUuid,
                    dashboard_uuid: newScheduler.dashboardUuid,
                    updated_at: new Date(),
                    options: newScheduler.options,
                    filters:
                        isDashboardScheduler(newScheduler) &&
                        newScheduler.filters
                            ? JSON.stringify(newScheduler.filters)
                            : null,
                    custom_viewport_width:
                        isDashboardScheduler(newScheduler) &&
                        newScheduler.customViewportWidth
                            ? newScheduler.customViewportWidth
                            : null,
                    thresholds: newScheduler.thresholds
                        ? JSON.stringify(newScheduler.thresholds)
                        : null,
                    enabled: true,
                    notification_frequency:
                        newScheduler.notificationFrequency || null,
                    selected_tabs:
                        isDashboardScheduler(newScheduler) &&
                        newScheduler.selectedTabs
                            ? JSON.stringify(newScheduler.selectedTabs)
                            : null,
                })
                .returning('*');
            const targetPromises = newScheduler.targets.map(async (target) => {
                if (isCreateSchedulerSlackTarget(target)) {
                    return trx(SchedulerSlackTargetTableName).insert({
                        scheduler_uuid: scheduler.scheduler_uuid,
                        channel: target.channel,
                        updated_at: new Date(),
                    });
                }

                return trx(SchedulerEmailTargetTableName).insert({
                    scheduler_uuid: scheduler.scheduler_uuid,
                    recipient: target.recipient,
                    updated_at: new Date(),
                });
            });

            await Promise.all(targetPromises);
            return scheduler.scheduler_uuid;
        });
        return this.getSchedulerAndTargets(schedulerUuid);
    }

    async setSchedulerEnabled(
        schedulerUuid: string,
        enabled: boolean,
    ): Promise<SchedulerAndTargets> {
        await this.database(SchedulerTableName)
            .update({
                enabled,
                updated_at: new Date(),
            })
            .where('scheduler_uuid', schedulerUuid);

        return this.getSchedulerAndTargets(schedulerUuid);
    }

    async updateScheduler(
        scheduler: UpdateSchedulerAndTargets,
    ): Promise<SchedulerAndTargets> {
        await this.database.transaction(async (trx) => {
            await trx(SchedulerTableName)
                .update({
                    name: scheduler.name,
                    message: scheduler.message,
                    format: scheduler.format,
                    cron: scheduler.cron,
                    updated_at: new Date(),
                    options: scheduler.options,
                    filters:
                        'filters' in scheduler && scheduler.filters
                            ? JSON.stringify(scheduler.filters)
                            : null,
                    custom_viewport_width:
                        'customViewportWidth' in scheduler &&
                        scheduler.customViewportWidth
                            ? scheduler.customViewportWidth
                            : null,
                    thresholds: scheduler.thresholds
                        ? JSON.stringify(scheduler.thresholds)
                        : null,
                    notification_frequency:
                        scheduler.notificationFrequency || null,
                    selected_tabs:
                        'selectedTabs' in scheduler && scheduler.selectedTabs
                            ? JSON.stringify(scheduler.selectedTabs)
                            : null,
                })
                .where('scheduler_uuid', scheduler.schedulerUuid);

            const slackTargetsToUpdate = scheduler.targets.reduce<string[]>(
                (acc, target) =>
                    isUpdateSchedulerSlackTarget(target)
                        ? [...acc, target.schedulerSlackTargetUuid]
                        : acc,
                [],
            );
            await trx(SchedulerSlackTargetTableName)
                .delete()
                .where('scheduler_uuid', scheduler.schedulerUuid)
                .andWhere(
                    'scheduler_slack_target_uuid',
                    'not in',
                    slackTargetsToUpdate,
                );

            const emailTargetsToUpdate = scheduler.targets.reduce<string[]>(
                (acc, target) =>
                    isUpdateSchedulerEmailTarget(target)
                        ? [...acc, target.schedulerEmailTargetUuid]
                        : acc,
                [],
            );

            await trx(SchedulerEmailTargetTableName)
                .delete()
                .where('scheduler_uuid', scheduler.schedulerUuid)
                .andWhere(
                    'scheduler_email_target_uuid',
                    'not in',
                    emailTargetsToUpdate,
                );

            const targetPromises = scheduler.targets.map(async (target) => {
                // Update existing targets
                if (isUpdateSchedulerSlackTarget(target)) {
                    return trx(SchedulerSlackTargetTableName)
                        .update({
                            channel: target.channel,
                            updated_at: new Date(),
                        })
                        .where(
                            'scheduler_slack_target_uuid',
                            target.schedulerSlackTargetUuid,
                        )
                        .andWhere('scheduler_uuid', scheduler.schedulerUuid);
                }
                if (isUpdateSchedulerEmailTarget(target)) {
                    return trx(SchedulerEmailTargetTableName)
                        .update({
                            recipient: target.recipient,
                            updated_at: new Date(),
                        })
                        .where(
                            'scheduler_email_target_uuid',
                            target.schedulerEmailTargetUuid,
                        )
                        .andWhere('scheduler_uuid', scheduler.schedulerUuid);
                }
                // Create new targets
                if (isCreateSchedulerSlackTarget(target)) {
                    return trx(SchedulerSlackTargetTableName).insert({
                        scheduler_uuid: scheduler.schedulerUuid,
                        channel: target.channel,
                        updated_at: new Date(),
                    });
                }

                return trx(SchedulerEmailTargetTableName).insert({
                    scheduler_uuid: scheduler.schedulerUuid,
                    recipient: target.recipient,
                    updated_at: new Date(),
                });
            });

            await Promise.all(targetPromises);
        });
        return this.getSchedulerAndTargets(scheduler.schedulerUuid);
    }

    async deleteScheduler(schedulerUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(SchedulerTableName)
                .delete()
                .where('scheduler_uuid', schedulerUuid);
            await trx(SchedulerSlackTargetTableName)
                .delete()
                .where('scheduler_uuid', schedulerUuid);
            await trx(SchedulerEmailTargetTableName)
                .delete()
                .where('scheduler_uuid', schedulerUuid);
        });
    }

    static parseSchedulerLog(logDb: SchedulerLogDb): SchedulerLog {
        return {
            task: logDb.task as SchedulerLog['task'],
            scheduledTime: logDb.scheduled_time,
            createdAt: logDb.created_at,
            schedulerUuid: logDb.scheduler_uuid,
            jobGroup: logDb.job_group,
            jobId: logDb.job_id,
            status: logDb.status as SchedulerJobStatus,
            target: logDb.target === null ? undefined : logDb.target,
            targetType:
                logDb.target_type === null
                    ? undefined
                    : (logDb.target_type as SchedulerLog['targetType']),
            details: logDb.details === null ? undefined : logDb.details,
        };
    }

    async getSchedulerForProject(
        projectUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        const schedulerCharts = this.database(SchedulerTableName)
            .select('scheduler.*')
            .leftJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SchedulerTableName}.saved_chart_uuid`,
            )
            .leftJoin(DashboardsTableName, function joinDashboards() {
                this.on(
                    `${DashboardsTableName}.dashboard_uuid`,
                    '=',
                    `${SavedChartsTableName}.dashboard_uuid`,
                ).andOnNotNull(`${SavedChartsTableName}.dashboard_uuid`);
            })
            .leftJoin(SpaceTableName, function joinSpaces() {
                this.on(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${SavedChartsTableName}.space_id`,
                ).andOnNotNull(`${SavedChartsTableName}.space_id`);
                this.orOn(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${DashboardsTableName}.space_id`,
                );
            })
            .leftJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        const schedulerDashboards = this.database(SchedulerTableName)
            .select('scheduler.*')
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SchedulerTableName}.dashboard_uuid`,
            )
            .leftJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .leftJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid);

        const schedulerDashboardWithTargets =
            await this.getSchedulersWithTargets(await schedulerDashboards);
        const schedulerChartWithTargets = await this.getSchedulersWithTargets(
            await schedulerCharts,
        );

        return [...schedulerChartWithTargets, ...schedulerDashboardWithTargets];
    }

    async getSchedulerLogs(projectUuid: string): Promise<SchedulerWithLogs> {
        const schedulers = await this.getSchedulerForProject(projectUuid);
        const { schedulerUuids, userUuids, chartUuids, dashboardUuids } =
            schedulers.reduce<{
                schedulerUuids: string[];
                userUuids: string[];
                chartUuids: string[];
                dashboardUuids: string[];
            }>(
                (acc, s) => ({
                    schedulerUuids: [...acc.schedulerUuids, s.schedulerUuid],
                    userUuids: [...acc.userUuids, s.createdBy],
                    chartUuids: isChartScheduler(s)
                        ? [...acc.chartUuids, s.savedChartUuid]
                        : acc.chartUuids,
                    dashboardUuids: isChartScheduler(s)
                        ? acc.dashboardUuids
                        : [...acc.dashboardUuids, s.dashboardUuid],
                }),
                {
                    schedulerUuids: [],
                    userUuids: [],
                    chartUuids: [],
                    dashboardUuids: [],
                },
            );

        const sevenDaysAgo: Date = new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000,
        );
        const logs = await this.database(SchedulerLogTableName)
            .select()
            .whereIn(`scheduler_uuid`, schedulerUuids)
            .where(`scheduled_time`, '>', sevenDaysAgo)
            .where(`scheduled_time`, '<', new Date())
            .orderBy('created_at', 'desc');

        const schedulerLogs: SchedulerLog[] = logs.map(
            SchedulerModel.parseSchedulerLog,
        );

        const sortedLogs = schedulerLogs.sort(SchedulerModel.sortLogs);
        const uniqueLogs = sortedLogs.reduce<SchedulerLog[]>((acc, log) => {
            if (
                acc.some(
                    (l) => l.jobGroup === log.jobGroup && l.task === log.task,
                )
            ) {
                return acc;
            }
            return [...acc, log];
        }, []);
        const users = await this.database(UserTableName)
            .select('first_name', 'last_name', 'user_uuid')
            .whereIn('user_uuid', userUuids);
        const charts = await this.database(SavedChartsTableName)
            .select('name', 'saved_query_uuid')
            .whereIn('saved_query_uuid', chartUuids);
        const dashboards = await this.database(DashboardsTableName)
            .select('name', 'dashboard_uuid')
            .whereIn('dashboard_uuid', dashboardUuids);

        return {
            schedulers,
            users: users.map((u) => ({
                firstName: u.first_name,
                lastName: u.last_name,
                userUuid: u.user_uuid,
            })),
            charts: charts.map((c) => ({
                name: c.name,
                savedChartUuid: c.saved_query_uuid,
            })),
            dashboards: dashboards.map((d) => ({
                name: d.name,
                dashboardUuid: d.dashboard_uuid,
            })),
            logs: uniqueLogs,
        };
    }

    async logSchedulerJob(log: CreateSchedulerLog): Promise<void> {
        try {
            await this.database(SchedulerLogTableName).insert({
                task: log.task,
                scheduler_uuid: log.schedulerUuid,
                status: log.status,
                job_id: log.jobId,
                job_group: log.jobGroup,
                scheduled_time: log.scheduledTime,
                target: log.target || null,
                target_type: log.targetType || null,
                details: log.details || null,
            });
        } catch (error) {
            const FOREIGN_KEY_VIOLATION_ERROR_CODE = '23503';

            if (
                !(
                    error.code === FOREIGN_KEY_VIOLATION_ERROR_CODE &&
                    error.constraint === 'scheduler_log_scheduler_uuid_foreign'
                )
            )
                throw error;
        }
    }

    async deleteScheduledLogs(schedulerUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(SchedulerLogTableName)
                .delete()
                .where('scheduler_uuid', schedulerUuid)
                .andWhere('status', SchedulerJobStatus.SCHEDULED);
        });
    }

    static sortLogs = (a: SchedulerLog, b: SchedulerLog) => {
        /**
         *  Sometimes scheduled event is added after the job is completed
            First sort by date DESC, then sort by status,
         */
        if (a.scheduledTime.getTime() === b.scheduledTime.getTime()) {
            return (
                statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
            );
        }
        return b.scheduledTime.getTime() - a.scheduledTime.getTime();
    };

    async getCsvUrl(jobId: string, userUuid: string) {
        const jobs = await this.database(SchedulerLogTableName)
            .where(`job_id`, jobId)
            .andWhere((query) => {
                void query
                    .where('task', 'downloadCsv')
                    .orWhere('task', 'uploadGsheetFromQuery');
            })
            .orderBy('scheduled_time', 'desc')
            .returning('*');

        const job = jobs.sort(
            (a, b) =>
                statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
        )[0];
        if (!job || job.details?.createdByUserUuid !== userUuid)
            throw new NotFoundError('Download CSV job not found');

        return job;
    }

    async getJobStatus(jobId: string) {
        const jobs = await this.database(SchedulerLogTableName)
            .where(`job_id`, jobId)
            .orderBy('scheduled_time', 'desc')
            .returning('*');

        if (jobs.length === 0) throw new NotFoundError('Job not found');

        const job = jobs.sort(
            (a, b) =>
                statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status),
        )[0];

        return job;
    }
}
