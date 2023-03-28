import {
    CreateSchedulerAndTargets,
    isCreateSchedulerSlackTarget,
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
    UpdateSchedulerAndTargets,
} from '@lightdash/common';
import { NotFound } from 'express-openapi-validator/dist/openapi.validator';
import { Knex } from 'knex';
import {
    SchedulerDb,
    SchedulerEmailTargetDb,
    SchedulerEmailTargetTableName,
    SchedulerLogTableName,
    SchedulerSlackTargetDb,
    SchedulerSlackTargetTableName,
    SchedulerTable,
    SchedulerTableName,
} from '../../database/entities/scheduler';

type ModelDependencies = {
    database: Knex;
};

export class SchedulerModel {
    private database: Knex;

    constructor(deps: ModelDependencies) {
        this.database = deps.database;
    }

    static convertScheduler(scheduler: SchedulerDb): Scheduler {
        return {
            schedulerUuid: scheduler.scheduler_uuid,
            name: scheduler.name,
            createdAt: scheduler.created_at,
            updatedAt: scheduler.updated_at,
            createdBy: scheduler.created_by,
            cron: scheduler.cron,
            savedChartUuid: scheduler.saved_chart_uuid,
            dashboardUuid: scheduler.dashboard_uuid,
            format: scheduler.format,
            options: scheduler.options,
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
        schedulersQueryBuilder: Knex.QueryBuilder<
            SchedulerTable,
            SchedulerDb[]
        >,
    ): Promise<SchedulerAndTargets[]> {
        const schedulers = await schedulersQueryBuilder;
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
        return this.getSchedulersWithTargets(schedulers);
    }

    async getChartSchedulers(
        savedChartUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        const schedulers = this.database(SchedulerTableName)
            .select()
            .where(`${SchedulerTableName}.saved_chart_uuid`, savedChartUuid);
        return this.getSchedulersWithTargets(schedulers);
    }

    async getDashboardSchedulers(
        dashboardUuid: string,
    ): Promise<SchedulerAndTargets[]> {
        const schedulers = this.database(SchedulerTableName)
            .select()
            .where(`${SchedulerTableName}.dashboard_uuid`, dashboardUuid);
        return this.getSchedulersWithTargets(schedulers);
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
                    format: newScheduler.format,
                    created_by: newScheduler.createdBy,
                    cron: newScheduler.cron,
                    saved_chart_uuid: newScheduler.savedChartUuid,
                    dashboard_uuid: newScheduler.dashboardUuid,
                    updated_at: new Date(),
                    options: newScheduler.options,
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

    async updateScheduler(
        scheduler: UpdateSchedulerAndTargets,
    ): Promise<SchedulerAndTargets> {
        await this.database.transaction(async (trx) => {
            await trx(SchedulerTableName)
                .update({
                    name: scheduler.name,
                    format: scheduler.format,
                    cron: scheduler.cron,
                    updated_at: new Date(),
                    options: scheduler.options,
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
                    await trx(SchedulerSlackTargetTableName)
                        .update({
                            channel: target.channel,
                            updated_at: new Date(),
                        })
                        .where(
                            'scheduler_slack_target_uuid',
                            target.schedulerSlackTargetUuid,
                        )
                        .andWhere('scheduler_uuid', scheduler.schedulerUuid);
                } else if (isUpdateSchedulerEmailTarget(target)) {
                    await trx(SchedulerEmailTargetTableName)
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
                else if (isCreateSchedulerSlackTarget(target)) {
                    await trx(SchedulerSlackTargetTableName).insert({
                        scheduler_uuid: scheduler.schedulerUuid,
                        channel: target.channel,
                        updated_at: new Date(),
                    });
                } else {
                    await trx(SchedulerEmailTargetTableName).insert({
                        scheduler_uuid: scheduler.schedulerUuid,
                        recipient: target.recipient,
                        updated_at: new Date(),
                    });
                }
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

    async logSchedulerJob(log: SchedulerLog): Promise<void> {
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
    }

    async deleteScheduledLogs(schedulerUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(SchedulerLogTableName)
                .delete()
                .where('scheduler_uuid', schedulerUuid)
                .andWhere('status', SchedulerJobStatus.SCHEDULED);
        });
    }

    async getCsvUrl(jobId: string, token: string) {
        const [job] = await this.database(SchedulerLogTableName)
            .select()
            .where(`${SchedulerSlackTargetTableName}.job_id`, jobId)
            .where('details.token', token)
            .orderBy('scheduled_time', 'desc')
            .limit(1);

        if (!job) throw new NotFoundError('Download CSV job not found');

        return job;
    }
}
