import {
    CreateSchedulerAndTargets,
    isSlackTarget,
    isUpdateSchedulerSlackTarget,
    NotFoundError,
    Scheduler,
    SchedulerAndTargets,
    SchedulerEmailTarget,
    SchedulerSlackTarget,
    UpdateSchedulerAndTargets,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    SchedulerDb,
    SchedulerEmailTargetDb,
    SchedulerEmailTargetTableName,
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
        const targets = await this.database(SchedulerSlackTargetTableName)
            .select()
            .whereIn(
                `${SchedulerSlackTargetTableName}.scheduler_uuid`,
                schedulers.map((s) => s.scheduler_uuid),
            );
        return schedulers.map((scheduler) => ({
            ...SchedulerModel.convertScheduler(scheduler),
            targets: targets
                .filter(
                    (target) =>
                        target.scheduler_uuid === scheduler.scheduler_uuid,
                )
                .map(SchedulerModel.convertSlackTarget),
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
                    created_by: newScheduler.createdBy,
                    cron: newScheduler.cron,
                    saved_chart_uuid: newScheduler.savedChartUuid,
                    dashboard_uuid: newScheduler.dashboardUuid,
                    updated_at: new Date(),
                })
                .returning('*');
            const targetPromises = newScheduler.targets.map(async (target) => {
                const isSlack = 'channel' in target;
                if (isSlack) {
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
                    cron: scheduler.cron,
                    updated_at: new Date(),
                })
                .where('scheduler_uuid', scheduler.schedulerUuid);

            const targetsToUpdate = scheduler.targets.reduce<string[]>(
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
                    targetsToUpdate,
                );

            const targetPromises = scheduler.targets.map(async (target) => {
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
                } else if (isSlackTarget(target)) {
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
        });
    }
}
