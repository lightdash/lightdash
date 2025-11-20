import {
    AnyType,
    CreateSchedulerAndTargets,
    CreateSchedulerLog,
    KnexPaginateArgs,
    KnexPaginatedData,
    LogCounts,
    NotFoundError,
    Scheduler,
    SchedulerAndTargets,
    SchedulerEmailTarget,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerLog,
    SchedulerMsTeamsTarget,
    SchedulerRun,
    SchedulerRunLog,
    SchedulerRunLogsResponse,
    SchedulerRunStatus,
    SchedulerSlackTarget,
    SchedulerTaskName,
    SchedulerWithLogs,
    UpdateSchedulerAndTargets,
    isChartScheduler,
    isCreateSchedulerMsTeamsTarget,
    isCreateSchedulerSlackTarget,
    isDashboardScheduler,
    isEmailTarget,
    isMsTeamsTarget,
    isSlackTarget,
    isUpdateSchedulerEmailTarget,
    isUpdateSchedulerMsTeamsTarget,
    isUpdateSchedulerSlackTarget,
    type SchedulerCronUpdate,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DatabaseError } from 'pg';
import { DashboardsTableName } from '../../database/entities/dashboards';
import { ProjectTableName } from '../../database/entities/projects';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import {
    SchedulerDb,
    SchedulerEmailTargetDb,
    SchedulerEmailTargetTableName,
    SchedulerLogDb,
    SchedulerLogTableName,
    SchedulerMsTeamsTargetDb,
    SchedulerMsTeamsTargetTableName,
    SchedulerSlackTargetDb,
    SchedulerSlackTargetTableName,
    SchedulerTableName,
} from '../../database/entities/scheduler';
import { SpaceTableName } from '../../database/entities/spaces';
import { UserTableName } from '../../database/entities/users';
import KnexPaginate from '../../database/pagination';
import { getColumnMatchRegexQuery } from '../SearchModel/utils/search';

type SelectScheduler = SchedulerDb & {
    created_by_name: string | null;
    saved_chart_name: string | null;
    dashboard_name: string | null;
};

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

    static convertScheduler(scheduler: SelectScheduler): Scheduler {
        return {
            schedulerUuid: scheduler.scheduler_uuid,
            name: scheduler.name,
            message: scheduler.message,
            createdAt: scheduler.created_at,
            updatedAt: scheduler.updated_at,
            createdBy: scheduler.created_by,
            createdByName: scheduler.created_by_name,
            cron: scheduler.cron,
            timezone: scheduler.timezone ?? undefined,
            savedChartUuid: scheduler.saved_chart_uuid,
            savedChartName: scheduler.saved_chart_name,
            dashboardUuid: scheduler.dashboard_uuid,
            dashboardName: scheduler.dashboard_name,
            format: scheduler.format,
            options: scheduler.options,
            filters: scheduler.filters,
            parameters: scheduler.parameters,
            customViewportWidth: scheduler.custom_viewport_width,
            thresholds: scheduler.thresholds || undefined,
            enabled: scheduler.enabled,
            notificationFrequency: scheduler.notification_frequency,
            selectedTabs: scheduler.selected_tabs,
            includeLinks: scheduler.include_links,
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

    static convertMsTeamsTarget(
        scheduler: SchedulerMsTeamsTargetDb,
    ): SchedulerMsTeamsTarget {
        return {
            schedulerMsTeamsTargetUuid: scheduler.scheduler_msteams_target_uuid,
            createdAt: scheduler.created_at,
            updatedAt: scheduler.updated_at,
            schedulerUuid: scheduler.scheduler_uuid,
            webhook: scheduler.webhook,
        };
    }

    static getSlackChannels(
        targets: (
            | SchedulerSlackTarget
            | SchedulerEmailTarget
            | SchedulerMsTeamsTarget
        )[],
    ): string[] {
        return targets.reduce<string[]>((acc, target) => {
            if (isSlackTarget(target)) {
                return [...acc, target.channel];
            }
            return acc;
        }, []);
    }

    static getBaseSchedulerQuery(db: Knex) {
        return db(SchedulerTableName)
            .select<SelectScheduler[]>(
                `${SchedulerTableName}.*`,
                db.raw(
                    `(${UserTableName}.first_name || ' ' || ${UserTableName}.last_name) as created_by_name`,
                ),
                `${SavedChartsTableName}.name as saved_chart_name`,
                `${DashboardsTableName}.name as dashboard_name`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${SchedulerTableName}.created_by`,
            )
            .leftJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SchedulerTableName}.saved_chart_uuid`,
            )
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SchedulerTableName}.dashboard_uuid`,
            );
    }

    private async getSchedulersWithTargets(
        schedulers: SelectScheduler[],
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
        const msTeamsTargets = await this.database(
            SchedulerMsTeamsTargetTableName,
        )
            .select()
            .whereIn(
                `${SchedulerMsTeamsTargetTableName}.scheduler_uuid`,
                schedulers.map((s) => s.scheduler_uuid),
            );
        const targets = [
            ...slackTargets.map(SchedulerModel.convertSlackTarget),
            ...emailTargets.map(SchedulerModel.convertEmailTarget),
            ...msTeamsTargets.map(SchedulerModel.convertMsTeamsTarget),
        ];

        return schedulers.map((scheduler) => ({
            ...SchedulerModel.convertScheduler(scheduler),
            targets: targets.filter(
                (target) => target.schedulerUuid === scheduler.scheduler_uuid,
            ),
        }));
    }

    async getAllSchedulers(): Promise<SchedulerAndTargets[]> {
        const schedulers = SchedulerModel.getBaseSchedulerQuery(this.database)
            .where(`${SchedulerTableName}.enabled`, true)
            .where(`${UserTableName}.is_active`, true);
        return this.getSchedulersWithTargets(await schedulers);
    }

    async getSchedulers({
        projectUuid,
        paginateArgs,
        searchQuery,
        sort,
        filters,
    }: {
        projectUuid?: string;
        paginateArgs?: KnexPaginateArgs;
        searchQuery?: string;
        sort?: { column: string; direction: 'asc' | 'desc' };
        filters?: {
            createdByUserUuids?: string[];
            formats?: string[];
            resourceType?: 'chart' | 'dashboard';
            resourceUuids?: string[];
            destinations?: string[];
        };
    }): Promise<KnexPaginatedData<SchedulerAndTargets[]>> {
        let baseQuery = SchedulerModel.getBaseSchedulerQuery(this.database);

        // Apply search query if present
        if (searchQuery) {
            baseQuery = getColumnMatchRegexQuery(baseQuery, searchQuery, [
                `${SchedulerTableName}.name`,
            ]);
        }

        if (
            filters?.createdByUserUuids &&
            filters.createdByUserUuids.length > 0
        ) {
            baseQuery = baseQuery.whereIn(
                `${SchedulerTableName}.created_by`,
                filters.createdByUserUuids,
            );
        }

        if (filters?.formats && filters.formats.length > 0) {
            baseQuery = baseQuery.whereIn(
                `${SchedulerTableName}.format`,
                filters.formats,
            );
        }

        if (filters?.destinations && filters.destinations.length > 0) {
            baseQuery = baseQuery.where((builder) => {
                let isFirst = true;
                const destinations = filters.destinations!;

                if (destinations.includes('email')) {
                    if (isFirst) {
                        void builder.whereExists((subQuery) => {
                            void subQuery
                                .select('*')
                                .from(SchedulerEmailTargetTableName)
                                .whereRaw(
                                    `${SchedulerEmailTargetTableName}.scheduler_uuid = ${SchedulerTableName}.scheduler_uuid`,
                                );
                        });
                        isFirst = false;
                    } else {
                        void builder.orWhereExists((subQuery) => {
                            void subQuery
                                .select('*')
                                .from(SchedulerEmailTargetTableName)
                                .whereRaw(
                                    `${SchedulerEmailTargetTableName}.scheduler_uuid = ${SchedulerTableName}.scheduler_uuid`,
                                );
                        });
                    }
                }

                if (destinations.includes('slack')) {
                    if (isFirst) {
                        void builder.whereExists((subQuery) => {
                            void subQuery
                                .select('*')
                                .from(SchedulerSlackTargetTableName)
                                .whereRaw(
                                    `${SchedulerSlackTargetTableName}.scheduler_uuid = ${SchedulerTableName}.scheduler_uuid`,
                                );
                        });
                        isFirst = false;
                    } else {
                        void builder.orWhereExists((subQuery) => {
                            void subQuery
                                .select('*')
                                .from(SchedulerSlackTargetTableName)
                                .whereRaw(
                                    `${SchedulerSlackTargetTableName}.scheduler_uuid = ${SchedulerTableName}.scheduler_uuid`,
                                );
                        });
                    }
                }

                if (destinations.includes('msteams')) {
                    if (isFirst) {
                        void builder.whereExists((subQuery) => {
                            void subQuery
                                .select('*')
                                .from(SchedulerMsTeamsTargetTableName)
                                .whereRaw(
                                    `${SchedulerMsTeamsTargetTableName}.scheduler_uuid = ${SchedulerTableName}.scheduler_uuid`,
                                );
                        });
                        isFirst = false;
                    } else {
                        void builder.orWhereExists((subQuery) => {
                            void subQuery
                                .select('*')
                                .from(SchedulerMsTeamsTargetTableName)
                                .whereRaw(
                                    `${SchedulerMsTeamsTargetTableName}.scheduler_uuid = ${SchedulerTableName}.scheduler_uuid`,
                                );
                        });
                    }
                }
            });
        }

        const dashboardChartsJoinTable = 'dashboard_charts';

        // Create a union of two queries: one for saved charts and one for dashboards
        let schedulerCharts = baseQuery
            .clone()
            // Join to get the dashboard that the chart belongs to (if any)
            .leftJoin(
                { [dashboardChartsJoinTable]: DashboardsTableName },
                `${dashboardChartsJoinTable}.dashboard_uuid`,
                `${SavedChartsTableName}.dashboard_uuid`,
            )
            .innerJoin(SpaceTableName, function joinSpaces() {
                this.on(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${dashboardChartsJoinTable}.space_id`,
                ).orOn(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${SavedChartsTableName}.space_id`,
                );
            })
            .leftJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .whereNotNull(`${SchedulerTableName}.saved_chart_uuid`);

        let schedulerDashboards = baseQuery
            .clone()
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
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .whereNotNull(`${SchedulerTableName}.dashboard_uuid`);

        // Apply resource type filter
        if (filters?.resourceType === 'chart') {
            // Only include charts
            schedulerDashboards = schedulerDashboards.where(
                this.database.raw('1 = 0'),
            ); // Make dashboards query return no results
        } else if (filters?.resourceType === 'dashboard') {
            // Only include dashboards
            schedulerCharts = schedulerCharts.where(this.database.raw('1 = 0')); // Make charts query return no results
        }

        // Apply resource UUID filter
        if (filters?.resourceUuids && filters.resourceUuids.length > 0) {
            schedulerCharts = schedulerCharts.whereIn(
                `${SchedulerTableName}.saved_chart_uuid`,
                filters.resourceUuids,
            );
            schedulerDashboards = schedulerDashboards.whereIn(
                `${SchedulerTableName}.dashboard_uuid`,
                filters.resourceUuids,
            );
        }

        // Use union to combine both queries
        let query = schedulerCharts.unionAll(schedulerDashboards);

        // Apply sorting if present, default to name asc
        if (sort && sort.column && sort.direction) {
            query = query.orderBy(sort.column, sort.direction);
        } else {
            query = query.orderBy([
                {
                    column: `name`,
                    order: 'asc',
                },
                {
                    column: `created_at`,
                    order: 'asc',
                },
            ]);
        }

        // Paginate the results
        const { pagination, data } = await KnexPaginate.paginate(
            query,
            paginateArgs,
        );

        return {
            pagination,
            data: await this.getSchedulersWithTargets(data),
        };
    }

    async getChartSchedulers(
        savedChartUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        const schedulers = SchedulerModel.getBaseSchedulerQuery(this.database)
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
        const schedulers = SchedulerModel.getBaseSchedulerQuery(this.database)
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
        const [scheduler] = await SchedulerModel.getBaseSchedulerQuery(
            this.database,
        ).where(`${SchedulerTableName}.scheduler_uuid`, schedulerUuid);
        if (!scheduler) {
            throw new NotFoundError('Scheduler not found');
        }
        return SchedulerModel.convertScheduler(scheduler);
    }

    async getSchedulerAndTargets(
        schedulerUuid: string,
    ): Promise<SchedulerAndTargets> {
        const [scheduler] = await SchedulerModel.getBaseSchedulerQuery(
            this.database,
        ).where(`${SchedulerTableName}.scheduler_uuid`, schedulerUuid);
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
        const msTeamsTargets = await this.database(
            SchedulerMsTeamsTargetTableName,
        )
            .select()
            .where(
                `${SchedulerMsTeamsTargetTableName}.scheduler_uuid`,
                schedulerUuid,
            );

        const targets = [
            ...slackTargets.map(SchedulerModel.convertSlackTarget),
            ...emailTargets.map(SchedulerModel.convertEmailTarget),
            ...msTeamsTargets.map(SchedulerModel.convertMsTeamsTarget),
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
                    timezone: newScheduler.timezone ?? null,
                    saved_chart_uuid: newScheduler.savedChartUuid,
                    dashboard_uuid: newScheduler.dashboardUuid,
                    updated_at: new Date(),
                    options: newScheduler.options,
                    filters:
                        isDashboardScheduler(newScheduler) &&
                        newScheduler.filters
                            ? JSON.stringify(newScheduler.filters)
                            : null,
                    parameters:
                        isDashboardScheduler(newScheduler) &&
                        newScheduler.parameters
                            ? JSON.stringify(newScheduler.parameters)
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
                            ? newScheduler.selectedTabs
                            : null,
                    include_links: newScheduler.includeLinks !== false,
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
                if (isCreateSchedulerMsTeamsTarget(target)) {
                    return trx(SchedulerMsTeamsTargetTableName).insert({
                        scheduler_uuid: scheduler.scheduler_uuid,
                        webhook: target.webhook,
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
                    timezone: scheduler.timezone ?? null,
                    updated_at: new Date(),
                    options: scheduler.options,
                    filters:
                        'filters' in scheduler && scheduler.filters
                            ? JSON.stringify(scheduler.filters)
                            : null,
                    parameters:
                        'parameters' in scheduler && scheduler.parameters
                            ? JSON.stringify(scheduler.parameters)
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
                            ? (scheduler.selectedTabs as string[])
                            : null,
                    include_links: scheduler.includeLinks !== false,
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

            const msTeamsTargetsToUpdate = scheduler.targets.reduce<string[]>(
                (acc, target) =>
                    isUpdateSchedulerMsTeamsTarget(target)
                        ? [...acc, target.schedulerMsTeamsTargetUuid]
                        : acc,
                [],
            );
            await trx(SchedulerMsTeamsTargetTableName)
                .delete()
                .where('scheduler_uuid', scheduler.schedulerUuid)
                .andWhere(
                    'scheduler_msteams_target_uuid',
                    'not in',
                    msTeamsTargetsToUpdate,
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
                if (isCreateSchedulerMsTeamsTarget(target)) {
                    return trx(SchedulerMsTeamsTargetTableName).insert({
                        scheduler_uuid: scheduler.schedulerUuid,
                        webhook: target.webhook,
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
            details: {
                projectUuid: 'missing-project-uuid',
                organizationUuid: 'missing-organization-uuid',
                createdByUserUuid: 'missing-created-by-user-uuid',
                ...(logDb.details || {}),
            },
        };
    }

    async getSchedulerForProject(
        projectUuid: string,
        schedulerUuids?: string[],
    ): Promise<SchedulerAndTargets[]> {
        let schedulerCharts = this.database(SchedulerTableName)
            .select<SelectScheduler[]>(
                `${SchedulerTableName}.*`,
                this.database.raw(
                    `(${UserTableName}.first_name || ' ' || ${UserTableName}.last_name) as created_by_name`,
                ),
                `${SavedChartsTableName}.name as saved_chart_name`,
                `${DashboardsTableName}.name as dashboard_name`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${SchedulerTableName}.created_by`,
            )
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
        if (schedulerUuids?.length) {
            schedulerCharts = schedulerCharts.whereIn(
                `${SchedulerTableName}.scheduler_uuid`,
                schedulerUuids,
            );
        }

        let schedulerDashboards = this.database(SchedulerTableName)
            .select<SelectScheduler[]>(
                `${SchedulerTableName}.*`,
                this.database.raw(
                    `(${UserTableName}.first_name || ' ' || ${UserTableName}.last_name) as created_by_name`,
                ),
                this.database.raw(`NULL as saved_chart_name`),
                `${DashboardsTableName}.name as dashboard_name`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${SchedulerTableName}.created_by`,
            )
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
        if (schedulerUuids?.length) {
            schedulerDashboards = schedulerDashboards.whereIn(
                `${SchedulerTableName}.scheduler_uuid`,
                schedulerUuids,
            );
        }

        const schedulerDashboardWithTargets =
            await this.getSchedulersWithTargets(await schedulerDashboards);
        const schedulerChartWithTargets = await this.getSchedulersWithTargets(
            await schedulerCharts,
        );

        return [...schedulerChartWithTargets, ...schedulerDashboardWithTargets];
    }

    async getSchedulersByUuid(
        projectUuid: string,
        schedulerUuids: string[],
    ): Promise<SchedulerAndTargets[]> {
        if (schedulerUuids.length === 0) {
            return [];
        }
        return this.getSchedulerForProject(projectUuid, schedulerUuids);
    }

    async getSchedulerLogs({
        projectUuid,
        paginateArgs,
        searchQuery,
        filters,
    }: {
        projectUuid: string;
        paginateArgs?: KnexPaginateArgs;
        searchQuery?: string;
        filters?: {
            statuses?: SchedulerJobStatus[];
            createdByUserUuids?: string[];
            destinations?: string[];
        };
    }): Promise<KnexPaginatedData<SchedulerWithLogs>> {
        const schedulers = await this.getSchedulerForProject(projectUuid);

        // Filter schedulers based on filters
        let filteredSchedulers = schedulers;

        // Apply search filter on scheduler name
        if (searchQuery) {
            const searchLower = searchQuery.toLowerCase();
            filteredSchedulers = filteredSchedulers.filter((s) =>
                s.name.toLowerCase().includes(searchLower),
            );
        }

        // Apply createdBy filter
        if (
            filters?.createdByUserUuids &&
            filters.createdByUserUuids.length > 0
        ) {
            filteredSchedulers = filteredSchedulers.filter((s) =>
                filters.createdByUserUuids!.includes(s.createdBy),
            );
        }

        // Apply destinations filter
        if (filters?.destinations && filters.destinations.length > 0) {
            filteredSchedulers = filteredSchedulers.filter((s) =>
                s.targets.some((target) => {
                    if (
                        filters.destinations!.includes('slack') &&
                        isSlackTarget(target)
                    ) {
                        return true;
                    }
                    if (
                        filters.destinations!.includes('email') &&
                        isEmailTarget(target)
                    ) {
                        return true;
                    }
                    if (
                        filters.destinations!.includes('msteams') &&
                        isMsTeamsTarget(target)
                    ) {
                        return true;
                    }
                    return false;
                }),
            );
        }

        const { schedulerUuids, userUuids, chartUuids, dashboardUuids } =
            filteredSchedulers.reduce<{
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

        if (schedulerUuids.length === 0) {
            // No schedulers match filters
            return {
                pagination: {
                    page: paginateArgs?.page || 1,
                    pageSize: paginateArgs?.pageSize || 10,
                    totalPageCount: 0,
                    totalResults: 0,
                },
                data: {
                    schedulers: filteredSchedulers,
                    users: [],
                    charts: [],
                    dashboards: [],
                    logs: [],
                },
            };
        }

        const sevenDaysAgo: Date = new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000,
        );

        let logsQuery = this.database(SchedulerLogTableName)
            .select()
            .whereIn(`scheduler_uuid`, schedulerUuids)
            .where(`scheduled_time`, '>', sevenDaysAgo)
            .where(`scheduled_time`, '<', new Date());

        // Apply status filter
        if (filters?.statuses && filters.statuses.length > 0) {
            logsQuery = logsQuery.whereIn(`status`, filters.statuses);
        }

        logsQuery = logsQuery.orderBy('created_at', 'desc');

        const logs = await logsQuery;

        const schedulerLogs: SchedulerLog[] = logs.map(
            SchedulerModel.parseSchedulerLog,
        );

        const sortedLogs = schedulerLogs.sort(SchedulerModel.sortLogs);
        const uniqueLogs = sortedLogs.reduce<SchedulerLog[]>((acc, log) => {
            if (
                acc.some(
                    (l) =>
                        l.jobId === log.jobId &&
                        l.task === log.task &&
                        l.status === log.status,
                )
            ) {
                return acc;
            }
            return [...acc, log];
        }, []);

        // Paginate the unique logs
        const page = paginateArgs?.page || 1;
        const pageSize = paginateArgs?.pageSize || 10;
        const startIndex = (page - 1) * pageSize;
        const paginatedLogs = uniqueLogs.slice(
            startIndex,
            startIndex + pageSize,
        );

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
            pagination: {
                page,
                pageSize,
                totalPageCount: Math.ceil(uniqueLogs.length / pageSize),
                totalResults: uniqueLogs.length,
            },
            data: {
                schedulers: filteredSchedulers,
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
                logs: paginatedLogs,
            },
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
                    error instanceof DatabaseError &&
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

    async setJobStatus(jobId: string, status: SchedulerJobStatus) {
        await this.database(SchedulerLogTableName)
            .update({ status })
            .where('job_id', jobId);
    }

    async bulkUpdateSchedulersCron(
        schedulerCronUpdates: SchedulerCronUpdate[],
    ) {
        await this.database.transaction(async (trx) => {
            const updatePromises = schedulerCronUpdates.map(
                async ({ schedulerUuid, cron }) => {
                    await trx(SchedulerTableName)
                        .update({ cron })
                        .where('scheduler_uuid', schedulerUuid);
                },
            );

            await Promise.all(updatePromises);
        });
    }

    async getSchedulerRuns({
        projectUuid,
        paginateArgs,
        searchQuery,
        sort,
        filters,
    }: {
        projectUuid: string;
        paginateArgs?: KnexPaginateArgs;
        searchQuery?: string;
        sort?: { column: string; direction: 'asc' | 'desc' };
        filters?: {
            schedulerUuids?: string[];
            statuses?: SchedulerRunStatus[];
            createdByUserUuids?: string[];
            destinations?: string[];
            resourceType?: 'chart' | 'dashboard';
            resourceUuids?: string[];
        };
    }): Promise<KnexPaginatedData<SchedulerRun[]>> {
        const schedulers =
            filters?.schedulerUuids && filters.schedulerUuids.length > 0
                ? await this.getSchedulersByUuid(
                      projectUuid,
                      filters.schedulerUuids,
                  )
                : await this.getSchedulerForProject(projectUuid);

        // Apply scheduler-level filters
        let filteredSchedulers = schedulers;

        if (searchQuery) {
            const searchLower = searchQuery.toLowerCase();
            filteredSchedulers = filteredSchedulers.filter((s) =>
                s.name.toLowerCase().includes(searchLower),
            );
        }

        if (filters?.schedulerUuids && filters.schedulerUuids.length > 0) {
            const schedulerUuidSet = new Set(filters.schedulerUuids);
            filteredSchedulers = filteredSchedulers.filter((s) =>
                schedulerUuidSet.has(s.schedulerUuid),
            );
        }

        if (
            filters?.createdByUserUuids &&
            filters.createdByUserUuids.length > 0
        ) {
            filteredSchedulers = filteredSchedulers.filter((s) =>
                filters.createdByUserUuids!.includes(s.createdBy),
            );
        }

        if (filters?.destinations && filters.destinations.length > 0) {
            filteredSchedulers = filteredSchedulers.filter((s) =>
                s.targets.some((target) => {
                    if (
                        filters.destinations!.includes('slack') &&
                        isSlackTarget(target)
                    ) {
                        return true;
                    }
                    if (
                        filters.destinations!.includes('email') &&
                        isEmailTarget(target)
                    ) {
                        return true;
                    }
                    if (
                        filters.destinations!.includes('msteams') &&
                        isMsTeamsTarget(target)
                    ) {
                        return true;
                    }
                    return false;
                }),
            );
        }

        if (filters?.resourceType) {
            filteredSchedulers = filteredSchedulers.filter((s) =>
                filters.resourceType === 'chart'
                    ? isChartScheduler(s)
                    : !isChartScheduler(s),
            );
        }

        if (filters?.resourceUuids && filters.resourceUuids.length > 0) {
            filteredSchedulers = filteredSchedulers.filter((s) =>
                isChartScheduler(s)
                    ? filters.resourceUuids!.includes(s.savedChartUuid)
                    : filters.resourceUuids!.includes(s.dashboardUuid),
            );
        }

        if (filteredSchedulers.length === 0) {
            return {
                pagination: {
                    page: paginateArgs?.page || 1,
                    pageSize: paginateArgs?.pageSize || 10,
                    totalPageCount: 0,
                    totalResults: 0,
                },
                data: [],
            };
        }

        const schedulerUuids = filteredSchedulers.map((s) => s.schedulerUuid);

        // Query parent jobs (where job_id = job_group) with aggregated child counts
        const sevenDaysAgo: Date = new Date(
            Date.now() - 7 * 24 * 60 * 60 * 1000,
        );

        // Build subquery for child job counts - only count most recent status per child
        // First, get the most recent entry for each child job
        const rankedChildJobsSubquery = this.database(SchedulerLogTableName)
            .select(
                'job_id',
                'job_group',
                'status',
                this.database.raw(
                    'ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created_at DESC) as rn',
                ),
            )
            .whereRaw('job_id != job_group') // Only child jobs
            .as('ranked_children');

        // Then count only the most recent status of each child (rn = 1)
        const childCountsSubquery = this.database
            .from(rankedChildJobsSubquery)
            .select(
                'job_group',
                this.database.raw('COUNT(*) as total'),
                this.database.raw(
                    `COUNT(CASE WHEN status = '${SchedulerJobStatus.SCHEDULED}' THEN 1 END) as scheduled_count`,
                ),
                this.database.raw(
                    `COUNT(CASE WHEN status = '${SchedulerJobStatus.STARTED}' THEN 1 END) as started_count`,
                ),
                this.database.raw(
                    `COUNT(CASE WHEN status = '${SchedulerJobStatus.COMPLETED}' THEN 1 END) as completed_count`,
                ),
                this.database.raw(
                    `COUNT(CASE WHEN status = '${SchedulerJobStatus.ERROR}' THEN 1 END) as error_count`,
                ),
            )
            .where('rn', 1)
            .groupBy('job_group')
            .as('child_counts');

        // Use window function (ROW_NUMBER) to get only the most recent parent job per run
        // This approach is safer and more compatible than DISTINCT ON
        const rankedRunsSubquery = this.database(SchedulerLogTableName)
            .select(
                'job_id',
                'scheduler_uuid',
                'scheduled_time',
                'status',
                'created_at',
                'details',
                this.database.raw(
                    'ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created_at DESC) as rn',
                ),
            )
            .whereRaw('job_id = job_group') // Only parent jobs
            .whereIn('scheduler_uuid', schedulerUuids)
            .where('scheduled_time', '>', sevenDaysAgo)
            .where('scheduled_time', '<', new Date())
            .as('ranked_runs');

        const distinctRunsSubquery = this.database
            .from(rankedRunsSubquery)
            .where('rn', 1)
            .as('distinct_runs');

        const runsQuery = this.database(distinctRunsSubquery)
            .select(
                'distinct_runs.job_id as run_id',
                'distinct_runs.scheduler_uuid',
                'distinct_runs.scheduled_time',
                'distinct_runs.status',
                'distinct_runs.created_at',
                'distinct_runs.details',
                `${SchedulerTableName}.name as scheduler_name`,
                `${SchedulerTableName}.format`,
                this.database.raw(
                    `CASE WHEN ${SchedulerTableName}.saved_chart_uuid IS NOT NULL THEN 'chart' ELSE 'dashboard' END as resource_type`,
                ),
                this.database.raw(
                    `COALESCE(${SchedulerTableName}.saved_chart_uuid, ${SchedulerTableName}.dashboard_uuid) as resource_uuid`,
                ),
                this.database.raw(
                    `COALESCE(${SavedChartsTableName}.name, ${DashboardsTableName}.name) as resource_name`,
                ),
                `${SchedulerTableName}.created_by as created_by_user_uuid`,
                this.database.raw(
                    `(${UserTableName}.first_name || ' ' || ${UserTableName}.last_name) as created_by_user_name`,
                ),
                this.database.raw('COALESCE(child_counts.total, 0) as total'),
                this.database.raw(
                    'COALESCE(child_counts.scheduled_count, 0) as scheduled_count',
                ),
                this.database.raw(
                    'COALESCE(child_counts.started_count, 0) as started_count',
                ),
                this.database.raw(
                    'COALESCE(child_counts.completed_count, 0) as completed_count',
                ),
                this.database.raw(
                    'COALESCE(child_counts.error_count, 0) as error_count',
                ),
                // Compute run_status in SQL so it can be used in outer query for filtering/sorting
                // (SELECT aliases can't be referenced in WHERE, so we wrap this as a subquery)
                this.database.raw(`
                    CASE
                        -- Parent failed
                        WHEN distinct_runs.status = '${SchedulerJobStatus.ERROR}' THEN '${SchedulerRunStatus.FAILED}'

                        -- Parent not started
                        WHEN distinct_runs.status = '${SchedulerJobStatus.SCHEDULED}' THEN '${SchedulerRunStatus.SCHEDULED}'

                        -- Parent completed with errors
                        WHEN distinct_runs.status = '${SchedulerJobStatus.COMPLETED}'
                             AND COALESCE(child_counts.error_count, 0) > 0 THEN '${SchedulerRunStatus.PARTIAL_FAILURE}'

                        -- Parent completed, no errors
                        WHEN distinct_runs.status = '${SchedulerJobStatus.COMPLETED}' THEN '${SchedulerRunStatus.COMPLETED}'

                        -- Parent or children still running
                        WHEN distinct_runs.status = '${SchedulerJobStatus.STARTED}'
                             OR COALESCE(child_counts.started_count, 0) > 0
                             OR COALESCE(child_counts.scheduled_count, 0) > 0 THEN '${SchedulerRunStatus.RUNNING}'

                        ELSE '${SchedulerRunStatus.SCHEDULED}'
                    END as run_status
                `),
            )
            .leftJoin(
                childCountsSubquery,
                'distinct_runs.job_id',
                'child_counts.job_group',
            )
            .leftJoin(
                SchedulerTableName,
                `${SchedulerTableName}.scheduler_uuid`,
                'distinct_runs.scheduler_uuid',
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${SchedulerTableName}.created_by`,
            )
            .leftJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SchedulerTableName}.saved_chart_uuid`,
            )
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SchedulerTableName}.dashboard_uuid`,
            );

        // Wrap runsQuery as a subquery so we can filter/sort on computed columns like run_status
        // (WHERE clause can't reference SELECT aliases, so we need an outer query)
        const runsWithStatusSubquery = runsQuery.as('runs_with_status');

        let finalQuery = this.database(runsWithStatusSubquery).select('*');

        // Apply runStatus filter on the outer query (run_status is now a real column)
        if (filters?.statuses && filters.statuses.length > 0) {
            finalQuery = finalQuery.whereIn('run_status', filters.statuses);
        }

        // Apply sorting on the outer query
        if (sort && sort.column && sort.direction) {
            let sortColumn: string = sort.column;
            // Map the sort column to the actual column name
            if (sort.column === 'scheduledTime') {
                sortColumn = 'scheduled_time';
            } else if (sort.column === 'createdAt') {
                sortColumn = 'created_at';
            } else if (sort.column === 'runStatus') {
                sortColumn = 'run_status';
            }
            finalQuery = finalQuery.orderBy(sortColumn, sort.direction);
        } else {
            finalQuery = finalQuery.orderBy('scheduled_time', 'desc');
        }

        // Paginate the final, filtered query
        const { pagination, data } = await KnexPaginate.paginate(
            finalQuery,
            paginateArgs,
        );

        // Map database results to SchedulerRun type
        // run_status is now computed in SQL, so we just read it from the row
        interface SchedulerRunRow {
            run_id: string;
            scheduler_uuid: string;
            scheduler_name: string;
            format: SchedulerFormat;
            scheduled_time: Date;
            status: SchedulerJobStatus;
            run_status: SchedulerRunStatus; // Computed in SQL
            created_at: Date;
            details: Record<string, AnyType> | null;
            total: string;
            scheduled_count: string;
            started_count: string;
            completed_count: string;
            error_count: string;
            resource_type: 'chart' | 'dashboard';
            resource_uuid: string;
            resource_name: string;
            created_by_user_uuid: string;
            created_by_user_name: string;
        }

        const runs: SchedulerRun[] = (data as unknown as SchedulerRunRow[]).map(
            (row) => {
                const logCounts: LogCounts = {
                    total: parseInt(row.total, 10),
                    scheduled: parseInt(row.scheduled_count, 10),
                    started: parseInt(row.started_count, 10),
                    completed: parseInt(row.completed_count, 10),
                    error: parseInt(row.error_count, 10),
                };

                return {
                    runId: row.run_id,
                    schedulerUuid: row.scheduler_uuid,
                    schedulerName: row.scheduler_name,
                    scheduledTime: row.scheduled_time,
                    status: row.status as SchedulerJobStatus,
                    runStatus: row.run_status as SchedulerRunStatus, // Use DB-computed value
                    createdAt: row.created_at,
                    details: row.details,
                    logCounts,
                    resourceType: row.resource_type,
                    resourceUuid: row.resource_uuid,
                    resourceName: row.resource_name,
                    createdByUserUuid: row.created_by_user_uuid,
                    createdByUserName: row.created_by_user_name,
                    format: row.format as SchedulerFormat,
                };
            },
        );

        return {
            pagination,
            data: runs,
        };
    }

    async getRunLogs(runId: string): Promise<SchedulerRunLogsResponse> {
        // Get ALL parent job entries (there may be multiple status updates)
        const parentJobs = await this.database(SchedulerLogTableName)
            .select(
                `${SchedulerLogTableName}.*`,
                `${SchedulerTableName}.name as scheduler_name`,
                this.database.raw(
                    `CASE WHEN ${SchedulerTableName}.saved_chart_uuid IS NOT NULL THEN 'chart' ELSE 'dashboard' END as resource_type`,
                ),
                this.database.raw(
                    `COALESCE(${SchedulerTableName}.saved_chart_uuid, ${SchedulerTableName}.dashboard_uuid) as resource_uuid`,
                ),
                this.database.raw(
                    `COALESCE(${SavedChartsTableName}.name, ${DashboardsTableName}.name) as resource_name`,
                ),
                `${SchedulerTableName}.created_by as created_by_user_uuid`,
                this.database.raw(
                    `(${UserTableName}.first_name || ' ' || ${UserTableName}.last_name) as created_by_user_name`,
                ),
            )
            .leftJoin(
                SchedulerTableName,
                `${SchedulerTableName}.scheduler_uuid`,
                `${SchedulerLogTableName}.scheduler_uuid`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${SchedulerTableName}.created_by`,
            )
            .leftJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SchedulerTableName}.saved_chart_uuid`,
            )
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${SchedulerTableName}.dashboard_uuid`,
            )
            .where(`${SchedulerLogTableName}.job_id`, runId)
            .whereRaw(
                `${SchedulerLogTableName}.job_id = ${SchedulerLogTableName}.job_group`,
            )
            .orderBy(`${SchedulerLogTableName}.created_at`, 'asc');

        if (!parentJobs || parentJobs.length === 0) {
            throw new NotFoundError(`Run with ID ${runId} not found`);
        }

        // Get child jobs
        const childJobs = await this.database(SchedulerLogTableName)
            .select()
            .where('job_group', runId)
            .whereNot('job_id', runId)
            .orderBy('created_at', 'asc');

        // Map parent jobs to SchedulerRunLog type
        // job_group is guaranteed to be present due to WHERE clause filtering
        const parentLogs: SchedulerRunLog[] = parentJobs.map((job) => ({
            jobId: job.job_id,
            jobGroup: job.job_group as string,
            task: job.task as SchedulerTaskName,
            status: job.status as SchedulerJobStatus,
            scheduledTime: job.scheduled_time,
            createdAt: job.created_at,
            target: job.target || null,
            targetType:
                (job.target_type as
                    | 'email'
                    | 'slack'
                    | 'msteams'
                    | 'gsheets') || null,
            details: job.details || null,
            isParent: true,
        }));

        const childLogs: SchedulerRunLog[] = childJobs.map((job) => ({
            jobId: job.job_id,
            jobGroup: job.job_group as string,
            task: job.task as SchedulerTaskName,
            status: job.status as SchedulerJobStatus,
            scheduledTime: job.scheduled_time,
            createdAt: job.created_at,
            target: job.target || null,
            targetType:
                (job.target_type as
                    | 'email'
                    | 'slack'
                    | 'msteams'
                    | 'gsheets') || null,
            details: job.details || null,
            isParent: false,
        }));

        // Merge and sort all logs by created_at
        const allLogs = [...parentLogs, ...childLogs].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );

        // Use first parent job for metadata
        const firstParentJob = parentJobs[0];

        return {
            runId,
            schedulerUuid: firstParentJob.scheduler_uuid,
            schedulerName: firstParentJob.scheduler_name,
            scheduledTime: firstParentJob.scheduled_time,
            logs: allLogs,
            resourceType: firstParentJob.resource_type,
            resourceUuid: firstParentJob.resource_uuid,
            resourceName: firstParentJob.resource_name,
            createdByUserUuid: firstParentJob.created_by_user_uuid,
            createdByUserName: firstParentJob.created_by_user_name,
        };
    }
}
