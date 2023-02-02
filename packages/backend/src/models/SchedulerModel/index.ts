import { NotFoundError, Scheduler } from '@lightdash/common';
import {
    ChartScheduler,
    DashboardScheduler,
    SchedulerSlackTarget,
    SchedulerWithTargets,
} from '@lightdash/common/dist/types/scheduler';
import { Knex } from 'knex';
import {
    SchedulerDb,
    SchedulerSlackTargetDb,
    SchedulerSlackTargetTableName,
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
            userUuid: scheduler.user_uuid,
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
            channels: scheduler.channels,
        };
    }

    async getAllSchedulers(): Promise<Scheduler[]> {
        const schedulers = await this.database(SchedulerTableName).select();
        return schedulers.map(SchedulerModel.convertScheduler);
    }

    async getChartSchedulers(
        saved_chart_uuid: string,
    ): Promise<ChartScheduler[]> {
        const schedulers = await this.database(SchedulerTableName)
            .select('*')
            .where(`${SchedulerTableName}.saved_chart_uuid`, saved_chart_uuid);
        return schedulers.map(
            SchedulerModel.convertScheduler,
        ) as ChartScheduler[];
    }

    async getDashboardSchedulers(
        dashboard_uuid: string,
    ): Promise<DashboardScheduler[]> {
        const schedulers = await this.database(SchedulerTableName)
            .select()
            .where(`${SchedulerTableName}.dashboard_uuid`, dashboard_uuid);
        return schedulers.map(
            SchedulerModel.convertScheduler,
        ) as DashboardScheduler[];
    }

    async getSchedulerWithTargets(
        schedulerUuid: string,
    ): Promise<SchedulerWithTargets> {
        const [scheduler] = await this.database(SchedulerTableName)
            .select()
            .where(`${SchedulerTableName}.scheduler_uuid`, schedulerUuid);
        if (!scheduler) {
            throw new NotFoundError('Scheduler not found');
        }
        const targets = await this.database(SchedulerSlackTargetTableName)
            .select()
            .where(
                `${SchedulerSlackTargetTableName}.scheduler_uuid`,
                schedulerUuid,
            );

        return {
            ...SchedulerModel.convertScheduler(scheduler),
            targets: targets.map(SchedulerModel.convertSlackTarget),
        };
    }
}
