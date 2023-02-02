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

    async getScheduler(schedulerUuid: string) {
        const scheduler = await this.schedulerModel.getScheduler(schedulerUuid);
        return scheduler;
    }

    async createScheduler() {
        // todo
    }

    async updateScheduler() {
        // todo
    }
}
