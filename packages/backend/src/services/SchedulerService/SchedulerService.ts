import { CreateSchedulerWithTargets, Scheduler } from '@lightdash/common';
import { SchedulerWithTargets } from '@lightdash/common/dist/types/scheduler';
import { LightdashConfig } from '../../config/parseConfig';
import { SchedulerModel } from '../../models/SchedulerModel';

type ServiceDependencies = {
    lightdashConfig: LightdashConfig;
    schedulerModel: SchedulerModel;
};

export class SchedulerService {
    lightdashConfig: LightdashConfig;

    schedulerModel: SchedulerModel;

    constructor({ lightdashConfig, schedulerModel }: ServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.schedulerModel = schedulerModel;
    }

    async getAllSchedulers(): Promise<Scheduler[]> {
        const schedulers = await this.schedulerModel.getAllSchedulers();
        return schedulers;
    }

    async getScheduler(schedulerUuid: string): Promise<SchedulerWithTargets> {
        const scheduler = await this.schedulerModel.getSchedulerWithTargets(
            schedulerUuid,
        );
        return scheduler;
    }

    async createScheduler(
        newScheduler: CreateSchedulerWithTargets,
    ): Promise<string> {
        // todo: check if user has edit permission to chart/dashboard
        return this.schedulerModel.createScheduler(newScheduler);
    }

    //
    // async updateScheduler() {
    //     // todo
    // }
}
