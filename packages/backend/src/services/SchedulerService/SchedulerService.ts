import { subject } from '@casl/ability';
import {
    ForbiddenError,
    isChartScheduler,
    Scheduler,
    SchedulerAndTargets,
    SessionUser,
    UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';

type ServiceDependencies = {
    lightdashConfig: LightdashConfig;
    schedulerModel: SchedulerModel;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;
};

export class SchedulerService {
    lightdashConfig: LightdashConfig;

    schedulerModel: SchedulerModel;

    dashboardModel: DashboardModel;

    savedChartModel: SavedChartModel;

    constructor({
        lightdashConfig,
        schedulerModel,
        dashboardModel,
        savedChartModel,
    }: ServiceDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.schedulerModel = schedulerModel;
        this.dashboardModel = dashboardModel;
        this.savedChartModel = savedChartModel;
    }

    private async checkUserCanUpdateScheduler(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<void> {
        const scheduler = await this.schedulerModel.getScheduler(schedulerUuid);
        if (isChartScheduler(scheduler)) {
            const { organizationUuid, projectUuid } =
                await this.savedChartModel.get(scheduler.savedChartUuid);

            if (
                user.ability.cannot(
                    'update',
                    subject('SavedChart', { organizationUuid, projectUuid }),
                )
            ) {
                throw new ForbiddenError();
            }
        } else {
            const { organizationUuid, projectUuid } =
                await this.dashboardModel.getById(scheduler.dashboardUuid);
            if (
                user.ability.cannot(
                    'update',
                    subject('Dashboard', { organizationUuid, projectUuid }),
                )
            ) {
                throw new ForbiddenError();
            }
        }
    }

    async getAllSchedulers(): Promise<Scheduler[]> {
        return this.schedulerModel.getAllSchedulers();
    }

    async getScheduler(schedulerUuid: string): Promise<SchedulerAndTargets> {
        return this.schedulerModel.getSchedulerAndTargets(schedulerUuid);
    }

    async updateScheduler(
        user: SessionUser,
        schedulerUuid: string,
        updatedScheduler: UpdateSchedulerAndTargetsWithoutId,
    ): Promise<SchedulerAndTargets> {
        await this.checkUserCanUpdateScheduler(user, schedulerUuid);
        return this.schedulerModel.updateScheduler({
            ...updatedScheduler,
            schedulerUuid,
        });
    }

    async deleteScheduler(
        user: SessionUser,
        schedulerUuid: string,
    ): Promise<void> {
        await this.checkUserCanUpdateScheduler(user, schedulerUuid);
        return this.schedulerModel.deleteScheduler(schedulerUuid);
    }
}
