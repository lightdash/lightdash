import { AnonymousAccount, ForbiddenError } from '@lightdash/common';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { BaseService } from '../BaseService';

type PermissionsServiceArguments = {
    dashboardModel: DashboardModel;
};

export class PermissionsService extends BaseService {
    private readonly dashboardModel: DashboardModel;

    constructor(args: PermissionsServiceArguments) {
        super();
        this.dashboardModel = args.dashboardModel;
    }

    async checkEmbedPermissions(
        account: AnonymousAccount,
        savedChartUuid: string,
    ) {
        const { projectUuid, dashboardUuids, allowAllDashboards } =
            account.embed;
        const dashboardUuid = account.access.dashboardId;

        if (!projectUuid) {
            throw new ForbiddenError(
                'Project UUID is required to check embed permissions',
            );
        }

        if (!allowAllDashboards && !dashboardUuids.includes(dashboardUuid)) {
            throw new ForbiddenError(
                `Dashboard ${dashboardUuid} is not embedded`,
            );
        }

        const chartInDashboards = await this.dashboardModel.getAllByProject(
            projectUuid,
            savedChartUuid,
        );

        const chartInDashboardUuids = chartInDashboards.map((d) => d.uuid);
        if (!chartInDashboardUuids.includes(dashboardUuid)) {
            throw new ForbiddenError(
                `This chart does not belong to dashboard ${dashboardUuid}`,
            );
        }
    }
}
